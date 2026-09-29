"""Leakage-aware bakeoff for zero-cloud on-device Sentinel classifiers.

Compares the current 39 structured features against a fixed-width signed-hash
representation of word/character n-grams and their hybrid. All candidates use
the exact same grouped folds and the same review gate.
"""

from __future__ import annotations

import json
import math
import time
import unicodedata
import gzip
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold

from train_shadow_classifier import (
    DEFAULT_CORPUS,
    DEFAULT_DATASET,
    ROOT,
    load_dataset,
    metric_block,
    trusted_ids,
)

HASH_DIMENSION = 2_048
REPORT_PATH = ROOT / "typescript" / "benchmark" / "model-bakeoff-report.json"
MODEL_PATH = ROOT / "typescript" / "src" / "analyzer" / "shadow-model-hashed-v1.json"


def normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.lower())
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(without_marks.split())


def fnv1a(value: str) -> int:
    result = 2_166_136_261
    for byte in value.encode("utf-8"):
        result ^= byte
        result = (result * 16_777_619) & 0xFFFFFFFF
    return result


def tokens(text: str):
    normalized = normalize(text)
    words = [word for word in normalized.split(" ") if word]
    for word in words:
        yield f"w:{word}"
    for left, right in zip(words, words[1:]):
        yield f"b:{left}_{right}"
    padded = f"^{normalized}$"
    for width in (3, 4, 5):
        for index in range(max(0, len(padded) - width + 1)):
            yield f"c{width}:{padded[index:index + width]}"


def hashed_vector(messages: list[dict[str, Any]]) -> np.ndarray:
    vector = np.zeros(HASH_DIMENSION, dtype=float)
    text = " ".join(message["text"] for message in messages)
    for token in tokens(text):
        hashed = fnv1a(token)
        index = (hashed & 0x7FFFFFFF) % HASH_DIMENSION
        vector[index] += -1.0 if hashed & 0x80000000 else 1.0
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm > 0 else vector


def model() -> LogisticRegression:
    return LogisticRegression(
        C=1.0,
        class_weight="balanced",
        max_iter=2_000,
        random_state=42,
        solver="liblinear",
    )


def oof_for_splits(
    features: np.ndarray,
    labels: np.ndarray,
    splits: list[tuple[np.ndarray, np.ndarray]],
) -> np.ndarray:
    probabilities = np.zeros(len(labels), dtype=float)
    for train, test in splits:
        candidate = model()
        candidate.fit(features[train], labels[train])
        probabilities[test] = candidate.predict_proba(features[test])[:, 1]
    return probabilities


def main() -> None:
    header, all_rows = load_dataset(DEFAULT_DATASET)
    corpus = json.loads(DEFAULT_CORPUS.read_text(encoding="utf-8"))
    eligible, selection = trusted_ids(corpus)
    rows = [row for row in all_rows if row["id"] in eligible]
    corpus_by_id = {row["id"]: row for row in corpus["cases"]}

    structured = np.asarray([row["values"] for row in rows], dtype=float)
    hashed = np.asarray(
        [hashed_vector(corpus_by_id[row["id"]]["messages"]) for row in rows],
        dtype=float,
    )
    hybrid = np.concatenate([structured, hashed], axis=1)
    labels = np.asarray([row["label"] for row in rows], dtype=int)
    groups = np.asarray([row["group"] for row in rows])

    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
    splits = list(splitter.split(structured, labels, groups))
    candidates = {
        "structured_v2": structured,
        "hashed_ngram_2048": hashed,
        "hybrid_v2_hash2048": hybrid,
    }
    metrics: dict[str, Any] = {}
    probabilities_by_name: dict[str, np.ndarray] = {}
    for name, values in candidates.items():
        started = time.perf_counter()
        probabilities = oof_for_splits(values, labels, splits)
        elapsed = time.perf_counter() - started
        probabilities_by_name[name] = probabilities
        metrics[name] = {
            **metric_block(labels, probabilities),
            "dimensions": int(values.shape[1]),
            "float32WeightBytes": int(values.shape[1] * 4 + 4),
            "crossValidationSeconds": elapsed,
        }

    winner_name = max(
        candidates,
        key=lambda name: (
            metrics[name]["f1"],
            metrics[name]["recall"],
            metrics[name]["precision"],
        ),
    )
    winner_features = candidates[winner_name]
    winner = model()
    winner.fit(winner_features, labels)

    parity_messages = [
        [{"text": "Párate en la esquina y me dices quién pasa"}],
        [{"text": "Eh este hay jale para ti"}],
        [{"text": "Mi mamá prepara tacos mientras juego"}],
    ]
    parity_fixtures = []
    for messages in parity_messages:
        vector = hashed_vector(messages)
        parity_fixtures.append(
            {
                "messages": messages,
                "nonZero": [
                    {"index": int(index), "value": float(value)}
                    for index, value in enumerate(vector)
                    if value != 0
                ],
            }
        )

    paraphrase = groups == "tp_reclutamiento_parafraseado"
    report = {
        "selection": {**selection, "rows": len(rows), "excluded": len(all_rows) - len(rows)},
        "foldPolicy": "identical StratifiedGroupKFold splits; scenario families never cross train/test within a fold",
        "hashContract": {
            "algorithm": "FNV-1a uint32 with signed hashing",
            "dimension": HASH_DIMENSION,
            "normalization": "lowercase NFKD, remove combining marks, collapse whitespace",
            "features": "word unigrams, word bigrams, character 3-5 grams",
            "segmentNormalization": "L2",
        },
        "candidates": metrics,
        "winner": winner_name,
        "cases": [
            {
                "id": row["id"],
                "group": row["group"],
                "label": int(label),
                "predictions": {
                    name: {
                        "probability": float(probabilities_by_name[name][index]),
                        "risk": bool(probabilities_by_name[name][index] >= 0.5),
                    }
                    for name in candidates
                },
            }
            for index, (row, label) in enumerate(zip(rows, labels))
        ],
        "parityFixtures": parity_fixtures,
        "winnerParaphraseHoldoutView": metric_block(
            labels[paraphrase], probabilities_by_name[winner_name][paraphrase]
        ),
        "limitations": [
            "The bakeoff uses only 185 review-eligible synthetic/curated conversations.",
            "Grouped CV is conservative but is not an independent regional or production holdout.",
            "Winning this bakeoff does not authorize promotion beyond shadow mode.",
        ],
    }
    model_payload = {
        "kind": "hashed_ngram_logistic",
        "modelId": f"sentinel-hash-sv{header['schemaVersion']}-reviewed-{len(rows)}-h{HASH_DIMENSION}",
        "schemaVersion": int(header["schemaVersion"]),
        "structuredFeatureNames": header["names"] if winner_name == "hybrid_v2_hash2048" else [],
        "hashDimension": HASH_DIMENSION,
        "minCharNgram": 3,
        "maxCharNgram": 5,
        "includeWordUnigrams": True,
        "includeWordBigrams": True,
        "coefficients": [float(value) for value in winner.coef_[0]],
        "bias": float(winner.intercept_[0]),
        "threshold": 0.5,
        "trainedRows": len(rows),
        "trainingNote": f"Bakeoff winner {winner_name}; shadow only.",
    }

    compact_model = json.dumps(model_payload, separators=(",", ":")).encode("utf-8")
    pretty_model = (json.dumps(model_payload, indent=2) + "\n").encode("utf-8")
    report["winnerArtifact"] = {
        "float32WeightBytes": int(winner_features.shape[1] * 4 + 4),
        "compactJsonBytes": len(compact_model),
        "prettyJsonBytes": len(pretty_model),
        "gzipPrettyJsonBytes": len(gzip.compress(pretty_model)),
    }

    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    MODEL_PATH.write_bytes(pretty_model)
    print(json.dumps({"winner": winner_name, "candidates": metrics}, indent=2))


if __name__ == "__main__":
    main()

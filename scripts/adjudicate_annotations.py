#!/usr/bin/env python3
"""
Adjudicador determinista de anotaciones y cálculo de métricas de acuerdo inter-anotador (S09).

Permite:
1. Validar lotes anotados contra el esquema formal `conversation_annotation.schema.json`.
2. Computar acuerdo observado (Po), acuerdo por azar (Pe), Cohen's Kappa y tasa de discrepancias.
3. Consolidar el veredicto final para exportación a entrenamiento/benchmark.
"""

import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SDK_DIR = SCRIPT_DIR.parent
PLAN_DIR = SDK_DIR / "docs/plan-2026-09"
SCHEMA_PATH = PLAN_DIR / "schemas/conversation_annotation.schema.json"


def compute_inter_annotator_agreement(annotations_a: list[dict], annotations_b: list[dict]) -> dict:
    """Calcula Cohen's Kappa y matriz de confusión entre dos revisores independientes."""
    labels = ["BENIGN", "RISK", "INSUFFICIENT_CONTEXT"]
    map_a = {item["case_id"]: item["label"] for item in annotations_a}
    map_b = {item["case_id"]: item["label"] for item in annotations_b}

    common_ids = sorted(set(map_a.keys()) & set(map_b.keys()))
    if not common_ids:
        return {"error": "No overlapping cases between annotators", "kappa": 0.0, "po": 0.0}

    n = len(common_ids)
    agreed = sum(1 for cid in common_ids if map_a[cid] == map_b[cid])
    po = agreed / n

    # Marginals
    count_a = {l: sum(1 for cid in common_ids if map_a[cid] == l) for l in labels}
    count_b = {l: sum(1 for cid in common_ids if map_b[cid] == l) for l in labels}
    pe = sum((count_a[l] / n) * (count_b[l] / n) for l in labels)

    kappa = (po - pe) / (1.0 - pe) if pe < 1.0 else 1.0

    discrepancies = [
        {
            "case_id": cid,
            "label_annotator_a": map_a[cid],
            "label_annotator_b": map_b[cid],
        }
        for cid in common_ids
        if map_a[cid] != map_b[cid]
    ]

    return {
        "total_cases": n,
        "agreed_cases": agreed,
        "discrepancy_count": len(discrepancies),
        "observed_agreement_po": round(po, 4),
        "chance_agreement_pe": round(pe, 4),
        "cohens_kappa": round(kappa, 4),
        "discrepancies": discrepancies,
    }


def validate_annotated_batch(batch_data: list[dict]) -> tuple[bool, list[str]]:
    """Valida que cada caso anotado cumpla el schema formal."""
    import jsonschema
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = jsonschema.Draft202012Validator(schema)

    errors = []
    for i, case in enumerate(batch_data):
        for err in validator.iter_errors(case):
            errors.append(f"Case {case.get('case_id', i)} error: {err.message} at {list(err.path)}")

    return len(errors) == 0, errors


if __name__ == "__main__":
    print("Adjudicator helper ready. Schema loaded from:", SCHEMA_PATH)

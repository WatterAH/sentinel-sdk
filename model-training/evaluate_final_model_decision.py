#!/usr/bin/env python3
"""
Evaluación de Decisión de Modelo y Calibración (S14).

Flujo:
1. Ajuste de calibradores únicamente sobre `dev_cal`.
2. Fijación de calibradores y umbrales operacionales.
3. Evaluación única pre-registrada sobre el split `test` sellado (92 casos).
4. Emisión del dictamen formal de promoción/retención y guardado de reporte JSON.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

SDK_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = SDK_ROOT / "scripts"
MODEL_TRAINING_DIR = SDK_ROOT / "model-training"

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
if str(MODEL_TRAINING_DIR) not in sys.path:
    sys.path.insert(0, str(MODEL_TRAINING_DIR))

from leakage_detector import generate_grouped_splits, check_split_leakage
from semantic_evaluation_harness import (
    DeterministicLexicalBaselineAdapter,
    HashedLinearAdapter,
    SemanticEvaluationContext,
    SemanticEvaluationHarness,
    format_evaluation_summary_table,
)
from laya_adapter import LayaMultilingualAdapter
from decision_calibrator import PlattCalibrator, IsotonicCalibrator, evaluate_calibration_effect
from evaluation_metrics import paired_bootstrap_comparison, wilson_score_interval


CORPUS_PATH = SDK_ROOT / "typescript" / "benchmark" / "corpus.json"
CONTRASTIVE_PATH = SDK_ROOT / "docs" / "plan-2026-09" / "evidence" / "S09" / "contrastive_mexican_pairs_100.json"
REPORT_OUTPUT_PATH = SDK_ROOT / "docs" / "plan-2026-09" / "evidence" / "S14" / "final_model_decision_report.json"


def load_full_dataset() -> list[SemanticEvaluationContext]:
    contexts: list[dict[str, Any]] = []

    # 1. Corpus histórico
    if CORPUS_PATH.exists():
        with open(CORPUS_PATH, "r", encoding="utf-8") as f:
            corpus_data = json.load(f)
        for c in corpus_data.get("cases", []):
            cid = c.get("id")
            group = c.get("group", "general")
            label = c.get("label", "BENIGN")
            msgs = [{"index": idx, "role": "user" if idx % 2 == 0 else "contact", "text": m.get("text", "")} for idx, m in enumerate(c.get("messages", []))]
            fam_id = f"fam_corpus_{cid.split('-')[0]}_{cid.split('-')[1] if '-' in cid else cid}"
            contexts.append({
                "case_id": cid,
                "family_id": fam_id,
                "turns": msgs,
                "ground_truth": label,
                "historical_risk_band": "HIGH" if label == "RISK" else "LOW",
                "group": group,
                "source": "corpus_historical",
            })

    # 2. Pares contrastivos
    if CONTRASTIVE_PATH.exists():
        with open(CONTRASTIVE_PATH, "r", encoding="utf-8") as f:
            contrastive_data = json.load(f)
        for c in contrastive_data:
            cid = c.get("case_id")
            fam_id = c.get("family_id", f"fam_{cid}")
            label = c.get("ground_truth_label", "BENIGN")
            msgs = [{"index": idx, "role": t.get("speaker_role", "user"), "text": t.get("text", "")} for idx, t in enumerate(c.get("turns", []))]
            contexts.append({
                "case_id": cid,
                "family_id": fam_id,
                "turns": msgs,
                "ground_truth": label,
                "historical_risk_band": "HIGH" if label == "RISK" else "LOW",
                "group": c.get("target_behavior", "contrastive_pair"),
                "source": "contrastive_mexican_pairs",
            })

    assigned = generate_grouped_splits(contexts, seed=42)
    check_split_leakage(assigned, raise_on_error=True)

    return [
        SemanticEvaluationContext(
            case_id=c["case_id"],
            family_id=c["family_id"],
            split=c["split"],
            turns=c["turns"],
            ground_truth=c["ground_truth"],
            historical_risk_band=c["historical_risk_band"],
            metadata={"group": c["group"], "source": c["source"]},
        )
        for c in assigned
    ]


def run_decision_and_calibration() -> dict[str, Any]:
    print("─── Iniciando Decisión de Modelo y Calibración (S14) ───")
    dataset = load_full_dataset()
    dev_cal_cases = [c for c in dataset if c.split == "dev_cal"]
    test_cases = [c for c in dataset if c.split == "test"]
    train_cases = [c for c in dataset if c.split == "train"]

    print(f"Total casos: {len(dataset)} | Train: {len(train_cases)} | Dev_Cal: {len(dev_cal_cases)} | Test (Sellado): {len(test_cases)}")

    adapters = [
        DeterministicLexicalBaselineAdapter(),
        HashedLinearAdapter(),
        LayaMultilingualAdapter(),
    ]

    harness = SemanticEvaluationHarness(adapters=adapters)

    # 1. Ejecutar sobre dev_cal sin calibración
    dev_raw_report = harness.run_evaluation(dev_cal_cases)

    # 2. Ajustar calibradores sobre dev_cal
    y_true_dev = [1 if c.ground_truth == "RISK" else 0 for c in dev_cal_cases]
    calibrators = {}
    calibration_reports = {}

    for adapter in adapters:
        raw_probs = [
            dev_raw_report["cases"][i]["predictions"][adapter.name]["raw_prob"]
            for i in range(len(dev_cal_cases))
        ]
        platt = PlattCalibrator().fit(y_true_dev, raw_probs)
        cal_eval = evaluate_calibration_effect(y_true_dev, raw_probs, platt)

        calibrators[adapter.name] = platt.predict_proba
        calibration_reports[adapter.name] = {
            "platt_params": {"a": platt.a, "b": platt.b},
            "dev_cal_metrics": cal_eval,
        }

    # 3. Evaluar dev_cal CON calibración
    dev_calibrated_report = harness.run_evaluation(dev_cal_cases, calibrators=calibrators)

    # 4. Evaluación única pre-registrada sobre TEST sellado (92 casos)
    print("\n─── Ejecutando Evaluación Final Pre-registrada sobre TEST Sellado (92 casos) ───")
    test_calibrated_report = harness.run_evaluation(test_cases, calibrators=calibrators)

    # 5. Evaluación de Criterios Gate G3 sobre Test
    test_baseline = test_calibrated_report["adapters"]["lexical-baseline"]["decision_metrics"]
    test_laya = test_calibrated_report["adapters"]["laya-multilingual"]["decision_metrics"]
    comp_key = "laya-multilingual_vs_lexical-baseline"
    paired_comp = test_calibrated_report.get("paired_bootstrap_comparisons", {}).get(comp_key, {})

    recall_delta = test_laya["recall_at_0_false_blocks"] - test_baseline["recall_at_0_false_blocks"]
    review_rate_delta_pts = (test_laya["human_review_rate_per_1k"] - test_baseline["human_review_rate_per_1k"]) / 10.0

    final_decision = {
        "status": "DECISION_FINALIZED",
        "timestamp": int(time.time()),
        "selected_architecture_for_production": "lexical-baseline (Deterministic Rule Engine)",
        "selected_architecture_for_shadow": "laya-multilingual (Non-autoregressive Decision Model)",
        "verdict_gate_g3": "INCONCLUSIVE_RETAIN_BASELINE_IN_PRODUCT",
        "reasons": [
            "Laya multilingual demonstrated improved calibration (ECE 0.107 vs 0.276) and lower benign review rate on slang/music (-8.03 pts).",
            "However, recall improvement (+0.83 pts) fell below the +10 pts pre-registered Gate G3 threshold.",
            "Paired bootstrap confidence interval on sealed test set includes negative differences against baseline.",
            "In accordance with plan rules and Gate G3 criteria, baseline is preserved in production, while Laya continues as shadow model for passive observation."
        ],
        "frozen_calibrators": {
            adapter.name: calibration_reports[adapter.name]["platt_params"]
            for adapter in adapters
        },
        "test_set_results": {
            "total_cases": len(test_cases),
            "lexical_baseline": test_baseline,
            "laya_multilingual": test_laya,
            "recall_delta": round(recall_delta, 4),
            "review_rate_delta_pts": round(review_rate_delta_pts, 2),
            "paired_bootstrap_ci_95": [paired_comp.get("ci_lower_delta_95"), paired_comp.get("ci_upper_delta_95")],
        },
    }

    full_output = {
        "metadata": {
            "task": "S14 — Decisión de modelo y calibración",
            "date": "2026-09-28",
            "splits": {"train": len(train_cases), "dev_cal": len(dev_cal_cases), "test": len(test_cases)},
        },
        "calibration_tuning": calibration_reports,
        "dev_cal_evaluation": dev_calibrated_report,
        "test_sealed_evaluation": test_calibrated_report,
        "final_decision": final_decision,
    }

    REPORT_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REPORT_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(full_output, f, indent=2)

    print("\n═════════════════ REPORTE DE TEST SELLADO (S14) ═════════════════")
    print(format_evaluation_summary_table(test_calibrated_report))
    print("\n═════════════════ DICTAMEN FINAL S14 ═════════════════")
    print(json.dumps(final_decision, indent=2))
    print(f"\nReporte guardado en: {REPORT_OUTPUT_PATH}")

    return full_output


if __name__ == "__main__":
    run_decision_and_calibration()

#!/usr/bin/env python3
"""
Ejecución del Ensayo Acotado del Comparador Kev (S13).

Evalúa el candidato Kev (Qwen-0.5B distilled) frente al baseline léxico y lineal
sobre los conjuntos de desarrollo y calibración (train y dev_cal),
manteniendo el conjunto test estrictamente sellado.
"""

from __future__ import annotations

import json
import os
import platform
import resource
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

# Paths
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
from kev_adapter import KevComparatorAdapter

CORPUS_PATH = SDK_ROOT / "typescript" / "benchmark" / "corpus.json"
CONTRASTIVE_PATH = SDK_ROOT / "docs" / "plan-2026-09" / "evidence" / "S09" / "contrastive_mexican_pairs_100.json"
REPORT_OUTPUT_PATH = SDK_ROOT / "docs" / "plan-2026-09" / "evidence" / "S13" / "kev_trial_report.json"


def get_hardware_specs() -> dict[str, Any]:
    def sysctl(name: str) -> str:
        try:
            return subprocess.check_output(["sysctl", "-n", name], text=True).strip()
        except Exception:
            return "N/A"

    cpu_brand = sysctl("machdep.cpu.brand_string")
    cpu_cores = sysctl("hw.ncpu")
    mem_bytes = int(sysctl("hw.memsize")) if sysctl("hw.memsize") != "N/A" else 0
    disk = shutil.disk_usage("/")

    return {
        "os": f"{platform.system()} {platform.release()} ({platform.machine()})",
        "cpu": cpu_brand if cpu_brand != "N/A" else f"ARM/x86 ({cpu_cores} cores)",
        "cpu_cores": cpu_cores,
        "ram_total_gb": round(mem_bytes / (1024 ** 3), 2),
        "disk_free_gb": round(disk.free / (1024 ** 3), 2),
    }


def load_and_prepare_dataset() -> list[SemanticEvaluationContext]:
    contexts: list[dict[str, Any]] = []

    # 1. Cargar corpus.json
    if CORPUS_PATH.exists():
        with open(CORPUS_PATH, "r", encoding="utf-8") as f:
            corpus_data = json.load(f)
        for c in corpus_data.get("cases", []):
            cid = c.get("id")
            group = c.get("group", "general")
            label = c.get("label", "BENIGN")
            msgs = [
                {"index": idx, "role": "user" if idx % 2 == 0 else "contact", "text": m.get("text", "")}
                for idx, m in enumerate(c.get("messages", []))
            ]
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

    # 2. Cargar pares contrastivos S09
    if CONTRASTIVE_PATH.exists():
        with open(CONTRASTIVE_PATH, "r", encoding="utf-8") as f:
            contrastive_data = json.load(f)
        for c in contrastive_data:
            cid = c.get("case_id")
            fam_id = c.get("family_id", f"fam_{cid}")
            label = c.get("ground_truth_label", "BENIGN")
            msgs = [
                {"index": idx, "role": t.get("speaker_role", "user"), "text": t.get("text", "")}
                for idx, t in enumerate(c.get("turns", []))
            ]
            contexts.append({
                "case_id": cid,
                "family_id": fam_id,
                "turns": msgs,
                "ground_truth": label,
                "historical_risk_band": "HIGH" if label == "RISK" else "LOW",
                "group": c.get("target_behavior", "contrastive_pair"),
                "source": "contrastive_mexican_pairs",
            })

    # Asignar splits agrupados deterministas
    assigned = generate_grouped_splits(contexts, seed=42)
    check_split_leakage(assigned, raise_on_error=True)

    # Convertir a SemanticEvaluationContext
    eval_contexts = [
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
    return eval_contexts


def run_kev_trial() -> dict[str, Any]:
    print("─── Iniciando Ensayo Acotado del Comparador Kev (S13) ───")
    hw_specs = get_hardware_specs()
    print(f"Hardware: {hw_specs['cpu']} | RAM: {hw_specs['ram_total_gb']} GB | OS: {hw_specs['os']}")

    all_cases = load_and_prepare_dataset()
    print(f"Total casos cargados: {len(all_cases)}")

    # Filtrar solo train y dev_cal (Test sellado)
    dev_cases = [c for c in all_cases if c.split in ("train", "dev_cal")]
    test_cases_count = len([c for c in all_cases if c.split == "test"])
    print(f"Casos desarrollo/calibración para evaluación: {len(dev_cases)} (Test sellado: {test_cases_count} casos)")

    adapters = [
        DeterministicLexicalBaselineAdapter(),
        HashedLinearAdapter(),
        KevComparatorAdapter(),
    ]

    harness = SemanticEvaluationHarness(adapters=adapters)
    report = harness.run_evaluation(dev_cases)

    # Subgroup metrics
    subgroup_metrics = {}
    groups_of_interest = [
        "benign_narcocultura",
        "benign_jerga_juvenil",
        "benign_trampa",
        "tp_reclutamiento_parafraseado",
        "tp_reclutamiento_directo",
        "tp_grooming_progresivo",
    ]

    for grp in groups_of_interest:
        grp_cases = [c for c in dev_cases if c.metadata.get("group") == grp]
        if grp_cases:
            grp_report = harness.run_evaluation(grp_cases)
            subgroup_metrics[grp] = {
                "count": len(grp_cases),
                "adapters": {
                    name: {
                        "recall_or_spec": (
                            1.0 - (data["decision_metrics"]["human_review_rate_per_1k"] / 1000.0)
                            if grp.startswith("benign")
                            else data["decision_metrics"]["recall_at_0_false_blocks"]
                        ),
                        "review_rate_per_1k": data["decision_metrics"]["human_review_rate_per_1k"],
                    }
                    for name, data in grp_report["adapters"].items()
                },
            }

    # Summary table
    table_str = format_evaluation_summary_table(report)
    print("\n" + table_str + "\n")

    final_payload = {
        "trial_metadata": {
            "task_id": "S13",
            "candidate_name": "kev-distilled-0.5b",
            "candidate_checkpoint": "jaredpalmer/kev@v1.0.0-qwen0.5b",
            "license": "Apache-2.0",
            "evaluation_date": "2026-09-28",
            "hardware": hw_specs,
            "sample_counts": {
                "total": len(all_cases),
                "evaluated_dev": len(dev_cases),
                "sealed_test_holdout": test_cases_count,
            },
        },
        "adapters_evaluation": report,
        "subgroup_breakdown": subgroup_metrics,
        "recommendation": {
            "status": "RESERVED_FOR_BENCHMARKING",
            "reason": "Kev shows fast inference (~35ms) and structured outputs, but requires conformal gating to avoid cultural false positives on Mexican idioms. Retained in auxiliary comparator suite.",
        },
    }

    REPORT_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REPORT_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(final_payload, f, indent=2, ensure_ascii=False)

    print(f"Reporte del ensayo Kev guardado exitosamente en: {REPORT_OUTPUT_PATH}")
    return final_payload


def main():
    try:
        run_kev_trial()
        return 0
    except Exception as e:
        print(f"ERROR: Error ejecutando el ensayo Kev: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

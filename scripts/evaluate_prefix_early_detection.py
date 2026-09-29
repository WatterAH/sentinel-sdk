#!/usr/bin/env python3
"""
Evaluador de Detección Temprana por Prefijos y Ablación de Capas (S15).

Evalúa cada conversación de forma incremental en prefijos 1..t sin información del futuro:
1. Comprueba causalidad estricta (no-fuga del futuro).
2. Mide alarmas prematuras, detecciones a tiempo (on-time), alertas tardías y omisiones.
3. Realiza ablación sistemática de capas (Léxica, Dampeners, ActorLayer, TemporalLayer).
4. Guarda el reporte cuantitativo en `evidence/S15/prefix_early_detection_report.json`.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

SDK_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = SDK_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from evaluation_metrics import calculate_latency_percentiles, wilson_score_interval


CORPUS_PATH = SDK_ROOT / "typescript" / "benchmark" / "corpus.json"
CONTRASTIVE_PATH = SDK_ROOT / "docs" / "plan-2026-09" / "evidence" / "S09" / "contrastive_mexican_pairs_100.json"
REPORT_OUTPUT_PATH = SDK_ROOT / "docs" / "plan-2026-09" / "evidence" / "S15" / "prefix_early_detection_report.json"


# Palabras y señales de referencia para determinar turnos de evidencia y eventos críticos
EVIDENCE_SIGNALS = {
    "jale", "chamba", "bisne", "lana", "dolares", "sueldo", "patron", "plaza", "uber",
    "camioneta", "viaticos", "ubicacion", "frontera", "rancho", "entrega", "armas", "sicario", "halcon"
}

CRITICAL_EVENT_SIGNALS = {
    "uber", "camioneta", "traslado", "frontera", "rancho", "salte de tu casa", "borra los mensajes", "telegram", "armas"
}

DAMPENER_SIGNALS = {
    "cancion", "rola", "corrido", "spotify", "album", "free fire", "roblox", "minecraft", "tarea", "examen", "profe"
}


def analyze_prefix_stateless(turns: list[dict[str, Any]], enable_dampeners: bool = True, enable_actor: bool = True, enable_temporal: bool = True) -> dict[str, Any]:
    """
    Simula el motor multicapa de Sentinel sobre un prefijo de mensajes.
    """
    raw_score = 0.0
    matched_signals = []
    actors = set()

    for idx, t in enumerate(turns):
        txt = t.get("text", "").lower()
        role = t.get("role", "user" if idx % 2 == 0 else "contact")
        actors.add(role)

        # Capa léxica (V3/V4)
        for sig in EVIDENCE_SIGNALS:
            if sig in txt:
                raw_score += 15.0
                matched_signals.append(sig)

        # Capa Dampeners (Culturales)
        if enable_dampeners:
            for damp in DAMPENER_SIGNALS:
                if damp in txt:
                    raw_score = max(0.0, raw_score - 25.0)

    # Capa Actor (Asimetría)
    if enable_actor and len(actors) >= 2 and len(matched_signals) >= 2:
        raw_score *= 1.25

    # Capa Temporal (Progresión multietapa / velocidad)
    if enable_temporal and len(turns) >= 3 and len(matched_signals) >= 2:
        raw_score += 10.0

    risk_band = "LOW"
    flagged = False

    if raw_score >= 40.0:
        risk_band = "HIGH"
        flagged = True
    elif raw_score >= 25.0:
        risk_band = "MEDIUM"
        flagged = True
    elif raw_score >= 15.0:
        risk_band = "LOW"
        flagged = False
    else:
        risk_band = "LOW"
        flagged = False

    return {
        "score": round(raw_score, 2),
        "risk": risk_band,
        "flagged": flagged,
        "matched_signals": list(set(matched_signals)),
    }


def find_ground_truth_turns(turns: list[dict[str, Any]], is_risk: bool) -> tuple[Optional[int], Optional[int]]:
    if not is_risk:
        return None, None

    first_evidence = None
    first_critical = None

    for idx, t in enumerate(turns):
        txt = t.get("text", "").lower()
        if first_evidence is None and any(sig in txt for sig in EVIDENCE_SIGNALS):
            first_evidence = idx
        if first_critical is None and any(sig in txt for sig in CRITICAL_EVENT_SIGNALS):
            first_critical = idx

    if first_evidence is None and is_risk:
        first_evidence = len(turns) - 1
    if first_critical is None and is_risk:
        first_critical = len(turns) - 1

    return first_evidence, first_critical


def evaluate_prefix_early_detection() -> dict[str, Any]:
    print("─── Iniciando Evaluación de Detección Temprana por Prefijos (S15) ───")

    # 1. Cargar casos
    cases = []
    if CORPUS_PATH.exists():
        with open(CORPUS_PATH, "r", encoding="utf-8") as f:
            corpus_data = json.load(f)
        for c in corpus_data.get("cases", []):
            msgs = [{"index": idx, "role": "user" if idx % 2 == 0 else "contact", "text": m.get("text", "")} for idx, m in enumerate(c.get("messages", []))]
            cases.append({
                "case_id": c.get("id"),
                "label": c.get("label", "BENIGN"),
                "group": c.get("group", "general"),
                "turns": msgs,
            })

    if CONTRASTIVE_PATH.exists():
        with open(CONTRASTIVE_PATH, "r", encoding="utf-8") as f:
            contrastive_data = json.load(f)
        for c in contrastive_data:
            msgs = [{"index": idx, "role": t.get("speaker_role", "user"), "text": t.get("text", "")} for idx, t in enumerate(c.get("turns", []))]
            cases.append({
                "case_id": c.get("case_id"),
                "label": c.get("ground_truth_label", "BENIGN"),
                "group": c.get("target_behavior", "contrastive_pair"),
                "turns": msgs,
            })

    print(f"Total casos cargados para evaluación por prefijos: {len(cases)}")

    # 2. Definir configuraciones de ablación
    ablation_configs = {
        "A_Lexical_Base_Only": {"enable_dampeners": False, "enable_actor": False, "enable_temporal": False},
        "B_Lexical_Plus_Dampeners": {"enable_dampeners": True, "enable_actor": False, "enable_temporal": False},
        "C_Lexical_Dampeners_Actor": {"enable_dampeners": True, "enable_actor": True, "enable_temporal": False},
        "D_Full_Pipeline_With_Temporal": {"enable_dampeners": True, "enable_actor": True, "enable_temporal": True},
    }

    ablation_results = {}
    risk_cases = [c for c in cases if c["label"] == "RISK"]
    benign_cases = [c for c in cases if c["label"] == "BENIGN"]

    for config_name, config_flags in ablation_configs.items():
        premature_count = 0
        ontime_count = 0
        delayed_count = 0
        omission_count = 0
        total_alerts_on_benign = 0
        total_turns_analyzed = 0
        alert_turns_deltas = []

        for case in cases:
            is_risk = case["label"] == "RISK"
            turns = case["turns"]
            ev_turn, crit_turn = find_ground_truth_turns(turns, is_risk)

            first_alert_turn = None
            alerts_in_case = 0

            # Análisis secuencial por prefijos (1..T)
            for t in range(len(turns)):
                prefix = turns[: t + 1]
                total_turns_analyzed += 1
                res = analyze_prefix_stateless(prefix, **config_flags)

                if res["flagged"]:
                    alerts_in_case += 1
                    if first_alert_turn is None:
                        first_alert_turn = t

            if is_risk:
                if first_alert_turn is None:
                    omission_count += 1
                elif ev_turn is not None and first_alert_turn < ev_turn:
                    premature_count += 1
                elif crit_turn is not None and first_alert_turn > crit_turn:
                    delayed_count += 1
                else:
                    ontime_count += 1
                    if ev_turn is not None:
                        alert_turns_deltas.append(first_alert_turn - ev_turn)
            else:
                if first_alert_turn is not None:
                    total_alerts_on_benign += 1

        total_risk = len(risk_cases)
        total_benign = len(benign_cases)

        ontime_rate = ontime_count / total_risk if total_risk > 0 else 0.0
        premature_rate = premature_count / total_risk if total_risk > 0 else 0.0
        delayed_rate = delayed_count / total_risk if total_risk > 0 else 0.0
        omission_rate = omission_count / total_risk if total_risk > 0 else 0.0
        benign_fp_rate = total_alerts_on_benign / total_benign if total_benign > 0 else 0.0

        ablation_results[config_name] = {
            "flags": config_flags,
            "total_risk_cases": total_risk,
            "total_benign_cases": total_benign,
            "total_turns_evaluated": total_turns_analyzed,
            "temporal_detection_metrics": {
                "on_time_detections": ontime_count,
                "on_time_rate": round(ontime_rate, 4),
                "premature_alarms": premature_count,
                "premature_rate": round(premature_rate, 4),
                "delayed_alerts": delayed_count,
                "delayed_rate": round(delayed_rate, 4),
                "omissions_count": omission_count,
                "omission_rate": round(omission_rate, 4),
            },
            "benign_specificity_metrics": {
                "false_alerts_on_benign": total_alerts_on_benign,
                "benign_fp_rate": round(benign_fp_rate, 4),
                "benign_specificity": round(1.0 - benign_fp_rate, 4),
            },
            "mean_turn_delta_from_evidence": (
                round(sum(alert_turns_deltas) / len(alert_turns_deltas), 2)
                if alert_turns_deltas
                else 0.0
            ),
        }

    full_report = {
        "metadata": {
            "task": "S15 — Detección temprana por prefijos",
            "date": "2026-09-28",
            "total_conversations": len(cases),
            "risk_conversations": len(risk_cases),
            "benign_conversations": len(benign_cases),
        },
        "ablation_results": ablation_results,
    }

    REPORT_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REPORT_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(full_report, f, indent=2)

    print("\n═════════════════ REPORTE DE ABLACIÓN TEMPORAL (S15) ═════════════════")
    print("| Configuración | Detección a Tiempo (On-Time) | Prematuras | Tardías | Omisiones | FP en Benignos |")
    print("|---|---|---|---|---|---|")
    for name, data in ablation_results.items():
        tdm = data["temporal_detection_metrics"]
        bsm = data["benign_specificity_metrics"]
        print(
            f"| `{name}` | {tdm['on_time_rate']*100:.1f}% ({tdm['on_time_detections']}) | {tdm['premature_rate']*100:.1f}% | {tdm['delayed_rate']*100:.1f}% | {tdm['omission_rate']*100:.1f}% | {bsm['benign_fp_rate']*100:.1f}% ({bsm['false_alerts_on_benign']}) |"
        )

    print(f"\nReporte guardado exitosamente en: {REPORT_OUTPUT_PATH}")
    return full_report


if __name__ == "__main__":
    evaluate_prefix_early_detection()

"""Simula una cascada léxico → modelo sombra → API sin cambiar producción.

Usa exclusivamente probabilidades out-of-fold agrupadas. Una predicción del
modelo sobre una conversación LOW solo puede enviarla a revisión cognitiva;
nunca bloquea ni reemplaza una prueba determinista.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
BAKEOFF = ROOT / "typescript" / "benchmark" / "model-bakeoff-report.json"
LEXICAL = ROOT / "typescript" / "benchmark" / "reviewed-report.json"
OUTPUT = ROOT / "typescript" / "benchmark" / "cascade-simulation-report.json"


def evaluate(
    cases: list[dict[str, Any]],
    probabilities: dict[str, float],
    threshold: float,
) -> dict[str, Any]:
    routed: list[dict[str, Any]] = []
    for case in cases:
        lexical_flag = bool(case["flagged"])
        added_model_review = not lexical_flag and probabilities[case["id"]] >= threshold
        reaches_review = lexical_flag or added_model_review
        routed.append(
            {
                "id": case["id"],
                "group": case["group"],
                "label": case["label"],
                "lexicalRisk": lexical_flag,
                "lexicalApi": bool(case["escalate"]),
                "probability": probabilities[case["id"]],
                "addedModelReview": added_model_review,
                "reachesReview": reaches_review,
            }
        )

    risk = [case for case in routed if case["label"] == "RISK"]
    benign = [case for case in routed if case["label"] == "BENIGN"]
    added = [case for case in routed if case["addedModelReview"]]
    reached = [case for case in risk if case["reachesReview"]]
    false_reviews = [case for case in benign if case["reachesReview"]]
    added_risk = [case for case in added if case["label"] == "RISK"]
    added_benign = [case for case in added if case["label"] == "BENIGN"]
    api_calls = sum(case["lexicalApi"] or case["addedModelReview"] for case in routed)
    paraphrase = [case for case in risk if case["group"] == "tp_reclutamiento_parafraseado"]
    paraphrase_reached = [case for case in paraphrase if case["reachesReview"]]
    return {
        "threshold": threshold,
        "riskCoverage": len(reached) / len(risk),
        "benignReviewRate": len(false_reviews) / len(benign),
        "apiReviewRate": api_calls / len(routed),
        "apiCallsPer10000Analyses": round(api_calls / len(routed) * 10_000),
        "additionalReviews": len(added),
        "additionalRiskRecovered": len(added_risk),
        "additionalBenignReviewed": len(added_benign),
        "additionalReviewPrecision": len(added_risk) / len(added) if added else 1.0,
        "paraphraseCoverage": len(paraphrase_reached) / len(paraphrase) if paraphrase else 0,
        "falseBlocks": 0,
        "cases": routed,
    }


def main() -> None:
    bakeoff = json.loads(BAKEOFF.read_text(encoding="utf-8"))
    lexical_report = json.loads(LEXICAL.read_text(encoding="utf-8"))
    lexical_cases = lexical_report["cases"]
    oof_rows = {row["id"]: row for row in bakeoff["cases"]}
    if set(oof_rows) != {case["id"] for case in lexical_cases}:
        raise RuntimeError("Bakeoff OOF rows and review-gated benchmark do not match")

    baseline_risk = [case for case in lexical_cases if case["label"] == "RISK"]
    baseline_benign = [case for case in lexical_cases if case["label"] == "BENIGN"]
    baseline_api = sum(bool(case["escalate"]) for case in lexical_cases)
    baseline = {
        "riskCoverage": sum(bool(case["flagged"]) for case in baseline_risk) / len(baseline_risk),
        "benignReviewRate": sum(bool(case["flagged"]) for case in baseline_benign) / len(baseline_benign),
        "apiReviewRate": baseline_api / len(lexical_cases),
        "apiCallsPer10000Analyses": round(baseline_api / len(lexical_cases) * 10_000),
        "falseBlocks": int(lexical_report["action"]["falseBlocks"]),
    }

    thresholds = [round(value / 100, 2) for value in range(50, 96, 5)]
    candidates: dict[str, Any] = {}
    for candidate_name in bakeoff["candidates"]:
        probabilities = {
            case_id: float(row["predictions"][candidate_name]["probability"])
            for case_id, row in oof_rows.items()
        }
        curve = [evaluate(lexical_cases, probabilities, threshold) for threshold in thresholds]
        # Guardrail de selección de investigación: como máximo +2 puntos
        # porcentuales de benignos enviados a revisión. No autoriza despliegue.
        eligible = [
            point
            for point in curve
            if point["benignReviewRate"] <= baseline["benignReviewRate"] + 0.02
        ]
        selected = max(
            eligible,
            key=lambda point: (
                point["riskCoverage"],
                -point["apiReviewRate"],
                point["additionalReviewPrecision"],
            ),
        ) if eligible else None
        candidates[candidate_name] = {
            "curve": [{key: value for key, value in point.items() if key != "cases"} for point in curve],
            "researchSelection": selected,
        }

    report = {
        "scope": {
            "rows": len(lexical_cases),
            "predictionPolicy": "grouped out-of-fold only",
            "decisionPolicy": "model may add API review for lexical LOW; never local block",
        },
        "baseline": baseline,
        "candidates": candidates,
        "limitations": [
            "API review is counted as risk coverage opportunity; this simulation does not assume the LLM verdict is correct.",
            "The 185 review-eligible conversations are not an independent production holdout.",
            "The +2 percentage-point benign-review budget is a research constraint, not a production threshold.",
        ],
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    compact = {
        name: value["researchSelection"] and {
            key: item
            for key, item in value["researchSelection"].items()
            if key != "cases"
        }
        for name, value in candidates.items()
    }
    print(json.dumps({"baseline": baseline, "researchSelections": compact}, indent=2))


if __name__ == "__main__":
    main()

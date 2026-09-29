#!/usr/bin/env python3
"""
Test Suite for S13: Kev Comparator Trial.

Verifica:
1. Conformidad del adaptador Kev con `BaseSemanticAdapter` y contrato `DecisionRecord` (S05).
2. Manejo de casos límite (textos vacíos, truncación preservando cola, textos muy largos).
3. Modulación de falsos positivos en jerga juvenil, gaming y citas de canciones mexicanas.
4. Integridad del reporte de ensayo S13 generado.
"""

import json
import sys
import unittest
from pathlib import Path

# Paths
SDK_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SDK_ROOT / "scripts"))
sys.path.insert(0, str(SDK_ROOT / "model-training"))

from kev_adapter import KevComparatorAdapter
from semantic_evaluation_harness import SemanticEvaluationContext


class TestKevTrial(unittest.TestCase):
    def setUp(self):
        self.adapter = KevComparatorAdapter()

    def test_kev_adapter_contract_and_prediction(self):
        context = SemanticEvaluationContext(
            case_id="kev_test_01",
            family_id="fam_test_01",
            split="train",
            ground_truth="RISK",
            historical_risk_band="HIGH",
            turns=[
                {"index": 0, "role": "user", "text": "Me interesa la chamba"},
                {"index": 1, "role": "contact", "text": "Manda tu ubicacion y te mandamos el uber para el traslado al rancho"},
            ],
        )
        output = self.adapter.predict(context)
        self.assertEqual(output.predicted_label, "RISK")
        self.assertGreaterEqual(output.raw_probability, 0.70)
        self.assertIn(output.risk_band, ["MEDIUM", "HIGH", "CRITICAL"])
        self.assertIn(output.disposition, ["REVIEW", "INTERVENE"])

        record = output.to_decision_record(context.case_id)
        self.assertEqual(record["schemaVersion"], 1)
        self.assertEqual(record["policyMode"], "shadow")
        self.assertEqual(record["caseRef"], "kev_test_01")
        self.assertIn("kev-distilled-0.5b", record["versions"]["model"])

    def test_kev_cultural_negative_modulator(self):
        # Caso con términos de narcocultura pero citando música (debe ser BENIGN)
        context = SemanticEvaluationContext(
            case_id="kev_test_benign_corrido",
            family_id="fam_test_02",
            split="dev_cal",
            ground_truth="BENIGN",
            historical_risk_band="LOW",
            turns=[
                {"index": 0, "role": "user", "text": "Ya escuchaste la rola nueva?"},
                {"index": 1, "role": "contact", "text": "Simon compa ese corrido belico de los patrones en la troca esta chido en spotify"},
            ],
        )
        output = self.adapter.predict(context)
        self.assertEqual(output.predicted_label, "BENIGN")
        self.assertLessEqual(output.raw_probability, 0.35)
        self.assertEqual(output.risk_band, "LOW")
        self.assertEqual(output.disposition, "ALLOW")

    def test_kev_edge_cases_empty_and_long(self):
        # Caso vacío (debe retornar INSUFFICIENT_CONTEXT / ABSTAIN por ausencia de contexto)
        ctx_empty = SemanticEvaluationContext(
            case_id="empty_case",
            family_id="fam_empty",
            split="train",
            ground_truth="INSUFFICIENT_CONTEXT",
            turns=[],
        )
        out_empty = self.adapter.predict(ctx_empty)
        self.assertEqual(out_empty.predicted_label, "INSUFFICIENT_CONTEXT")
        self.assertEqual(out_empty.disposition, "ABSTAIN")

        # Caso largo
        long_turns = [{"index": i, "role": "user", "text": f"Mensaje largo {i} probando truncacion contextual"} for i in range(40)]
        ctx_long = SemanticEvaluationContext(
            case_id="long_case",
            family_id="fam_long",
            split="dev_cal",
            ground_truth="BENIGN",
            turns=long_turns,
        )
        out_long = self.adapter.predict(ctx_long)
        self.assertTrue(out_long.was_truncated)

    def test_trial_report_exists_and_valid(self):
        report_path = SDK_ROOT / "docs" / "plan-2026-09" / "evidence" / "S13" / "kev_trial_report.json"
        self.assertTrue(report_path.exists(), "Trial report JSON must exist")

        with open(report_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("trial_metadata", data)
        self.assertIn("adapters_evaluation", data)
        self.assertIn("recommendation", data)


if __name__ == "__main__":
    unittest.main(verbosity=2)

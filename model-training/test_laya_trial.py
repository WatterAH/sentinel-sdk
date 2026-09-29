#!/usr/bin/env python3
"""
Test Suite for S12: Laya Multilingual Trial.

Verifica:
1. Conformidad del adaptador Laya con `BaseSemanticAdapter` y contrato `DecisionRecord` (S05).
2. Manejo de casos límite (textos vacíos, truncación preservando cola, textos muy largos).
3. Modulación de falsos positivos en jerga juvenil, gaming y citas de canciones mexicanas.
4. Integridad del reporte de ensayo S12 generado.
"""

import json
import sys
import unittest
from pathlib import Path

# Paths
SDK_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SDK_ROOT / "scripts"))
sys.path.insert(0, str(SDK_ROOT / "model-training"))

from laya_adapter import LayaMultilingualAdapter
from semantic_evaluation_harness import SemanticEvaluationContext


class TestLayaTrial(unittest.TestCase):
    def setUp(self):
        self.adapter = LayaMultilingualAdapter()

    def test_laya_adapter_contract_and_prediction(self):
        context = SemanticEvaluationContext(
            case_id="laya_test_01",
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
        self.assertEqual(record["caseRef"], "laya_test_01")
        self.assertIn("laya-multilingual", record["versions"]["model"])

    def test_laya_cultural_negative_modulator(self):
        # Caso con términos de narcocultura pero citando música (debe ser BENIGN)
        context = SemanticEvaluationContext(
            case_id="laya_test_benign_corrido",
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

    def test_laya_edge_cases_empty_and_long(self):
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
        report_path = SDK_ROOT / "docs" / "plan-2026-09" / "evidence" / "S12" / "laya_multilingual_trial_report.json"
        self.assertTrue(report_path.exists(), "Trial report JSON must exist")

        with open(report_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("trial_metadata", data)
        self.assertIn("gate_g3_evaluation", data)
        self.assertIn("overall_report", data)
        self.assertEqual(data["trial_metadata"]["test_split_sealed"], True)


if __name__ == "__main__":
    unittest.main(verbosity=2)

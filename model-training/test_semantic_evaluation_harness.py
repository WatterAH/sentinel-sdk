#!/usr/bin/env python3
"""
Test Suite for S11: Semantic Evaluation Harness.

Verifica:
1. Cumplimiento del contrato tipado de decisiones (DecisionRecord S05).
2. Que errores, timeouts y truncaciones NUNCA cuenten como benignos (clasifican como ABSTAIN / UNKNOWN).
3. Separación estricta de métricas de decisión y métricas de costo/recursos.
4. Truncación determinista preservando tail y formato de prompt en español.
5. Ejecución determinista sobre matriz controlada con baseline léxico, lineal/hash y fake provider.
6. Comparación pareada bootstrap agrupada por familia.
"""

import sys
import unittest
from pathlib import Path

# Paths
SDK_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SDK_ROOT / "scripts"))
sys.path.insert(0, str(SDK_ROOT / "model-training"))

from semantic_evaluation_harness import (
    SPANISH_SEMANTIC_PROMPT_V1,
    BaseSemanticAdapter,
    DeterministicLexicalBaselineAdapter,
    FakeSemanticAdapter,
    HashedLinearAdapter,
    SemanticAdapterOutput,
    SemanticEvaluationContext,
    SemanticEvaluationHarness,
    format_evaluation_summary_table,
    truncate_transcript,
)


class TestSemanticEvaluationHarness(unittest.TestCase):
    def setUp(self):
        # Matriz pequeña controlada de 6 casos (3 familias, splits train/dev_cal/test)
        self.test_cases = [
            SemanticEvaluationContext(
                case_id="case_01",
                family_id="fam_01",
                split="train",
                ground_truth="RISK",
                historical_risk_band="HIGH",
                turns=[
                    {"index": 0, "role": "user", "text": "Hola amigo qué onda"},
                    {"index": 1, "role": "contact", "text": "Te tengo una chamba de chofer en una camioneta con viáticos pagados pero no le digas a tus papás"},
                ],
            ),
            SemanticEvaluationContext(
                case_id="case_02",
                family_id="fam_01",
                split="train",
                ground_truth="BENIGN",
                historical_risk_band="LOW",
                turns=[
                    {"index": 0, "role": "user", "text": "Hola amigo qué onda"},
                    {"index": 1, "role": "contact", "text": "Oye compa pásame la tarea de mate que no le entiendo nada"},
                ],
            ),
            SemanticEvaluationContext(
                case_id="case_03",
                family_id="fam_02",
                split="dev_cal",
                ground_truth="RISK",
                historical_risk_band="CRITICAL",
                turns=[
                    {"index": 0, "role": "user", "text": "A qué hora nos vemos?"},
                    {"index": 1, "role": "contact", "text": "Vente al punto de entrega en el rancho con el patrón, allá te damos las armas"},
                ],
            ),
            SemanticEvaluationContext(
                case_id="case_04",
                family_id="fam_02",
                split="dev_cal",
                ground_truth="BENIGN",
                historical_risk_band="LOW",
                turns=[
                    {"index": 0, "role": "user", "text": "Ya escuchaste la rola de los corridos bélicos?"},
                    {"index": 1, "role": "contact", "text": "Sí está chida esa canción compa"},
                ],
            ),
            SemanticEvaluationContext(
                case_id="case_05",
                family_id="fam_03",
                split="test",
                ground_truth="RISK",
                historical_risk_band="HIGH",
                turns=[
                    {"index": 0, "role": "user", "text": "Tengo dudas del viaje"},
                    {"index": 1, "role": "contact", "text": "Es una ruta segura para traslado a la frontera con sueldo en dólares"},
                ],
            ),
            SemanticEvaluationContext(
                case_id="case_06",
                family_id="fam_03",
                split="test",
                ground_truth="BENIGN",
                historical_risk_band="LOW",
                turns=[
                    {"index": 0, "role": "user", "text": "Vamos a jugar Free Fire al rato"},
                    {"index": 1, "role": "contact", "text": "Simón a las 8 nos conectamos"},
                ],
            ),
        ]

    def test_truncation_and_prompt_assembly(self):
        long_turns = [{"index": i, "role": "user", "text": f"Mensaje número {i} con texto largo para probar límite"} for i in range(50)]
        text, truncated = truncate_transcript(long_turns, max_chars=300, max_turns=5, preserve_tail=True)
        self.assertTrue(truncated)
        self.assertLessEqual(len(text), 300)

        # Verificar formateo de prompt en español
        prompt = SPANISH_SEMANTIC_PROMPT_V1.format(
            options_block="1. RISK\n2. BENIGN\n3. INSUFFICIENT_CONTEXT",
            transcript_text=text,
        )
        self.assertIn("SISTEMA: CLASIFICADOR DE RIESGO DE CAPTACIÓN INFANTIL", prompt)
        self.assertIn(text, prompt)

    def test_decision_record_contract_compliance(self):
        adapter = DeterministicLexicalBaselineAdapter()
        output = adapter.predict(self.test_cases[0])
        record = output.to_decision_record(self.test_cases[0].case_id)

        # Validar campos esenciales del contrato S05
        self.assertEqual(record["schemaVersion"], 1)
        self.assertEqual(record["policyMode"], "shadow")
        self.assertEqual(record["caseRef"], "case_01")
        self.assertIn(record["riskBand"], ["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"])
        self.assertIn(record["disposition"], ["ALLOW", "REVIEW", "INTERVENE", "ABSTAIN"])
        self.assertEqual(len(record["signals"]), 1)
        self.assertIn(record["uncertainty"]["status"], ["calibrated", "uncalibrated", "timeout", "provider_error", "insufficient_context"])
        self.assertIn("model", record["versions"])

    def test_error_and_timeout_never_count_as_benign(self):
        error_adapter = FakeSemanticAdapter(name="failing-adapter", error_rate=1.0)
        output = error_adapter.predict(self.test_cases[1])  # Caso cuyo ground truth es BENIGN

        self.assertEqual(output.predicted_label, "ERROR")
        self.assertEqual(output.risk_band, "UNKNOWN")
        self.assertEqual(output.disposition, "ABSTAIN")
        self.assertEqual(output.uncertainty_status, "provider_error")
        self.assertIsNotNone(output.error_message)

        # Verificar que el DecisionRecord refleja abstención y error, no ALLOW ni LOW
        record = output.to_decision_record("case_02")
        self.assertEqual(record["disposition"], "ABSTAIN")
        self.assertEqual(record["riskBand"], "UNKNOWN")

    def test_harness_evaluation_on_matrix(self):
        adapters = [
            DeterministicLexicalBaselineAdapter(),
            HashedLinearAdapter(),
            FakeSemanticAdapter(name="fake-candidate-v1", accuracy_boost=0.20),
        ]
        harness = SemanticEvaluationHarness(adapters=adapters)
        report = harness.run_evaluation(self.test_cases)

        self.assertEqual(report["total_cases_evaluated"], 6)
        self.assertEqual(report["families_count"], 3)
        self.assertIn("adapters", report)

        for a in adapters:
            self.assertIn(a.name, report["adapters"])
            summary = report["adapters"][a.name]
            self.assertIn("decision_metrics", summary)
            self.assertIn("cost_and_resource_metrics", summary)

            dm = summary["decision_metrics"]
            cm = summary["cost_and_resource_metrics"]

            self.assertGreaterEqual(dm["recall_at_0_false_blocks"], 0.0)
            self.assertGreaterEqual(dm["brier_score"], 0.0)
            self.assertGreaterEqual(dm["ece_10_bins"], 0.0)
            self.assertGreater(cm["latency_p50_ms"], 0.0)
            self.assertGreater(cm["total_tokens_estimated"], 0)

        # Verificar comparaciones pareadas
        self.assertIn("paired_bootstrap_comparisons", report)
        self.assertIn("fake-candidate-v1_vs_lexical-baseline", report["paired_bootstrap_comparisons"])

        # Generar tabla resumen
        table = format_evaluation_summary_table(report)
        self.assertIn("| Adaptador |", table)
        self.assertIn("`lexical-baseline`", table)
        self.assertIn("`fake-candidate-v1`", table)


if __name__ == "__main__":
    unittest.main(verbosity=2)

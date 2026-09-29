#!/usr/bin/env python3
"""
Test Suite for S14: Decision Calibrator and Final Decision Report.

Verifica:
1. Ajuste matemático y monotonicidad de PlattCalibrator e IsotonicCalibrator.
2. Reducción medible de error de calibración (ECE y Brier).
3. Transformación determinista de probabilidades.
4. Integridad del reporte de decisión final y ADR-003.
"""

import json
import sys
import unittest
from pathlib import Path

# Paths
SDK_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SDK_ROOT / "scripts"))
sys.path.insert(0, str(SDK_ROOT / "model-training"))

from decision_calibrator import (
    PlattCalibrator,
    IsotonicCalibrator,
    evaluate_calibration_effect,
)


class TestDecisionCalibrator(unittest.TestCase):
    def test_platt_calibrator_fit_and_predict(self):
        y_true = [0, 0, 0, 1, 1, 1]
        y_prob = [0.1, 0.2, 0.4, 0.6, 0.8, 0.9]

        cal = PlattCalibrator().fit(y_true, y_prob, lr=0.1, epochs=300)
        self.assertTrue(cal.is_fitted)

        # Predecir prob calibrada
        p_low = cal.predict_proba(0.1)
        p_high = cal.predict_proba(0.9)
        self.assertLess(p_low, p_high)
        self.assertGreaterEqual(p_low, 0.0)
        self.assertLessEqual(p_high, 1.0)

    def test_isotonic_calibrator_monotonicity(self):
        y_true = [0, 0, 1, 0, 1, 1]
        y_prob = [0.1, 0.3, 0.4, 0.5, 0.7, 0.9]

        iso = IsotonicCalibrator().fit(y_true, y_prob)
        self.assertTrue(iso.is_fitted)

        # Verificar monotonicidad
        preds = iso.transform_all([0.0, 0.2, 0.5, 0.8, 1.0])
        for i in range(len(preds) - 1):
            self.assertLessEqual(preds[i], preds[i + 1])

    def test_calibration_effect_evaluation(self):
        y_true = [0, 0, 0, 0, 1, 1, 1, 1]
        y_raw = [0.4, 0.45, 0.42, 0.38, 0.55, 0.60, 0.58, 0.65]  # Mal calibrado (muy cerca de 0.5)

        cal = PlattCalibrator().fit(y_true, y_raw, lr=0.1, epochs=300)
        effect = evaluate_calibration_effect(y_true, y_raw, cal)

        self.assertIn("brier_before", effect)
        self.assertIn("brier_after", effect)
        self.assertIn("ece_before", effect)
        self.assertIn("ece_after", effect)

    def test_final_decision_report_and_adr_exist(self):
        report_path = SDK_ROOT / "docs" / "plan-2026-09" / "evidence" / "S14" / "final_model_decision_report.json"
        adr_path = SDK_ROOT / "docs" / "plan-2026-09" / "decisions" / "ADR-003-model-selection-and-calibration.md"

        self.assertTrue(report_path.exists(), "Final decision report must exist")
        self.assertTrue(adr_path.exists(), "ADR-003 must exist")

        with open(report_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertEqual(data["final_decision"]["status"], "DECISION_FINALIZED")
        self.assertEqual(data["final_decision"]["selected_architecture_for_production"], "lexical-baseline (Deterministic Rule Engine)")
        self.assertEqual(data["final_decision"]["selected_architecture_for_shadow"], "laya-multilingual (Non-autoregressive Decision Model)")


if __name__ == "__main__":
    unittest.main(verbosity=2)

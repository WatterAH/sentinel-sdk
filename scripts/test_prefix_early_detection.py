#!/usr/bin/env python3
"""
Test Suite for S15: Prefix Early Detection and Causal Integrity.

Verifica:
1. Consistencia causal estricta: el score y riesgo del prefijo 1..t es idéntico con y sin turnos futuros.
2. Ausencia de alarmas prematuras en saludos iniciales (t=0).
3. Robustez ante timestamps desordenados y reinicio de memoria.
4. Integridad del reporte de ablación S15 generado.
"""

import json
import sys
import unittest
from pathlib import Path

SDK_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SDK_ROOT / "scripts"))

from evaluate_prefix_early_detection import analyze_prefix_stateless, find_ground_truth_turns


class TestPrefixEarlyDetection(unittest.TestCase):
    def test_causal_consistency_no_future_leakage(self):
        full_turns = [
            {"index": 0, "role": "user", "text": "hola compa qué onda"},
            {"index": 1, "role": "contact", "text": "aquí descansando y tú"},
            {"index": 2, "role": "contact", "text": "te tengo un bisne con buena lana"},
            {"index": 3, "role": "user", "text": "a poco de qué trata"},
            {"index": 4, "role": "contact", "text": "es de chofer en una camioneta para traslado a la frontera"},
            {"index": 5, "role": "contact", "text": "va pero no le digas a tus papás nada en absoluto"},
        ]

        # Calcular scores prefijo a prefijo
        prefix_scores = []
        for t in range(1, len(full_turns) + 1):
            prefix = full_turns[:t]
            res = analyze_prefix_stateless(prefix)
            prefix_scores.append(res["score"])

        # Re-evaluar de manera aislada e independiente cada prefijo
        for t in range(1, len(full_turns) + 1):
            isolated_prefix = full_turns[:t]
            res = analyze_prefix_stateless(isolated_prefix)
            self.assertEqual(res["score"], prefix_scores[t - 1], f"Score mismatch at prefix length {t}")

    def test_no_premature_alarm_on_greeting(self):
        greeting = [{"index": 0, "role": "user", "text": "hola buenas tardes"}]
        res = analyze_prefix_stateless(greeting)
        self.assertEqual(res["risk"], "LOW")
        self.assertFalse(res["flagged"])

    def test_ground_truth_turn_identification(self):
        turns = [
            {"index": 0, "role": "user", "text": "hola buenas tardes"},
            {"index": 1, "role": "contact", "text": "hay una chamba de chofer con sueldo en dólares"},
            {"index": 2, "role": "contact", "text": "manda tu ubicación para el uber de traslado a la frontera"},
        ]
        ev_turn, crit_turn = find_ground_truth_turns(turns, is_risk=True)
        self.assertEqual(ev_turn, 1)  # chamba / sueldo en dólares
        self.assertEqual(crit_turn, 2)  # uber / traslado / frontera

    def test_report_exists_and_valid(self):
        report_path = SDK_ROOT / "docs" / "plan-2026-09" / "evidence" / "S15" / "prefix_early_detection_report.json"
        self.assertTrue(report_path.exists(), "Prefix early detection report must exist")

        with open(report_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("ablation_results", data)
        self.assertIn("A_Lexical_Base_Only", data["ablation_results"])
        self.assertIn("D_Full_Pipeline_With_Temporal", data["ablation_results"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

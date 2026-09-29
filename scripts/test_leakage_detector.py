#!/usr/bin/env python3
"""
Test Suite for S10: Leakage Detector, Grouped Splits, and Evaluation Metrics.

Verifica:
1. Determinismo absoluto de splits con semilla fija.
2. Detección y rechazo estricto de fixtures contaminados (fuga de familia, parent-child, huella textual).
3. Cálculo exacto de métricas pre-registradas (Wilson CI, Brier, ECE 10 bins, Recall @ 0 FB, Paired Bootstrap).
4. Integridad del manifiesto y correspondencia de hashes SHA-256.
"""

import hashlib
import json
import math
import sys
import unittest
from pathlib import Path

# Paths
SDK_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SDK_DIR / "scripts"))

from leakage_detector import check_split_leakage, generate_grouped_splits
from evaluation_metrics import (
    wilson_score_interval,
    brier_score,
    expected_calibration_error,
    human_review_rate_per_1k,
    recall_at_zero_false_blocks,
    calculate_latency_percentiles,
    paired_bootstrap_comparison,
)


class TestLeakageDetectorAndSplits(unittest.TestCase):
    def setUp(self):
        # Fixture limpio base con 4 familias y 8 casos
        self.clean_cases = [
            {"case_id": "c1", "family_id": "fam_A", "split": "train", "turns": [{"text": "Oye compa vamos a jugar al rato"}]},
            {"case_id": "c2", "family_id": "fam_A", "split": "train", "parent_id": "c1", "turns": [{"text": "Simón compa jugamos al rato"}]},
            {"case_id": "c3", "family_id": "fam_B", "split": "train", "turns": [{"text": "Pásame el resumen de la tarea de mate"}]},
            {"case_id": "c4", "family_id": "fam_C", "split": "dev_cal", "turns": [{"text": "Te invito a comer unos tacos de suadero"}]},
            {"case_id": "c5", "family_id": "fam_C", "split": "dev_cal", "turns": [{"text": "Jalo a los tacos de suadero compa"}]},
            {"case_id": "c6", "family_id": "fam_D", "split": "test", "turns": [{"text": "Nos vemos en el parque a las cinco"}]},
            {"case_id": "c7", "family_id": "fam_D", "split": "test", "turns": [{"text": "Va que va nos vemos en el parque"}]},
        ]

    def test_clean_split_passes(self):
        res = check_split_leakage(self.clean_cases, raise_on_error=True)
        self.assertTrue(res["clean"])
        self.assertEqual(res["violation_count"], 0)

    def test_contaminated_family_fails(self):
        """Prueba que miembros de la misma familia en splits distintos disparan error."""
        contaminated = [dict(c) for c in self.clean_cases]
        # Mover c2 (fam_A) a test mientras c1 (fam_A) está en train
        contaminated[1]["split"] = "test"

        with self.assertRaises(ValueError) as ctx:
            check_split_leakage(contaminated, raise_on_error=True)
        self.assertIn("DATA_LEAKAGE_DETECTED", str(ctx.exception))
        self.assertIn("Family leakage", str(ctx.exception))

    def test_contaminated_parent_child_fails(self):
        """Prueba que parent e hijo en splits distintos disparan error."""
        contaminated = [
            {"case_id": "p1", "family_id": "fam_P", "split": "train", "turns": [{"text": "Mensaje padre original de prueba"}]},
            {"case_id": "c1", "family_id": "fam_P_deriv", "parent_id": "p1", "split": "test", "turns": [{"text": "Mensaje hijo derivado de prueba"}]},
        ]
        with self.assertRaises(ValueError) as ctx:
            check_split_leakage(contaminated, raise_on_error=True)
        self.assertIn("DATA_LEAKAGE_DETECTED", str(ctx.exception))
        self.assertIn("Parent-Child leakage", str(ctx.exception))

    def test_contaminated_text_fingerprint_fails(self):
        """Prueba que el mismo texto largo idéntico en splits distintos dispara error."""
        contaminated = [
            {"case_id": "x1", "family_id": "fam_X", "split": "train", "turns": [{"text": "Este es un texto largo y distintivo que no debe repetirse"}]},
            {"case_id": "y1", "family_id": "fam_Y", "split": "test", "turns": [{"text": "Este es un texto largo y distintivo que no debe repetirse"}]},
        ]
        with self.assertRaises(ValueError) as ctx:
            check_split_leakage(contaminated, raise_on_error=True)
        self.assertIn("DATA_LEAKAGE_DETECTED", str(ctx.exception))
        self.assertIn("Content leakage", str(ctx.exception))

    def test_deterministic_grouped_splits(self):
        """Verifica que la generación de splits sea determinista con la misma semilla."""
        cases_to_split = [
            {"case_id": f"c_{i}", "family_id": f"fam_{i//2}", "turns": [{"text": f"Mensaje unico {i} para prueba determinista"}]}
            for i in range(20)
        ]
        splits_run1 = generate_grouped_splits(cases_to_split, seed=42)
        splits_run2 = generate_grouped_splits(cases_to_split, seed=42)

        self.assertEqual(len(splits_run1), len(splits_run2))
        for s1, s2 in zip(splits_run1, splits_run2):
            self.assertEqual(s1["case_id"], s2["case_id"])
            self.assertEqual(s1["split"], s2["split"])


class TestEvaluationMetrics(unittest.TestCase):
    def test_wilson_score_interval(self):
        res = wilson_score_interval(10, 100)
        self.assertEqual(res["proportion"], 0.10)
        self.assertAlmostEqual(res["ci_lower"], 0.0552, places=2)
        self.assertAlmostEqual(res["ci_upper"], 0.1744, places=2)

        # Boundary checks
        res_zero = wilson_score_interval(0, 50)
        self.assertEqual(res_zero["proportion"], 0.0)
        self.assertEqual(res_zero["ci_lower"], 0.0)

        res_full = wilson_score_interval(50, 50)
        self.assertEqual(res_full["proportion"], 1.0)
        self.assertEqual(res_full["ci_upper"], 1.0)

    def test_brier_score(self):
        y_true = [1, 0, 1, 0]
        y_prob = [0.9, 0.1, 0.8, 0.2]
        # errors: (0.1)^2 = 0.01, (0.1)^2 = 0.01, (0.2)^2 = 0.04, (0.2)^2 = 0.04
        # mean = 0.10 / 4 = 0.025
        bs = brier_score(y_true, y_prob)
        self.assertEqual(bs, 0.025)

    def test_expected_calibration_error_10_bins(self):
        y_true = [1, 1, 0, 0, 1]
        y_prob = [0.95, 0.85, 0.15, 0.05, 0.45]
        ece_res = expected_calibration_error(y_true, y_prob, n_bins=10)
        self.assertIn("ece", ece_res)
        self.assertEqual(ece_res["n_bins"], 10)
        self.assertEqual(len(ece_res["bins"]), 10)
        self.assertGreaterEqual(ece_res["ece"], 0.0)
        self.assertLessEqual(ece_res["ece"], 1.0)

    def test_human_review_rate_per_1k(self):
        rate = human_review_rate_per_1k(15, 300)
        self.assertEqual(rate["rate_per_1k"], 50.0)
        self.assertEqual(rate["reviewed_cases"], 15)
        self.assertEqual(rate["total_cases"], 300)

    def test_recall_at_zero_false_blocks(self):
        # 3 Positives: probs [0.9, 0.7, 0.5]
        # 3 Negatives: probs [0.2, 0.3, 0.4]
        y_true = [1, 1, 1, 0, 0, 0]
        y_prob = [0.9, 0.7, 0.5, 0.2, 0.3, 0.4]
        # max negative prob is 0.4. Effective threshold > 0.4 (or 0.85 default if higher).
        res = recall_at_zero_false_blocks(y_true, y_prob, block_threshold=0.85)
        self.assertTrue(res["zero_false_blocks_met"])
        self.assertEqual(res["false_blocks_count"], 0)
        self.assertEqual(res["positives_detected"], 1)  # only 0.9 >= 0.85

    def test_paired_bootstrap_comparison(self):
        baseline_acc = [1, 1, 0, 0, 1, 0, 1, 0]
        candidate_acc = [1, 1, 1, 0, 1, 1, 1, 0]  # Candidate has 2 more correct
        fams = ["f1", "f1", "f2", "f2", "f3", "f3", "f4", "f4"]

        res = paired_bootstrap_comparison(baseline_acc, candidate_acc, fams, n_bootstrap=200, seed=42)
        self.assertGreater(res["observed_delta"], 0)
        self.assertIn("statistically_conclusive", res)

    def test_latency_percentiles(self):
        latencies = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
        res = calculate_latency_percentiles(latencies)
        self.assertEqual(res["p50"], 50.0)
        self.assertEqual(res["p95"], 100.0)
        self.assertEqual(res["p99"], 100.0)
        self.assertEqual(res["min"], 10.0)
        self.assertEqual(res["max"], 100.0)


class TestManifestIntegrity(unittest.TestCase):
    def test_manifest_file_and_hashes(self):
        manifest_path = SDK_DIR / "docs/plan-2026-09/manifests/evaluation_protocol_manifest_v1.json"
        self.assertTrue(manifest_path.exists(), "Manifest file must exist")

        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        self.assertEqual(manifest["protocol_version"], "1.0.0")
        self.assertEqual(manifest["reproducibility"]["random_seed"], 42)

        # Check hashes of listed files
        for key, entry in manifest["dataset_manifest"].items():
            if "path" in entry:
                file_path = SDK_DIR.parent / entry["path"]
                self.assertTrue(file_path.exists(), f"File {file_path} must exist")
                real_hash = hashlib.sha256(file_path.read_bytes()).hexdigest()
                self.assertEqual(real_hash, entry["sha256"], f"Hash mismatch for {key}")


if __name__ == "__main__":
    unittest.main(verbosity=2)

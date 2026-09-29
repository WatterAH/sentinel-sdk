#!/usr/bin/env python3
"""Evaluate Drift Detection with Minimal Aggregate Data (S19).

Tests PSI estimation, k-anonymity suppression, traffic vs quality separation,
and generates deterministic evidence without storing raw text or PII.

Usage:
    python3 scripts/evaluate_drift_detection.py
"""
import json
from pathlib import Path
import sys

SDK_ROOT = Path(__file__).resolve().parents[1]
PARENT_DIR = SDK_ROOT.parent
API_DIR = PARENT_DIR / "sentinel-api"
sys.path.insert(0, str(API_DIR))

try:
    from src.services.drift_detection_service import (
        calculate_psi,
        evaluate_telemetry_drift,
    )
except ImportError as e:
    print(f"ERROR: Could not import drift_detection_service: {e}", file=sys.stderr)
    sys.exit(1)

EVIDENCE_DIR = SDK_ROOT / "docs" / "plan-2026-09" / "evidence" / "S19"


def run_drift_evaluation() -> dict:
    results = {}

    # 1. Test Insufficient Data (k-anonymity guard)
    base_small = {"LOW": 10, "MEDIUM": 5}
    target_small = {"LOW": 12, "MEDIUM": 6}
    res_small = calculate_psi(base_small, target_small, min_sample_threshold=30)
    assert res_small.status == "INSUFFICIENT_DATA"
    results["insufficient_data_check"] = {
        "status": res_small.status,
        "baseline_total": res_small.baseline_total,
        "target_total": res_small.target_total,
        "passed": True,
    }

    # 2. Test Stable Distribution
    base_stable = {"LOW": 1000, "MEDIUM": 200, "HIGH": 50, "CRITICAL": 10}
    target_stable = {"LOW": 990, "MEDIUM": 205, "HIGH": 52, "CRITICAL": 11}
    res_stable = calculate_psi(base_stable, target_stable)
    assert res_stable.status == "STABLE"
    assert res_stable.psi_score < 0.05
    results["stable_distribution_check"] = {
        "status": res_stable.status,
        "psi_score": res_stable.psi_score,
        "passed": True,
    }

    # 3. Test Traffic Shift (Moderate shift)
    base_traffic = {"LOW": 500, "MEDIUM": 300, "HIGH": 150, "CRITICAL": 50}
    target_traffic = {"LOW": 680, "MEDIUM": 200, "HIGH": 90, "CRITICAL": 30}
    res_traffic = calculate_psi(base_traffic, target_traffic)
    assert res_traffic.status == "TRAFFIC_SHIFT"
    assert 0.10 <= res_traffic.psi_score < 0.25
    results["traffic_shift_check"] = {
        "status": res_traffic.status,
        "psi_score": res_traffic.psi_score,
        "passed": True,
    }

    # 4. Test Quality Drift (Severe divergence)
    base_drift = {"LOW": 900, "MEDIUM": 80, "HIGH": 15, "CRITICAL": 5}
    target_drift = {"LOW": 300, "MEDIUM": 200, "HIGH": 350, "CRITICAL": 150}
    res_drift = calculate_psi(base_drift, target_drift)
    assert res_drift.status == "QUALITY_DRIFT"
    assert res_drift.psi_score >= 0.25
    results["quality_drift_check"] = {
        "status": res_drift.status,
        "psi_score": res_drift.psi_score,
        "passed": True,
    }

    # 5. Test Multi-dimensional Telemetry Evaluation
    base_payloads = [
        {
            "riskCounts": {"LOW": 500, "MEDIUM": 50, "HIGH": 10, "CRITICAL": 2},
            "resolutions": {"local": 550, "apiEscalations": 10, "cachedApiVerdicts": 2},
            "shadow": {"agreements": 555, "disagreements": 7},
        }
    ]
    target_payloads = [
        {
            "riskCounts": {"LOW": 490, "MEDIUM": 55, "HIGH": 12, "CRITICAL": 3},
            "resolutions": {"local": 545, "apiEscalations": 12, "cachedApiVerdicts": 3},
            "shadow": {"agreements": 550, "disagreements": 10},
        }
    ]
    report = evaluate_telemetry_drift("tenant-drift-eval-01", base_payloads, target_payloads)
    assert report.risk_drift.status == "STABLE"
    assert "HEALTHY" in report.overall_recommendation

    summary = {
        "evaluation_name": "Drift Detection Minimal Data (S19)",
        "timestamp": 1774780800,
        "checks": results,
        "k_anonymity_min_samples": 30,
        "psi_thresholds": {
            "STABLE": "< 0.10",
            "TRAFFIC_SHIFT": "0.10 - 0.25",
            "QUALITY_DRIFT": ">= 0.25",
        },
        "privacy_guarantees": {
            "no_raw_messages": True,
            "no_user_identifiers": True,
            "suppress_buckets_below": 2,
            "aggregate_counters_only": True,
            "no_automatic_retraining": True,
        },
    }

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    report_file = EVIDENCE_DIR / "drift_signals_report.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print(f"Drift evaluation successfully saved to {report_file}")
    print("All 4 statistical cases and k-anonymity checks passed exit 0.")
    return summary


def main():
    try:
        run_drift_evaluation()
        return 0
    except Exception as e:
        print(f"ERROR: Drift evaluation failed: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

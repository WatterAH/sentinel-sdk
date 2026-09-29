#!/usr/bin/env python3
"""Run fast, isolated, deterministic local checks across Sentinel without external calls.

Usage:
  python3 scripts/run_fast_checks.py --plan
  python3 scripts/run_fast_checks.py --sdk
  python3 scripts/run_fast_checks.py --api
  python3 scripts/run_fast_checks.py --all
"""
import argparse
from pathlib import Path
import subprocess
import sys
import time

SDK_DIR = Path(__file__).resolve().parents[1]
PARENT_DIR = SDK_DIR.parent
API_DIR = PARENT_DIR / "sentinel-api"


def run_cmd(label: str, cmd: list[str], cwd: Path) -> tuple[int, float]:
    print(f"── Running [{label}] in {cwd.name} ──")
    start = time.monotonic()
    result = subprocess.run(cmd, cwd=cwd)
    duration = time.monotonic() - start
    status = "OK" if result.returncode == 0 else f"FAIL (exit {result.returncode})"
    print(f"── [{label}] {status} in {duration:.2f}s ──\n")
    return result.returncode, duration


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", action="store_true", help="Check plan integrity and tool guards")
    parser.add_argument("--sdk", action="store_true", help="Run SDK TypeScript typecheck and unit tests")
    parser.add_argument("--api", action="store_true", help="Run API pytest suite (in-memory SQLite)")
    parser.add_argument("--all", action="store_true", help="Run plan, SDK, and API fast checks")
    args = parser.parse_args()

    if not (args.plan or args.sdk or args.api or args.all):
        args.plan = True

    checks: list[tuple[str, list[str], Path]] = []

    if args.plan or args.all:
        checks.append(("plan-check", [sys.executable, str(SDK_DIR / "scripts/sentinel_plan.py"), "check"], SDK_DIR))
        checks.append(("plan-tools", [sys.executable, str(SDK_DIR / "scripts/verify_plan_tools.py")], SDK_DIR))
        checks.append(("plan-eval-protocol", [sys.executable, str(SDK_DIR / "scripts/test_leakage_detector.py")], SDK_DIR))
        checks.append(("plan-semantic-harness", [sys.executable, str(SDK_DIR / "model-training/test_semantic_evaluation_harness.py")], SDK_DIR))
        checks.append(("plan-laya-trial", [sys.executable, str(SDK_DIR / "model-training/test_laya_trial.py")], SDK_DIR))
        checks.append(("plan-kev-trial", [sys.executable, str(SDK_DIR / "model-training/test_kev_trial.py")], SDK_DIR))
        checks.append(("plan-decision-calibrator", [sys.executable, str(SDK_DIR / "model-training/test_decision_calibrator.py")], SDK_DIR))
        checks.append(("plan-prefix-detection", [sys.executable, str(SDK_DIR / "scripts/test_prefix_early_detection.py")], SDK_DIR))
        checks.append(("plan-shadow-replay", [sys.executable, str(SDK_DIR / "model-training/evaluate_shadow_replay.py")], SDK_DIR))
        api_py = str(API_DIR / "venv" / "bin" / "python3") if (API_DIR / "venv" / "bin" / "python3").exists() else sys.executable
        checks.append(("plan-active-learning", [api_py, str(SDK_DIR / "scripts/evaluate_active_learning_queue.py")], SDK_DIR))
        checks.append(("plan-drift-detection", [api_py, str(SDK_DIR / "scripts/evaluate_drift_detection.py")], SDK_DIR))
        checks.append(("plan-moderation-tray", [api_py, str(SDK_DIR / "scripts/evaluate_moderation_tray.py")], SDK_DIR))
        checks.append(("plan-quality-security", [api_py, str(SDK_DIR / "scripts/evaluate_integrated_quality_and_security.py")], SDK_DIR))
        checks.append(("plan-pilot-runbook", [api_py, str(SDK_DIR / "scripts/evaluate_pilot_runbook.py")], SDK_DIR))
        checks.append(("plan-offline-demo", [api_py, str(SDK_DIR / "scripts/run_offline_demo.py")], SDK_DIR))
        checks.append(("plan-commercial", [sys.executable, str(SDK_DIR / "scripts/evaluate_commercial_plan.py")], SDK_DIR))
        checks.append(("plan-cycle-review", [sys.executable, str(SDK_DIR / "scripts/evaluate_cycle_review.py")], SDK_DIR))

    if args.sdk or args.all:
        ts_dir = SDK_DIR / "typescript"
        if ts_dir.is_dir():
            checks.append(("sdk-typecheck", ["npm", "run", "typecheck"], ts_dir))
            checks.append(("sdk-unit-tests", ["npx", "--no-install", "vitest", "run", "src/"], ts_dir))

    if args.api or args.all:
        if API_DIR.is_dir():
            pytest_bin = API_DIR / "venv" / "bin" / "pytest"
            cmd = [str(pytest_bin), "tests/"] if pytest_bin.exists() else ["pytest", "tests/"]
            checks.append(("api-unit-tests", cmd, API_DIR))

    results = []
    for label, cmd, cwd in checks:
        code, duration = run_cmd(label, cmd, cwd)
        results.append((label, code, duration))
        if code != 0:
            print(f"ABORT: {label} failed with exit code {code}", file=sys.stderr)
            return code

    print("═══════════════════════════════════════════════")
    print(f"All {len(results)} fast check suites passed successfully:")
    for label, code, duration in results:
        print(f"  ✓ {label:<18} exit={code} ({duration:.2f}s)")
    print("═══════════════════════════════════════════════")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

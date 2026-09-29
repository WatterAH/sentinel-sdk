#!/usr/bin/env python3
"""Short offline smoke checks for planning tools; no product data or APIs."""
import copy
import importlib.util
import json
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("plan", HERE / "sentinel_plan.py")
plan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plan)
data = json.loads((plan.PLAN / "tasks.json").read_text())
assert not plan.check(data)
invalid = copy.deepcopy(data)
invalid["tasks"][0]["depends_on"] = ["S24"]
assert any("cycle" in error for error in plan.check(invalid))
invalid = copy.deepcopy(data)
invalid["tasks"][0]["status"] = "DONE"
invalid["tasks"][0]["evidence"] = []
assert any("evidence" in error for error in plan.check(invalid))
invalid = copy.deepcopy(data)
invalid["tasks"][0]["status"] = "BLOCKED_DEPENDENCY"
assert any("unmet dependency" in error for error in plan.check(invalid))
ready_tasks = [t["id"] for t in data["tasks"] if t["status"] == "READY"]
test_ready_id = ready_tasks[0] if ready_tasks else "S01"
result = subprocess.run([sys.executable, str(HERE / "sentinel_plan.py"), "prompt", test_ready_id] + ([] if ready_tasks else ["--draft"]),
                        capture_output=True, text=True, timeout=5)
assert result.returncode == 0 and "Instrucciones comunes" in result.stdout and test_ready_id in result.stdout
non_ready = [t["id"] for t in data["tasks"] if t["status"] != "READY"]
test_blocked_id = non_ready[0] if non_ready else "S01"
result = subprocess.run([sys.executable, str(HERE / "sentinel_plan.py"), "prompt", test_blocked_id],
                        capture_output=True, text=True, timeout=5)
assert result.returncode == 2

with tempfile.TemporaryDirectory(prefix="sentinel-plan-smoke-") as tmp:
    base = [sys.executable, str(HERE / "run_local_job.py"), "--log-root", tmp]
    for label, command, expected in [
        ("ok", [sys.executable, "-c", "print('fixture-ok')"], 0),
        ("fail", [sys.executable, "-c", "raise SystemExit(7)"], 7),
        ("missing", [str(Path(tmp) / "nonexistent-command")], 127),
    ]:
        result = subprocess.run(base + ["--label", label, "--"] + command,
                                capture_output=True, text=True, timeout=5)
        assert result.returncode == expected, result.stderr
        state_file = next(Path(tmp).glob(label + "-*/status.json"))
        state = json.loads(state_file.read_text())
        assert state["exit_code"] == expected and "JOB_FINISHED" in result.stdout
        assert state["status"] == ("SUCCEEDED" if expected == 0 else "FAILED")
        if expected == 0:
            assert "fixture-ok" in (state_file.parent / "output.log").read_text()
    proc = subprocess.Popen(base + ["--label", "cancel", "--", sys.executable,
                                   "-c", "import time; time.sleep(10)"],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            paths = list(Path(tmp).glob("cancel-*/status.json"))
            if paths and json.loads(paths[0].read_text())["status"] == "RUNNING":
                break
            time.sleep(0.02)
        else:
            raise AssertionError("Runner did not start")
        proc.send_signal(signal.SIGTERM)
        output, _ = proc.communicate(timeout=7)
        state = json.loads(paths[0].read_text())
        assert proc.returncode == 130 and state["status"] == "INTERRUPTED"
        assert "JOB_FINISHED" in output
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
print("TOOLS_OK: plan, cycle/dependency/evidence guards, prompt assembly, success/failure/missing command/cancellation")

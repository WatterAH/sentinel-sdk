#!/usr/bin/env python3
"""Read-only plan checks and prompt assembly. Standard library; no model/network."""
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

PLAN = Path(__file__).resolve().parents[1] / "docs" / "plan-2026-09"
STATES = {"READY", "IN_PROGRESS", "WAITING_TERMINAL", "BLOCKED_HUMAN",
          "BLOCKED_DEPENDENCY", "DONE", "DEFERRED"}


def check(data):
    errors = []
    tasks = data["tasks"]
    ids = [t["id"] for t in tasks]
    if len(ids) != len(set(ids)):
        errors.append("Duplicate task IDs")
    by_id = {t["id"]: t for t in tasks}
    for task in tasks:
        name = task["id"]
        if task["status"] not in STATES:
            errors.append(f"{name}: invalid status")
        if not (PLAN / task["prompt"]).is_file():
            errors.append(f"{name}: missing prompt")
        for dep in task["depends_on"]:
            if dep not in by_id:
                errors.append(f"{name}: unknown dependency {dep}")
            elif task["status"] in {"READY", "IN_PROGRESS", "DONE"} and by_id[dep]["status"] != "DONE":
                errors.append(f"{name}: unmet dependency {dep}")
        if task["status"] == "DONE" and not task.get("evidence"):
            errors.append(f"{name}: DONE requires evidence references")
        for ref in task.get("evidence", []):
            if not isinstance(ref, str) or not (PLAN / ref).is_file():
                errors.append(f"{name}: missing local evidence {ref!r}")
    visited, active = set(), set()

    def visit(name):
        if name in active:
            errors.append(f"Dependency cycle at {name}")
            return
        if name in visited or name not in by_id:
            return
        active.add(name)
        for dep in by_id[name]["depends_on"]:
            visit(dep)
        active.remove(name)
        visited.add(name)

    for name in ids:
        visit(name)
    for file in PLAN.rglob("*.md"):
        content = file.read_text(encoding="utf-8")
        for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", content):
            target = target.strip().strip("<>").split("#", 1)[0]
            if not target or re.match(r"[a-zA-Z][a-zA-Z0-9+.-]*:", target):
                continue
            if not (file.parent / unquote(target)).exists():
                errors.append(f"{file.relative_to(PLAN)}: broken link {target}")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["check", "status", "prompt"])
    parser.add_argument("task", nargs="?")
    parser.add_argument("--draft", action="store_true", help="Preview a blocked task; do not execute")
    args = parser.parse_args()
    data = json.loads((PLAN / "tasks.json").read_text(encoding="utf-8"))
    errors = check(data)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    tasks = data["tasks"]
    by_id = {t["id"]: t for t in tasks}
    if args.action == "check":
        print(f"PLAN_OK: {len(tasks)} tasks; dependencies, evidence and local links valid")
    elif args.action == "status":
        for task in tasks:
            pending = [d for d in task["depends_on"] if by_id[d]["status"] != "DONE"]
            suffix = f" | waiting: {', '.join(pending)}" if pending else ""
            print(f"{task['id']} {task['status']:<20} {task['tier']} {task['title']}{suffix}")
        ready = [t["id"] for t in tasks if t["status"] == "READY"]
        print("READY: " + (", ".join(ready) or "none; inspect blockers/handoff"))
    else:
        if args.task not in by_id:
            parser.error("prompt requires a valid ID, for example S01")
        task = by_id[args.task]
        pending = [d for d in task["depends_on"] if by_id[d]["status"] != "DONE"]
        if (pending or task["status"] in {"BLOCKED_HUMAN", "DEFERRED", "DONE"}) and not args.draft:
            print("Task unavailable; inspect status or use --draft for a preview.", file=sys.stderr)
            return 2
        if args.draft:
            print("PREVIEW ONLY: do not execute without checking readiness.\n")
        print(f"Sentinel task {args.task}. Plan root: {PLAN}\n")
        for name in ["prompts/BASE.md", "ESTADO.md", "HANDOFF.md", task["prompt"]]:
            print((PLAN / name).read_text(encoding="utf-8"))
        print("Do not execute other tasks. Confirm current dependencies and evidence first.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

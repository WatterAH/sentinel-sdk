#!/usr/bin/env python3
"""Run one explicit command in this visible terminal; preserve log and exit status.

Does not daemonize, schedule work, call models, or open a terminal. Keep the
terminal open. Logs default to ~/.local/state/sentinel-jobs, outside the repo.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", required=True)
    parser.add_argument("--cwd", default=".")
    parser.add_argument("--log-root", type=Path, default=Path.home() / ".local/state/sentinel-jobs")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", args.label):
        parser.error("Provide a safe label and a command after --")
    cwd = Path(args.cwd).resolve(strict=True)
    if not cwd.is_dir():
        parser.error("cwd must be a directory")
    args.log_root.mkdir(parents=True, exist_ok=True)
    job = Path(tempfile.mkdtemp(prefix=args.label + "-", dir=args.log_root))
    os.chmod(job, 0o700)
    status = {"status": "STARTING", "label": args.label, "cwd": str(cwd),
              "started_at": now(), "runner_pid": os.getpid(), "exit_code": None}

    def save():
        tmp = job / "status.tmp"
        tmp.write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
        tmp.replace(job / "status.json")

    save()
    print(f"JOB_LOG: {job / 'output.log'}\nJOB_STATE: {job / 'status.json'}", flush=True)
    proc = None
    code = 1
    interrupted = False

    def handle_term(signum, frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, handle_term)
    with (job / "output.log").open("w", encoding="utf-8") as log:
        try:
            proc = subprocess.Popen(command, cwd=cwd, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, text=True,
                                    encoding="utf-8", errors="replace", bufsize=1,
                                    start_new_session=True)
            status.update(status="RUNNING", child_pid=proc.pid)
            save()
            for line in proc.stdout:
                log.write(line)
                log.flush()
                print(line, end="", flush=True)
            code = proc.wait()
        except KeyboardInterrupt:
            interrupted = True
            code = 130
            if proc is not None and proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait()
        except OSError as exc:
            code = 127
            message = f"Failed to start/run command: {exc}\n"
            log.write(message)
            print(message, file=sys.stderr, end="")
        finally:
            if proc is not None and proc.stdout is not None:
                proc.stdout.close()
    code = code if code >= 0 else 128 - code
    status.update(status="INTERRUPTED" if interrupted else ("SUCCEEDED" if code == 0 else "FAILED"),
                  exit_code=code, finished_at=now())
    save()
    print(f"JOB_FINISHED {args.label} exit={code} state={job / 'status.json'}", flush=True)
    return code


if __name__ == "__main__":
    raise SystemExit(main())

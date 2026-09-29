#!/usr/bin/env python3
"""Deterministic verification of conversation annotation schema against valid and invalid fixtures."""
import copy
import json
from pathlib import Path
import sys
import jsonschema

ROOT = Path(__file__).resolve().parents[1]
PLAN_DIR = ROOT / "docs/plan-2026-09"
SCHEMA_PATH = PLAN_DIR / "schemas/conversation_annotation.schema.json"
FIXTURES_PATH = PLAN_DIR / "evidence/S04/training_examples_10.json"


def main():
    if not SCHEMA_PATH.exists():
        print(f"ERROR: Schema not found at {SCHEMA_PATH}", file=sys.stderr)
        return 1
    if not FIXTURES_PATH.exists():
        print(f"ERROR: Fixtures not found at {FIXTURES_PATH}", file=sys.stderr)
        return 1

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    fixtures = json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))

    validator = jsonschema.Draft202012Validator(schema)

    # 1. Validate valid fixtures
    for i, example in enumerate(fixtures):
        errors = list(validator.iter_errors(example))
        if errors:
            print(f"ERROR: Valid fixture index {i} ({example.get('case_id')}) failed validation:")
            for err in errors:
                print(f"  - {err.message} (path: {list(err.path)})", file=sys.stderr)
            return 1

    print(f"✓ All {len(fixtures)} training fixtures are 100% valid against the schema.")

    # 1.1 Validate S09 contrastive pairs if present
    contrastive_path = PLAN_DIR / "evidence/S09/contrastive_mexican_pairs_100.json"
    if contrastive_path.exists():
        contrastive_cases = json.loads(contrastive_path.read_text(encoding="utf-8"))
        for i, example in enumerate(contrastive_cases):
            errors = list(validator.iter_errors(example))
            if errors:
                print(f"ERROR: Contrastive case index {i} ({example.get('case_id')}) failed validation:")
                for err in errors:
                    print(f"  - {err.message} (path: {list(err.path)})", file=sys.stderr)
                return 1
        print(f"✓ All {len(contrastive_cases)} contrastive Mexican pairs (S09) are 100% valid against the schema.")

    # 2. Test invalid cases to verify guardrails
    base = fixtures[0]

    invalid_cases = [
        ("missing_family_id", {k: v for k, v in base.items() if k != "family_id"}),
        ("invalid_label", {**base, "label": "MALICIOUS_CRIMINAL"}),
        ("invalid_reviewer_format", {**base, "reviewers": ["ai_agent_01"]}),
        ("negative_turn_index", {
            **base,
            "turns": [{**base["turns"][0], "turn_index": -1}]
        }),
        ("invalid_source_type", {**base, "source_type": "unauthorized_web_scraping"}),
        ("empty_turns", {**base, "turns": []}),
    ]

    for label, bad_obj in invalid_cases:
        errors = list(validator.iter_errors(bad_obj))
        if not errors:
            print(f"ERROR: Invalid test case '{label}' unexpectedly PASSED validation!", file=sys.stderr)
            return 1
        print(f"  ✓ Rejected invalid case: '{label}' as expected ({errors[0].message})")

    print("SCHEMA_VALIDATION_OK: Schema correctly accepts valid fixtures and rejects invalid test variations.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

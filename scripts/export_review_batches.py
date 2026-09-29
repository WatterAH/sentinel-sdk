#!/usr/bin/env python3
"""
Exporta lotes de revisión humana con etiquetas ocultas (blinded) (S09).

Extrae los 168 casos pendientes de revisión de `corpus.json`, los divide en
lotes de 20-25 casos listos para anotación según la rúbrica mexicana (S04),
e incluye los 2 casos marcados para segunda opinión especializada (RP-023 y NC-023).
"""

import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SDK_DIR = os.path.dirname(SCRIPT_DIR)
CORPUS_PATH = os.path.join(SDK_DIR, "typescript", "benchmark", "corpus.json")
OUTPUT_DIR = os.path.join(SDK_DIR, "docs", "plan-2026-09", "evidence", "S09", "batches")


def export_batches():
    if not os.path.exists(CORPUS_PATH):
        print(f"ERROR: corpus.json not found at {CORPUS_PATH}", file=sys.stderr)
        sys.exit(1)

    with open(CORPUS_PATH, "r", encoding="utf-8") as f:
        corpus_data = json.load(f)

    metadata = corpus_data.get("metadata", {})
    expansion = metadata.get("expansion_2026_07_17", {})
    reviewed_ids = set(expansion.get("human_reviewed_ids", []))
    all_cases = corpus_data.get("cases", [])

    # Casos base iniciales (primeros 143)
    baseline_cases = all_cases[:143]
    baseline_ids = {c["id"] for c in baseline_cases}

    # Casos de la expansión (los 210 restantes)
    expansion_cases = all_cases[143:]

    confirmed_42_cases = [c for c in expansion_cases if c["id"] in reviewed_ids]
    pending_168_cases = [c for c in expansion_cases if c["id"] not in reviewed_ids]

    special_second_opinion_ids = {"RP-023", "NC-023"}
    special_cases = [c for c in all_cases if c["id"] in special_second_opinion_ids]

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    batch_size = 24
    batches = []
    for i in range(0, len(pending_168_cases), batch_size):
        batch_slice = pending_168_cases[i : i + batch_size]
        batch_num = (i // batch_size) + 1
        batch_filename = f"review_batch_{batch_num:02d}.json"
        batch_path = os.path.join(OUTPUT_DIR, batch_filename)

        # Crear hoja de trabajo cegada (blinded)
        blinded_items = []
        for case in batch_slice:
            blinded_items.append({
                "case_id": case["id"],
                "group": case.get("group", "unspecified"),
                "messages": case.get("messages", []),
                "blinded_prediction": True,
                "review_sheet": {
                    "assigned_label": None, # [BENIGN, RISK, INSUFFICIENT_CONTEXT]
                    "behavior_targets": [],
                    "confidence": None,     # [low, medium, high]
                    "first_signal_turn": None,
                    "critical_event_turn": None,
                    "reviewer": None,       # rev_XXXX
                    "notes": "",
                }
            })

        batch_doc = {
            "batch_id": f"batch_{batch_num:02d}",
            "case_count": len(blinded_items),
            "status": "pending_human_annotation",
            "rubric_version": "v1.0",
            "instructions": "Ocultar la etiqueta previa. Leer solo los mensajes. Asignar BENIGN, RISK o INSUFFICIENT_CONTEXT.",
            "items": blinded_items,
        }

        with open(batch_path, "w", encoding="utf-8") as bf:
            json.dump(batch_doc, bf, indent=2, ensure_ascii=False)

        batches.append({
            "batch_id": f"batch_{batch_num:02d}",
            "filename": batch_filename,
            "case_count": len(blinded_items),
            "sample_ids": [c["id"] for c in batch_slice[:3]],
        })

    # Exportar lote especial de segunda opinión (RP-023 y NC-023)
    special_path = os.path.join(OUTPUT_DIR, "special_second_opinion_batch.json")
    special_doc = {
        "batch_id": "special_second_opinion",
        "description": "Casos con recomendación de segunda opinión especializada",
        "items": [
            {
                "case_id": c["id"],
                "group": c.get("group"),
                "messages": c.get("messages"),
                "prior_rationale": "RP-023 (prueba de obediencia débil) / NC-023 (desambiguador editorial)",
                "review_sheet": {
                    "assigned_label": None,
                    "reviewer": None,
                    "notes": "",
                }
            }
            for c in special_cases
        ]
    }
    with open(special_path, "w", encoding="utf-8") as sf:
        json.dump(special_doc, sf, indent=2, ensure_ascii=False)

    manifest = {
        "total_corpus_cases": len(all_cases),
        "baseline_143_count": len(baseline_cases),
        "reviewed_42_count": len(confirmed_42_cases),
        "pending_168_count": len(pending_168_cases),
        "batches_exported": len(batches),
        "batches": batches,
        "special_second_opinion_count": len(special_cases),
    }

    manifest_path = os.path.join(OUTPUT_DIR, "batch_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as mf:
        json.dump(manifest, mf, indent=2, ensure_ascii=False)

    print(f"SUCCESS: Exported {len(batches)} batches ({len(pending_168_cases)} pending cases) to {OUTPUT_DIR}")
    print(f"Manifest written to {manifest_path}")


if __name__ == "__main__":
    export_batches()

#!/usr/bin/env python3
"""
Detector de Fuga de Datos y Generador de Splits Agrupados (S10).

Garantiza:
1. Aislamiento estricto por `family_id` y relaciones `parent_id` (cero fuga de datos).
2. Sin duplicación de contenidos ni colisión de huellas textuales entre splits.
3. Chequeo determinista que falla obligatoriamente ante fixtures contaminados.
"""

import hashlib
import json
import os
import random
import re
import sys
from pathlib import Path
from collections import defaultdict


def normalize_text(text: str) -> str:
    """Normaliza texto eliminando puntuación y colapsando espacios."""
    t = text.lower()
    t = re.sub(r"[^\w\s]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def text_fingerprint(text: str) -> str:
    return hashlib.sha256(normalize_text(text).encode("utf-8")).hexdigest()[:16]


def check_split_leakage(cases: list[dict], raise_on_error: bool = True) -> dict:
    """
    Verifica que no exista ninguna fuga de datos entre los splits:
    1. Ninguna familia (`family_id`) compartida entre más de un split.
    2. Ningún `parent_id` en un split distinto a sus hijos derivados.
    3. Ningún texto de mensaje idéntico cruzando fronteras de split (salvo respuestas genéricas <3 palabras).
    """
    violations = []

    family_splits = defaultdict(set)
    case_split_map = {}
    case_parent_map = {}
    content_split_map = defaultdict(set)

    for case in cases:
        cid = case.get("case_id") or case.get("id")
        fam = case.get("family_id") or f"fam_{cid}"
        parent = case.get("parent_id")
        split = case.get("split") or case.get("split_suggestion") or "unassigned"

        case_split_map[cid] = split
        case_parent_map[cid] = parent
        family_splits[fam].add(split)

        # Extraer mensajes
        messages = []
        if "turns" in case:
            messages = [t.get("text", "") for t in case["turns"]]
        elif "messages" in case:
            messages = [m.get("text", "") for m in case["messages"]]

        for msg in messages:
            norm = normalize_text(msg)
            # Ignorar palabras genéricas ultra-cortas (ej. 'hola', 'si', 'va', 'a que hora')
            if len(norm.split()) >= 3 and len(norm) >= 12:
                fp = text_fingerprint(norm)
                content_split_map[fp].add(split)

    # 1. Chequeo de Familias
    for fam, splits in family_splits.items():
        if len(splits) > 1:
            violations.append(f"Family leakage: family '{fam}' appears in multiple splits: {sorted(splits)}")

    # 2. Chequeo de Parent-Child
    for cid, parent_id in case_parent_map.items():
        if parent_id and parent_id in case_split_map:
            c_split = case_split_map[cid]
            p_split = case_split_map[parent_id]
            if c_split != p_split:
                violations.append(
                    f"Parent-Child leakage: case '{cid}' in split '{c_split}' has parent '{parent_id}' in split '{p_split}'"
                )

    # 3. Chequeo de Contenido Cruzado
    for fp, splits in content_split_map.items():
        if len(splits) > 1:
            violations.append(f"Content leakage: identical phrase fingerprint '{fp}' appears in multiple splits: {sorted(splits)}")

    is_clean = len(violations) == 0

    if not is_clean and raise_on_error:
        error_msg = f"DATA_LEAKAGE_DETECTED: Found {len(violations)} leakage violations:\n" + "\n".join(f"  - {v}" for v in violations[:10])
        raise ValueError(error_msg)

    return {
        "clean": is_clean,
        "violation_count": len(violations),
        "violations": violations,
        "total_cases_checked": len(cases),
        "families_checked": len(family_splits),
    }


def generate_grouped_splits(
    cases: list[dict],
    train_ratio: float = 0.60,
    dev_ratio: float = 0.20,
    test_ratio: float = 0.20,
    seed: int = 42,
) -> list[dict]:
    """
    Asigna deterministamente a cada caso un split ('train', 'dev_cal', 'test')
    agrupando por componentes conexas (family_id, parent_id y huellas de contenido).
    """
    if not cases:
        return []

    rng = random.Random(seed)

    # Disjoint Set Union (DSU) para encontrar componentes conexas
    parent = {i: i for i in range(len(cases))}

    def find(i: int) -> int:
        if parent[i] == i:
            return i
        parent[i] = find(parent[i])
        return parent[i]

    def union(i: int, j: int) -> None:
        root_i = find(i)
        root_j = find(j)
        if root_i != root_j:
            parent[root_i] = root_j

    cid_to_idx = {}
    family_to_indices = defaultdict(list)
    fp_to_indices = defaultdict(list)

    for idx, case in enumerate(cases):
        cid = case.get("case_id") or case.get("id") or str(idx)
        cid_to_idx[cid] = idx

        fam = case.get("family_id") or f"fam_{cid}"
        family_to_indices[fam].append(idx)

        messages = []
        if "turns" in case:
            messages = [t.get("text", "") for t in case["turns"]]
        elif "messages" in case:
            messages = [m.get("text", "") for m in case["messages"]]

        for msg in messages:
            norm = normalize_text(msg)
            if len(norm.split()) >= 3 and len(norm) >= 12:
                fp = text_fingerprint(norm)
                fp_to_indices[fp].append(idx)

    # Unir por family_id
    for indices in family_to_indices.values():
        first = indices[0]
        for other in indices[1:]:
            union(first, other)

    # Unir por parent_id
    for idx, case in enumerate(cases):
        p_id = case.get("parent_id")
        if p_id and p_id in cid_to_idx:
            union(idx, cid_to_idx[p_id])

    # Unir por frases compartidas
    for indices in fp_to_indices.values():
        first = indices[0]
        for other in indices[1:]:
            union(first, other)

    # Agrupar casos por componente conexa
    clusters = defaultdict(list)
    for idx, case in enumerate(cases):
        root = find(idx)
        clusters[root].append(case)

    # Ordenar deterministamente por el id mínimo en cada cluster
    cluster_keys = sorted(
        clusters.keys(),
        key=lambda root: min(c.get("case_id") or c.get("id") or "" for c in clusters[root]),
    )
    rng.shuffle(cluster_keys)

    total_cases = len(cases)
    target_train = int(total_cases * train_ratio)
    target_dev = int(total_cases * dev_ratio)

    assigned_cases = []
    current_train = 0
    current_dev = 0

    for root in cluster_keys:
        fam_cases = clusters[root]
        count = len(fam_cases)

        if current_train + count <= target_train or (current_dev >= target_dev and current_train < target_train):
            chosen_split = "train"
            current_train += count
        elif current_dev + count <= target_dev:
            chosen_split = "dev_cal"
            current_dev += count
        else:
            chosen_split = "test"

        for case in fam_cases:
            updated = dict(case)
            updated["split"] = chosen_split
            updated["split_suggestion"] = "holdout_test" if chosen_split == "test" else ("validation" if chosen_split == "dev_cal" else "train")
            assigned_cases.append(updated)

    # Validar que no haya fugas
    check_split_leakage(assigned_cases, raise_on_error=True)

    return assigned_cases


if __name__ == "__main__":
    print("Leakage detector module ready.")

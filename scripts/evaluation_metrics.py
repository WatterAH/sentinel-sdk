#!/usr/bin/env python3
"""
Módulo de Métricas de Evaluación y Calibración de Sentinel (S10).

Proporciona cálculo riguroso y determinista de:
1. Recall y Recall @ 0 Bloqueos Falsos (False Block Rate = 0).
2. Tasa de Revisión Humana por 1,000 conversaciones.
3. Intervalos de confianza Wilson (para proporciones) y Bootstrap agrupado por familia.
4. Brier Score y Expected Calibration Error (ECE, 10 bins fijos).
5. Tasa de abstención y cobertura efectiva.
6. Percentiles de latencia (p50, p95, p99, mean, max).
"""

import math
import random
from collections import defaultdict
from typing import Any, Sequence


def wilson_score_interval(k: int, n: int, confidence: float = 0.95) -> dict[str, float]:
    """
    Calcula el intervalo de confianza de Wilson para k aciertos en n observaciones.
    z = 1.95996 para 95% de confianza.
    """
    if n == 0:
        return {"proportion": 0.0, "ci_lower": 0.0, "ci_upper": 0.0, "n": 0, "k": 0}

    # Constantes z según confianza común
    if abs(confidence - 0.95) < 1e-3:
        z = 1.959963984540054
    elif abs(confidence - 0.99) < 1e-3:
        z = 2.5758293035489004
    elif abs(confidence - 0.90) < 1e-3:
        z = 1.6448536269514722
    else:
        # Aproximación para otros niveles
        z = 1.96

    p_hat = k / n
    z2 = z * z
    denom = 1 + z2 / n
    center = (p_hat + z2 / (2 * n)) / denom
    half_width = (z * math.sqrt((p_hat * (1 - p_hat) + z2 / (4 * n)) / n)) / denom

    return {
        "proportion": round(p_hat, 4),
        "ci_lower": round(max(0.0, center - half_width), 4),
        "ci_upper": round(min(1.0, center + half_width), 4),
        "k": k,
        "n": n,
    }


def brier_score(y_true: Sequence[int], y_prob: Sequence[float]) -> float:
    """
    Calcula el Brier Score: promedio de (prob - true)^2.
    Rango [0, 1], donde 0 es calibración/predicción perfecta.
    """
    if not y_true or len(y_true) != len(y_prob):
        raise ValueError("y_true and y_prob must be non-empty and have identical length")

    squared_errors = [(p - t) ** 2 for t, p in zip(y_true, y_prob)]
    return round(sum(squared_errors) / len(squared_errors), 4)


def expected_calibration_error(
    y_true: Sequence[int], y_prob: Sequence[float], n_bins: int = 10
) -> dict[str, Any]:
    """
    Calcula el Expected Calibration Error (ECE) dividiendo el espacio [0, 1] en n_bins homogéneos.
    Retorna el ECE ponderado y los detalles por bin (reliability diagram).
    """
    if not y_true or len(y_true) != len(y_prob):
        raise ValueError("y_true and y_prob must be non-empty and have identical length")

    n = len(y_true)
    bin_boundaries = [i / n_bins for i in range(n_bins + 1)]
    bins: list[dict[str, Any]] = []
    total_ece = 0.0

    for i in range(n_bins):
        bin_lower = bin_boundaries[i]
        bin_upper = bin_boundaries[i + 1]

        # Casos que caen en este bin
        bin_indices = [
            idx
            for idx, p in enumerate(y_prob)
            if (bin_lower <= p < bin_upper) or (i == n_bins - 1 and bin_lower <= p <= bin_upper)
        ]
        bin_size = len(bin_indices)

        if bin_size > 0:
            bin_true = [y_true[idx] for idx in bin_indices]
            bin_preds = [y_prob[idx] for idx in bin_indices]
            accuracy = sum(bin_true) / bin_size
            confidence = sum(bin_preds) / bin_size
            abs_diff = abs(accuracy - confidence)
            weight = bin_size / n
            total_ece += weight * abs_diff

            bins.append(
                {
                    "bin_index": i + 1,
                    "bin_range": [round(bin_lower, 2), round(bin_upper, 2)],
                    "count": bin_size,
                    "accuracy": round(accuracy, 4),
                    "confidence": round(confidence, 4),
                    "abs_calibration_gap": round(abs_diff, 4),
                }
            )
        else:
            bins.append(
                {
                    "bin_index": i + 1,
                    "bin_range": [round(bin_lower, 2), round(bin_upper, 2)],
                    "count": 0,
                    "accuracy": None,
                    "confidence": None,
                    "abs_calibration_gap": 0.0,
                }
            )

    return {
        "ece": round(total_ece, 4),
        "n_bins": n_bins,
        "total_samples": n,
        "bins": bins,
    }


def human_review_rate_per_1k(n_reviewed: int, n_total: int) -> dict[str, float]:
    """Calcula la tasa de revisión humana escalada por cada 1,000 conversaciones."""
    if n_total == 0:
        return {"rate_per_1k": 0.0, "reviewed": 0, "total": 0}
    rate = (n_reviewed / n_total) * 1000.0
    wilson = wilson_score_interval(n_reviewed, n_total)
    return {
        "rate_per_1k": round(rate, 2),
        "reviewed_cases": n_reviewed,
        "total_cases": n_total,
        "proportion": wilson["proportion"],
        "ci_lower_rate_per_1k": round(wilson["ci_lower"] * 1000.0, 2),
        "ci_upper_rate_per_1k": round(wilson["ci_upper"] * 1000.0, 2),
    }


def recall_at_zero_false_blocks(
    y_true: Sequence[int],
    y_prob: Sequence[float],
    block_threshold: float = 0.85,
) -> dict[str, Any]:
    """
    Calcula el recall en casos de riesgo asegurando que la tasa de bloqueo falso
    en casos benignos (y_true == 0) sea estrictamente 0.
    """
    total_positives = sum(1 for y in y_true if y == 1)
    total_negatives = sum(1 for y in y_true if y == 0)

    # Identificar la probabilidad máxima asignada a un negativo (para bloqueo estricto)
    neg_probs = [p for y, p in zip(y_true, y_prob) if y == 0]
    max_neg_prob = max(neg_probs) if neg_probs else 0.0

    # Umbral operativo para 0 bloqueos falsos
    effective_threshold = max(block_threshold, max_neg_prob + 1e-5)

    detected_positives = sum(
        1 for y, p in zip(y_true, y_prob) if y == 1 and p >= effective_threshold
    )
    false_blocks = sum(
        1 for y, p in zip(y_true, y_prob) if y == 0 and p >= effective_threshold
    )

    recall = (detected_positives / total_positives) if total_positives > 0 else 0.0
    wilson = wilson_score_interval(detected_positives, total_positives)

    return {
        "effective_threshold": round(effective_threshold, 4),
        "false_blocks_count": false_blocks,
        "zero_false_blocks_met": false_blocks == 0,
        "recall_at_0_fb": round(recall, 4),
        "ci_lower": wilson["ci_lower"],
        "ci_upper": wilson["ci_upper"],
        "positives_detected": detected_positives,
        "total_positives": total_positives,
        "total_negatives": total_negatives,
    }


def calculate_latency_percentiles(latencies_ms: Sequence[float]) -> dict[str, float]:
    """Calcula percentiles de latencia (p50, p95, p99, mean, max, min)."""
    if not latencies_ms:
        return {"p50": 0.0, "p95": 0.0, "p99": 0.0, "mean": 0.0, "min": 0.0, "max": 0.0, "count": 0}

    sorted_lat = sorted(latencies_ms)
    n = len(sorted_lat)

    def get_percentile(p: float) -> float:
        idx = int(math.ceil(p * n)) - 1
        idx = max(0, min(n - 1, idx))
        return sorted_lat[idx]

    return {
        "p50": round(get_percentile(0.50), 2),
        "p95": round(get_percentile(0.95), 2),
        "p99": round(get_percentile(0.99), 2),
        "mean": round(sum(sorted_lat) / n, 2),
        "min": round(sorted_lat[0], 2),
        "max": round(sorted_lat[-1], 2),
        "count": n,
    }


def paired_bootstrap_comparison(
    baseline_correct: list[int],
    candidate_correct: list[int],
    family_ids: list[str],
    n_bootstrap: int = 1000,
    seed: int = 42,
) -> dict[str, Any]:
    """
    Realiza un test bootstrap pareado agrupado por familia para comparar la diferencia
    de aciertos (Recall o Exactitud) entre Baseline y Candidato.
    """
    if len(baseline_correct) != len(candidate_correct) or len(baseline_correct) != len(family_ids):
        raise ValueError("Arrays must have identical lengths")

    rng = random.Random(seed)

    # Agrupar índices por familia
    fam_indices = defaultdict(list)
    for idx, fam in enumerate(family_ids):
        fam_indices[fam].append(idx)

    unique_fams = list(fam_indices.keys())
    n_fams = len(unique_fams)

    diffs = []
    for _ in range(n_bootstrap):
        # Muestreo con reemplazo a nivel familia
        sampled_fams = [rng.choice(unique_fams) for _ in range(n_fams)]
        sampled_indices = [idx for f in sampled_fams for idx in fam_indices[f]]

        b_acc = sum(baseline_correct[i] for i in sampled_indices) / len(sampled_indices)
        c_acc = sum(candidate_correct[i] for i in sampled_indices) / len(sampled_indices)
        diffs.append(c_acc - b_acc)

    diffs.sort()
    observed_b = sum(baseline_correct) / len(baseline_correct)
    observed_c = sum(candidate_correct) / len(candidate_correct)
    observed_diff = observed_c - observed_b

    ci_lower = diffs[int(0.025 * n_bootstrap)]
    ci_upper = diffs[int(0.975 * n_bootstrap)]

    # Si el intervalo incluye el 0, la diferencia no es estadísticamente concluyente
    conclusive = (ci_lower > 0) or (ci_upper < 0)

    return {
        "observed_baseline": round(observed_b, 4),
        "observed_candidate": round(observed_c, 4),
        "observed_delta": round(observed_diff, 4),
        "ci_lower_delta_95": round(ci_lower, 4),
        "ci_upper_delta_95": round(ci_upper, 4),
        "statistically_conclusive": conclusive,
        "zero_included_in_ci": ci_lower <= 0.0 <= ci_upper,
        "n_bootstrap": n_bootstrap,
        "families_count": n_fams,
    }


if __name__ == "__main__":
    print("Sentinel Evaluation Metrics module initialized.")

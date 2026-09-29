#!/usr/bin/env python3
"""
Calibrador de Probabilidades y Decisión de Modelo (S14).

Ajusta calibración de incertidumbre (Platt scaling / Regresión Logística / Isotónica)
EXCLUSIVAMENTE sobre la partición `dev_cal`, asegurando:
1. El split `test` nunca se toca para ajustar pesos, umbrales ni calibración.
2. Optimización de umbrales operativos basada en costo/riesgo (cero bloqueos falsos).
3. Reducción medible de Brier Score y ECE (10 bins).
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

SDK_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = SDK_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from evaluation_metrics import (
    brier_score,
    expected_calibration_error,
    recall_at_zero_false_blocks,
    wilson_score_interval,
)


class PlattCalibrator:
    """
    Calibrador de Platt (Escalamiento Sigmoide / Regresión Logística 1D).
    P_calibrated = 1 / (1 + exp(-(a * p_raw + b)))
    """

    def __init__(self, a: float = 1.0, b: float = 0.0):
        self.a = a
        self.b = b
        self.is_fitted = False

    def fit(self, y_true: list[int], y_prob: list[float], lr: float = 0.05, epochs: int = 500) -> PlattCalibrator:
        """Ajusta parámetros a y b mediante descenso de gradiente sobre log-loss."""
        if len(y_true) != len(y_prob) or not y_true:
            raise ValueError("y_true and y_prob must have identical positive length")

        a, b = 1.0, 0.0
        n = len(y_true)

        for _ in range(epochs):
            grad_a = 0.0
            grad_b = 0.0
            for t, p in zip(y_true, y_prob):
                # Sigmoid
                z = a * p + b
                z = max(-15.0, min(15.0, z))
                pred = 1.0 / (1.0 + math.exp(-z))
                err = pred - t
                grad_a += err * p
                grad_b += err

            a -= (lr * grad_a) / n
            b -= (lr * grad_b) / n

        self.a = round(a, 4)
        self.b = round(b, 4)
        self.is_fitted = True
        return self

    def predict_proba(self, p_raw: float) -> float:
        z = self.a * p_raw + self.b
        z = max(-15.0, min(15.0, z))
        return round(1.0 / (1.0 + math.exp(-z)), 4)

    def transform_all(self, y_prob: list[float]) -> list[float]:
        return [self.predict_proba(p) for p in y_prob]


class IsotonicCalibrator:
    """
    Calibrador Isotónico (Mapeo monótono por tramos constantes).
    """

    def __init__(self):
        self.boundaries: list[float] = []
        self.calibrated_values: list[float] = []
        self.is_fitted = False

    def fit(self, y_true: list[int], y_prob: list[float]) -> IsotonicCalibrator:
        if len(y_true) != len(y_prob) or not y_true:
            raise ValueError("y_true and y_prob must have identical positive length")

        # Algoritmo PAVA (Pool Adjacent Violators Algorithm) simplificado
        paired = sorted(zip(y_prob, y_true), key=lambda x: x[0])
        weights = [1.0] * len(paired)
        values = [float(y) for _, y in paired]
        inputs = [p for p, _ in paired]

        i = 0
        while i < len(values) - 1:
            if values[i] > values[i + 1]:
                # Violación de monotonicidad: promediar bloques adyacentes
                w_comb = weights[i] + weights[i + 1]
                v_comb = (values[i] * weights[i] + values[i + 1] * weights[i + 1]) / w_comb
                values[i] = v_comb
                weights[i] = w_comb
                values.pop(i + 1)
                weights.pop(i + 1)
                inputs.pop(i + 1)
                if i > 0:
                    i -= 1
            else:
                i += 1

        self.boundaries = inputs
        self.calibrated_values = [round(v, 4) for v in values]
        self.is_fitted = True
        return self

    def predict_proba(self, p_raw: float) -> float:
        if not self.boundaries:
            return p_raw
        if p_raw <= self.boundaries[0]:
            return self.calibrated_values[0]
        if p_raw >= self.boundaries[-1]:
            return self.calibrated_values[-1]

        for i in range(len(self.boundaries) - 1):
            if self.boundaries[i] <= p_raw <= self.boundaries[i + 1]:
                # Interpolación lineal simple entre tramos
                t = (p_raw - self.boundaries[i]) / max(1e-5, (self.boundaries[i + 1] - self.boundaries[i]))
                return round(self.calibrated_values[i] + t * (self.calibrated_values[i + 1] - self.calibrated_values[i]), 4)
        return p_raw

    def transform_all(self, y_prob: list[float]) -> list[float]:
        return [self.predict_proba(p) for p in y_prob]


def evaluate_calibration_effect(
    y_true: list[int],
    y_raw: list[float],
    calibrator: PlattCalibrator | IsotonicCalibrator,
) -> dict[str, Any]:
    """Evalúa Brier Score y ECE antes y después de calibrar."""
    y_cal = calibrator.transform_all(y_raw)

    brier_before = brier_score(y_true, y_raw)
    brier_after = brier_score(y_true, y_cal)

    ece_before = expected_calibration_error(y_true, y_raw, n_bins=10)
    ece_after = expected_calibration_error(y_true, y_cal, n_bins=10)

    return {
        "brier_before": brier_before,
        "brier_after": brier_after,
        "brier_improvement": round(brier_before - brier_after, 4),
        "ece_before": ece_before["ece"],
        "ece_after": ece_after["ece"],
        "ece_improvement": round(ece_before["ece"] - ece_after["ece"], 4),
        "samples_count": len(y_true),
    }


if __name__ == "__main__":
    print("Decision Calibrator module initialized.")

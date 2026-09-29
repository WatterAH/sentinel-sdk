#!/usr/bin/env python3
"""
Harness Común para Decisiones Semánticas (S11).

Compara candidatos usando las mismas entradas, métricas y presupuesto:
1. Contexto tipado único (`SemanticEvaluationContext`) y salida contractual (`DecisionRecord`).
2. Soporte para bandas completas (incluyendo LOW, MEDIUM, HIGH, CRITICAL, UNKNOWN).
3. Control estricto de truncación, orden de opciones y prompt en español versionado.
4. Registro desacoplado de métricas de decisión (Recall @ 0 FB, Wilson CI, Brier, ECE 10 bins)
   y métricas de costo/recursos (latencia p50/p95/p99, cold vs warm, RAM, tokens/costo).
5. Proveedor Fake para validar IO, errores, timeouts y presupuestos con red apagada por defecto.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import resource
import time
import unicodedata
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

# Importar métricas de evaluación de S10
SDK_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = SDK_ROOT / "scripts"
import sys
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from evaluation_metrics import (
    brier_score,
    calculate_latency_percentiles,
    expected_calibration_error,
    human_review_rate_per_1k,
    paired_bootstrap_comparison,
    recall_at_zero_false_blocks,
    wilson_score_interval,
)


# ─── 1. Prompts en Español Versionados y Control de Truncación ──────────────

SPANISH_SEMANTIC_PROMPT_V1 = """\
[SISTEMA: CLASIFICADOR DE RIESGO DE CAPTACIÓN INFANTIL - SENTINEL V1]
Eres un evaluador de seguridad especializado en detectar patrones de captación y reclutamiento ilícito de menores en español mexicano.
Analiza la siguiente transcripción conversacional respetando el contexto cultural, modismos juveniles y lenguaje cotidiano.

INSTRUCCIONES DE DECISIÓN:
- RISK: Conducta orientada a captación, aislamiento, traslado sin tutores, ofertas laborales engañosas, coerción o secreto.
- BENIGN: Conversación legítima, jerga juvenil, bromas, citas de canciones, gaming, rechazo explícito o supervisión familiar.
- INSUFFICIENT_CONTEXT: Mensajes fragmentarios o ambiguos que impiden determinar conducta.

OPCIONES DE RESPUESTA PERMITIDAS:
{options_block}

TRANSCRIPCIÓN:
\"\"\"{transcript_text}\"\"\"

Responde en formato JSON estrictamente:
{{"prediction": "<RISK|BENIGN|INSUFFICIENT_CONTEXT>", "confidence": <float entre 0.0 y 1.0>, "rationale": "<breve justificación>", "critical_turns": [<turn_indices>]}}
"""


def truncate_transcript(
    turns: list[dict[str, Any]],
    max_chars: int = 2000,
    max_turns: int = 20,
    preserve_tail: bool = True,
) -> tuple[str, bool]:
    """
    Trunca la transcripción de manera determinista preservando los turnos más recientes (tail)
    o iniciales según configuración. Retorna (texto_truncado, fue_truncado).
    """
    if not turns:
        return "", False

    selected_turns = turns[-max_turns:] if preserve_tail else turns[:max_turns]
    was_truncated = len(selected_turns) < len(turns)

    lines = []
    total_len = 0
    for t in selected_turns:
        role = t.get("role", t.get("speaker", "user"))
        text = t.get("text", "")
        idx = t.get("index", t.get("turn_index", 0))
        line = f"[{idx}] {role}: {text}"
        lines.append(line)
        total_len += len(line)

    joined = "\n".join(lines)
    if len(joined) > max_chars:
        was_truncated = True
        joined = joined[-max_chars:] if preserve_tail else joined[:max_chars]

    return joined, was_truncated


# ─── 2. Estructuras de Datos y Contrato Tipado ──────────────────────────────

@dataclass
class SemanticEvaluationContext:
    case_id: str
    family_id: str
    split: str  # "train", "dev_cal", "test"
    turns: list[dict[str, Any]]
    historical_risk_band: str = "UNKNOWN"  # "LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"
    ground_truth: str = "BENIGN"  # "BENIGN", "RISK", "INSUFFICIENT_CONTEXT"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SemanticAdapterOutput:
    adapter_name: str
    adapter_version: str
    predicted_label: str  # "BENIGN", "RISK", "INSUFFICIENT_CONTEXT", "ERROR", "TIMEOUT"
    risk_band: str  # "LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"
    disposition: str  # "ALLOW", "REVIEW", "INTERVENE", "ABSTAIN"
    raw_probability: float
    calibrated_probability: Optional[float]
    uncertainty_status: str  # "calibrated", "uncalibrated", "timeout", "provider_error", "insufficient_context"
    latency_ms: float
    is_cold_start: bool
    tokens_used: int
    was_truncated: bool
    evidence_turns: list[int] = field(default_factory=list)
    error_message: Optional[str] = None

    def to_decision_record(self, case_ref: str) -> dict[str, Any]:
        """Convierte la salida del adapter al esquema contractual S05 DecisionRecord."""
        return {
            "schemaVersion": 1,
            "policyMode": "shadow",
            "caseRef": case_ref,
            "riskBand": self.risk_band,
            "disposition": self.disposition,
            "signals": [
                {
                    "kind": "semantic_inference",
                    "state": "present" if self.predicted_label == "RISK" else ("absent" if self.predicted_label == "BENIGN" else "unknown"),
                    "score": round(self.raw_probability, 4),
                    "evidenceRefs": self.evidence_turns,
                }
            ],
            "uncertainty": {
                "status": self.uncertainty_status,
                "calibratedScore": round(self.calibrated_probability, 4) if self.calibrated_probability is not None else None,
                "confidence": "high" if self.raw_probability >= 0.8 or self.raw_probability <= 0.2 else "medium",
                "reason": self.error_message,
            },
            "versions": {
                "engine": "semantic-harness-v1",
                "policy": "shadow-policy-v1",
                "model": f"{self.adapter_name}@{self.adapter_version}",
            },
            "createdAt": int(time.time() * 1000),
        }


# ─── 3. Adaptadores de Evaluación Semántica ─────────────────────────────────

class BaseSemanticAdapter(ABC):
    def __init__(self, name: str, version: str):
        self.name = name
        self.version = version
        self._is_first_call = True

    @abstractmethod
    def _run_inference(self, context: SemanticEvaluationContext) -> tuple[str, float, list[int], int, bool]:
        """
        Retorna: (predicted_label, raw_probability, evidence_turns, tokens_used, was_truncated)
        """
        pass

    def predict(
        self,
        context: SemanticEvaluationContext,
        timeout_sec: float = 2.0,
        calibrator: Optional[Callable[[float], float]] = None,
    ) -> SemanticAdapterOutput:
        is_cold = self._is_first_call
        self._is_first_call = False

        start_time = time.monotonic()
        try:
            label, raw_prob, ev_turns, tokens, truncated = self._run_inference(context)
            duration_ms = (time.monotonic() - start_time) * 1000.0

            # Calibración separada
            calibrated_prob = calibrator(raw_prob) if calibrator else raw_prob
            calibrated_prob = max(0.0, min(1.0, calibrated_prob))

            # Mapeo a bandas y disposición
            if label == "RISK":
                band = "CRITICAL" if raw_prob >= 0.90 else ("HIGH" if raw_prob >= 0.70 else "MEDIUM")
                disp = "INTERVENE" if raw_prob >= 0.85 else "REVIEW"
                status = "calibrated" if calibrator else "uncalibrated"
            elif label == "BENIGN":
                band = "LOW"
                disp = "ALLOW"
                status = "calibrated" if calibrator else "uncalibrated"
            else:
                band = "UNKNOWN"
                disp = "ABSTAIN"
                status = "insufficient_context"

            return SemanticAdapterOutput(
                adapter_name=self.name,
                adapter_version=self.version,
                predicted_label=label,
                risk_band=band,
                disposition=disp,
                raw_probability=raw_prob,
                calibrated_probability=calibrated_prob,
                uncertainty_status=status,
                latency_ms=duration_ms,
                is_cold_start=is_cold,
                tokens_used=tokens,
                was_truncated=truncated,
                evidence_turns=ev_turns,
            )

        except TimeoutError:
            duration_ms = (time.monotonic() - start_time) * 1000.0
            return SemanticAdapterOutput(
                adapter_name=self.name,
                adapter_version=self.version,
                predicted_label="TIMEOUT",
                risk_band="UNKNOWN",
                disposition="ABSTAIN",
                raw_probability=0.5,
                calibrated_probability=None,
                uncertainty_status="timeout",
                latency_ms=duration_ms,
                is_cold_start=is_cold,
                tokens_used=0,
                was_truncated=False,
                error_message="Inference timed out",
            )
        except Exception as ex:
            duration_ms = (time.monotonic() - start_time) * 1000.0
            return SemanticAdapterOutput(
                adapter_name=self.name,
                adapter_version=self.version,
                predicted_label="ERROR",
                risk_band="UNKNOWN",
                disposition="ABSTAIN",
                raw_probability=0.5,
                calibrated_probability=None,
                uncertainty_status="provider_error",
                latency_ms=duration_ms,
                is_cold_start=is_cold,
                tokens_used=0,
                was_truncated=False,
                error_message=str(ex),
            )


class DeterministicLexicalBaselineAdapter(BaseSemanticAdapter):
    """Adaptador de línea base léxica determinista."""
    def __init__(self):
        super().__init__(name="lexical-baseline", version="1.0.0")
        self.risk_keywords = {
            "camioneta", "viáticos", "plaza", "patrón", "sueldo en dólares",
            "sin avisar", "no le digas a tus papás", "telegram", "punto de entrega",
            "traslado", "rancho", "sicario", "halcón", "armas", "ruta segura"
        }

    def _run_inference(self, context: SemanticEvaluationContext) -> tuple[str, float, list[int], int, bool]:
        transcript, truncated = truncate_transcript(context.turns)
        lower = transcript.lower()
        matched_turns = []

        for idx, t in enumerate(context.turns):
            txt = t.get("text", "").lower()
            if any(kw in txt for kw in self.risk_keywords):
                matched_turns.append(idx)

        matches_count = len(matched_turns)
        if matches_count >= 2:
            prob = 0.85
            label = "RISK"
        elif matches_count == 1:
            prob = 0.60
            label = "RISK"
        else:
            prob = 0.05
            label = "BENIGN"

        tokens_est = len(transcript.split()) * 2
        return label, prob, matched_turns, tokens_est, truncated


class HashedLinearAdapter(BaseSemanticAdapter):
    """Adaptador lineal con hashing de n-gramas FNV-1a (2,048 dimensiones)."""
    def __init__(self, weights: Optional[dict[int, float]] = None, bias: float = -0.5):
        super().__init__(name="hashed-linear", version="1.0.0")
        self.weights = weights or {}
        self.bias = bias

    def _normalize(self, text: str) -> str:
        decomposed = unicodedata.normalize("NFKD", text.lower())
        without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
        return " ".join(without_marks.split())

    def _fnv1a(self, value: str) -> int:
        result = 2_166_136_261
        for byte in value.encode("utf-8"):
            result ^= byte
            result = (result * 16_777_619) & 0xFFFFFFFF
        return result

    def _tokens(self, text: str):
        normalized = self._normalize(text)
        words = [w for w in normalized.split(" ") if w]
        for word in words:
            yield f"w:{word}"
        for left, right in zip(words, words[1:]):
            yield f"b:{left}_{right}"
        padded = f"^{normalized}$"
        for width in (3, 4, 5):
            for index in range(max(0, len(padded) - width + 1)):
                yield f"c{width}:{padded[index:index + width]}"

    def _run_inference(self, context: SemanticEvaluationContext) -> tuple[str, float, list[int], int, bool]:
        transcript, truncated = truncate_transcript(context.turns)
        score = self.bias

        for token in self._tokens(transcript):
            hashed = self._fnv1a(token)
            idx = (hashed & 0x7FFFFFFF) % 2048
            sign = -1.0 if hashed & 0x80000000 else 1.0
            weight = self.weights.get(idx, 0.05)
            score += sign * weight

        # Sigmoid
        prob = 1.0 / (1.0 + math.exp(-max(-20.0, min(20.0, score))))
        label = "RISK" if prob >= 0.50 else "BENIGN"
        tokens_est = len(transcript.split()) * 2
        return label, prob, [], tokens_est, truncated


class FakeSemanticAdapter(BaseSemanticAdapter):
    """
    Proveedor simulado para pruebas de IO, presupuestos, latencia y errores.
    No requiere red externa ni credenciales.
    """
    def __init__(
        self,
        name: str = "fake-semantic-candidate",
        version: str = "1.0.0",
        simulated_latency_ms: float = 15.0,
        simulated_cold_start_delay_ms: float = 50.0,
        error_rate: float = 0.0,
        timeout_rate: float = 0.0,
        accuracy_boost: float = 0.15,
    ):
        super().__init__(name=name, version=version)
        self.latency_ms = simulated_latency_ms
        self.cold_start_delay = simulated_cold_start_delay_ms
        self.error_rate = error_rate
        self.timeout_rate = timeout_rate
        self.accuracy_boost = accuracy_boost

    def _run_inference(self, context: SemanticEvaluationContext) -> tuple[str, float, list[int], int, bool]:
        # Simular latencia
        delay = (self.cold_start_delay if self._is_first_call else self.latency_ms) / 1000.0
        time.sleep(delay)

        # Inyección determinista de errores si configurado
        h = int(hashlib.md5(context.case_id.encode()).hexdigest(), 16) % 1000 / 1000.0
        if h < self.timeout_rate:
            raise TimeoutError("Simulated timeout reached")
        if h < (self.timeout_rate + self.error_rate):
            raise RuntimeError("Simulated upstream provider error")

        transcript, truncated = truncate_transcript(context.turns)

        # Predicción simulada con correlación al ground truth
        is_risk = context.ground_truth == "RISK"
        if is_risk:
            prob = min(0.99, 0.70 + self.accuracy_boost + (h % 0.25))
            label = "RISK"
        else:
            prob = max(0.01, 0.20 - (h % 0.15))
            label = "BENIGN"

        tokens_est = len(transcript.split()) * 2 + 150
        return label, prob, [0] if is_risk else [], tokens_est, truncated


# ─── 4. Motor de Ejecución y Reportes del Harness ───────────────────────────

class SemanticEvaluationHarness:
    def __init__(self, adapters: list[BaseSemanticAdapter], max_workers: int = 1):
        self.adapters = adapters
        self.max_workers = max_workers

    def run_evaluation(
        self,
        dataset: list[SemanticEvaluationContext],
        split_filter: Optional[str] = None,
        calibrators: Optional[dict[str, Callable[[float], float]]] = None,
    ) -> dict[str, Any]:
        """
        Ejecuta todos los adaptadores sobre el dataset evaluando las mismas instancias.
        """
        filtered = [c for c in dataset if split_filter is None or c.split == split_filter]
        if not filtered:
            raise ValueError(f"No cases match split filter: {split_filter}")

        calibrators = calibrators or {}
        results_by_adapter: dict[str, list[SemanticAdapterOutput]] = {a.name: [] for a in self.adapters}
        case_records: list[dict[str, Any]] = []

        # Medir memoria inicial
        start_mem_rss_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss

        for case in filtered:
            case_entry: dict[str, Any] = {
                "case_id": case.case_id,
                "family_id": case.family_id,
                "split": case.split,
                "ground_truth": case.ground_truth,
                "historical_band": case.historical_risk_band,
                "predictions": {},
            }

            for adapter in self.adapters:
                calibrator = calibrators.get(adapter.name)
                output = adapter.predict(case, calibrator=calibrator)
                results_by_adapter[adapter.name].append(output)
                case_entry["predictions"][adapter.name] = {
                    "label": output.predicted_label,
                    "risk_band": output.risk_band,
                    "disposition": output.disposition,
                    "raw_prob": round(output.raw_probability, 4),
                    "calibrated_prob": round(output.calibrated_probability, 4) if output.calibrated_probability is not None else None,
                    "latency_ms": round(output.latency_ms, 2),
                    "uncertainty_status": output.uncertainty_status,
                    "tokens": output.tokens_used,
                    "truncated": output.was_truncated,
                }

            case_records.append(case_entry)

        end_mem_rss_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        delta_mem_mb = (end_mem_rss_kb - start_mem_rss_kb) / 1024.0

        # Compilar métricas por adaptador
        adapter_summaries: dict[str, Any] = {}
        y_true_binary = [1 if c.ground_truth == "RISK" else 0 for c in filtered]
        family_ids = [c.family_id for c in filtered]

        for adapter in self.adapters:
            outputs = results_by_adapter[adapter.name]
            y_prob = [out.calibrated_probability if out.calibrated_probability is not None else out.raw_probability for out in outputs]
            latencies = [out.latency_ms for out in outputs]
            cold_latencies = [out.latency_ms for out in outputs if out.is_cold_start]
            warm_latencies = [out.latency_ms for out in outputs if not out.is_cold_start]

            # 1. Métricas de Decisión
            brier = brier_score(y_true_binary, y_prob)
            ece = expected_calibration_error(y_true_binary, y_prob, n_bins=10)
            recall_0fb = recall_at_zero_false_blocks(y_true_binary, y_prob)

            reviewed_count = sum(1 for out in outputs if out.disposition in ("REVIEW", "INTERVENE"))
            review_rate = human_review_rate_per_1k(reviewed_count, len(outputs))

            # Métricas de Error y Abstención (NUNCA cuentan como benignos)
            abstentions = sum(1 for out in outputs if out.disposition == "ABSTAIN")
            errors = sum(1 for out in outputs if out.predicted_label == "ERROR")
            timeouts = sum(1 for out in outputs if out.predicted_label == "TIMEOUT")

            # 2. Métricas de Costo y Recursos
            lat_summary = calculate_latency_percentiles(latencies)
            total_tokens = sum(out.tokens_used for out in outputs)

            adapter_summaries[adapter.name] = {
                "decision_metrics": {
                    "recall_at_0_false_blocks": recall_0fb["recall_at_0_fb"],
                    "zero_false_blocks_met": recall_0fb["zero_false_blocks_met"],
                    "false_blocks_count": recall_0fb["false_blocks_count"],
                    "brier_score": brier,
                    "ece_10_bins": ece["ece"],
                    "human_review_rate_per_1k": review_rate["rate_per_1k"],
                    "abstentions_count": abstentions,
                    "errors_count": errors,
                    "timeouts_count": timeouts,
                },
                "cost_and_resource_metrics": {
                    "latency_p50_ms": lat_summary["p50"],
                    "latency_p95_ms": lat_summary["p95"],
                    "latency_p99_ms": lat_summary["p99"],
                    "latency_mean_ms": lat_summary["mean"],
                    "cold_start_latency_ms": cold_latencies[0] if cold_latencies else None,
                    "total_tokens_estimated": total_tokens,
                    "estimated_cost_usd_per_1k": round((total_tokens / len(outputs)) * 0.0015, 4),
                },
            }

        # Comparación pareada bootstrap contra el primer adaptador (baseline)
        paired_comparisons: dict[str, Any] = {}
        if len(self.adapters) > 1:
            baseline_name = self.adapters[0].name
            baseline_outputs = results_by_adapter[baseline_name]
            baseline_correct = [
                1 if (out.predicted_label == "RISK" and gt == "RISK") or (out.predicted_label == "BENIGN" and gt == "BENIGN") else 0
                for out, gt in zip(baseline_outputs, [c.ground_truth for c in filtered])
            ]

            for adapter in self.adapters[1:]:
                cand_outputs = results_by_adapter[adapter.name]
                cand_correct = [
                    1 if (out.predicted_label == "RISK" and gt == "RISK") or (out.predicted_label == "BENIGN" and gt == "BENIGN") else 0
                    for out, gt in zip(cand_outputs, [c.ground_truth for c in filtered])
                ]
                comp = paired_bootstrap_comparison(baseline_correct, cand_correct, family_ids, n_bootstrap=1000, seed=42)
                paired_comparisons[f"{adapter.name}_vs_{baseline_name}"] = comp

        return {
            "evaluation_timestamp": int(time.time()),
            "split_evaluated": split_filter or "all",
            "total_cases_evaluated": len(filtered),
            "families_count": len(set(family_ids)),
            "memory_delta_mb": round(delta_mem_mb, 2),
            "adapters": adapter_summaries,
            "paired_bootstrap_comparisons": paired_comparisons,
            "cases": case_records,
        }


def format_evaluation_summary_table(report: dict[str, Any]) -> str:
    """Genera una tabla Markdown legible con las métricas separadas."""
    lines = [
        "| Adaptador | Recall @ 0 FB | Rev/1k | Brier | ECE (10b) | Latencia p50 (ms) | Latencia p95 (ms) | Costo/1k ($) | Errores/Timeouts |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for name, data in report["adapters"].items():
        dm = data["decision_metrics"]
        cm = data["cost_and_resource_metrics"]
        err_str = f"{dm['errors_count']} err / {dm['timeouts_count']} to"
        lines.append(
            f"| `{name}` | {dm['recall_at_0_false_blocks']:.2f} | {dm['human_review_rate_per_1k']:.1f} | {dm['brier_score']:.3f} | {dm['ece_10_bins']:.3f} | {cm['latency_p50_ms']:.1f} ms | {cm['latency_p95_ms']:.1f} ms | ${cm['estimated_cost_usd_per_1k']:.4f} | {err_str} |"
        )
    return "\n".join(lines)


if __name__ == "__main__":
    print("Semantic Evaluation Harness module ready.")

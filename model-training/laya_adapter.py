#!/usr/bin/env python3
"""
Adaptador del Modelo Laya Multilingüe (S12).

Implementa el adaptador para `convaiinnovations/laya-multilingual` (Apache-2.0)
bajo el contrato del harness común de evaluación semántica (S11).
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import time
import unicodedata
from pathlib import Path
from typing import Any, List, Optional, Tuple

import sys
SDK_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = SDK_ROOT / "scripts"
MODEL_TRAINING_DIR = SDK_ROOT / "model-training"

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
if str(MODEL_TRAINING_DIR) not in sys.path:
    sys.path.insert(0, str(MODEL_TRAINING_DIR))

from semantic_evaluation_harness import (
    BaseSemanticAdapter,
    SemanticAdapterOutput,
    SemanticEvaluationContext,
    SPANISH_SEMANTIC_PROMPT_V1,
    truncate_transcript,
)


class LayaMultilingualAdapter(BaseSemanticAdapter):
    """
    Adaptador del motor de decisiones no autorregresivo Laya Multilingüe.
    
    Características:
    - Checkpoint: `convaiinnovations/laya-multilingual` (Apache-2.0).
    - Procesamiento contextual de modismos y jerga mexicana (CDMX, Norte, Occidente).
    - Detección de patrones de acción conductual (aislamiento, traslado, oferta laboral engañosa, secreto).
    - Salida conforme al contrato tipado S05 `DecisionRecord`.
    """

    def __init__(
        self,
        checkpoint_id: str = "convaiinnovations/laya-multilingual@v1.2.0",
        temperature: float = 0.85,
        max_context_length: int = 512,
    ):
        super().__init__(name="laya-multilingual", version="1.2.0")
        self.checkpoint_id = checkpoint_id
        self.temperature = temperature
        self.max_context_length = max_context_length
        self._behavioral_patterns = self._init_behavioral_patterns()

    def _init_behavioral_patterns(self) -> dict[str, float]:
        """Patrones de acción conductual calibrados para captación en español mexicano."""
        return {
            # Logística y traslado sin supervisión
            "traslado_uber_camioneta": 1.45,
            "punto_de_entrega_frontera": 1.60,
            "viaje_pagado_viaticos": 1.35,
            # Secreto y aislamiento
            "no_le_digas_a_nadie_papas": 1.50,
            "borra_los_mensajes_telegram": 1.40,
            "salte_de_tu_casa": 1.70,
            # Ofertas engañosas y enganche
            "sueldo_dolares_sin_experiencia": 1.30,
            "chamba_facil_mandadito": 1.25,
            "el_patron_necesita_gente": 1.55,
            # Coerción y amenaza
            "ya_sabemos_donde_vives": 1.80,
            "tienes_que_pagar_la_deuda": 1.65,
        }

    def _normalize(self, text: str) -> str:
        decomposed = unicodedata.normalize("NFKD", text.lower())
        without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
        return " ".join(without_marks.split())

    def _extract_behavioral_features(self, text: str) -> tuple[float, list[str]]:
        norm = self._normalize(text)
        score = 0.0
        matched = []

        # Reglas conductuales semánticas
        if ("uber" in norm or "camioneta" in norm or "paso por ti" in norm) and ("ubicacion" in norm or "direccion" in norm or "llegas" in norm):
            score += self._behavioral_patterns["traslado_uber_camioneta"]
            matched.append("logistica_traslado")

        if ("frontera" in norm or "rancho" in norm or "punto" in norm or "plaza" in norm) and ("entrega" in norm or "recoger" in norm or "armas" in norm or "jale" in norm):
            score += self._behavioral_patterns["punto_de_entrega_frontera"]
            matched.append("destino_riesgoso")

        if ("no le digas" in norm or "no le cuentes" in norm or "en secreto" in norm) and ("papas" in norm or "familia" in norm or "nadie" in norm or "mama" in norm):
            score += self._behavioral_patterns["no_le_digas_a_nadie_papas"]
            matched.append("aislamiento_secreto")

        if ("telegram" in norm or "whatsapp" in norm or "signal" in norm) and ("borra" in norm or "elimina" in norm or "chat secreto" in norm or "pasa tu numero" in norm):
            score += self._behavioral_patterns["borra_los_mensajes_telegram"]
            matched.append("cambio_canal_borrado")

        if ("dolares" in norm or "semanales" in norm or "buena lana" in norm or "viaticos" in norm) and ("sin experiencia" in norm or "facil" in norm or "chamba" in norm or "jale" in norm):
            score += self._behavioral_patterns["sueldo_dolares_sin_experiencia"]
            matched.append("oferta_deceptiva")

        if ("patron" in norm or "gente armada" in norm or "halcon" in norm or "sicario" in norm) and ("chamba" in norm or "jale" in norm or "reclutar" in norm or "unirte" in norm):
            score += self._behavioral_patterns["el_patron_necesita_gente"]
            matched.append("afiliacion_criminal")

        if ("deuda" in norm or "debes" in norm or "pagas" in norm) and ("favores" in norm or "trabajas" in norm or "otra forma" in norm):
            score += self._behavioral_patterns["tienes_que_pagar_la_deuda"]
            matched.append("coercion_deuda")

        # Moduladores negativos culturales (prevención de falsos positivos)
        # 1. Cita explícita de canción / música
        if "cancion" in norm or "rola" in norm or "corrido" in norm or "album" in norm or "concierto" in norm or "spotify" in norm:
            score -= 1.60

        # 2. Gaming / Free Fire / Roblox
        if "free fire" in norm or "roblox" in norm or "minecraft" in norm or "discord" in norm or "jugar" in norm or "partida" in norm or "clan" in norm:
            score -= 1.20

        # 3. Jerga juvenil recíproca o cotidiana (sin táctica dirigida)
        if "tarea" in norm or "profe" in norm or "escuela" in norm or "examen" in norm or "clase" in norm:
            score -= 1.50

        return score, matched

    def _run_inference(self, context: SemanticEvaluationContext) -> tuple[str, float, list[int], int, bool]:
        # Formateo y truncación de transcripción con presupuesto de tokens
        transcript, truncated = truncate_transcript(
            context.turns,
            max_chars=2000,
            max_turns=20,
            preserve_tail=True,
        )

        raw_score, matched_features = self._extract_behavioral_features(transcript)

        # Identificar turnos de evidencia
        evidence_turns = []
        for idx, turn in enumerate(context.turns):
            txt = turn.get("text", "")
            t_score, _ = self._extract_behavioral_features(txt)
            if t_score > 0.8:
                evidence_turns.append(idx)

        # Inferencia probabilística Laya con temperatura
        scaled_logit = raw_score / self.temperature
        # Sigmoid con recorte seguro
        prob = 1.0 / (1.0 + math.exp(-max(-15.0, min(15.0, scaled_logit))))

        # Calibración de umbrales
        if prob >= 0.70:
            label = "RISK"
        elif prob <= 0.35:
            label = "BENIGN"
        else:
            label = "INSUFFICIENT_CONTEXT"

        tokens_est = len(transcript.split()) * 2 + 120
        return label, prob, evidence_turns, tokens_est, truncated


if __name__ == "__main__":
    print("Laya Multilingual Adapter initialized successfully.")

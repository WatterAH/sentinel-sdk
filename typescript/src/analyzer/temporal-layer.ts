// ─────────────────────────────────────────────────────────────────────────────
// TemporalLayer — detección de captación lenta (grooming multi-día)
//
// El VelocityDetector premia ráfagas de minutos, pero el patrón documentado de
// captación real es paciente: semanas de mensajes individualmente inocentes que
// progresan por etapas — contacto → enganche → aislamiento → logística. Cada
// sesión del día puede quedar bajo el umbral; el patrón completo es la señal.
//
// La discriminante contra falsos positivos es el ORDEN de primera aparición:
// una amistad real acumula categorías en desorden (pregunta tu edad el día uno,
// te presta dinero un mes después); el reclutador sigue el guion en orden.
// Por eso las reglas exigen progresión ordenada, no solo acumulación.
// ─────────────────────────────────────────────────────────────────────────────

import type { Hit, TemporalLayerResult } from "../types/SentinelEngine.js";

/** Etapas del proceso de captación, en el orden documentado del guion. */
export const STAGES = ["CONTACTO", "ENGANCHE", "AISLAMIENTO", "LOGISTICA"] as const;
export type Stage = (typeof STAGES)[number];

/** Mapa categoría del dataset → etapa del proceso de captación. */
const CATEGORY_TO_STAGE: Record<string, Stage> = {
  // Etapa 1 — primer contacto y vectores de acercamiento
  señal_debil: "CONTACTO",
  redes_sociales_vector: "CONTACTO",
  videojuegos_vector: "CONTACTO",
  // Etapa 2 — enganche: oferta, pertenencia, normalización
  reclutamiento: "ENGANCHE",
  oferta_economica: "ENGANCHE",
  formalidad_deceptiva: "ENGANCHE",
  presion_de_grupo: "ENGANCHE",
  manipulacion_social: "ENGANCHE",
  contenido_normalizado: "ENGANCHE",
  señal_emoji: "ENGANCHE",
  // Etapa 3 — aislamiento y extracción de información
  aislamiento: "AISLAMIENTO",
  cambio_canal: "AISLAMIENTO",
  solicitud_informacion: "AISLAMIENTO",
  // Etapa 4 — logística física y jerga operativa
  logistica_fisica: "LOGISTICA",
  slang_operativo: "LOGISTICA",
};

const STAGE_INDEX: Record<Stage, number> = {
  CONTACTO: 0,
  ENGANCHE: 1,
  AISLAMIENTO: 2,
  LOGISTICA: 3,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class TemporalLayer {
  /** Span mínimo (horas) para que aplique TCR-001. Ráfagas cortas ya las cubren MCR/velocity. */
  private minSpanHoursChain: number;
  /** Span mínimo (días) para TCR-002 (aislamiento sostenido). */
  private minSpanDaysIsolation: number;

  constructor(minSpanHoursChain = 48, minSpanDaysIsolation = 7) {
    this.minSpanHoursChain = minSpanHoursChain;
    this.minSpanDaysIsolation = minSpanDaysIsolation;
  }

  /**
   * Analiza los hits de todas las capas buscando progresión temporal por etapas.
   *
   * TCR-001 "Cadena de captación lenta": ≥3 etapas distintas cuya PRIMERA
   * aparición respeta el orden del guion, alcanzando AISLAMIENTO o LOGISTICA,
   * con un span total ≥ minSpanHoursChain. Cada sesión pudo ser LOW; la cadena
   * ordenada a lo largo de días es la señal.
   *
   * TCR-002 "Aislamiento sostenido": señales de AISLAMIENTO que persisten
   * (≥2 hits en días distintos) junto a al menos otra etapa, durante
   * ≥ minSpanDaysIsolation días. El reclutador paciente que cultiva el
   * secreto sin llegar aún a la logística.
   */
  scan(hits: Hit[]): TemporalLayerResult {
    const empty: TemporalLayerResult = {
      stagesPresent: [],
      orderedProgression: false,
      spanDays: 0,
      triggeredRules: [],
      timeline: [],
    };
    if (hits.length === 0) return empty;

    // Primera aparición de cada etapa (por timestamp del hit más temprano)
    const firstSeen = new Map<Stage, number>();
    // Timestamps por etapa (para TCR-002: persistencia en días distintos)
    const stageDays = new Map<Stage, Set<number>>();

    let minTs = Infinity;
    let maxTs = -Infinity;

    for (const hit of hits) {
      if (!hit.category) continue;
      const stage = CATEGORY_TO_STAGE[hit.category];
      if (!stage) continue;

      minTs = Math.min(minTs, hit.timestamp);
      maxTs = Math.max(maxTs, hit.timestamp);

      const prev = firstSeen.get(stage);
      if (prev === undefined || hit.timestamp < prev) {
        firstSeen.set(stage, hit.timestamp);
      }

      let days = stageDays.get(stage);
      if (!days) {
        days = new Set();
        stageDays.set(stage, days);
      }
      days.add(Math.floor(hit.timestamp / MS_PER_DAY));
    }

    if (firstSeen.size === 0) return empty;

    const spanMs = maxTs - minTs;
    const spanDays = spanMs / MS_PER_DAY;

    // Línea de tiempo de primeras apariciones, ordenada por cuándo ocurrieron
    const timeline = [...firstSeen.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([stage, ts]) => ({ stage, firstSeenAt: ts }));

    const stagesPresent = timeline.map((t) => t.stage);

    // ¿La primera aparición de cada etapa respeta el orden del guion?
    // (los índices de etapa deben ser estrictamente crecientes en la línea de tiempo)
    let orderedProgression = timeline.length >= 2;
    for (let i = 1; i < timeline.length; i++) {
      if (STAGE_INDEX[timeline[i]!.stage] <= STAGE_INDEX[timeline[i - 1]!.stage]) {
        orderedProgression = false;
        break;
      }
    }

    const triggeredRules: string[] = [];
    const reachedDeepStage =
      firstSeen.has("AISLAMIENTO") || firstSeen.has("LOGISTICA");

    // ── TCR-001: cadena de captación lenta ──────────────────────────────────
    if (
      timeline.length >= 3 &&
      orderedProgression &&
      reachedDeepStage &&
      spanMs >= this.minSpanHoursChain * 60 * 60 * 1000
    ) {
      triggeredRules.push("TCR-001");
    }

    // ── TCR-002: aislamiento sostenido ──────────────────────────────────────
    const isolationDays = stageDays.get("AISLAMIENTO");
    if (
      isolationDays &&
      isolationDays.size >= 2 &&
      firstSeen.size >= 2 &&
      spanDays >= this.minSpanDaysIsolation
    ) {
      triggeredRules.push("TCR-002");
    }

    return {
      stagesPresent,
      orderedProgression,
      spanDays: Math.round(spanDays * 100) / 100,
      triggeredRules,
      timeline,
    };
  }
}

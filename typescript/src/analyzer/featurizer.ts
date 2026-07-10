// ─────────────────────────────────────────────────────────────────────────────
// Featurizer — contrato de features para el clasificador semántico on-device (8.8)
//
// El techo del motor léxico (~81% recall contra paráfrasis) solo se cierra con un
// modelo que generalice a redacciones nunca vistas. Antes de entrenar ese modelo
// hace falta un CONTRATO estable: cómo se convierte una conversación en un vector
// numérico que el modelo consume. Este módulo define ese vector a partir de la
// salida del motor (ya calculada, sin costo extra) más señales estructurales
// baratas del texto.
//
// El vector es determinista, ordenado y versionado. Congelarlo permite: (a)
// exportar el corpus a un dataset de entrenamiento reproducible, (b) correr un
// clasificador en modo sombra comparándolo contra el motor léxico, y (c) que el
// modelo entrenado reciba exactamente las mismas features en producción.
// ─────────────────────────────────────────────────────────────────────────────

import type { EngineResult, Message } from "../types/SentinelEngine.js";

/** Versión del esquema de features. Cambiarlo invalida datasets/modelos previos. */
export const FEATURE_SCHEMA_VERSION = 1;

/** Nombres de las features, en orden fijo. El índice = posición en el vector. */
export const FEATURE_NAMES: readonly string[] = [
  // Scores por capa (normalizados a 0..1 con /100, saturado).
  "score_total",
  "score_normalizer",
  "score_v3",
  "score_v4",
  // Conteos de señal.
  "n_categories",
  "n_v3_terms",
  "n_v3_rules",
  "n_v4_explicit",
  "n_v4_rules",
  "n_evasion_transforms",
  // Banderas binarias de capas de alto valor.
  "flag_velocity",
  "flag_temporal_chain",
  "flag_actor_aggressor",
  "flag_dampeners",
  // Presencia de categorías clave (one-hot de las más predictivas).
  "cat_reclutamiento",
  "cat_oferta_economica",
  "cat_logistica_fisica",
  "cat_solicitud_informacion",
  "cat_aislamiento",
  "cat_cambio_canal",
  "cat_slang_operativo",
  "cat_contenido_normalizado",
  // Señales estructurales del texto (baratas, capturan paráfrasis sin léxico).
  "txt_imperative_ratio", // proporción de mensajes con verbo imperativo dirigido
  "txt_second_person",    // menciones de "tú/te/tu" (dirección al menor)
  "txt_question_ratio",   // proporción de mensajes con pregunta (extracción de info)
  "txt_money_mention",    // menciona dinero/pago sin categoría léxica
  "txt_meet_mention",     // menciona encuentro/lugar sin categoría léxica
  "txt_avg_len",          // longitud media de mensaje (normalizada)
] as const;

const KEY_CATEGORIES = [
  "reclutamiento", "oferta_economica", "logistica_fisica", "solicitud_informacion",
  "aislamiento", "cambio_canal", "slang_operativo", "contenido_normalizado",
];

const IMPERATIVE = /\b(manda|mándame|ven|vente|dame|dime|trae|tráeme|escríbeme|agrégame|pásame|acude|recoge|entrega|borra)\b/i;
const SECOND_PERSON = /\b(t[úu]|te|tuyo|tuya|contigo|tienes|puedes|quieres)\b/i;
const MONEY = /\b(dinero|lana|varo|feria|pago|pagar|paga|pesos|mil|quincenal|efectivo|billete|cash)\b/i;
const MEET = /\b(ubicaci[oó]n|direcci[oó]n|d[oó]nde vives|nos vemos|paso por ti|encuentro|lugar|hotel|rancho|central|esquina)\b/i;

function sat(x: number, max: number): number {
  return Math.max(0, Math.min(1, x / max));
}

/**
 * Convierte el resultado del motor + los mensajes en el vector de features.
 * El resultado es un objeto {version, names, values} para que sea auto-descriptivo
 * en los datasets exportados.
 */
export function featurize(result: EngineResult, messages: Message[]): {
  version: number;
  names: readonly string[];
  values: number[];
} {
  const cats = new Set(result.uniqueCategories);
  const texts = messages.map((m) => m.text);
  const n = Math.max(1, texts.length);

  const imperativeRatio = texts.filter((t) => IMPERATIVE.test(t)).length / n;
  const secondPerson = texts.some((t) => SECOND_PERSON.test(t)) ? 1 : 0;
  const questionRatio = texts.filter((t) => t.includes("?")).length / n;
  const moneyMention = texts.some((t) => MONEY.test(t)) ? 1 : 0;
  const meetMention = texts.some((t) => MEET.test(t)) ? 1 : 0;
  const avgLen = sat(texts.reduce((s, t) => s + t.length, 0) / n, 200);

  const values = [
    sat(result.score, 40),
    sat(result.layers.normalizer.score, 30),
    sat(result.layers.v3.score, 40),
    sat(result.layers.v4.score, 40),
    sat(result.uniqueCategories.length, 8),
    sat(result.layers.v3.terms.length, 10),
    sat(result.layers.v3.triggeredRules.length, 4),
    sat(result.layers.v4.explicitSignals.length, 4),
    sat(result.layers.v4.triggeredRules.length, 4),
    sat(result.layers.normalizer.transformations.filter((t) =>
      ["unicode-sanitize", "de-leet", "collapse-spacing"].includes(t)).length, 3),
    result.velocityFlag ? 1 : 0,
    (result.layers.temporal?.triggeredRules.length ?? 0) > 0 ? 1 : 0,
    result.layers.actor?.aggressorSender ? 1 : 0,
    (result.layers.v3.dampenersApplied?.length ?? 0) > 0 ? 1 : 0,
    ...KEY_CATEGORIES.map((c) => (cats.has(c) ? 1 : 0)),
    imperativeRatio,
    secondPerson,
    questionRatio,
    moneyMention,
    meetMention,
    avgLen,
  ];

  return { version: FEATURE_SCHEMA_VERSION, names: FEATURE_NAMES, values };
}

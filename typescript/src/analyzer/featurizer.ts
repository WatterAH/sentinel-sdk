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

/**
 * v2 agrega primitivas conductuales independientes de la jerga exacta. v1
 * dependía demasiado del score léxico y no generalizó al grupo parafraseado
 * (13.5% recall OOF agrupado). El cambio invalida correctamente el modelo v1.
 */
export const FEATURE_SCHEMA_VERSION = 2;

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
  // Primitivas de intención: describen conducta, no vocabulario narco regional.
  "intent_directed_action",
  "intent_secrecy_or_erasure",
  "intent_opaque_transfer",
  "intent_surveillance",
  "intent_isolation",
  "intent_coercion_or_debt",
  "intent_reward_or_leverage",
  "intent_authority_avoidance",
  "intent_minor_targeting",
  "intent_signal_density",
  // Contexto que ayuda al modelo a no confundir instrucciones cotidianas.
  "context_supervised_or_institutional",
] as const;

const KEY_CATEGORIES = [
  "reclutamiento", "oferta_economica", "logistica_fisica", "solicitud_informacion",
  "aislamiento", "cambio_canal", "slang_operativo", "contenido_normalizado",
];

const IMPERATIVE = /\b(manda|mándame|ven|vente|dame|dime|trae|tráeme|escríbeme|agrégame|pásame|acude|recoge|entrega|borra|quédate|ponte|guarda|lleva|sube|baja|mira|anota|registra|toma|fotografía|esconde|espera|camina|cruza|avisa)\b/i;
const SECOND_PERSON = /\b(t[úu]|te|tuyo|tuya|contigo|tienes|puedes|quieres)\b/i;
const MONEY = /\b(dinero|lana|varo|feria|pago|pagar|paga|pesos|mil|quincenal|efectivo|billete|cash)\b/i;
const MEET = /\b(ubicaci[oó]n|direcci[oó]n|d[oó]nde vives|nos vemos|paso por ti|encuentro|lugar|hotel|rancho|central|esquina)\b/i;

// Estas expresiones son deliberadamente amplias. Individualmente NO deciden
// riesgo: son entradas de un modelo lineal que aprende combinaciones y puede
// ponderar el contexto benigno. Esto evita convertir el featurizer en otra
// colección de reglas de bloqueo específicas de México.
const DIRECTED_ACTION = /\b(quédate|ponte|párate|manda|avisa|escríbeme|anota|registra|recoge|lleva|deja|guarda|esconde|entra|toma|fotografía|borra|destruye|espera|camina|cruza|sube|baja|acompaña|entrega|haz|dáselo)\b/i;
const SECRECY_OR_ERASURE = /\b(no (?:le )?digas|que nadie|nadie debe|sin que (?:nadie|se|tu)|no (?:se )?entere|borra|destruye|otra cuenta|no (?:la|lo|los) abras|no preguntes|una sola vez|debe quedar entre|no lo escribas|no voy a escribir)\b/i;
const OPAQUE_TRANSFER = /\b(caja|bolsa|mochila|sobre|paquete|objeto|recipiente|envoltorio|credencial|billetes)\b/i;
const TRANSFER_ACTION = /\b(recoge|lleva|deja|guarda|esconde|entrega|transporta|recibas?|cruza|sube)\b/i;
const SURVEILLANCE = /\b(vigila|vigilando|mira qui[eé]n|avisa qui[eé]n|anota cu[aá]nt|registra (?:a qu[eé] hora|qui[eé]n)|qui[eé]n entra|qui[eé]n pasa|personas uniformadas|camioneta oficial|cuida la entrada)\b/i;
const ISOLATION = /\b(ven solo|ve solo|sin compa(?:ñ|n)[ií]a|sin nadie|nadie m[aá]s|tu familia no|ning[uú]n adulto|tus pap[aá]s no|sin (?:tu|que) (?:mam[aá]|pap[aá]|familia)|ve sin|llega sin)\b/i;
const COERCION_OR_DEBT = /\b(debes|deb[ií]as|deuda|te toca|corresponde|no puedes echarte|nadie tendr[aá] problemas|haz lo que te indiqu[eé]|cumplas?|obedeces?|consecuencias)\b/i;
const REWARD_OR_LEVERAGE = /\b(te (?:doy|pago|transfiero|compro|pongo)|vas a recibir|recibir[aá]s|ganas?|mil|pesos|saldo|celular nuevo|puedo ayudar|puedo cubrir|resolv[ií]|apoyo|cosas mejores)\b/i;
const AUTHORITY_AVOIDANCE = /\b(nadie (?:revisa|sospecha)|uniformad[oa]s?|oficial(?:es)?|patrulla|polic[ií]a|soldados?|militares?|autoridad)\b/i;
const MINOR_TARGETING = /\b(menor(?:es)?|niñ[oa]|chav[oa] como t[uú]|de tu edad|secundaria|tus pap[aá]s|tu mam[aá]|tu pap[aá]|adulto)\b/i;
const SUPERVISED_OR_INSTITUTIONAL = /\b(profe(?:sor|sora)?|maestr[oa]|escuela|clase|tarea|examen|equipo|entrenador|con permiso|mis pap[aá]s|mi mam[aá]|mi pap[aá]|protecci[oó]n civil|documental|serie|canci[oó]n|videojuego)\b/i;

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
  const conversation = texts.join(" ");
  const directedAction = texts.filter((text) => DIRECTED_ACTION.test(text)).length / n;
  const secrecy = SECRECY_OR_ERASURE.test(conversation) ? 1 : 0;
  const opaqueTransfer =
    OPAQUE_TRANSFER.test(conversation) && TRANSFER_ACTION.test(conversation) ? 1 : 0;
  const intentSignals = [
    directedAction > 0 ? 1 : 0,
    secrecy,
    opaqueTransfer,
    SURVEILLANCE.test(conversation) ? 1 : 0,
    ISOLATION.test(conversation) ? 1 : 0,
    COERCION_OR_DEBT.test(conversation) ? 1 : 0,
    REWARD_OR_LEVERAGE.test(conversation) ? 1 : 0,
    AUTHORITY_AVOIDANCE.test(conversation) ? 1 : 0,
    MINOR_TARGETING.test(conversation) ? 1 : 0,
  ];

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
    directedAction,
    ...intentSignals.slice(1),
    sat(intentSignals.reduce((sum, value) => sum + value, 0), intentSignals.length),
    SUPERVISED_OR_INSTITUTIONAL.test(conversation) ? 1 : 0,
  ];

  return { version: FEATURE_SCHEMA_VERSION, names: FEATURE_NAMES, values };
}

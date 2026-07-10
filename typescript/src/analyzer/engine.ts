// ─────────────────────────────────────────────────────────────────────────────
// SENTINEL MX — Engine v1
// Pipeline: NormalizerLayer → V3Layer → V4Layer → VelocityDetector → resultado
// ─────────────────────────────────────────────────────────────────────────────

import { NormalizerLayer } from "./normalizer-layer.js";
import { V3Layer } from "./v3-layer.js";
import { V4Layer } from "./v4-layer.js";
import { VelocityDetector } from "./velocity-detector.js";
import { DampenerLayer } from "./dampener-layer.js";
import { TemporalLayer } from "./temporal-layer.js";
import { ActorLayer } from "./actor-layer.js";
import { ageCategoryMultiplier, type AgeBand } from "./age-policy.js";
import type { Message, EngineResult, RiskLevel } from "../types/SentinelEngine.js";

/** Contexto opcional que la plataforma puede pasar para afinar el análisis. */
export interface AnalyzeOptions {
  /** Banda de edad del usuario protegido; ajusta pesos por categoría (7.4). */
  ageBand?: AgeBand;
}

export class Engine {
  private normalizer: NormalizerLayer;
  private v3: V3Layer;
  private v4: V4Layer;
  private velocity: VelocityDetector;
  private dampener: DampenerLayer;
  private temporal: TemporalLayer;
  private actor: ActorLayer;
  private sessionThreshold: number;

  constructor() {
    this.normalizer = new NormalizerLayer();
    // El índice V3 se normaliza con el mismo pipeline que el texto de entrada,
    // para que términos como "facebook" (que las fonéticas vuelven "faceboqu")
    // coincidan en ambos lados.
    this.v3 = new V3Layer((raw) => this.normalizer.normalizeText(raw));
    this.v4 = new V4Layer((raw) => this.normalizer.normalizeText(raw));
    this.velocity = new VelocityDetector();
    this.dampener = new DampenerLayer();
    this.temporal = new TemporalLayer();
    this.actor = new ActorLayer();
    this.sessionThreshold = this.v3.sessionThreshold;
  }

  /** Inyecta términos dinámicos en el V3Layer desde la API. */
  injectHotTerms(terms: Array<{ id: string; term: string; category: string; weight: number; variants: string[] }>): void {
    this.v3.injectHotTerms(terms);
  }

  /** Analiza un array de mensajes a través de todas las capas del pipeline. */
  analyze(messages: Message[], options: AnalyzeOptions = {}): EngineResult {
    const ageBand = options.ageBand;

    // Cotas defensivas: el motor corre on-device y no debe ser vulnerable a una
    // entrada enorme (un mensaje kilométrico o miles de mensajes). Se acota el
    // número de mensajes (se conservan los primeros —contexto/etapas iniciales—
    // y los últimos) y el largo de cada texto.
    const MAX_MESSAGES = 2000;
    const MAX_TEXT_LEN = 4000;
    let capped = messages;
    if (messages.length > MAX_MESSAGES) {
      const head = Math.floor(MAX_MESSAGES / 4);
      capped = [...messages.slice(0, head), ...messages.slice(messages.length - (MAX_MESSAGES - head))];
    }
    capped = capped.map((m) =>
      m.text.length > MAX_TEXT_LEN ? { ...m, text: m.text.slice(0, MAX_TEXT_LEN) } : m,
    );
    messages = capped;
    // ── Fase 1: Normalizar ──────────────────────────────────────────────────
    const n0 = this.normalizer.process(messages);

    // ── Fase 2: V3 sobre texto normalizado ──────────────────────────────────
    const v3 = this.v3.scan(n0.messages);

    // ── Fase 3: V4 sobre texto normalizado ──────────────────────────────────
    const v4 = this.v4.scan(n0.messages);

    // ── Fase 4: Velocidad sobre todos los hits combinados ───────────────────
    const allHits = [...n0.hits, ...v3.hits, ...v4.hits];
    const { flag: velocityFlag, windowSeconds } = this.velocity.check(allHits);

    // ── Fase 4b: Progresión temporal (captación lenta multi-día) ────────────
    const temporal = this.temporal.scan(allHits);

    // ── Fase 4c: Asimetría de actor (¿un solo emisor concentra las tácticas?) ─
    const actor = this.actor.analyze(n0.messages, this.v3);

    // Bonus 20% si hay velocidad + al menos una regla activa en cualquier capa
    const hasActiveRule =
      v3.triggeredRules.length > 0 ||
      v4.triggeredRules.length > 0 ||
      n0.triggeredRules.length > 0;

    // ── Fase 5: Amortiguadores de contexto (Dampeners) + banda de edad ──────
    // Se itera término por término aplicando (a) el multiplicador por edad y
    // (b) el factor de dampener cuando corresponde. Sin dampeners ni edad, el
    // resultado es idéntico al score V3 original.
    const dampeners = this.dampener.scan(n0.messages);
    const canDampen = v4.explicitSignals.length === 0;
    const dampenersApplied: string[] = [];
    let dampenedV3Score = 0;

    const termCategories = new Map<string, string>();
    const termWeights = new Map<string, number>();
    for (const hit of v3.hits) {
      if (hit.category) {
        termCategories.set(hit.id, hit.category);
        termWeights.set(hit.id, hit.score);
      }
    }

    for (const termId of v3.terms) {
      const category = termCategories.get(termId);
      const originalWeight = termWeights.get(termId) ?? 0;
      let weight = originalWeight;

      // (a) Ajuste por banda de edad (1 si no hay banda o categoría no listada).
      const ageFactor = ageCategoryMultiplier(ageBand, category);
      if (ageFactor !== 1) weight = weight * ageFactor;

      // (b) Dampeners de contexto benigno (nunca sobre aislamiento).
      if (canDampen && dampeners.length > 0 && category && category !== "aislamiento") {
        const matchingDampeners = dampeners.filter((d) =>
          d.dampen_categories.includes(category)
        );
        if (matchingDampeners.length > 0) {
          const minFactor = Math.min(...matchingDampeners.map((d) => d.factor));
          weight = weight * minFactor;
          for (const d of matchingDampeners) {
            dampenersApplied.push(`${d.id} (${d.term})`);
          }
        }
      }
      dampenedV3Score += Math.round(weight);
    }
    const uniqueDampenersApplied = [...new Set(dampenersApplied)];

    // ── Score total ─────────────────────────────────────────────────────────
    let totalScore = n0.score + dampenedV3Score + v4.score;

    if (velocityFlag && hasActiveRule) {
      totalScore = Math.round(totalScore * 1.2);
    }

    // ── Categorías únicas (unión de todas las capas) ─────────────────────────
    const uniqueCategories = [
      ...new Set([
        ...v3.categories,
        ...v4.explicitSignals.map((id) => this.v4.resolveSignalCategory(id)),
      ].filter(Boolean)),
    ];

    // Corroboración multi-señal
    const categoriesForCorroboration = uniqueCategories.filter((cat) => cat !== "señal_debil");
    const hasCorroboration =
      categoriesForCorroboration.length >= 2 ||
      hasActiveRule ||
      v4.explicitSignals.length > 0;

    // ── Risk y escalate ─────────────────────────────────────────────────────
    const hasDampeners = uniqueDampenersApplied.length > 0;
    let risk = this.resolveRisk(
      totalScore,
      v3.triggeredRules,
      v4.triggeredRules,
      velocityFlag,
      hasCorroboration,
      hasDampeners
    );

    // Piso de riesgo por progresión temporal: una cadena de captación lenta es
    // señal aunque cada sesión individual haya quedado bajo el umbral de score.
    // TCR-001 con las 4 etapas completas → piso HIGH (el guion completo se
    // ejecutó; la corroboración multi-categoría está implícita en ≥3 etapas).
    // Cualquier TCR → piso MEDIUM, que fuerza la revisión de la capa cognitiva
    // con el contexto completo. Los dampeners no anulan el piso: el contexto
    // benigno explica un término suelto, no una progresión ordenada de semanas.
    const hasTemporalChain = temporal.triggeredRules.length > 0;
    if (hasTemporalChain) {
      const fullScript =
        temporal.triggeredRules.includes("TCR-001") &&
        temporal.stagesPresent.length >= 4;
      const floor: RiskLevel = fullScript ? "HIGH" : "MEDIUM";
      const order: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
      if (order.indexOf(risk) < order.indexOf(floor)) {
        risk = floor;
      }
    }

    // Techo por contexto fuerte de entretenimiento: hablar de series/corridos/
    // música con léxico narco DESCRIPTIVO, sin ninguna señal de acción dirigida
    // al menor (oferta, logística, solicitud de datos, cambio de canal,
    // aislamiento), no puede producir un BLOQUEO automático — a lo mucho escala
    // al LLM para que confirme. Un fan viendo Netflix nunca debe ser HARD_BLOCK.
    // La progresión temporal ignora este techo (una cadena de semanas es señal
    // real aunque se disfrace de plática de corridos).
    const ACTION_CATEGORIES = new Set([
      "oferta_economica",
      "logistica_fisica",
      "solicitud_informacion",
      "cambio_canal",
      "aislamiento",
      "formalidad_deceptiva",
    ]);
    const hasHardContext = dampeners.some((d) => d.hardContext);
    const hasDirectedAction = uniqueCategories.some((c) => ACTION_CATEGORIES.has(c));
    if (hasHardContext && !hasDirectedAction && !hasTemporalChain) {
      if (risk === "HIGH" || risk === "CRITICAL") {
        risk = "MEDIUM";
      }
    }

    // Piso por asimetría de actor: si un solo emisor concentra las tácticas de
    // acción dirigida (ofrece + aísla + pide datos...), es la firma del agresor
    // aunque el score total sea moderado. Nunca dejamos que un patrón así quede
    // por debajo de MEDIUM (= lo ve la capa cognitiva). El contexto de
    // entretenimiento NO lo excusa: un reclutador que además cita corridos sigue
    // siendo un actor concentrando tácticas.
    if (actor.aggressorSender) {
      const order: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
      if (order.indexOf(risk) < order.indexOf("MEDIUM")) {
        risk = "MEDIUM";
      }
    }

    // Reciprocidad: el complemento de la asimetría. Si hay ≥2 emisores, NINGUNO
    // concentra las tácticas (señal repartida), y no hay ninguna señal fuerte
    // independiente del emisor (regla MCR/CR, señal explícita V4, cadena
    // temporal), entonces es interacción entre pares — dos amigos planeando una
    // fiesta ("manda tu ubicación" mutuo) o prestándose dinero recíprocamente.
    // Un reclutador real dispara reglas o concentra; esto no lo deja escapar.
    // Categorías coercivas que NUNCA son benignas-recíprocas entre menores:
    // pedir secreto o mudar de canal para ocultarse no tiene versión "mutua".
    const COERCIVE_CATEGORIES = new Set(["aislamiento", "cambio_canal", "manipulacion_social"]);
    const hasCoercive = uniqueCategories.some((c) => COERCIVE_CATEGORIES.has(c));
    const reciprocal =
      actor.analyzed &&
      !actor.aggressorSender &&
      actor.concentration <= 0.6 && // señal de acción dirigida genuinamente repartida
      !hasActiveRule && // sin regla MCR/CR fuerte (independiente del emisor)
      !hasCoercive && // sin tácticas de secreto/aislamiento
      !hasTemporalChain;
    let reciprocalCapped = false;
    if (reciprocal && risk === "MEDIUM") {
      risk = "LOW";
      reciprocalCapped = true;
    }

    const escalate =
      !reciprocalCapped &&
      (totalScore >= this.sessionThreshold ||
        (hasActiveRule && !hasDampeners) ||
        hasTemporalChain ||
        actor.aggressorSender !== null ||
        risk === "CRITICAL");

    return {
      score: totalScore,
      risk,
      escalate,
      layers: {
        normalizer: {
          score: n0.score,
          features: n0.features,
          triggeredRules: n0.triggeredRules,
          transformations: n0.transformations,
        },
        v3: {
          score: dampenedV3Score,
          originalScore: v3.score,
          dampenersApplied: uniqueDampenersApplied,
          terms: v3.terms,
          categories: v3.categories,
          triggeredRules: v3.triggeredRules,
        },
        v4: {
          score: v4.score,
          features: v4.features,
          triggeredRules: v4.triggeredRules,
          explicitSignals: v4.explicitSignals,
        },
        temporal,
        actor,
      },
      velocityFlag,
      velocityWindow: windowSeconds,
      messagesAnalyzed: messages.length,
      uniqueCategories,
      ageBand,
    };
  }

  private resolveRisk(
    score: number,
    mcrRules: string[],
    crRules: string[],
    velocityFlag: boolean,
    hasCorroboration: boolean,
    hasDampeners: boolean
  ): RiskLevel {
    const totalRules = hasDampeners ? 0 : (mcrRules.length + crRules.length);
    let risk: RiskLevel = "LOW";
    if (score >= 25 || totalRules >= 2) {
      risk = "CRITICAL";
    } else if (score >= 20 || (velocityFlag && totalRules > 0)) {
      risk = "HIGH";
    } else if (score >= this.sessionThreshold) {
      risk = "MEDIUM";
    }

    // Corroboración multi-señal para HIGH y CRITICAL
    if ((risk === "HIGH" || risk === "CRITICAL") && !hasCorroboration) {
      return "MEDIUM";
    }
    return risk;
  }
}

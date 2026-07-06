// ─────────────────────────────────────────────────────────────────────────────
// SENTINEL MX — Engine v1
// Pipeline: NormalizerLayer → V3Layer → V4Layer → VelocityDetector → resultado
// ─────────────────────────────────────────────────────────────────────────────

import { NormalizerLayer } from "./normalizer-layer.js";
import { V3Layer } from "./v3-layer.js";
import { V4Layer } from "./v4-layer.js";
import { VelocityDetector } from "./velocity-detector.js";
import { DampenerLayer } from "./dampener-layer.js";
import type { Message, EngineResult, RiskLevel } from "../types/SentinelEngine.js";

export class Engine {
  private normalizer: NormalizerLayer;
  private v3: V3Layer;
  private v4: V4Layer;
  private velocity: VelocityDetector;
  private dampener: DampenerLayer;
  private sessionThreshold: number;

  constructor() {
    this.normalizer = new NormalizerLayer();
    this.v3 = new V3Layer();
    this.v4 = new V4Layer();
    this.velocity = new VelocityDetector();
    this.dampener = new DampenerLayer();
    this.sessionThreshold = this.v3.sessionThreshold;
  }

  /** Inyecta términos dinámicos en el V3Layer desde la API. */
  injectHotTerms(terms: Array<{ id: string; term: string; category: string; weight: number; variants: string[] }>): void {
    this.v3.injectHotTerms(terms);
  }

  /** Analiza un array de mensajes a través de todas las capas del pipeline. */
  analyze(messages: Message[]): EngineResult {
    // ── Fase 1: Normalizar ──────────────────────────────────────────────────
    const n0 = this.normalizer.process(messages);

    // ── Fase 2: V3 sobre texto normalizado ──────────────────────────────────
    const v3 = this.v3.scan(n0.messages);

    // ── Fase 3: V4 sobre texto normalizado ──────────────────────────────────
    const v4 = this.v4.scan(n0.messages);

    // ── Fase 4: Velocidad sobre todos los hits combinados ───────────────────
    const allHits = [...n0.hits, ...v3.hits, ...v4.hits];
    const { flag: velocityFlag, windowSeconds } = this.velocity.check(allHits);

    // Bonus 20% si hay velocidad + al menos una regla activa en cualquier capa
    const hasActiveRule =
      v3.triggeredRules.length > 0 ||
      v4.triggeredRules.length > 0 ||
      n0.triggeredRules.length > 0;

    // ── Fase 5: Amortiguadores de contexto (Dampeners) ──────────────────────
    const dampeners = this.dampener.scan(n0.messages);
    const canDampen = v4.explicitSignals.length === 0;
    const dampenersApplied: string[] = [];
    let dampenedV3Score = 0;

    if (canDampen && dampeners.length > 0) {
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

        if (category && category !== "aislamiento") {
          const matchingDampeners = dampeners.filter((d) =>
            d.dampen_categories.includes(category)
          );
          if (matchingDampeners.length > 0) {
            const minFactor = Math.min(...matchingDampeners.map((d) => d.factor));
            weight = Math.round(originalWeight * minFactor);
            for (const d of matchingDampeners) {
              dampenersApplied.push(`${d.id} (${d.term})`);
            }
          }
        }
        dampenedV3Score += weight;
      }
    } else {
      dampenedV3Score = v3.score;
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
    const risk = this.resolveRisk(
      totalScore,
      v3.triggeredRules,
      v4.triggeredRules,
      velocityFlag,
      hasCorroboration,
      hasDampeners
    );
    const escalate =
      totalScore >= this.sessionThreshold ||
      (hasActiveRule && !hasDampeners) ||
      risk === "CRITICAL";

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
      },
      velocityFlag,
      velocityWindow: windowSeconds,
      messagesAnalyzed: messages.length,
      uniqueCategories,
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

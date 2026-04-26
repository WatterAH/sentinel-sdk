// ─────────────────────────────────────────────────────────────────────────────
// SENTINEL MX — Engine v1
// Pipeline: NormalizerLayer → V3Layer → V4Layer → VelocityDetector → resultado
// ─────────────────────────────────────────────────────────────────────────────

import { NormalizerLayer } from "./normalizer-layer.js";
import { V3Layer } from "./v3-layer.js";
import { V4Layer } from "./v4-layer.js";
import { VelocityDetector } from "./velocity-detector.js";
import type { Message, EngineResult, RiskLevel } from "../types/SentinelEngine.js";

export class Engine {
  private normalizer: NormalizerLayer;
  private v3: V3Layer;
  private v4: V4Layer;
  private velocity: VelocityDetector;
  private sessionThreshold: number;

  constructor() {
    this.normalizer = new NormalizerLayer();
    this.v3 = new V3Layer();
    this.v4 = new V4Layer();
    this.velocity = new VelocityDetector();
    this.sessionThreshold = this.v3.sessionThreshold;
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

    // ── Score total ─────────────────────────────────────────────────────────
    let totalScore = n0.score + v3.score + v4.score;

    // Bonus 20% si hay velocidad + al menos una regla activa en cualquier capa
    const hasActiveRule =
      v3.triggeredRules.length > 0 ||
      v4.triggeredRules.length > 0 ||
      n0.triggeredRules.length > 0;

    if (velocityFlag && hasActiveRule) {
      totalScore = Math.round(totalScore * 1.2);
    }

    // ── Risk y escalate ─────────────────────────────────────────────────────
    const risk = this.resolveRisk(totalScore, v3.triggeredRules, v4.triggeredRules, velocityFlag);
    const escalate =
      totalScore >= this.sessionThreshold ||
      hasActiveRule ||
      risk === "CRITICAL";

    // ── Categorías únicas (unión de todas las capas) ─────────────────────────
    const uniqueCategories = [
      ...new Set([
        ...v3.categories,
        ...v4.explicitSignals.map((id) => this.v4.resolveSignalCategory(id)),
      ].filter(Boolean)),
    ];

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
          score: v3.score,
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
  ): RiskLevel {
    const totalRules = mcrRules.length + crRules.length;
    if (score >= 25 || totalRules >= 2) return "CRITICAL";
    if (score >= 20 || (velocityFlag && totalRules > 0)) return "HIGH";
    if (score >= this.sessionThreshold) return "MEDIUM";
    return "LOW";
  }
}

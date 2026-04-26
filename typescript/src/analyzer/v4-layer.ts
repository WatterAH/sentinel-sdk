// ─────────────────────────────────────────────────────────────────────────────
// CAPA 2: V4Layer
// Responsabilidad: features abstractas + señales explícitas + reglas de combinación
// ─────────────────────────────────────────────────────────────────────────────

import v4Dataset from "../constants/sentinel_dataset_v4.json" with { type: "json" };
import type { Message, V4Output, Hit } from "../types/SentinelEngine.js";

export class V4Layer {
  private lexicons: Map<string, string[]>;
  private features: Array<{
    id: string;
    name: string;
    weight: number;
    lexiconKeys: string[];
    negated: boolean;
    category?: string;
  }>;
  private combinationRules: Array<{
    id: string;
    features_required: string[];
    bonus_score: number;
  }>;
  private explicitSignals: Array<{
    id: string;
    label: string;
    patterns: string[];
    weight: number;
    category: string;
  }>;

  constructor() {
    const data = v4Dataset as any;

    this.lexicons = new Map(Object.entries(data.lexicons ?? {})) as Map<string, string[]>;

    this.features = (data.features ?? []).map((f: any) => ({
      id: f.id,
      name: f.name,
      weight: f.weight ?? 1,
      lexiconKeys: f.derived_from ?? [],
      negated: f.logic === "NEGATED — se activa cuando NO hay match",
      category: f.category,
    }));

    this.combinationRules = data.combination_rules ?? [];
    this.explicitSignals = data.explicit_signals ?? [];
  }

  /** Escanea mensajes buscando features V4, señales explícitas y reglas de combinación. */
  scan(messages: Message[]): V4Output {
    const allActiveFeatures = new Set<string>();
    const triggeredExplicit: string[] = [];
    const hits: Hit[] = [];
    let score = 0;

    for (const msg of messages) {
      const lower = msg.text.toLowerCase();

      // Señales explícitas — mayor precisión, mayor peso
      for (const signal of this.explicitSignals) {
        const matched = signal.patterns.some((p) => lower.includes(p.toLowerCase()));
        if (matched && !triggeredExplicit.includes(signal.id)) {
          triggeredExplicit.push(signal.id);
          score += signal.weight;
          hits.push({
            id: signal.id,
            score: signal.weight,
            category: signal.category,
            timestamp: msg.timestamp,
          });
        }
      }

      // Features abstractas
      const features = this.detectFeatures(lower);
      for (const f of features) allActiveFeatures.add(f);
    }

    // Peso base de features
    for (const featureName of allActiveFeatures) {
      const def = this.features.find((f) => f.name === featureName);
      if (def) {
        score += def.weight;
        hits.push({ id: def.id, score: def.weight, timestamp: Date.now() });
      }
    }

    // Bonus de combinaciones
    const triggeredRules: string[] = [];
    for (const rule of this.combinationRules) {
      const allPresent = rule.features_required.every((f) => allActiveFeatures.has(f));
      if (allPresent) {
        triggeredRules.push(rule.id);
        score += rule.bonus_score;
      }
    }

    return {
      score,
      features: [...allActiveFeatures],
      triggeredRules,
      explicitSignals: triggeredExplicit,
      hits,
    };
  }

  private detectFeatures(text: string): Set<string> {
    const active = new Set<string>();

    for (const feature of this.features) {
      if (feature.negated) {
        const hasMatch = feature.lexiconKeys.some((key) =>
          (this.lexicons.get(key) ?? []).some((term) => text.includes(term.toLowerCase()))
        );
        if (!hasMatch) active.add(feature.name);
      } else {
        const hasMatch = feature.lexiconKeys.some((key) =>
          (this.lexicons.get(key) ?? []).some((term) => text.includes(term.toLowerCase()))
        );
        if (hasMatch) active.add(feature.name);
      }
    }

    return active;
  }

  /** Resuelve la categoría de una señal explícita por su ID. */
  resolveSignalCategory(signalId: string): string {
    const sig = this.explicitSignals.find((s) => s.id === signalId);
    return sig?.category ?? "";
  }
}

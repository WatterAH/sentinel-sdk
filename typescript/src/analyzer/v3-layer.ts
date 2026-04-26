// ─────────────────────────────────────────────────────────────────────────────
// CAPA 1: V3Layer
// Responsabilidad: términos exactos documentados + reglas MCR
// ─────────────────────────────────────────────────────────────────────────────

import v3Dataset from "../constants/sentinel_dataset_v3.json" with { type: "json" };
import type { Message, V3Output, Hit } from "../types/SentinelEngine.js";

export class V3Layer {
  private index: Map<string, { id: string; weight: number; category: string }>;
  private mcrRules: Array<{
    id: string;
    categories_required?: string[];
    min_categories?: number;
    min_messages: number;
  }>;
  readonly sessionThreshold: number;

  constructor() {
    const data = v3Dataset as any;
    this.sessionThreshold = data.metadata.tier1_session_threshold;
    this.mcrRules = data.metadata.multi_category_escalation_rules.rules;

    // Construir índice plano de término/variante → entrada
    this.index = new Map();
    for (const entry of data.terms) {
      const all = [entry.term, ...(entry.variants ?? [])];
      for (const variant of all) {
        this.index.set(variant.toLowerCase().trim(), {
          id: entry.id,
          weight: entry.weight,
          category: entry.category,
        });
      }
    }
  }

  /** Escanea mensajes buscando términos V3 y evalúa reglas MCR. */
  scan(messages: Message[]): V3Output {
    let score = 0;
    const termsFound = new Set<string>();
    const categoriesFound = new Set<string>();
    const hits: Hit[] = [];

    for (const msg of messages) {
      const lower = msg.text.toLowerCase();
      for (const [variant, entry] of this.index) {
        if (lower.includes(variant)) {
          if (!termsFound.has(entry.id)) {
            // Solo suma el peso una vez por término único
            score += entry.weight;
            termsFound.add(entry.id);
          }
          categoriesFound.add(entry.category);
          hits.push({
            id: entry.id,
            score: entry.weight,
            category: entry.category,
            timestamp: msg.timestamp,
          });
        }
      }
    }

    const triggeredRules = this.checkMCR(categoriesFound, messages.length);

    return {
      score,
      terms: [...termsFound],
      categories: [...categoriesFound],
      triggeredRules,
      hits,
    };
  }

  private checkMCR(categories: Set<string>, messageCount: number): string[] {
    const triggered: string[] = [];
    for (const rule of this.mcrRules) {
      if (rule.categories_required) {
        const allPresent = rule.categories_required.every((c) => categories.has(c));
        if (allPresent && messageCount >= rule.min_messages) {
          triggered.push(rule.id);
        }
      }
      if (rule.min_categories !== undefined) {
        if (categories.size >= rule.min_categories && messageCount >= rule.min_messages) {
          triggered.push(rule.id);
        }
      }
    }
    return triggered;
  }
}

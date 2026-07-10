// ─────────────────────────────────────────────────────────────────────────────
// CAPA 1: V3Layer
// Responsabilidad: términos exactos documentados + reglas MCR
// ─────────────────────────────────────────────────────────────────────────────

import v3Dataset from "../constants/sentinel_dataset_v3.json" with { type: "json" };
import type { Message, V3Output, Hit } from "../types/SentinelEngine.js";
import { removeAccents } from "./text-utils.js";

export class V3Layer {
  private index: Map<string, { id: string; weight: number; category: string; regex: RegExp; ambiguous: boolean }>;
  private mcrRules: Array<{
    id: string;
    categories_required?: string[];
    min_categories?: number;
    min_messages: number;
  }>;
  readonly sessionThreshold: number;
  private normalizeKey: (raw: string) => string;

  /**
   * @param normalizeFn opcional: normalizador de términos, para que el índice
   *   pase por el mismo pipeline (reglas fonéticas, etc.) que el texto de
   *   entrada. Si no se pasa, cae a solo quitar acentos (comportamiento previo).
   */
  constructor(normalizeFn?: (raw: string) => string) {
    const data = v3Dataset as any;
    this.sessionThreshold = data.metadata.tier1_session_threshold;
    this.mcrRules = data.metadata.multi_category_escalation_rules.rules;
    this.normalizeKey = normalizeFn ?? ((raw: string) => removeAccents(raw.toLowerCase().trim()));

    // Construir índice plano de término/variante → entrada
    this.index = new Map();
    for (const entry of data.terms) {
      const all = [entry.term, ...(entry.variants ?? [])];
      for (const variant of all) {
        const key = this.normalizeKey(variant);
        if (!key) continue;
        this.index.set(key, {
          id: entry.id,
          weight: entry.weight,
          category: entry.category,
          regex: this.buildRegex(key),
          // Términos-clave polisémicos (ej. "facebook"=fentanilo, "papaya"=arma):
          // son jerga real pero colisionan con lenguaje cotidiano. Solo cuentan
          // si otra señal de riesgo los acompaña (ver scan()).
          ambiguous: entry.requires_corroboration === true,
        });
      }
    }
  }

  private buildRegex(term: string): RegExp {
    // Escapar caracteres especiales de RegExp
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Reemplazar espacios por \s+ para tolerar espaciado flexible
    const flexible = escaped.replace(/\s+/g, '\\s+');
    // Usar fronteras de palabra compatibles con Unicode (letras y números)
    return new RegExp(`(?<![\\p{L}\\p{N}])${flexible}(?![\\p{L}\\p{N}])`, 'ui');
  }

  /**
   * Inyecta términos dinámicos desde la API (hot-terms).
   * Se mezclan con el dataset estático sin reemplazarlo.
   * Si un término ya existe, se ignora para no alterar el peso original.
   */
  injectHotTerms(terms: Array<{ id: string; term: string; category: string; weight: number; variants: string[] }>): void {
    for (const entry of terms) {
      const all = [entry.term, ...entry.variants];
      for (const variant of all) {
        const key = this.normalizeKey(variant);
        if (!key) continue;
        if (!this.index.has(key)) {
          this.index.set(key, {
            id: entry.id,
            weight: entry.weight,
            category: entry.category,
            regex: this.buildRegex(key),
            ambiguous: (entry as any).requires_corroboration === true,
          });
        }
      }
    }
  }

  /** Escanea mensajes buscando términos V3 y evalúa reglas MCR. */
  scan(messages: Message[]): V3Output {
    // ── Pasada 1: recolectar todos los matches (una vez por término único) ──
    interface Match { id: string; weight: number; category: string; ambiguous: boolean; timestamp: number }
    const matchesById = new Map<string, Match>();

    for (const msg of messages) {
      for (const [, entry] of this.index) {
        if (matchesById.has(entry.id)) continue;
        if (entry.regex.test(msg.text)) {
          matchesById.set(entry.id, {
            id: entry.id,
            weight: entry.weight,
            category: entry.category,
            ambiguous: entry.ambiguous,
            timestamp: msg.timestamp ?? Date.now(),
          });
        }
      }
    }

    // ── Corroboración: ¿hay alguna señal de riesgo NO ambigua y de peso real? ──
    // Un término inequívoco de categoría distinta a señal_debil corrobora a los
    // términos-clave ambiguos. Sin corroboración, lo ambiguo no cuenta: "la rola"
    // (canción) suelta no es MDMA; "tengo facebook, jalas al bisne" sí lo es
    // porque "jale" (reclutamiento) corrobora.
    const hasSolidSignal = [...matchesById.values()].some(
      (m) => !m.ambiguous && m.category !== "señal_debil"
    );

    // ── Pasada 2: score y categorías, aplicando corroboración ──────────────
    let score = 0;
    const termsFound = new Set<string>();
    const categoriesFound = new Set<string>();
    const hits: Hit[] = [];

    for (const m of matchesById.values()) {
      // Un término ambiguo sin corroboración se ignora por completo (no suma
      // score ni aporta su categoría a las reglas MCR).
      if (m.ambiguous && !hasSolidSignal) continue;

      score += m.weight;
      termsFound.add(m.id);
      categoriesFound.add(m.category);
      hits.push({ id: m.id, score: m.weight, category: m.category, timestamp: m.timestamp });
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

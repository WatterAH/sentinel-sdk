// ─────────────────────────────────────────────────────────────────────────────
// CAPA 0: NormalizerLayer
// Responsabilidad: limpiar texto informal, expandir emojis/abreviaciones,
// aplicar reglas fonéticas, y detectar features propias N0.
// ─────────────────────────────────────────────────────────────────────────────

import normalizerDataset from "../constants/sentinel_dataset_normalizer_v2.json" with { type: "json" };
import { removeAccents, collapseRepeated } from "./text-utils.js";
import type { Message, NormalizerOutput, Hit } from "../types/SentinelEngine.js";

export class NormalizerLayer {
  private unicodeMap: Map<string, string>;
  private abbrMap: Map<string, string>;
  private phoneticRules: Array<{ pattern: RegExp; replacement: string }>;
  private misspellingMap: Map<string, string>;
  private lexicons: Map<string, string[]>;
  private features: Array<{ id: string; lexicons: string[]; weight: number; negated?: boolean }>;
  private combinationRules: Array<{
    id: string;
    features_required: string[];
    bonus_score: number;
  }>;
  private negationRules: Array<{ pattern: RegExp; effect: "CANCEL" | "KEEP"; signal?: string }>;

  constructor() {
    const data = normalizerDataset as any;

    // Emojis y símbolos → texto canónico
    this.unicodeMap = new Map(
      data.normalization_rules.unicode_and_symbols.map((e: any) => [e.raw, e.canonical])
    );

    // Abreviaciones de chat → forma canónica
    this.abbrMap = new Map(
      data.normalization_rules.chat_abbreviations.entries.map((e: any) => [
        e.abbr.toLowerCase(),
        e.canonical,
      ])
    );

    // Reglas fonéticas ordenadas
    const pRules = data.normalization_rules?.phonetic_rules?.rules ?? [];
    this.phoneticRules = pRules.map((r: any) => ({
      pattern: new RegExp(r.find, "gi"),
      replacement: r.replace,
    }));

    // Errores de tipeo comunes (fallback if missing in v2)
    const mRules = data.normalization_rules?.common_misspellings ?? [];
    this.misspellingMap = new Map(
      mRules.map((e: any) => [
        e.raw.toLowerCase(),
        e.canonical,
      ])
    );

    // Lexicons N0
    this.lexicons = new Map(
      Object.entries(data.lexicons ?? {}).map(([key, value]) => [
        key,
        (value as any).entries as string[],
      ])
    );

    // Features N0
    const fRules = data.N0_features?.features ?? [];
    this.features = fRules.map((f: any) => ({
      id: f.id,
      lexicons: f.derived_from ?? [],
      weight: f.weight ?? 1,
      negated: f.logic === "NEGATED",
    }));

    // Reglas de combinación N0
    this.combinationRules = data.N0_combination_rules?.rules ?? [];

    // Reglas de negación
    this.negationRules = (data.negation_rules?.rules ?? []).map((r: any) => ({
      pattern: new RegExp(r.pattern, "i"),
      effect: r.signal_effect.startsWith("CANCEL") ? "CANCEL" as const : "KEEP" as const,
      signal: r.signal_effect.startsWith("KEEP") ? r.signal_effect.split("— ")[1] : undefined,
    }));
  }

  /** Normaliza un string aplicando todas las transformaciones. */
  normalize(raw: string): { text: string; transformations: string[] } {
    const transformations: string[] = [];
    let text = raw.toLowerCase().trim();

    // 1. Expandir emojis y símbolos
    for (const [emoji, canonical] of this.unicodeMap) {
      if (text.includes(emoji)) {
        text = text.replaceAll(emoji, ` ${canonical} `);
        transformations.push(`${emoji}→${canonical}`);
      }
    }

    // 2. Normalizar unicode (acentos)
    text = removeAccents(text);

    // 3. Colapsar repetidos
    text = collapseRepeated(text);

    // 4. Errores de tipeo comunes (antes de abreviaciones)
    for (const [misspell, canonical] of this.misspellingMap) {
      const regex = new RegExp(`\\b${misspell}\\b`, "gi");
      if (regex.test(text)) {
        text = text.replace(regex, canonical);
        transformations.push(`${misspell}→${canonical}`);
      }
    }

    // 5. Abreviaciones (word boundary)
    const words = text.split(/\s+/);
    const expanded = words.map((word) => {
      const clean = word.replace(/[^a-z0-9']/g, "");
      const canonical = this.abbrMap.get(clean);
      if (canonical) {
        transformations.push(`${clean}→${canonical}`);
        return canonical;
      }
      return word;
    });
    text = expanded.join(" ");

    // 6. Reglas fonéticas
    for (const rule of this.phoneticRules) {
      const before = text;
      text = text.replace(rule.pattern, rule.replacement);
      if (text !== before) {
        transformations.push(`phonetic:${rule.replacement}`);
      }
    }

    return { text, transformations };
  }

  /** Detecta features N0 en texto ya normalizado. */
  private detectFeatures(text: string): Set<string> {
    const active = new Set<string>();

    for (const feature of this.features) {
      if (feature.negated) {
        // Feature negada: activa si NO hay match en sus lexicons
        const hasMatch = feature.lexicons.some((lexName) => {
          const lex = this.lexicons.get(lexName) ?? [];
          return lex.some((term) => text.includes(term.toLowerCase()));
        });
        if (!hasMatch) active.add(feature.id);
      } else {
        const hasMatch = feature.lexicons.some((lexName) => {
          const lex = this.lexicons.get(lexName) ?? [];
          return lex.some((term) => text.includes(term.toLowerCase()));
        });
        if (hasMatch) active.add(feature.id);
      }
    }

    return active;
  }

  /** Evalúa reglas de combinación N0. */
  private checkCombinationRules(
    activeFeatures: Set<string>
  ): { triggered: string[]; bonusScore: number } {
    let bonusScore = 0;
    const triggered: string[] = [];

    for (const rule of this.combinationRules) {
      const allPresent = rule.features_required.every((f) => activeFeatures.has(f));
      if (allPresent) {
        triggered.push(rule.id);
        bonusScore += rule.bonus_score;
      }
    }

    return { triggered, bonusScore };
  }

  /** Procesa un array de mensajes: normaliza, detecta features, evalúa reglas. */
  process(messages: Message[]): NormalizerOutput {
    const allTransformations: string[] = [];
    const allActiveFeatures = new Set<string>();
    const normalizedMessages: Message[] = [];
    const hits: Hit[] = [];

    for (const msg of messages) {
      const { text, transformations } = this.normalize(msg.text);
      normalizedMessages.push({ text, timestamp: msg.timestamp });
      allTransformations.push(...transformations);

      const features = this.detectFeatures(text);
      for (const f of features) allActiveFeatures.add(f);
    }

    // Peso base de features individuales
    let baseScore = 0;
    for (const featureId of allActiveFeatures) {
      const def = this.features.find((f) => f.id === featureId);
      if (def) {
        baseScore += def.weight;
        hits.push({ id: featureId, score: def.weight, timestamp: Date.now() });
      }
    }

    // Bonus de combinaciones
    const { triggered, bonusScore } = this.checkCombinationRules(allActiveFeatures);

    return {
      messages: normalizedMessages,
      score: baseScore + bonusScore,
      features: [...allActiveFeatures],
      triggeredRules: triggered,
      transformations: [...new Set(allTransformations)], // deduplicar
      hits,
    };
  }
}

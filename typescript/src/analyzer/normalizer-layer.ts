// ─────────────────────────────────────────────────────────────────────────────
// CAPA 0: NormalizerLayer
// Responsabilidad: limpiar texto informal, expandir emojis/abreviaciones,
// aplicar reglas fonéticas, y detectar features propias N0.
// ─────────────────────────────────────────────────────────────────────────────

import normalizerDataset from "../constants/sentinel_dataset_normalizer_v2.json" with { type: "json" };
import { removeAccents, collapseRepeated, sanitizeUnicode, collapseIntraWordSpacing, deLeet } from "./text-utils.js";
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

    // Reglas fonéticas ordenadas.
    // El dataset escribe las backreferences estilo PCRE/Python ("\1"), pero
    // JavaScript String.replace usa "$1"; sin esta conversión el reemplazo
    // inserta "\1" literal y corrompe la palabra (ej. "facebook" → "faceb\1qu",
    // rompiendo el término insignia del pitch). Bug detectado por el red-team.
    const pRules = data.normalization_rules?.phonetic_rules?.rules ?? [];
    this.phoneticRules = pRules.map((r: any) => ({
      pattern: new RegExp(r.find, "gi"),
      replacement: String(r.replace).replace(/\\(\d)/g, "$$$1"),
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

  /**
   * Normaliza un término del dataset con el MISMO pipeline que el texto de
   * entrada, para que ambos lados coincidan. Sin esto, un término como
   * "facebook" (que las reglas fonéticas convierten a "faceboqu") nunca
   * matchearía el texto entrante, que sufre la misma transformación.
   */
  normalizeText(raw: string): string {
    return this.normalize(raw).text;
  }

  /** Normaliza un string aplicando todas las transformaciones. */
  normalize(raw: string): { text: string; transformations: string[] } {
    const transformations: string[] = [];

    // 0. Blindaje anti-evasión ANTES de todo: fullwidth/homóglifos/invisibles.
    //    Sin esto, "ｆａｃｅｂｏｏｋ", texto cirílico o zero-width spaces evaden el
    //    filtro por completo (medido en el red-team: 0-5% de supervivencia).
    const sanitized = sanitizeUnicode(raw);
    if (sanitized !== raw) transformations.push("unicode-sanitize");

    let text = sanitized.toLowerCase().trim();

    // 0b. Colapsar espaciado intra-palabra ("f a c e b o o k" → "facebook").
    const despaced = collapseIntraWordSpacing(text);
    if (despaced !== text) {
      transformations.push("collapse-spacing");
      text = despaced;
    }

    // 0c. De-leet condicional en tokens mixtos letra+dígito ("h4lc0n"→"halcon").
    const deleeted = deLeet(text);
    if (deleeted !== text) {
      transformations.push("de-leet");
      text = deleeted;
    }

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
      normalizedMessages.push({ text, timestamp: msg.timestamp, sender: msg.sender });
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

    // Señal de evasión deliberada: homóglifos, fullwidth, invisibles, de-leet o
    // espaciado intra-palabra no ocurren por accidente en un chat normal. Su
    // presencia es intención de ocultar → suma score y marca una regla. Ofuscar
    // el mensaje es, en sí mismo, comportamiento sospechoso (principio del
    // red-team: la evasión detectada nunca debe DEJAR pasar; debe ELEVAR).
    const EVASION_MARKERS = new Set(["unicode-sanitize", "de-leet", "collapse-spacing"]);
    const evasionTransforms = [...new Set(allTransformations)].filter((t) => EVASION_MARKERS.has(t));
    let evasionScore = 0;
    if (evasionTransforms.length > 0) {
      // +2 por la primera técnica de evasión, +2 por cada técnica adicional
      // (apilar técnicas es más deliberado). Tope razonable para no dominar.
      evasionScore = Math.min(6, 2 * evasionTransforms.length);
      triggered.push("N0-EVASION");
      hits.push({ id: "N0-EVASION", score: evasionScore, timestamp: Date.now() });
    }

    return {
      messages: normalizedMessages,
      score: baseScore + bonusScore + evasionScore,
      features: [...allActiveFeatures],
      triggeredRules: triggered,
      transformations: [...new Set(allTransformations)], // deduplicar
      hits,
    };
  }
}

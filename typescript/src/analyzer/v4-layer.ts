// ─────────────────────────────────────────────────────────────────────────────
// CAPA 2: V4Layer
// Responsabilidad: features abstractas + señales explícitas + reglas de combinación
// ─────────────────────────────────────────────────────────────────────────────

import v4Dataset from "../constants/sentinel_dataset_v4.json" with { type: "json" };
import type { Message, V4Output, Hit } from "../types/SentinelEngine.js";
import { removeAccents, buildRegex } from "./text-utils.js";

export class V4Layer {
  private lexicons: Map<string, RegExp[]>;
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
    patterns: RegExp[];
    weight: number;
    category: string;
  }>;
  private intentSignals: Array<{
    id: string;
    name: string;
    patterns: RegExp[];
  }>;

  private normalizeKey: (raw: string) => string;

  /**
   * @param normalizeFn opcional: mismo normalizador que el texto de entrada, para
   *   que los lexicones/señales (que son literales vía buildRegex) coincidan con
   *   el texto ya normalizado por las reglas fonéticas. Sin esto se repite el bug
   *   de "facebook"→"faceboqu" que ya se corrigió en V3. Las señales de intención
   *   NO se normalizan porque son regex crudos.
   */
  constructor(normalizeFn?: (raw: string) => string) {
    const data = v4Dataset as any;
    this.normalizeKey = normalizeFn ?? ((raw: string) => removeAccents(raw.toLowerCase().trim()));

    // Compilar lexicones a expresiones regulares normalizadas
    this.lexicons = new Map();
    if (data.lexicons) {
      for (const [key, terms] of Object.entries(data.lexicons)) {
        const regexes = (terms as string[]).map((term) =>
          buildRegex(this.normalizeKey(term))
        );
        this.lexicons.set(key, regexes);
      }
    }

    this.features = (data.features ?? []).map((f: any) => ({
      id: f.id,
      name: f.name,
      weight: f.weight ?? 1,
      lexiconKeys: f.derived_from ?? [],
      negated: f.logic === "NEGATED — se activa cuando NO hay match",
      category: f.category,
    }));

    this.combinationRules = data.combination_rules ?? [];

    // Compilar señales explícitas (literales vía buildRegex, se normalizan igual)
    this.explicitSignals = (data.explicit_signals ?? []).map((signal: any) => ({
      id: signal.id,
      label: signal.label,
      patterns: (signal.patterns ?? []).map((pat: string) =>
        buildRegex(this.normalizeKey(pat))
      ),
      weight: signal.weight,
      category: signal.category,
    }));

    // Compilar señales de intención
    this.intentSignals = (data.intent_signals ?? []).map((intent: any) => ({
      id: intent.id,
      name: intent.name,
      patterns: (intent.patterns ?? []).map((pat: string) =>
        new RegExp(pat, "ui")
      ),
    }));
  }

  /** Escanea mensajes buscando features V4, señales explícitas y reglas de combinación. */
  scan(messages: Message[]): V4Output {
    const allActiveFeatures = new Set<string>();
    const triggeredExplicit: string[] = [];
    const activeIntents = new Set<string>();
    const hits: Hit[] = [];
    let score = 0;

    // Timestamp de referencia para hits AGREGADOS (features/CR-013), que no
    // pertenecen a un mensaje único: se usa el del último mensaje, no Date.now()
    // (que contaminaría las capas temporal y de velocidad con la hora actual).
    const timestamps = messages.map((m) => m.timestamp).filter((t): t is number => t != null);
    const aggregateTs = timestamps.length ? Math.max(...timestamps) : Date.now();

    for (const msg of messages) {
      // Normalizar texto del mensaje quitando acentos
      const normalized = removeAccents(msg.text.toLowerCase());

      // Señales explícitas — mayor precisión, mayor peso
      for (const signal of this.explicitSignals) {
        const matched = signal.patterns.some((regex) => regex.test(normalized));
        if (matched && !triggeredExplicit.includes(signal.id)) {
          triggeredExplicit.push(signal.id);
          score += signal.weight;
          hits.push({
            id: signal.id,
            score: signal.weight,
            category: signal.category,
            timestamp: msg.timestamp ?? Date.now(),
          });
        }
      }

      // Señales de intención
      for (const intent of this.intentSignals) {
        if (intent.patterns.some((regex) => regex.test(normalized))) {
          activeIntents.add(intent.id);
        }
      }

      // Features abstractas
      const features = this.detectFeatures(normalized);
      for (const f of features) allActiveFeatures.add(f);
    }

    // Peso base de features
    for (const featureName of allActiveFeatures) {
      const def = this.features.find((f) => f.name === featureName);
      if (def) {
        score += def.weight;
        hits.push({ id: def.id, score: def.weight, timestamp: aggregateTs });
      }
    }

    // Bonus de combinaciones
    const triggeredRules: string[] = [];
    for (const rule of this.combinationRules) {
      if (rule.id === "CR-013") continue; // Se evalúa por separado basado en intenciones
      const allPresent = rule.features_required.every((f) => allActiveFeatures.has(f));
      if (allPresent) {
        triggeredRules.push(rule.id);
        score += rule.bonus_score;
      }
    }

    // Regla especial de grooming por intenciones acumuladas
    if (activeIntents.size >= 3) {
      triggeredRules.push("CR-013");
      score += 15;
      hits.push({
        id: "CR-013",
        score: 15,
        category: "manipulacion_social",
        timestamp: aggregateTs
      });
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

    // Primero evaluamos las características afirmativas
    for (const feature of this.features) {
      if (!feature.negated) {
        const isAnd = feature.name === "logistics_transfer";
        const hasMatch = isAnd
          ? feature.lexiconKeys.every((key) =>
              (this.lexicons.get(key) ?? []).some((regex) => regex.test(text))
            )
          : feature.lexiconKeys.some((key) =>
              (this.lexicons.get(key) ?? []).some((regex) => regex.test(text))
            );
        if (hasMatch) active.add(feature.name);
      }
    }

    // Luego evaluamos las características de negación (como low_specificity)
    for (const feature of this.features) {
      if (feature.negated) {
        // Corrección: low_specificity solo se activa si hay ambiguous_opportunity o call_to_action
        if (feature.name === "low_specificity") {
          const hasBaseFeature = active.has("ambiguous_opportunity") || active.has("call_to_action");
          if (!hasBaseFeature) continue;
        }

        const hasMatch = feature.lexiconKeys.some((key) =>
          (this.lexicons.get(key) ?? []).some((regex) => regex.test(text))
        );
        if (!hasMatch) active.add(feature.name);
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


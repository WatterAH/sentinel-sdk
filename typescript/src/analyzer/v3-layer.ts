// ─────────────────────────────────────────────────────────────────────────────
// CAPA 1: V3Layer
// Responsabilidad: términos exactos documentados + reglas MCR por region pack
// ─────────────────────────────────────────────────────────────────────────────

import { MX_REGION_PACK } from "../packs/mx.js";
import {
  canonicalRegionId,
  type HotTermInput,
  outputRegionId,
  type RegionCategoryRequirement,
  type RegionMcrRule,
  type V3RegionPack,
  validateRegionPacks,
} from "../packs/v3-region-pack.js";
import type { Hit, Message, V3Output } from "../types/SentinelEngine.js";
import { removeAccents } from "./text-utils.js";

interface IndexedEntry {
  canonicalId: string;
  outputId: string;
  weight: number;
  category: string;
  regex: RegExp;
  ambiguous: boolean;
}

interface IndexedRule extends RegionMcrRule {
  packId: string;
  outputId: string;
}

interface PackIndex {
  pack: V3RegionPack;
  entries: Map<string, IndexedEntry>;
  rules: IndexedRule[];
}

export class V3Layer {
  private packIndexes: PackIndex[];
  readonly sessionThreshold: number;
  private normalizeKey: (raw: string) => string;

  /**
   * @param normalizeFn normalizador compartido índice/texto. La firma original
   *   sigue vigente; `packs` es opcional y por default carga solo México.
   */
  constructor(
    normalizeFn?: (raw: string) => string,
    packs: readonly V3RegionPack[] = [MX_REGION_PACK],
  ) {
    validateRegionPacks(packs);
    this.normalizeKey = normalizeFn ?? ((raw: string) => removeAccents(raw.toLowerCase().trim()));
    this.sessionThreshold = packs[0].metadata.sessionThreshold;
    this.packIndexes = packs.map((pack) => this.buildPackIndex(pack));
  }

  /** Versiones editoriales de los packs que realmente integran este índice. */
  getRegionPackVersions(): Record<string, string> {
    return Object.fromEntries(
      this.packIndexes.map(({ pack }) => [pack.id, pack.version]),
    );
  }

  private buildPackIndex(pack: V3RegionPack): PackIndex {
    const entries = new Map<string, IndexedEntry>();
    for (const term of pack.terms) {
      for (const variant of [term.term, ...(term.variants ?? [])]) {
        const key = this.normalizeKey(variant);
        if (!key) continue;
        entries.set(key, {
          canonicalId: canonicalRegionId(pack.id, term.id),
          outputId: outputRegionId(pack, term.id),
          weight: term.weight,
          category: term.category,
          regex: this.buildRegex(key),
          ambiguous: term.requires_corroboration === true,
        });
      }
    }
    return {
      pack,
      entries,
      rules: pack.rules.map((rule) => ({
        ...rule,
        packId: pack.id,
        outputId: outputRegionId(pack, rule.id),
      })),
    };
  }

  private buildRegex(term: string): RegExp {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flexible = escaped.replace(/\s+/g, "\\s+");
    return new RegExp(`(?<![\\p{L}\\p{N}])${flexible}(?![\\p{L}\\p{N}])`, "ui");
  }

  /**
   * Inyecta hot terms sin reemplazar entradas estáticas. `packId` es opcional;
   * la API histórica continúa inyectando en MX.
   */
  injectHotTerms(terms: HotTermInput[]): void {
    for (const term of terms) {
      const packId = term.packId ?? "MX";
      const target = this.packIndexes.find((candidate) => candidate.pack.id === packId);
      if (!target) throw new Error(`Cannot inject hot term into unloaded pack: ${packId}`);

      for (const variant of [term.term, ...term.variants]) {
        const key = this.normalizeKey(variant);
        if (!key || target.entries.has(key)) continue;
        target.entries.set(key, {
          canonicalId: canonicalRegionId(target.pack.id, term.id),
          outputId: outputRegionId(target.pack, term.id),
          weight: term.weight,
          category: term.category,
          regex: this.buildRegex(key),
          ambiguous: term.requires_corroboration === true,
        });
      }
    }
  }

  /** Escanea mensajes buscando términos V3 en todos los packs activos. */
  scan(messages: Message[]): V3Output {
    interface Match {
      canonicalId: string;
      outputId: string;
      packId: string;
      weight: number;
      category: string;
      ambiguous: boolean;
      timestamp: number;
    }

    const matchesById = new Map<string, Match>();
    const claimedSurfaceCategories = new Set<string>();

    for (const msg of messages) {
      for (const packIndex of this.packIndexes) {
        for (const [surface, entry] of packIndex.entries) {
          if (matchesById.has(entry.canonicalId)) continue;
          if (entry.regex.test(msg.text)) {
            // Construir la clave de colisión solo ante un match. Hacerlo para
            // cada miss recreaba miles de strings y elevaba p95 ~0.4 ms.
            const surfaceCategory = `${surface}\u0000${entry.category}`;
            if (claimedSurfaceCategories.has(surfaceCategory)) continue;
            matchesById.set(entry.canonicalId, {
              canonicalId: entry.canonicalId,
              outputId: entry.outputId,
              packId: packIndex.pack.id,
              weight: entry.weight,
              category: entry.category,
              ambiguous: entry.ambiguous,
              timestamp: msg.timestamp ?? Date.now(),
            });
            // La precedencia del array de packs evita doble score por la misma
            // evidencia y categoría, sin sobrescribir índices entre regiones.
            claimedSurfaceCategories.add(surfaceCategory);
          }
        }
      }
    }

    const hasSolidSignal = [...matchesById.values()].some(
      (match) => !match.ambiguous && match.category !== "señal_debil",
    );

    let score = 0;
    const termsFound = new Set<string>();
    const categoriesFound = new Set<string>();
    const scopedCategories = new Set<string>();
    const hits: Hit[] = [];

    for (const match of matchesById.values()) {
      if (match.ambiguous && !hasSolidSignal) continue;

      score += match.weight;
      termsFound.add(match.outputId);
      categoriesFound.add(match.category);
      scopedCategories.add(this.scopedCategory(match.packId, match.category));
      hits.push({
        id: match.outputId,
        score: match.weight,
        category: match.category,
        timestamp: match.timestamp,
      });
    }

    const triggeredRules = this.checkMCR(categoriesFound, scopedCategories, messages.length);
    return {
      score,
      terms: [...termsFound],
      categories: [...categoriesFound],
      triggeredRules,
      hits,
    };
  }

  private scopedCategory(packId: string, category: string): string {
    return `${packId}\u0000${category}`;
  }

  private requirementPresent(
    requirement: RegionCategoryRequirement,
    categories: Set<string>,
    scopedCategories: Set<string>,
  ): boolean {
    return typeof requirement === "string"
      ? categories.has(requirement)
      : scopedCategories.has(this.scopedCategory(requirement.packId, requirement.category));
  }

  private checkMCR(
    categories: Set<string>,
    scopedCategories: Set<string>,
    messageCount: number,
  ): string[] {
    const triggered: string[] = [];
    for (const packIndex of this.packIndexes) {
      for (const rule of packIndex.rules) {
        if (rule.categories_required) {
          const allPresent = rule.categories_required.every((requirement) =>
            this.requirementPresent(requirement, categories, scopedCategories),
          );
          if (allPresent && messageCount >= rule.min_messages) triggered.push(rule.outputId);
        }
        if (
          rule.min_categories !== undefined &&
          categories.size >= rule.min_categories &&
          messageCount >= rule.min_messages
        ) {
          triggered.push(rule.outputId);
        }
      }
    }
    return triggered;
  }
}

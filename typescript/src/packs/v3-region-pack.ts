export interface RegionTerm {
  id: string;
  term: string;
  variants?: string[];
  category: string;
  weight: number;
  requires_corroboration?: boolean;
}

export type RegionCategoryRequirement =
  | string
  | { packId: string; category: string };

export interface RegionMcrRule {
  id: string;
  categories_required?: RegionCategoryRequirement[];
  min_categories?: number;
  min_messages: number;
}

export interface V3RegionPack {
  schemaVersion: 1;
  id: string;
  version: string;
  displayName: string;
  /** Compatibilidad temporal exclusiva del pack MX original. */
  legacyOutputIds?: boolean;
  metadata: {
    sessionThreshold: number;
    sources: string[];
  };
  terms: RegionTerm[];
  rules: RegionMcrRule[];
}

export interface HotTermInput {
  id: string;
  term: string;
  category: string;
  weight: number;
  variants: string[];
  requires_corroboration?: boolean;
  /** Omitido conserva el comportamiento histórico: inyectar en MX. */
  packId?: string;
}

const PACK_ID = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export function canonicalRegionId(packId: string, localId: string): string {
  return `${packId}-${localId}`;
}

export function outputRegionId(pack: V3RegionPack, localId: string): string {
  return pack.legacyOutputIds ? localId : canonicalRegionId(pack.id, localId);
}

export function validateRegionPacks(packs: readonly V3RegionPack[]): void {
  if (packs.length === 0) throw new Error("V3Layer requires at least one region pack");

  const ids = new Set<string>();
  const threshold = packs[0].metadata.sessionThreshold;
  let legacyPacks = 0;
  for (const pack of packs) {
    if (pack.schemaVersion !== 1) {
      throw new Error(`Unsupported region pack schema v${pack.schemaVersion} for ${pack.id}`);
    }
    if (!PACK_ID.test(pack.id)) throw new Error(`Invalid region pack id: ${pack.id}`);
    if (ids.has(pack.id)) throw new Error(`Duplicate region pack id: ${pack.id}`);
    ids.add(pack.id);
    if (pack.metadata.sessionThreshold !== threshold) {
      throw new Error("All active region packs must share the same session threshold");
    }
    if (pack.legacyOutputIds) {
      if (pack.id !== "MX") {
        throw new Error("Only the original MX pack may expose legacy unnamespaced IDs");
      }
      legacyPacks++;
    }

    const termIds = new Set<string>();
    for (const term of pack.terms) {
      if (termIds.has(term.id)) throw new Error(`Duplicate term id in ${pack.id}: ${term.id}`);
      termIds.add(term.id);
    }
    const ruleIds = new Set<string>();
    for (const rule of pack.rules) {
      if (ruleIds.has(rule.id)) throw new Error(`Duplicate MCR id in ${pack.id}: ${rule.id}`);
      ruleIds.add(rule.id);
    }
  }
  if (legacyPacks > 1) {
    throw new Error("Only one compatibility pack may expose legacy unnamespaced IDs");
  }

  for (const pack of packs) {
    for (const rule of pack.rules) {
      for (const requirement of rule.categories_required ?? []) {
        if (typeof requirement !== "string" && !ids.has(requirement.packId)) {
          throw new Error(
            `MCR ${pack.id}-${rule.id} references unloaded pack ${requirement.packId}`,
          );
        }
      }
    }
  }
}

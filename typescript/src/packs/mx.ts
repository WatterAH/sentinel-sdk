import v3Dataset from "../constants/sentinel_dataset_v3.json" with { type: "json" };
import type { RegionMcrRule, RegionTerm, V3RegionPack } from "./v3-region-pack.js";

interface CurrentV3Dataset {
  metadata: {
    version: string;
    tier1_session_threshold: number;
    sources: string[];
    multi_category_escalation_rules: { rules: RegionMcrRule[] };
  };
  terms: RegionTerm[];
}

const current = v3Dataset as unknown as CurrentV3Dataset;

/** Primer y único pack real: adapta el dataset mexicano actual sin duplicarlo. */
export const MX_REGION_PACK: V3RegionPack = {
  schemaVersion: 1,
  id: "MX",
  version: current.metadata.version,
  displayName: "México — dataset nacional actual",
  // Mantiene REC-001/MCR-001 en resultados públicos durante la migración.
  legacyOutputIds: true,
  metadata: {
    sessionThreshold: current.metadata.tier1_session_threshold,
    sources: current.metadata.sources,
  },
  terms: current.terms,
  rules: current.metadata.multi_category_escalation_rules.rules,
};

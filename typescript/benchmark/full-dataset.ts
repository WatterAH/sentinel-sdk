import fullDataset from "../src/constants/sentinel_dataset_v3.json" with { type: "json" };
import seedDataset from "../src/constants/sentinel_dataset_v3_seed.json" with { type: "json" };
import type { Engine } from "../src/analyzer/engine.js";
import type { HotTermInput, RegionTerm } from "../src/packs/v3-region-pack.js";

const seedIds = new Set(seedDataset.terms.map((term) => term.id));

/** Complemento privado que un cliente obtiene de GET /hot-terms?pack=full. */
export const FULL_DATASET_COMPLEMENT: HotTermInput[] = (
  fullDataset.terms as RegionTerm[]
)
  .filter((term) => !seedIds.has(term.id))
  .map((term) => ({
    id: term.id,
    term: term.term,
    variants: term.variants ?? [],
    category: term.category,
    weight: term.weight,
    requires_corroboration: term.requires_corroboration,
    packId: "MX",
  }));

export function injectFullDataset(engine: Engine): void {
  engine.injectHotTerms(FULL_DATASET_COMPLEMENT);
}

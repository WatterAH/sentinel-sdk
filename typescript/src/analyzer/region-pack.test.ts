import { describe, expect, it } from "vitest";
import { MX_REGION_PACK } from "../packs/mx.js";
import { canonicalRegionId } from "../packs/v3-region-pack.js";
import { NormalizerLayer } from "./normalizer-layer.js";
import { V3Layer } from "./v3-layer.js";

function mxLayer(): { normalizer: NormalizerLayer; v3: V3Layer } {
  const normalizer = new NormalizerLayer();
  return {
    normalizer,
    v3: new V3Layer((raw) => normalizer.normalizeText(raw), [MX_REGION_PACK]),
  };
}

describe("region pack MX", () => {
  it("mantiene los IDs públicos históricos mientras usa namespace canónico", () => {
    expect(canonicalRegionId(MX_REGION_PACK.id, "REC-001")).toBe("MX-REC-001");

    const { normalizer, v3 } = mxLayer();
    const messages = normalizer.process([
      { text: "hay jale", timestamp: 1 },
      { text: "manda tu ubicación", timestamp: 2 },
    ]).messages;
    const result = v3.scan(messages);

    expect(result.terms).toContain("REC-001");
    expect(result.terms).not.toContain("MX-REC-001");
    expect(result.triggeredRules).toContain("MCR-001");
  });

  it("conserva injectHotTerms sin packId como overlay de México", () => {
    const { normalizer, v3 } = mxLayer();
    v3.injectHotTerms([
      {
        id: "HOT-001",
        term: "clave regional confirmada",
        category: "reclutamiento",
        weight: 4,
        variants: [],
      },
    ]);
    const messages = normalizer.process([
      { text: "clave regional confirmada", timestamp: 1 },
    ]).messages;
    expect(v3.scan(messages).terms).toContain("HOT-001");
  });

  it("rechaza inyección hacia un pack que no fue cargado", () => {
    const { v3 } = mxLayer();
    expect(() =>
      v3.injectHotTerms([
        {
          id: "HOT-002",
          term: "sin región real",
          category: "reclutamiento",
          weight: 4,
          variants: [],
          packId: "MX-NORTE",
        },
      ]),
    ).toThrow(/unloaded pack/);
  });

  it("rechaza cargar dos veces el mismo pack real", () => {
    const normalizer = new NormalizerLayer();
    expect(
      () => new V3Layer((raw) => normalizer.normalizeText(raw), [MX_REGION_PACK, MX_REGION_PACK]),
    ).toThrow(/Duplicate region pack/);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import fullDataset from "./sentinel_dataset_v3.json" with { type: "json" };
import seedDataset from "./sentinel_dataset_v3_seed.json" with { type: "json" };
import packageJson from "../../package.json" with { type: "json" };
import { Sentinel } from "../core/sentinel.js";

afterEach(() => vi.unstubAllGlobals());

describe("seed split del paquete público", () => {
  it("contiene exactamente 30 IDs únicos que pertenecen al dataset histórico", () => {
    const seedIds = seedDataset.terms.map((term) => term.id);
    const fullIds = new Set(fullDataset.terms.map((term) => term.id));
    expect(seedIds).toHaveLength(30);
    expect(new Set(seedIds).size).toBe(30);
    expect(seedIds.every((id) => fullIds.has(id))).toBe(true);
    expect(packageJson.private).toBe(true);
  });

  it("initialize inyecta términos del complemento autenticado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            dataset_version: 7,
            data: [
              {
                id: "REC-023",
                term: "zancudo",
                variants: [],
                category: "slang_operativo",
                weight: 9,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const sentinel = new Sentinel({
      apiKey: "client-key",
      baseUrl: "https://api.example.test/api/v1",
    });
    const before = sentinel.localAnalyze([{ text: "zancudo" }]);
    await sentinel.initialize();
    const after = sentinel.localAnalyze([{ text: "zancudo" }]);

    expect(before.data?.layers.v3.terms).not.toContain("REC-023");
    expect(after.data?.layers.v3.terms).toContain("REC-023");
  });
});

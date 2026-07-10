// Genera el dataset de entrenamiento (benchmark/dataset.jsonl) a partir del corpus.
// Ejecutar con: npm run export:dataset
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import corpusJson from "./corpus.json" with { type: "json" };
import type { Corpus } from "./runner.js";
import { buildDataset, toJSONL } from "./export-dataset.js";
import { FEATURE_NAMES } from "../src/analyzer/featurizer.js";

const __dir = dirname(fileURLToPath(import.meta.url));

describe("export del dataset de entrenamiento", () => {
  it("cada fila tiene el mismo número de features que el esquema", () => {
    const ds = buildDataset(corpusJson as unknown as Corpus);
    for (const row of ds.rows) {
      expect(row.values.length, `fila ${row.id} con largo distinto`).toBe(FEATURE_NAMES.length);
      // Todas las features normalizadas deben estar en [0, 1].
      for (const v of row.values) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    // Debe haber ambas clases representadas.
    const labels = new Set(ds.rows.map((r) => r.label));
    expect(labels.has(0)).toBe(true);
    expect(labels.has(1)).toBe(true);
  }, 30000);

  it("escribe dataset.jsonl", () => {
    const ds = buildDataset(corpusJson as unknown as Corpus);
    writeFileSync(join(__dir, "dataset.jsonl"), toJSONL(ds));
    expect(ds.rows.length).toBeGreaterThan(100);
  }, 30000);
});

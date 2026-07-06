// Punto de entrada del benchmark. Se ejecuta con: npm run bench
// Usa vitest como runner porque ya resuelve TS + imports JSON sin config extra.
// Escribe benchmark/report.json y imprime el resumen en consola.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import corpusJson from "./corpus.json" with { type: "json" };
import { type Corpus, formatReport, runBenchmark } from "./runner.js";

const __dir = dirname(fileURLToPath(import.meta.url));

describe("benchmark del motor local", () => {
  it("corre el corpus completo y genera report.json", () => {
    const corpus = corpusJson as unknown as Corpus;
    expect(corpus.cases.length).toBeGreaterThan(0);

    const report = runBenchmark(corpus);

    writeFileSync(join(__dir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(formatReport(report));

    // Guardrails mínimos: si esto falla, el motor se degradó gravemente.
    // Los umbrales se endurecen conforme mejore el motor (ver ROADMAP).
    expect(report.detection.recall).toBeGreaterThanOrEqual(0.5);
    expect(report.latency.p95Ms).toBeLessThan(50);
  }, 15000);
});

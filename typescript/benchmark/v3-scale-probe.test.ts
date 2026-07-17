// Sonda manual de escalabilidad del matching V3 lineal.
// No corre dentro de `npm test`; usar `npm run bench:v3-scale`.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Engine } from "../src/analyzer/engine.js";
import type { Message } from "../src/types/SentinelEngine.js";
import corpusJson from "./corpus.json" with { type: "json" };
import type { Corpus, CorpusCase } from "./runner.js";

const BASE = 1_750_000_000_000;
const WARMUP_RUNS = 2;
const TIMED_RUNS = 5;
const __dir = dirname(fileURLToPath(import.meta.url));

function alphaId(value: number): string {
  let current = value;
  let output = "";
  do {
    output = String.fromCharCode(97 + (current % 26)) + output;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return output;
}

function syntheticTerms(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `SYNTHETIC-${index}`,
    // Solo letras y prefijo imposible en el corpus; evita que deLeet altere la
    // clave y garantiza que la sonda mida misses a través de todo el índice.
    term: `zzsyntheticpack${alphaId(index)}token`,
    category: "señal_debil",
    weight: 1,
    variants: [],
  }));
}

function toMessages(c: CorpusCase): Message[] {
  return c.messages.map((message) => ({
    text: message.text,
    timestamp: BASE + message.offset_s * 1_000,
    sender: message.sender,
    source: message.source,
  }));
}

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

const runScaleProbe = process.env.SENTINEL_V3_SCALE === "1" ? describe : describe.skip;

runScaleProbe("sonda manual de escala V3", () => {
  it("mide el corpus completo con términos sintéticos que no hacen match", () => {
    const corpus = corpusJson as unknown as Corpus;
    const requestedSizes = (process.env.V3_SCALE_SIZES ?? "0,500,1000,1500,2000,2500,3000")
      .split(",")
      .map(Number)
      .filter((value) => Number.isInteger(value) && value >= 0);
    const sizes = [...new Set([0, ...requestedSizes])].sort((a, b) => a - b);
    const allSynthetic = syntheticTerms(Math.max(...sizes));
    const baseline = new Map<string, { risk: string; score: number; terms: string }>();
    const rows: Array<{
      syntheticTerms: number;
      samples: number;
      p50Ms: number;
      p95Ms: number;
      meanMs: number;
      maxMs: number;
      indexBuildMs: number;
    }> = [];

    for (const size of sizes) {
      const latencies: number[] = [];
      // Sentinel construye y conserva un Engine; recrearlo por conversación
      // mediría GC/JIT de miles de RegExp, no el costo real por analyze().
      const engine = new Engine();
      const buildStart = performance.now();
      if (size > 0) engine.injectHotTerms(allSynthetic.slice(0, size));
      const indexBuildMs = performance.now() - buildStart;

      for (const c of corpus.cases) {
        const messages = toMessages(c);
        for (let run = 0; run < WARMUP_RUNS; run++) engine.analyze(messages);
        let result = engine.analyze(messages);
        for (let run = 0; run < TIMED_RUNS; run++) {
          const start = performance.now();
          result = engine.analyze(messages);
          latencies.push(performance.now() - start);
        }

        const signature = {
          risk: result.risk,
          score: result.score,
          terms: result.layers.v3.terms.join(","),
        };
        if (size === 0) baseline.set(c.id, signature);
        else expect(signature, `${c.id} cambió con ${size} términos sintéticos`).toEqual(baseline.get(c.id));
      }

      latencies.sort((a, b) => a - b);
      const mean = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
      rows.push({
        syntheticTerms: size,
        samples: latencies.length,
        p50Ms: Number(percentile(latencies, 50).toFixed(3)),
        p95Ms: Number(percentile(latencies, 95).toFixed(3)),
        meanMs: Number(mean.toFixed(3)),
        maxMs: Number((latencies.at(-1) ?? 0).toFixed(3)),
        indexBuildMs: Number(indexBuildMs.toFixed(3)),
      });
    }

    console.table(rows);
    writeFileSync(
      join(__dir, "v3-scale-report.json"),
      `${JSON.stringify({ timestamp: new Date().toISOString(), targetP95Ms: 8, rows }, null, 2)}\n`,
    );
  }, 180_000);
});

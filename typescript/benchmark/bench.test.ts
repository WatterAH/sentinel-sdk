// Punto de entrada del benchmark. Se ejecuta con: npm run bench
// Usa vitest como runner porque ya resuelve TS + imports JSON sin config extra.
// Escribe benchmark/report.json y imprime el resumen en consola.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import corpusJson from "./corpus.json" with { type: "json" };
import guardrailsJson from "./guardrails.json" with { type: "json" };
import { type Corpus, formatReport, runBenchmark } from "./runner.js";

const __dir = dirname(fileURLToPath(import.meta.url));

describe("benchmark del motor local", () => {
  it("corre el corpus completo y genera report.json", () => {
    const corpus = corpusJson as unknown as Corpus;
    expect(corpus.cases.length).toBeGreaterThan(0);

    const report = runBenchmark(corpus);
    const seedReport = runBenchmark(corpus, { datasetMode: "seed" });
    const metadata = corpusJson.metadata as {
      review_gate: { baseline_case_count: number };
      expansion_2026_07_17: { human_reviewed_ids: string[] };
    };
    const baselineCount = metadata.review_gate.baseline_case_count;
    const confirmedExpansionIds = new Set(
      metadata.expansion_2026_07_17.human_reviewed_ids,
    );
    const reviewedCorpus: Corpus = {
      metadata: corpus.metadata,
      cases: corpus.cases.filter(
        (entry, index) => index < baselineCount || confirmedExpansionIds.has(entry.id),
      ),
    };
    const reviewedReport = runBenchmark(reviewedCorpus);

    writeFileSync(join(__dir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(
      join(__dir, "seed-report.json"),
      `${JSON.stringify(seedReport, null, 2)}\n`,
    );
    writeFileSync(
      join(__dir, "reviewed-report.json"),
      `${JSON.stringify(reviewedReport, null, 2)}\n`,
    );
    console.log(formatReport(report));
    console.log("\n── Modo seed público ──");
    console.log(
      `Recall ${(seedReport.detection.recall * 100).toFixed(1)}% · precision ${(seedReport.detection.precision * 100).toFixed(1)}% · bloqueos falsos ${seedReport.action.falseBlocks}`,
    );
    console.log("\n── Guardrail sobre casos revisados ──");
    console.log(
      `Casos revisados: ${reviewedReport.totalCases} · recall ${(reviewedReport.detection.recall * 100).toFixed(1)}% · bloqueos falsos ${reviewedReport.action.falseBlocks}`,
    );
    const recallGap = Math.max(
      0,
      guardrailsJson.productTargets.reviewedRecall - reviewedReport.detection.recall,
    );
    console.log(
      `Meta de producto: ${(guardrailsJson.productTargets.reviewedRecall * 100).toFixed(1)}% · brecha actual ${(recallGap * 100).toFixed(1)} pp`,
    );

    // Guardrails alineados con el modelo de acción de 2 capas. El gate DURO es
    // falseBlocks === 0: bloquear automáticamente una conversación inocente es el
    // peor error de producto. Un benigno que escala a MEDIUM lo resuelve el LLM
    // (barato), por eso el FPR binario se vigila con holgura, no como gate duro.
    // Seguridad negativa sí se mide sobre TODO, incluso casos sintéticos aún
    // pendientes: ninguno puede provocar un bloqueo automático. El recall duro
    // solo usa etiquetas revisadas; el recall completo se sigue publicando sin
    // ocultarlo en report.json.
    expect(report.action.falseBlocks).toBe(0); // CERO bloqueos falsos, innegociable
    // Cero observados no equivale a tasa poblacional demostrada de cero.
    expect(report.action.intervals95.falseBlockRate.upper).toBeGreaterThan(0);
    expect(seedReport.action.falseBlocks).toBe(0);
    expect(reviewedReport.action.falseBlocks).toBe(0);
    // El 75% sigue siendo una META DE PRODUCTO visible, no una línea base
    // histórica ficticia. CI bloquea regresiones respecto de la medición
    // revisada y exige actualizar guardrails.json conscientemente cuando crece
    // el conjunto revisado. Así no maquillamos la cobertura ni dejamos CI roto.
    expect(reviewedReport.totalCases).toBeGreaterThanOrEqual(
      guardrailsJson.reviewedBaseline.caseCount,
    );
    expect(reviewedReport.detection.recall).toBeGreaterThanOrEqual(
      guardrailsJson.reviewedBaseline.recall -
        guardrailsJson.reviewedBaseline.maxRecallRegression,
    );
    expect(report.action.benignReviewRate).toBeLessThanOrEqual(
      guardrailsJson.productTargets.maxBenignReviewRate,
    );
    expect(report.latency.p95Ms).toBeLessThan(
      guardrailsJson.productTargets.maxP95LatencyMs,
    );
  }, 90000);
});

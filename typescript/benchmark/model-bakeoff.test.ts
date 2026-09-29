import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import corpusJson from "./corpus.json" with { type: "json" };
import reportJson from "./model-bakeoff-report.json" with { type: "json" };
import modelJson from "../src/analyzer/shadow-model-hashed-v1.json" with { type: "json" };
import { Engine } from "../src/analyzer/engine.js";
import {
  createHashedNgramShadowClassifier,
  hashedNgramVector,
  type HashedNgramShadowModel,
} from "../src/analyzer/shadow-classifier.js";
import type { Message } from "../src/types/SentinelEngine.js";
import type { Corpus, CorpusCase } from "./runner.js";
import { injectFullDataset } from "./full-dataset.js";

const BASE = 1_750_000_000_000;
const __dir = dirname(fileURLToPath(import.meta.url));

function toMessages(c: CorpusCase): Message[] {
  return c.messages.map((message) => ({
    text: message.text,
    timestamp: BASE + message.offset_s * 1_000,
    sender: message.sender,
    source: message.source,
  }));
}

describe("bakeoff semántico reproducible", () => {
  it("reproduce exactamente en TypeScript el hashing entrenado en Python", () => {
    const model = modelJson as HashedNgramShadowModel;
    for (const fixture of reportJson.parityFixtures) {
      const vector = hashedNgramVector(fixture.messages, model);
      const actual = vector
        .map((value, index) => ({ index, value }))
        .filter(({ value }) => value !== 0);
      expect(actual).toHaveLength(fixture.nonZero.length);
      for (let index = 0; index < actual.length; index++) {
        expect(actual[index].index).toBe(fixture.nonZero[index].index);
        expect(actual[index].value).toBeCloseTo(fixture.nonZero[index].value, 12);
      }
    }
  });

  it("evalúa caso por caso sin cambiar un solo veredicto del motor", () => {
    vi.spyOn(Date, "now").mockReturnValue(BASE + 60_000);
    const corpus = corpusJson as unknown as Corpus;
    const model = modelJson as HashedNgramShadowModel;
    const classifier = createHashedNgramShadowClassifier(model);
    const oofById = new Map(reportJson.cases.map((row) => [row.id, row]));
    const rows: Array<Record<string, string | number | boolean>> = [];

    for (const c of corpus.cases) {
      const messages = toMessages(c);
      const baselineEngine = new Engine();
      injectFullDataset(baselineEngine);
      const baseline = baselineEngine.analyze(messages);
      let probability = -1;
      const shadowEngine = new Engine();
      injectFullDataset(shadowEngine);
      shadowEngine.setShadowClassifier(classifier, (observation) => {
        probability = observation.shadowProbability;
      });
      const observed = shadowEngine.analyze(messages);

      expect(observed, c.id).toEqual(baseline);
      expect(probability, c.id).toBeGreaterThanOrEqual(0);
      const reviewed = oofById.get(c.id);
      rows.push({
        id: c.id,
        group: c.group,
        expected: c.label,
        lexicalRisk: baseline.risk !== "LOW",
        hashedFullFitRisk: probability >= model.threshold,
        hashedFullFitProbability: Number(probability.toFixed(4)),
        groupedOofRisk: reviewed?.predictions.hashed_ngram_2048.risk ?? "pending_review",
        groupedOofProbability:
          reviewed === undefined
            ? "pending_review"
            : Number(reviewed.predictions.hashed_ngram_2048.probability.toFixed(4)),
      });
    }

    console.table(rows);
    const markdown = [
      "# Comparación caso por caso: n-gramas con hashing",
      "",
      "> `full-fit` es diagnóstico, no una métrica. Solo los casos revisados tienen predicción OOF agrupada.",
      "",
      "| Caso | Grupo | Etiqueta | Léxico | Sombra full-fit | Prob. full-fit | Sombra OOF | Prob. OOF |",
      "|---|---|---|---:|---:|---:|---:|---:|",
      ...rows.map(
        (row) =>
          `| ${row.id} | ${row.group} | ${row.expected} | ${row.lexicalRisk} | ${row.hashedFullFitRisk} | ${row.hashedFullFitProbability} | ${row.groupedOofRisk} | ${row.groupedOofProbability} |`,
      ),
      "",
    ].join("\n");
    writeFileSync(join(__dir, "model-bakeoff-comparison.md"), markdown);
    expect(rows).toHaveLength(corpus.cases.length);
    expect(reportJson.cases).toHaveLength(reportJson.selection.rows);
  }, 30_000);
});

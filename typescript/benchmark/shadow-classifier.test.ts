import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import corpusJson from "./corpus.json" with { type: "json" };
import trainingJson from "./shadow-training-report.json" with { type: "json" };
import modelJson from "../src/analyzer/shadow-model-v1.json" with { type: "json" };
import { Engine } from "../src/analyzer/engine.js";
import {
  createLinearShadowClassifier,
  type LinearShadowModel,
} from "../src/analyzer/shadow-classifier.js";
import type { Message } from "../src/types/SentinelEngine.js";
import type { Corpus, CorpusCase } from "./runner.js";

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

describe("clasificador semántico en modo sombra", () => {
  it("compara todo el corpus sin cambiar ningún veredicto del motor", () => {
    const corpus = corpusJson as unknown as Corpus;
    const model = modelJson as LinearShadowModel;
    const classifier = createLinearShadowClassifier(model);
    const rows: Array<Record<string, string | number | boolean>> = [];
    const groupedOof = new Map(
      trainingJson.cases.map((entry) => [entry.id, entry.groupedOofProbability]),
    );

    for (const c of corpus.cases) {
      const messages = toMessages(c);
      const baseline = new Engine().analyze(messages);
      let probability: number | undefined;
      const shadowEngine = new Engine();
      shadowEngine.setShadowClassifier(classifier, (observation) => {
        probability = observation.shadowProbability;
      });
      const withShadow = shadowEngine.analyze(messages);

      // Gate central: el clasificador no entra al flujo de decisión real.
      expect(withShadow, c.id).toEqual(baseline);
      expect(probability, c.id).toBeTypeOf("number");

      const lexical = baseline.risk !== "LOW";
      const shadow = probability! >= model.threshold;
      const expected = c.label === "RISK";
      const comparison =
        lexical === expected && shadow === expected
          ? "both_correct"
          : lexical !== expected && shadow === expected
            ? "shadow_only"
            : lexical === expected && shadow !== expected
              ? "lexical_only"
              : "both_wrong";
      rows.push({
        id: c.id,
        group: c.group,
        expected: c.label,
        lexical,
        shadow,
        probability: Number(probability!.toFixed(4)),
        groupedOofProbability: Number((groupedOof.get(c.id) ?? 0).toFixed(4)),
        comparison,
      });
    }

    // Tabla caso por caso, no solo un promedio agregado. Es deliberadamente
    // detallada porque los desacuerdos son el producto de este experimento.
    console.table(rows);
    console.table(rows.filter((row) => row.comparison !== "both_correct"));

    const header =
      "| Caso | Grupo | Etiqueta | Léxico | Sombra full-fit | Prob. full-fit | Prob. OOF agrupada | Comparación |";
    const separator = "|---|---|---:|---:|---:|---:|---:|---|";
    const body = rows.map((row) =>
      `| ${row.id} | ${row.group} | ${row.expected} | ${row.lexical} | ${row.shadow} | ${row.probability} | ${row.groupedOofProbability} | ${row.comparison} |`
    );
    const markdown = [
      "# Comparación caso por caso del clasificador sombra",
      "",
      "> La predicción `full-fit` usa un modelo entrenado con todo este mismo corpus y no es una métrica de evaluación. Para estimar generalización se debe usar la probabilidad OOF agrupada y `shadow-training-report.json`.",
      "",
      header,
      separator,
      ...body,
      "",
    ].join("\n");
    writeFileSync(join(__dir, "shadow-comparison.md"), markdown);

    expect(rows).toHaveLength(corpus.cases.length);
    expect(rows.some((row) => row.comparison === "shadow_only")).toBe(true);
  }, 30_000);

  it("rechaza pesos incompatibles con el orden de features", () => {
    const incompatible = {
      ...(modelJson as LinearShadowModel),
      featureNames: [...(modelJson as LinearShadowModel).featureNames].reverse(),
    };
    expect(() => createLinearShadowClassifier(incompatible)).toThrow(/feature order/);
  });
});

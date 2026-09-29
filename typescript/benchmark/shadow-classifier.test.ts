import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import corpusJson from "./corpus.json" with { type: "json" };
import trainingJson from "./shadow-training-report.json" with { type: "json" };
import modelJson from "../src/analyzer/shadow-model-v2.json" with { type: "json" };
import { Engine } from "../src/analyzer/engine.js";
import {
  createLinearShadowClassifier,
  type LinearShadowModel,
} from "../src/analyzer/shadow-classifier.js";
import type { Message } from "../src/types/SentinelEngine.js";
import type { Corpus, CorpusCase } from "./runner.js";
import { injectFullDataset } from "./full-dataset.js";

const BASE = 1_750_000_000_000;
const __dir = dirname(fileURLToPath(import.meta.url));

afterEach(() => vi.restoreAllMocks());

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
    // Algunas capas usan Date.now() como timestamp de fallback para hits
    // agregados. Congelar el reloj evita confundir esa variación observacional
    // con un efecto del clasificador sombra.
    vi.spyOn(Date, "now").mockReturnValue(BASE + 60_000);
    const corpus = corpusJson as unknown as Corpus;
    const model = modelJson as LinearShadowModel;
    const classifier = createLinearShadowClassifier(model);
    const rows: Array<Record<string, string | number | boolean | null>> = [];
    const groupedOof = new Map(
      trainingJson.cases.map((entry) => [entry.id, entry.groupedOofProbability]),
    );
    const reviewedIds = new Set(trainingJson.cases.map((entry) => entry.id));
    const reviewQueue: Array<{
      id: string;
      group: string;
      lexical: boolean;
      shadow: boolean;
      probability: number;
      priority: number;
      reasons: string[];
    }> = [];

    for (const c of corpus.cases) {
      const messages = toMessages(c);
      const baselineEngine = new Engine();
      injectFullDataset(baselineEngine);
      const baseline = baselineEngine.analyze(messages);
      let probability: number | undefined;
      const shadowEngine = new Engine();
      injectFullDataset(shadowEngine);
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
      const oofProbability = groupedOof.get(c.id);
      const oofShadow = oofProbability === undefined ? null : oofProbability >= model.threshold;
      const comparison = oofShadow === null
        ? "pending_review"
        : lexical === expected && oofShadow === expected
          ? "both_correct"
          : lexical !== expected && oofShadow === expected
            ? "shadow_only"
            : lexical === expected && oofShadow !== expected
              ? "lexical_only"
              : "both_wrong";
      rows.push({
        id: c.id,
        group: c.group,
        expected: c.label,
        reviewed: reviewedIds.has(c.id),
        lexical,
        fullFitShadow: shadow,
        fullFitProbability: Number(probability!.toFixed(4)),
        groupedOofShadow: oofShadow,
        groupedOofProbability:
          oofProbability === undefined ? null : Number(oofProbability.toFixed(4)),
        comparison,
      });

      if (!reviewedIds.has(c.id)) {
        const uncertainty = 1 - Math.abs(probability! - 0.5) * 2;
        const disagreement = lexical !== shadow;
        const reasons: string[] = [];
        if (disagreement) reasons.push("desacuerdo léxico/sombra");
        if (uncertainty >= 0.7) reasons.push("modelo incierto");
        if (shadow && !lexical) reasons.push("posible riesgo invisible al léxico");
        const priority =
          (disagreement ? 0.55 : 0) +
          uncertainty * 0.35 +
          (shadow && !lexical ? 0.1 : 0);
        reviewQueue.push({
          id: c.id,
          group: c.group,
          lexical,
          shadow,
          probability: Number(probability!.toFixed(4)),
          priority: Number(priority.toFixed(4)),
          reasons: reasons.length > 0 ? reasons : ["cobertura de muestra"],
        });
      }
    }

    // Tabla caso por caso, no solo un promedio agregado. Es deliberadamente
    // detallada porque los desacuerdos son el producto de este experimento.
    console.table(rows);
    console.table(rows.filter((row) => row.comparison !== "both_correct"));

    const header =
      "| Caso | Grupo | Revisado | Etiqueta | Léxico | Sombra full-fit | Prob. full-fit | Sombra OOF agrupada | Prob. OOF agrupada | Comparación |";
    const separator = "|---|---|---:|---:|---:|---:|---:|---:|---:|---|";
    const body = rows.map((row) =>
      `| ${row.id} | ${row.group} | ${row.reviewed} | ${row.expected} | ${row.lexical} | ${row.fullFitShadow} | ${row.fullFitProbability} | ${row.groupedOofShadow ?? "N/A"} | ${row.groupedOofProbability ?? "N/A"} | ${row.comparison} |`
    );
    const markdown = [
      "# Comparación caso por caso del clasificador sombra",
      "",
      "> La predicción `full-fit` no es una métrica de evaluación. Solo los 185 casos que pasaron el gate de revisión tienen probabilidad OOF agrupada; las otras etiquetas se muestran como `pending_review` y no se usan para evaluar ni entrenar.",
      "",
      header,
      separator,
      ...body,
      "",
    ].join("\n");
    writeFileSync(join(__dir, "shadow-comparison.md"), markdown);

    reviewQueue.sort((left, right) => right.priority - left.priority);
    const queueMarkdown = [
      "# Cola de revisión activa del clasificador sombra",
      "",
      "> Prioriza casos todavía no revisados usando desacuerdo entre motores e incertidumbre. La etiqueta existente no participa en el puntaje.",
      "",
      "| Prioridad | Caso | Grupo | Léxico | Sombra | Probabilidad | Motivos |",
      "|---:|---|---|---:|---:|---:|---|",
      ...reviewQueue.slice(0, 50).map((entry) =>
        `| ${entry.priority} | ${entry.id} | ${entry.group} | ${entry.lexical} | ${entry.shadow} | ${entry.probability} | ${entry.reasons.join(", ")} |`
      ),
      "",
    ].join("\n");
    writeFileSync(join(__dir, "SHADOW_REVIEW_QUEUE.md"), queueMarkdown);

    expect(rows).toHaveLength(corpus.cases.length);
    expect(rows.filter((row) => row.reviewed)).toHaveLength(trainingJson.rows);
    expect(reviewQueue).toHaveLength(corpus.cases.length - trainingJson.rows);
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

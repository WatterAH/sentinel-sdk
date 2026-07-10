// Corre el red-team adversarial. Ejecutar con: npm run bench:adversarial
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import corpusJson from "./corpus.json" with { type: "json" };
import { type Corpus } from "./runner.js";
import { formatAdversarial, runAdversarial } from "./adversarial.js";

const __dir = dirname(fileURLToPath(import.meta.url));

describe("red-team adversarial", () => {
  it("mide supervivencia de detección bajo evasión y escribe reporte", () => {
    const report = runAdversarial(corpusJson as unknown as Corpus);
    writeFileSync(join(__dir, "adversarial-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(formatAdversarial(report));

    // Guardrail: ninguna transformación de evasión conocida debe bajar la
    // supervivencia de detección por debajo del 60%. Si esto falla, el motor
    // quedó vulnerable a una evasión que ya sabemos generar.
    for (const t of report.byTransform) {
      expect(t.survivalRate, `evasión '${t.transform}' rompe demasiadas detecciones`).toBeGreaterThanOrEqual(0.6);
    }
  }, 30000);
});

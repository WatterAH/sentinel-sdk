import { describe, expect, it } from "vitest";
import report from "./cascade-simulation-report.json" with { type: "json" };

describe("simulación de cascada de costo mínimo", () => {
  it("solo permite revisión adicional; nunca convierte el modelo en bloqueo", () => {
    expect(report.scope.predictionPolicy).toContain("out-of-fold");
    expect(report.baseline.falseBlocks).toBe(0);
    for (const candidate of Object.values(report.candidates)) {
      for (const point of candidate.curve) {
        expect(point.falseBlocks).toBe(0);
        expect(point.apiReviewRate).toBeGreaterThanOrEqual(report.baseline.apiReviewRate);
        expect(point.riskCoverage).toBeGreaterThanOrEqual(report.baseline.riskCoverage);
      }
      const selected = candidate.researchSelection;
      if (selected) {
        expect(selected.benignReviewRate).toBeLessThanOrEqual(
          report.baseline.benignReviewRate + 0.02 + Number.EPSILON,
        );
        expect(selected.cases.every((row) => !row.addedModelReview || !row.lexicalRisk)).toBe(true);
      }
    }
  });
});

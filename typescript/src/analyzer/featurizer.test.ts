import { describe, expect, it } from "vitest";
import { Engine } from "./engine.js";
import { featurize, FEATURE_NAMES } from "./featurizer.js";

const T0 = 1_750_000_000_000;
const m = (text: string, offsetS = 0) => ({ text, timestamp: T0 + offsetS * 1000 });

describe("featurizer — contrato del clasificador (8.8)", () => {
  it("el vector tiene el mismo largo que los nombres y valores en [0,1]", () => {
    const engine = new Engine();
    const result = engine.analyze([m("hay jale para ti, manda tu ubicacion")]);
    const { names, values, version } = featurize(result, [m("hay jale para ti, manda tu ubicacion")]);
    expect(values.length).toBe(names.length);
    expect(values.length).toBe(FEATURE_NAMES.length);
    expect(version).toBe(1);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("captura señales estructurales sin léxico (paráfrasis)", () => {
    const engine = new Engine();
    // Sin términos del dataset, pero con estructura de reclutamiento: imperativo
    // dirigido + dinero + encuentro.
    const msgs = [m("párate en la esquina y avísame quién pasa"), m("te pago mil pesos por eso")];
    const result = engine.analyze(msgs);
    const { names, values } = featurize(result, msgs);
    const idx = (n: string) => names.indexOf(n);
    expect(values[idx("txt_money_mention")]).toBe(1);
    expect(values[idx("txt_meet_mention")]).toBe(1);
  });
});

describe("modo sombra — no afecta el resultado", () => {
  it("evalúa el clasificador sin cambiar el veredicto", () => {
    const engine = new Engine();
    let observed: { shadowProbability: number; features: number[] } | null = null;
    // Clasificador stub: promedia las features como "probabilidad".
    engine.setShadowClassifier(
      (f) => f.reduce((a, b) => a + b, 0) / f.length,
      (info) => { observed = info; },
    );
    const msgs = [m("hola vamos al cine")];
    const withShadow = engine.analyze(msgs);
    // El veredicto es idéntico al de un motor sin sombra.
    const plain = new Engine().analyze(msgs);
    expect(withShadow.risk).toBe(plain.risk);
    expect(withShadow.score).toBe(plain.score);
    // Pero el observador recibió la comparación.
    expect(observed).not.toBeNull();
    const observation = observed as { shadowProbability: number; features: number[] } | null;
    if (!observation) throw new Error("El observador de modo sombra no fue invocado");
    expect(observation.features.length).toBe(FEATURE_NAMES.length);
  });

  it("un clasificador que lanza excepción no rompe el análisis", () => {
    const engine = new Engine();
    engine.setShadowClassifier(() => { throw new Error("modelo roto"); });
    const r = engine.analyze([m("hola")]);
    expect(r.risk).toBe("LOW");
  });
});

import { describe, expect, it } from "vitest";
import { Engine } from "./engine.js";
import { ageCategoryMultiplier, normalizeAgeBand } from "./age-policy.js";

const T0 = 1_750_000_000_000;
const m = (text: string, offsetS = 0) => ({ text, timestamp: T0 + offsetS * 1000 });

describe("age-policy — multiplicadores", () => {
  it("amplifica solicitud de información para menores", () => {
    expect(ageCategoryMultiplier("under13", "solicitud_informacion")).toBeGreaterThan(1);
    expect(ageCategoryMultiplier("13-15", "solicitud_informacion")).toBeGreaterThan(1);
  });

  it("amortigua oferta económica y formalidad para adultos", () => {
    expect(ageCategoryMultiplier("adult", "oferta_economica")).toBeLessThan(1);
    expect(ageCategoryMultiplier("adult", "formalidad_deceptiva")).toBeLessThan(1);
  });

  it("sin banda de edad no altera nada", () => {
    expect(ageCategoryMultiplier(undefined, "solicitud_informacion")).toBe(1);
  });

  it("normalizeAgeBand rechaza valores inválidos", () => {
    expect(normalizeAgeBand("under13")).toBe("under13");
    expect(normalizeAgeBand("42")).toBeUndefined();
    expect(normalizeAgeBand(null)).toBeUndefined();
  });
});

describe("Engine — el mismo mensaje puntúa distinto según edad", () => {
  // Solicitud de información personal — predatoria hacia un niño, más normal
  // (aunque intrusiva) entre adultos.
  const conv = [
    m("cuantos años tienes?", 0),
    m("en que escuela estas? a que hora sales solo?", 60),
    m("mandame una foto tuya y tu numero", 120),
  ];

  it("sube el score para un menor de 13 vs. sin contexto", () => {
    const base = new Engine().analyze(conv);
    const kid = new Engine().analyze(conv, { ageBand: "under13" });
    expect(kid.score).toBeGreaterThan(base.score);
  });

  it("baja el score para un adulto vs. sin contexto", () => {
    const base = new Engine().analyze(conv);
    const adult = new Engine().analyze(conv, { ageBand: "adult" });
    expect(adult.score).toBeLessThan(base.score);
  });

  it("registra la banda de edad usada en el resultado", () => {
    const r = new Engine().analyze(conv, { ageBand: "under13" });
    expect(r.ageBand).toBe("under13");
  });

  it("una oferta de trabajo entre adultos se amortigua (menos falsos positivos)", () => {
    const jobOffer = [
      m("hay chamba en la plaza comercial, pagan bien", 0),
      m("con prestaciones de ley y capacitación pagada", 60),
    ];
    const base = new Engine().analyze(jobOffer);
    const adult = new Engine().analyze(jobOffer, { ageBand: "adult" });
    expect(adult.score).toBeLessThanOrEqual(base.score);
  });
});

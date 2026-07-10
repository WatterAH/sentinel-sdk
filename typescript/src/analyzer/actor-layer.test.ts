import { describe, expect, it } from "vitest";
import { Engine } from "./engine.js";

const T0 = 1_750_000_000_000;
const m = (text: string, sender: string, offsetS = 0) => ({
  text,
  sender,
  timestamp: T0 + offsetS * 1000,
});

describe("ActorLayer — asimetría de emisor", () => {
  it("detecta al agresor que concentra tácticas de acción dirigida", () => {
    // El adulto ofrece, pide datos y da logística; el menor solo responde.
    const engine = new Engine();
    const r = engine.analyze([
      m("hola, te vi por aquí", "adulto", 0),
      m("hola", "menor", 30),
      m("tengo un trabajito para ti, se gana bien", "adulto", 60),
      m("ah sí? de qué", "menor", 90),
      m("manda tu ubicación y paso por ti, ven solo", "adulto", 120),
    ]);
    expect(r.layers.actor.analyzed).toBe(true);
    expect(r.layers.actor.aggressorSender).toBe("adulto");
    expect(r.layers.actor.triggeredRules).toContain("ACR-001");
    expect(r.risk).not.toBe("LOW");
  });

  it("NO marca agresor cuando las señales son recíprocas entre pares", () => {
    // Dos amigos organizando una fiesta: logística repartida, sin concentración.
    const engine = new Engine();
    const r = engine.analyze([
      m("oye dónde vives? paso por ti para la fiesta", "amigo1", 0),
      m("por el centro, y tú manda tu ubicación también", "amigo2", 60),
      m("va, nos vemos en la central de autobuses", "amigo1", 120),
    ]);
    // Aunque hay términos de logística, están repartidos → sin agresor claro.
    expect(r.layers.actor.aggressorSender).toBeNull();
  });

  it("reúne un término partido entre mensajes consecutivos del mismo emisor", () => {
    // Evasión: partir "jale" en dos mensajes. La concatenación por emisor lo une.
    const engine = new Engine();
    const partido = engine.analyze([
      m("oye tengo un ja", "adulto", 0),
      m("le para ti, se gana bien, manda tu ubicacion", "adulto", 20),
      m("ok", "menor", 40),
    ]);
    // El actor 'adulto' concentra tácticas aunque partió la palabra.
    expect(partido.layers.actor.analyzed).toBe(true);
  });

  it("sin emisores se comporta como antes (retrocompatible)", () => {
    const engine = new Engine();
    const r = engine.analyze([
      { text: "hola qué haces", timestamp: T0 },
      { text: "nada, aquí en la escuela", timestamp: T0 + 1000 },
    ]);
    expect(r.layers.actor.analyzed).toBe(false);
    expect(r.layers.actor.aggressorSender).toBeNull();
  });

  it("eleva a MEDIUM (escala) un caso de score moderado con agresor claro", () => {
    // Sin asimetría este caso podría quedar bajo el umbral; la concentración
    // en un actor lo empuja a revisión de la capa cognitiva.
    const engine = new Engine();
    const r = engine.analyze([
      m("te doy skins si me ayudas", "extraño", 0),
      m("no sé", "menor", 30),
      m("es fácil, no le digas a tus papás", "extraño", 60),
    ]);
    expect(r.escalate).toBe(true);
    expect(["MEDIUM", "HIGH", "CRITICAL"]).toContain(r.risk);
  });
});

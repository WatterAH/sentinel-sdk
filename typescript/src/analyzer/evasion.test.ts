// Tests del blindaje anti-evasión (red-team). Cada técnica de ocultamiento debe
// (a) seguir detectándose y (b) elevar el riesgo por la señal de evasión.
import { describe, expect, it } from "vitest";
import { NormalizerLayer } from "./normalizer-layer.js";
import { Engine } from "./engine.js";
import { sanitizeUnicode, deLeet, collapseIntraWordSpacing } from "./text-utils.js";

describe("text-utils — saneo anti-evasión", () => {
  it("NFKC colapsa fullwidth: ｆａｃｅｂｏｏｋ → facebook", () => {
    expect(sanitizeUnicode("ｆａｃｅｂｏｏｋ")).toBe("facebook");
  });

  it("pliega homóglifos cirílicos a latino", () => {
    // 'jаlе' con а y е cirílicas
    expect(sanitizeUnicode("jа" + "lе")).toBe("jale");
  });

  it("elimina caracteres invisibles insertados", () => {
    expect(sanitizeUnicode("j​a​l​e")).toBe("jale");
  });

  it("de-leet solo toca tokens mixtos letra+dígito, preserva números puros", () => {
    expect(deLeet("h4lc0n")).toBe("halcon");
    expect(deLeet("bi$ne")).toBe("bisne");
    expect(deLeet("5 mil quincenales")).toBe("5 mil quincenales"); // número puro intacto
  });

  it("colapsa espaciado intra-palabra de la palabra clave", () => {
    expect(collapseIntraWordSpacing("hay j a l e para ti")).toBe("hay jale para ti");
    // no toca palabras cortas legítimas sueltas
    expect(collapseIntraWordSpacing("voy a ir de compras")).toBe("voy a ir de compras");
  });
});

describe("Normalizer — la evasión eleva el riesgo (nunca lo baja)", () => {
  it("marca N0-EVASION y suma score cuando hay ofuscación", () => {
    const n = new NormalizerLayer();
    const out = n.process([{ text: "trayg0 Faceb00k, jalas al bi$ne", timestamp: 1 }]);
    expect(out.triggeredRules).toContain("N0-EVASION");
    expect(out.score).toBeGreaterThan(0);
  });

  it("texto limpio NO marca evasión", () => {
    const n = new NormalizerLayer();
    const out = n.process([{ text: "hola, vamos al cine el sábado?", timestamp: 1 }]);
    expect(out.triggeredRules).not.toContain("N0-EVASION");
  });
});

describe("Engine — un pitch de reclutamiento ofuscado sigue detectándose", () => {
  const variants: Record<string, string> = {
    fullwidth: "ｔｅｎｇｏ ｆａｃｅｂｏｏｋ, ｈａｙ ｊａｌｅ",
    leet: "t3ng0 faceb00k, h4y j4l3",
    invisibles: "tengo f​acebook, hay j​ale",
  };
  for (const [name, text] of Object.entries(variants)) {
    it(`variante '${name}' no evade la detección`, () => {
      const engine = new Engine();
      const r = engine.analyze([{ text, timestamp: 1 }]);
      expect(r.risk).not.toBe("LOW");
    });
  }
});

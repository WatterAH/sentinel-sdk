// Tests de los mecanismos anti-falso-positivo agregados tras expandir el corpus:
// corroboración de términos-clave polisémicos, dampeners narcoculturales, y el
// techo de riesgo por contexto de entretenimiento.
import { describe, expect, it } from "vitest";
import { Engine } from "./engine.js";
import { V3Layer } from "./v3-layer.js";

const T0 = 1_750_000_000_000;
const msg = (text: string, offsetS = 0) => ({ text, timestamp: T0 + offsetS * 1000 });

describe("Corroboración de términos-clave polisémicos", () => {
  it("'facebook' solo (ambiguo) no puntúa sin corroboración", () => {
    const v3 = new V3Layer();
    const out = v3.scan([msg("tienes facebook? agrégame")]);
    // "facebook" es variante de fentanilo (CN-005, requires_corroboration).
    // Sin otra señal de riesgo, no debe aportar score ni aparecer en terms.
    expect(out.terms).not.toContain("CN-005");
    expect(out.score).toBe(0);
  });

  it("'facebook' SÍ puntúa cuando lo corrobora una señal sólida", () => {
    const v3 = new V3Layer();
    const out = v3.scan([msg("tengo facebook, hay jale")]);
    // "hay jale" (reclutamiento, no ambiguo) corrobora → facebook cuenta.
    expect(out.terms).toContain("CN-005");
    expect(out.terms).toContain("REC-001");
    expect(out.score).toBeGreaterThan(0);
  });

  it("una palabra veneno eliminada del dataset ya no matchea (birria=comida)", () => {
    const v3 = new V3Layer();
    const out = v3.scan([msg("unos tacos de birria bien ricos")]);
    expect(out.terms).not.toContain("CN-005"); // fentanilo ya no tiene "birria"
    expect(out.score).toBe(0);
  });

  it("'la rola' (canción) ya no matchea MDMA", () => {
    const v3 = new V3Layer();
    const out = v3.scan([msg("esa rola está bien buena")]);
    expect(out.terms).not.toContain("CN-019");
  });
});

describe("Dampeners narcoculturales (fan de corridos ≠ reclutador)", () => {
  it("citar léxico narco hablando de una canción no dispara bloqueo", () => {
    const engine = new Engine();
    const r = engine.analyze([
      msg("🎵 de halcón empecé y ahora la plaza es mía 🎵 qué rola", 0),
      msg("esa canción de los alegres está durísima, la cantamos en el karaoke?", 400),
    ]);
    expect(r.risk).not.toBe("HIGH");
    expect(r.risk).not.toBe("CRITICAL");
  });

  it("hablar de una serie de narcos en netflix no produce bloqueo automático", () => {
    const engine = new Engine();
    const r = engine.analyze([
      msg("ya viste la serie del cartel en netflix?", 0),
      msg("voy en el capítulo del laboratorio clandestino, el que hace de sicario actúa increíble", 400),
    ]);
    // Contexto de entretenimiento sin acción dirigida → nunca HIGH/CRITICAL.
    expect(["LOW", "MEDIUM"]).toContain(r.risk);
  });
});

describe("El dampener NO salva al reclutador que usa corridos como gancho", () => {
  it("fan de corridos + oferta económica dirigida sí escala", () => {
    const engine = new Engine();
    const r = engine.analyze([
      msg("también te gustan los corridos de peso pluma? qué chido", 0),
      msg("esa vida es real eh, hay jale para ti y se gana bien", 300),
      msg("5 mil quincenales, jalas?", 600),
    ]);
    // La oferta económica es acción dirigida: el techo de entretenimiento NO aplica.
    expect(r.risk).not.toBe("LOW");
  });
});

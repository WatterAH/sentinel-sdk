import { describe, expect, it } from "vitest";
import { TemporalLayer } from "./temporal-layer.js";
import { Engine } from "./engine.js";
import type { Hit } from "../types/SentinelEngine.js";

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_750_000_000_000;

function hit(category: string, daysOffset: number, id = "X"): Hit {
  return { id, score: 1, category, timestamp: T0 + daysOffset * DAY };
}

describe("TemporalLayer — TCR-001 (cadena de captación lenta)", () => {
  it("dispara con 3 etapas ordenadas que alcanzan aislamiento en ≥48h", () => {
    const layer = new TemporalLayer();
    const result = layer.scan([
      hit("señal_debil", 0),
      hit("reclutamiento", 3),
      hit("solicitud_informacion", 6),
    ]);
    expect(result.orderedProgression).toBe(true);
    expect(result.triggeredRules).toContain("TCR-001");
  });

  it("dispara con las 4 etapas del guion completo", () => {
    const layer = new TemporalLayer();
    const result = layer.scan([
      hit("videojuegos_vector", 0),
      hit("oferta_economica", 4),
      hit("cambio_canal", 9),
      hit("logistica_fisica", 14),
    ]);
    expect(result.stagesPresent).toEqual([
      "CONTACTO",
      "ENGANCHE",
      "AISLAMIENTO",
      "LOGISTICA",
    ]);
    expect(result.triggeredRules).toContain("TCR-001");
  });

  it("NO dispara si el span es menor a 48h (eso lo cubren MCR/velocity)", () => {
    const layer = new TemporalLayer();
    const result = layer.scan([
      hit("señal_debil", 0),
      hit("reclutamiento", 0.5),
      hit("solicitud_informacion", 1),
    ]);
    expect(result.triggeredRules).not.toContain("TCR-001");
  });

  it("NO dispara sin progresión ordenada (amistad real: pregunta la edad primero)", () => {
    const layer = new TemporalLayer();
    const result = layer.scan([
      hit("solicitud_informacion", 0), // etapa 3 primero
      hit("señal_debil", 2), // etapa 1 después → desorden
      hit("oferta_economica", 20),
    ]);
    expect(result.orderedProgression).toBe(false);
    expect(result.triggeredRules).toHaveLength(0);
  });

  it("NO dispara si nunca alcanza aislamiento ni logística", () => {
    const layer = new TemporalLayer();
    const result = layer.scan([
      hit("señal_debil", 0),
      hit("videojuegos_vector", 3),
      hit("oferta_economica", 6),
    ]);
    // solo CONTACTO y ENGANCHE presentes (2 etapas) — sin etapa profunda
    expect(result.triggeredRules).not.toContain("TCR-001");
  });
});

describe("TemporalLayer — TCR-002 (aislamiento sostenido)", () => {
  it("dispara cuando el aislamiento persiste en ≥2 días distintos durante ≥7 días", () => {
    const layer = new TemporalLayer();
    const result = layer.scan([
      hit("señal_debil", 0),
      hit("aislamiento", 4, "AI-006"),
      hit("aislamiento", 11, "AI-006"), // mismo término, otro día — no suma score pero sí persistencia
    ]);
    expect(result.triggeredRules).toContain("TCR-002");
  });

  it("NO dispara si el aislamiento solo aparece un día", () => {
    const layer = new TemporalLayer();
    const result = layer.scan([
      hit("señal_debil", 0),
      hit("aislamiento", 8),
    ]);
    expect(result.triggeredRules).not.toContain("TCR-002");
  });

  it("NO dispara con span menor a 7 días", () => {
    const layer = new TemporalLayer();
    const result = layer.scan([
      hit("señal_debil", 0),
      hit("aislamiento", 2),
      hit("aislamiento", 4),
    ]);
    expect(result.triggeredRules).not.toContain("TCR-002");
  });
});

describe("TemporalLayer — casos borde", () => {
  it("devuelve vacío sin hits", () => {
    const layer = new TemporalLayer();
    const result = layer.scan([]);
    expect(result.stagesPresent).toHaveLength(0);
    expect(result.triggeredRules).toHaveLength(0);
  });

  it("ignora hits sin categoría o con categoría no mapeada", () => {
    const layer = new TemporalLayer();
    const result = layer.scan([
      { id: "N0-F001", score: 1, timestamp: T0 },
      { id: "??", score: 1, category: "categoria_inexistente", timestamp: T0 + DAY },
    ]);
    expect(result.stagesPresent).toHaveLength(0);
  });
});

describe("Engine — integración del piso temporal", () => {
  it("eleva a MEDIUM una conversación bajo el umbral cuando hay cadena temporal", () => {
    // Cada término es débil (hola=1, chambita=3, cuántos años=3 → score ~8 < 12)
    // pero la progresión ordenada en 6 días dispara TCR-001.
    const engine = new Engine();
    const result = engine.analyze([
      { text: "hola, qué haces", timestamp: T0 },
      { text: "hay una chambita por si te interesa", timestamp: T0 + 3 * DAY },
      { text: "primero dime, cuántos años tienes?", timestamp: T0 + 6 * DAY },
    ]);
    expect(result.layers.temporal.triggeredRules).toContain("TCR-001");
    expect(result.score).toBeLessThan(12);
    expect(result.risk).not.toBe("LOW");
    expect(result.escalate).toBe(true);
  });

  it("NO altera una amistad larga sin progresión ordenada", () => {
    const engine = new Engine();
    const result = engine.analyze([
      { text: "yo tengo 13, cuántos años tienes tú?", timestamp: T0 },
      { text: "hola! una partida al rato?", timestamp: T0 + 2 * DAY },
      { text: "gracias por prestarme tu cargador ayer", timestamp: T0 + 20 * DAY },
    ]);
    expect(result.layers.temporal.orderedProgression).toBe(false);
    expect(result.layers.temporal.triggeredRules).toHaveLength(0);
    expect(result.risk).toBe("LOW");
  });

  it("la misma conversación de captación en 10 minutos no dispara TCR (la cubren otras capas)", () => {
    const engine = new Engine();
    const result = engine.analyze([
      { text: "hola, qué haces", timestamp: T0 },
      { text: "hay una chambita por si te interesa", timestamp: T0 + 5 * 60 * 1000 },
      { text: "primero dime, cuántos años tienes?", timestamp: T0 + 10 * 60 * 1000 },
    ]);
    expect(result.layers.temporal.triggeredRules).toHaveLength(0);
  });
});

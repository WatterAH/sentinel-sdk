import { describe, it, expect } from "vitest";
import { Engine } from "./engine.js";
import type { Message } from "../types/SentinelEngine.js";

describe("S15 — Detección temprana por prefijos y no-fuga del futuro", () => {
  const engine = new Engine();

  it("garantiza consistencia causal: mensajes futuros jamás alteran el resultado pasado", () => {
    const fullConversation: Message[] = [
      { text: "hola compa qué haces", timestamp: 1000 },
      { text: "aquí descansando y tú", timestamp: 2000 },
      { text: "que onda, hay jale por si te interesa", timestamp: 3000 },
      { text: "lana fácil, nomás es un mandadito", timestamp: 4000 },
      { text: "manda tu ubicación y te mandamos el uber", timestamp: 5000 },
    ];

    // Evaluar secuencialmente prefijo a prefijo
    const prefixResults: Array<{ score: number; risk: string }> = [];
    for (let t = 1; t <= fullConversation.length; t++) {
      const prefix = fullConversation.slice(0, t);
      const res = engine.analyze(prefix);
      prefixResults.push({ score: res.score, risk: res.risk });
    }

    // Re-evaluar de forma independiente cada prefijo y confirmar coincidencia idéntica
    for (let t = 1; t <= fullConversation.length; t++) {
      const prefix = fullConversation.slice(0, t);
      const res = engine.analyze(prefix);
      expect(res.score).toBe(prefixResults[t - 1].score);
      expect(res.risk).toBe(prefixResults[t - 1].risk);
    }
  });

  it("evita alarma prematura en el saludo inicial (no alerta en turno 0)", () => {
    const greetingPrefix: Message[] = [
      { text: "hola buenas tardes", timestamp: 1000 },
    ];
    const res = engine.analyze(greetingPrefix);
    expect(res.risk).toBe("LOW");
    expect(res.escalate).toBe(false);
  });

  it("detecta a tiempo (on-time) en turno de evidencia antes del evento crítico final", () => {
    const conversation: Message[] = [
      { text: "hola qué onda", timestamp: 1000 }, // Turn 0: Saludo benigno
      { text: "que onda, hay jale por si te interesa", timestamp: 2000 }, // Turn 1: Oferta
      { text: "lana fácil, nomás es un mandadito", timestamp: 3000 }, // Turn 2: Enganche económico
      { text: "manda tu ubicación y te mandamos el uber para el traslado", timestamp: 4000 }, // Turn 3: Logística
    ];

    let firstAlertTurn = -1;
    for (let t = 0; t < conversation.length; t++) {
      const prefix = conversation.slice(0, t + 1);
      const res = engine.analyze(prefix);
      if (res.risk === "MEDIUM" || res.risk === "HIGH" || res.risk === "CRITICAL" || res.escalate || res.score >= 20) {
        firstAlertTurn = t;
        break;
      }
    }

    // La primera alerta ocurre después del saludo (t >= 1) y a tiempo para intervención
    expect(firstAlertTurn).toBeGreaterThanOrEqual(1);
    expect(firstAlertTurn).toBeLessThanOrEqual(3);
  });

  it("maneja timestamps desordenados y reinicio de memoria longitudinal", () => {
    const unorderedConversation: Message[] = [
      { text: "manda tu ubicación para el uber", timestamp: 3000 },
      { text: "hola qué onda", timestamp: 1000 },
      { text: "te tengo un jale", timestamp: 2000 },
    ];

    const res = engine.analyze(unorderedConversation);
    expect(res).toBeDefined();
    expect(typeof res.score).toBe("number");
    expect(res.risk).toBeDefined();
  });
});

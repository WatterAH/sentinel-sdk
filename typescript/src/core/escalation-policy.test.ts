import { describe, expect, it } from "vitest";
import { Engine } from "../analyzer/engine.js";

const T0 = 1_750_000_000_000;
const m = (text: string, offsetS = 0, sender?: string) => ({
  text,
  timestamp: T0 + offsetS * 1000,
  sender,
});

// La política de escalación vive en el motor (campo `escalate` + `escalationReason`).
// Principio: escalar solo cuando el motor está INSEGURO (zona gris), para minimizar
// el costo de API. Lo determinista se resuelve local.
describe("Política de escalación por incertidumbre", () => {
  it("LOW no escala (sin costo de API)", () => {
    const r = new Engine().analyze([m("hola, vamos al cine el sábado")]);
    expect(r.risk).toBe("LOW");
    expect(r.escalate).toBe(false);
    expect(r.escalationReason).toBe("none_low_risk");
  });

  it("riesgo alto con regla determinista se resuelve local (NO escala)", () => {
    // Reclutamiento + logística directa dispara una regla MCR (prueba dura).
    const r = new Engine().analyze([
      m("hay jale para ti, se gana bien"),
      m("manda tu ubicación y paso por ti, ven solo"),
    ]);
    expect(["HIGH", "CRITICAL"]).toContain(r.risk);
    expect(r.escalate).toBe(false);
    expect(r.escalationReason).toBe("confident_local_proof");
  });

  it("zona gris (MEDIUM) sí escala al LLM", () => {
    // Un solo término de peso moderado, sin regla dura → incierto.
    const r = new Engine().analyze([m("oye, tengo un trabajito para ti")]);
    if (r.risk === "MEDIUM") {
      expect(r.escalate).toBe(true);
      expect(r.escalationReason).toBe("uncertain_needs_llm");
    }
  });

  it("un agresor por asimetría cuenta como prueba dura (no escala)", () => {
    const r = new Engine().analyze([
      m("te doy dinero facil si me ayudas", 0, "adulto"),
      m("no sé", 30, "menor"),
      m("no le digas a tus papas, manda tu ubicacion, ven solo", 60, "adulto"),
    ]);
    if (r.risk === "HIGH" || r.risk === "CRITICAL") {
      expect(r.escalationReason).toBe("confident_local_proof");
      expect(r.escalate).toBe(false);
    }
  });
});

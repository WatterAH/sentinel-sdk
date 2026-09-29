import { afterEach, describe, expect, it, vi } from "vitest";
import { Sentinel } from "./sentinel.js";
import type { ApiAnalysisResponse } from "../types/SentinelAnalysisResult.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createMockLlmEnvelope(summary: string, risk: "MEDIUM" | "HIGH" = "MEDIUM") {
  const data: ApiAnalysisResponse = {
    messages_analyzed: 1,
    current_message: "sample",
    confidence: 0.85,
    risk,
    summary,
    stage: "CAPTACION",
    false_positive: false,
    ux_recommendation: "WARNING_OVERLAY",
    intervention: {
      recruiter_action: "SILENT_OBSERVE",
      protective_actions: ["WARN_MINOR"],
      minor_message: "Advertencia preventiva",
      rationale: "Patrón de captación detectado",
    },
  };
  return {
    success: true,
    status_code: 200,
    data,
  };
}

describe("S06 — Invalidación segura de la caché de escalación", () => {
  // Frase en zona gris (MEDIUM, score 13 sin regla dura -> escalate=true)
  const MEDIUM_PROMPT_1 = "tengo un trabajito para ti y te doy skins gratis";
  const FOLLOWUP_MSG = "qué opinas, te interesa?";

  it("deduplica solicitudes idénticas dentro del TTL sin repetir llamada a la API", async () => {
    let mockTime = 1_700_000_000_000;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(createMockLlmEnvelope("Primer veredicto")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const sentinel = new Sentinel({
      apiKey: "test-key",
      baseUrl: "http://localhost:8000/api/v1",
      escalationCache: {
        ttlMs: 60_000,
        nowProvider: () => mockTime,
      },
    });

    // 1er análisis (incierto -> escala al LLM)
    const res1 = await sentinel.analyze(MEDIUM_PROMPT_1, "sess-1", "adulto-1");
    expect(res1.error).toBeNull();
    expect(res1.data?.summary).toBe("Primer veredicto");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Replay / reintento idéntico a los 10 segundos
    mockTime += 10_000;
    const res2 = await sentinel.analyze(MEDIUM_PROMPT_1, "sess-1", "adulto-1");
    expect(res2.error).toBeNull();
    // Reutiliza caché: no debe haber una 2da llamada fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res2.data?.summary).toBe("Primer veredicto");
  });

  it("invalida la caché cuando cambia el contenido en la misma sesión aunque mantenga banda MEDIUM", async () => {
    let mockTime = 1_700_000_000_000;
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount++;
      return new Response(
        JSON.stringify(createMockLlmEnvelope(`Veredicto llamado #${callCount}`)),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const sentinel = new Sentinel({
      apiKey: "test-key",
      baseUrl: "http://localhost:8000/api/v1",
      escalationCache: {
        ttlMs: 60_000,
        nowProvider: () => mockTime,
      },
    });

    // Mensaje 1: MEDIUM_PROMPT_1 -> MEDIUM, escala
    const res1 = await sentinel.analyze(MEDIUM_PROMPT_1, "sess-2", "adulto-1");
    expect(res1.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res1.data?.summary).toBe("Veredicto llamado #1");

    // Mensaje 2: nuevo mensaje en la misma sesión -> sigue en zona MEDIUM / incierta,
    // pero al haber nueva evidencia/mensajes, NO debe reusar el veredicto viejo.
    mockTime += 5_000;
    const res2 = await sentinel.analyze(FOLLOWUP_MSG, "sess-2", "adulto-1");
    expect(res2.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res2.data?.summary).toBe("Veredicto llamado #2");
  });

  it("expira la caché cuando transcurre el TTL", async () => {
    let mockTime = 1_700_000_000_000;
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount++;
      return new Response(
        JSON.stringify(createMockLlmEnvelope(`Respuesta #${callCount}`)),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const sentinel = new Sentinel({
      apiKey: "test-key",
      baseUrl: "http://localhost:8000/api/v1",
      escalationCache: {
        ttlMs: 30_000, // 30s
        nowProvider: () => mockTime,
      },
    });

    await sentinel.analyze(MEDIUM_PROMPT_1, "sess-3", "adulto-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Avanza 35 segundos (> 30s TTL)
    mockTime += 35_000;

    const res2 = await sentinel.analyze(MEDIUM_PROMPT_1, "sess-3", "adulto-1");
    expect(res2.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res2.data?.summary).toBe("Respuesta #2");
  });

  it("invalida la caché si cambia el contexto (ej. ageBand)", async () => {
    let mockTime = 1_700_000_000_000;
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount++;
      return new Response(
        JSON.stringify(createMockLlmEnvelope(`Contexto #${callCount}`)),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const sentinel = new Sentinel({
      apiKey: "test-key",
      baseUrl: "http://localhost:8000/api/v1",
      escalationCache: {
        ttlMs: 60_000,
        nowProvider: () => mockTime,
      },
    });

    // 1. Sin ageBand
    await sentinel.analyze(MEDIUM_PROMPT_1, "sess-4", "adulto-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 2. Con ageBand under13 (cambio contextual que afecta la sensibilidad)
    mockTime += 1_000;
    await sentinel.analyze(MEDIUM_PROMPT_1, "sess-4", "adulto-1", {
      ageBand: "under13",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalida la caché explícitamente mediante clearSession, clearEscalationCache, reset e importSessions", async () => {
    const mockTime = 1_700_000_000_000;
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount++;
      return new Response(
        JSON.stringify(createMockLlmEnvelope(`Llamada #${callCount}`)),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const sentinel = new Sentinel({
      apiKey: "test-key",
      baseUrl: "http://localhost:8000/api/v1",
      escalationCache: {
        ttlMs: 60_000,
        nowProvider: () => mockTime,
      },
    });

    // 1. Test clearSession
    await sentinel.analyze(MEDIUM_PROMPT_1, "sess-5", "adulto-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    sentinel.clearSession("sess-5");
    await sentinel.analyze(MEDIUM_PROMPT_1, "sess-5", "adulto-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 2. Test clearEscalationCache
    sentinel.clearEscalationCache();
    await sentinel.analyze(MEDIUM_PROMPT_1, "sess-5", "adulto-1");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // 3. Test reset
    sentinel.reset();
    await sentinel.analyze(MEDIUM_PROMPT_1, "sess-5", "adulto-1");
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // 4. Test importSessions
    const exported = sentinel.exportSessions();
    sentinel.importSessions(exported);
    await sentinel.analyze(MEDIUM_PROMPT_1, "sess-5", "adulto-1");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("mantiene un tamaño acotado y expulsa las entradas más antiguas (LRU)", async () => {
    let mockTime = 1_700_000_000_000;
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount++;
      return new Response(
        JSON.stringify(createMockLlmEnvelope(`Capacidad #${callCount}`)),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const sentinel = new Sentinel({
      apiKey: "test-key",
      baseUrl: "http://localhost:8000/api/v1",
      escalationCache: {
        ttlMs: 60_000,
        maxEntries: 2, // capacidad máxima 2
        nowProvider: () => mockTime,
      },
    });

    // Llenar entrada 1
    mockTime += 100;
    await sentinel.analyze(MEDIUM_PROMPT_1, "sess-a", "user-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Llenar entrada 2
    mockTime += 100;
    await sentinel.analyze(MEDIUM_PROMPT_1, "sess-b", "user-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Llenar entrada 3 -> debe expulsar a sess-a
    mockTime += 100;
    await sentinel.analyze(MEDIUM_PROMPT_1, "sess-c", "user-1");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // sess-b y sess-c siguen en cache (reintento idéntico no debe generar llamadas)
    await sentinel.analyze(MEDIUM_PROMPT_1, "sess-b", "user-1");
    await sentinel.analyze(MEDIUM_PROMPT_1, "sess-c", "user-1");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // sess-a fue expulsada -> genera nueva llamada
    await sentinel.analyze(MEDIUM_PROMPT_1, "sess-a", "user-1");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("valida parámetros de configuración de la caché", () => {
    expect(
      () =>
        new Sentinel({
          apiKey: "test-key",
          escalationCache: { ttlMs: 0 },
        }),
    ).toThrow("escalationCache.ttlMs must be a positive number");

    expect(
      () =>
        new Sentinel({
          apiKey: "test-key",
          escalationCache: { maxEntries: -5 },
        }),
    ).toThrow("escalationCache.maxEntries must be a positive integer");
  });
});

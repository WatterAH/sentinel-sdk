import { describe, it, expect, vi } from "vitest";
import { Engine } from "./engine.js";
import { Sentinel } from "../core/sentinel.js";
import {
  ShadowRunner,
  type ShadowProvider,
  type ShadowObservation,
} from "./shadow-runner.js";
import {
  createLayaShadowProvider,
  applyPlattScaling,
  LAYA_PLATT_CALIBRATION,
} from "./laya-shadow-classifier.js";
import type { Message } from "../types/SentinelEngine.js";

const BENIGN_MESSAGES: Message[] = [
  { text: "¿A qué hora nos vemos para la reta de fútbol en la cancha?", sender: "amigo1", timestamp: 1000 },
  { text: "A las 5 pm, llevo el balón.", sender: "amigo2", timestamp: 1060 },
];

const SUSPICIOUS_MESSAGES: Message[] = [
  { text: "Te ofrezco 15 mil pesos a la quincena por cuidar un punto.", sender: "reclutador", timestamp: 1000 },
  { text: "No le digas a tus papás, ven solo al hotel de la central.", sender: "reclutador", timestamp: 1060 },
];

describe("S16 — Integración Mínima en Sombra (SDK)", () => {
  it("conserva intacto el resultado y las decisiones del motor principal con o sin sombra (invarianza)", () => {
    const enginePlain = new Engine();
    const resultPlain = enginePlain.analyze(BENIGN_MESSAGES);

    const engineWithShadow = new Engine();
    const layaProvider = createLayaShadowProvider();
    engineWithShadow.setShadowProvider(layaProvider);
    const resultWithShadow = engineWithShadow.analyze(BENIGN_MESSAGES);

    expect(resultWithShadow.risk).toBe(resultPlain.risk);
    expect(resultWithShadow.escalate).toBe(resultPlain.escalate);
    expect(resultWithShadow.score).toBe(resultPlain.score);
    expect(resultWithShadow.layers.v3.score).toBe(resultPlain.layers.v3.score);
    expect(resultWithShadow.layers.v4.score).toBe(resultPlain.layers.v4.score);
  });

  it("maneja errores y excepciones del candidato sombra de forma aislada sin afectar al motor", () => {
    const engine = new Engine();
    let recordedObservation: ShadowObservation | null = null;

    const brokenProvider: ShadowProvider = {
      modelId: "candidate-broken-crash",
      featureSchemaVersion: 2,
      predict: () => {
        throw new Error("Simulated memory overflow or tensor parse failure");
      },
    };

    engine.setShadowProvider(brokenProvider, (obs) => {
      recordedObservation = obs;
    });

    const result = engine.analyze(SUSPICIOUS_MESSAGES);

    expect(result.risk).toBe("CRITICAL");
    expect(recordedObservation).not.toBeNull();
    expect(recordedObservation!.status).toBe("error");
    expect(recordedObservation!.modelId).toBe("candidate-broken-crash");
    expect(recordedObservation!.shadowProbability).toBeNull();
    expect(recordedObservation!.errorReason).toContain("Simulated memory overflow");
  });

  it("maneja proveedores lentos / timeouts registrando status='timeout' sin bloquear el motor", () => {
    const engine = new Engine();
    let recordedObservation: ShadowObservation | null = null;

    const slowProvider: ShadowProvider = {
      modelId: "candidate-slow-timeout",
      featureSchemaVersion: 2,
      predict: () => {
        // Bloqueo síncrono simulado de 60 ms
        const start = Date.now();
        while (Date.now() - start < 60) {}
        return 0.95;
      },
    };

    // Configura cota de latencia estricta de 20 ms
    engine.setShadowProvider(
      slowProvider,
      (obs) => {
        recordedObservation = obs;
      },
      { maxLatencyMs: 20 },
    );

    const result = engine.analyze(SUSPICIOUS_MESSAGES);

    expect(result).toBeDefined();
    expect(recordedObservation).not.toBeNull();
    expect(recordedObservation!.status).toBe("timeout");
    expect(recordedObservation!.latencyMs).toBeGreaterThanOrEqual(20);
    expect(recordedObservation!.shadowProbability).toBeNull();
  });

  it("respeta el kill switch maestro (enabled: false) omitiendo la ejecución del modelo", () => {
    const engine = new Engine();
    let predictCalls = 0;
    let recordedObservation: ShadowObservation | null = null;

    const spyProvider: ShadowProvider = {
      modelId: "candidate-spy",
      featureSchemaVersion: 2,
      predict: () => {
        predictCalls++;
        return 0.8;
      },
    };

    engine.setShadowProvider(
      spyProvider,
      (obs) => {
        recordedObservation = obs;
      },
      { enabled: false }, // Kill switch apagado
    );

    const result = engine.analyze(BENIGN_MESSAGES);

    expect(result.risk).toBe("LOW");
    expect(predictCalls).toBe(0);
    expect(recordedObservation).not.toBeNull();
    expect(recordedObservation!.status).toBe("disabled");
    expect(recordedObservation!.shadowProbability).toBeNull();
  });

  it("aplica límite estricto de presupuesto / tasa de llamadas por minuto", () => {
    const runner = new ShadowRunner(
      {
        modelId: "rate-limited-model",
        featureSchemaVersion: 2,
        predict: () => 0.42,
      },
      undefined,
      { budgetLimitPerMinute: 3 },
    );

    const engine = new Engine();
    const mockResult = engine.analyze(BENIGN_MESSAGES);

    const obs1 = runner.execute(mockResult, [0, 0, 0], BENIGN_MESSAGES);
    const obs2 = runner.execute(mockResult, [0, 0, 0], BENIGN_MESSAGES);
    const obs3 = runner.execute(mockResult, [0, 0, 0], BENIGN_MESSAGES);
    const obs4 = runner.execute(mockResult, [0, 0, 0], BENIGN_MESSAGES); // Excede presupuesto

    expect(obs1.status).toBe("ok");
    expect(obs2.status).toBe("ok");
    expect(obs3.status).toBe("ok");
    expect(obs4.status).toBe("budget_exceeded");
    expect(obs4.shadowProbability).toBeNull();
  });

  it("maneja modelo ausente con status='missing_model' de forma segura", () => {
    const runner = new ShadowRunner(undefined, undefined, { enabled: true });
    const engine = new Engine();
    const mockResult = engine.analyze(BENIGN_MESSAGES);

    const obs = runner.execute(mockResult, [0, 0, 0], BENIGN_MESSAGES);
    expect(obs.status).toBe("missing_model");
    expect(obs.shadowProbability).toBeNull();
  });

  it("evalúa el proveedor calibrado Laya Multilingual con parámetros congelados en S14", () => {
    const laya = createLayaShadowProvider();
    expect(laya.modelId).toBe(LAYA_PLATT_CALIBRATION.modelId);

    // Probabilidad calibrada en caso benigno
    const benignProb = laya.predict(Array(38).fill(0), BENIGN_MESSAGES);
    expect(benignProb).toBeGreaterThanOrEqual(0);
    expect(benignProb).toBeLessThan(0.6);

    // Platt scaling formula test
    const scaled = applyPlattScaling(0.5, { a: 1.0, b: 0.0 });
    expect(scaled).toBeCloseTo(0.5, 3);
  });

  it("garantiza que la telemetría agregada jamás expone textos, IDs de usuario ni PII", async () => {
    let capturedBody: any = null;
    const fetchSpy = vi.fn().mockImplementation((_url, init) => {
      if (init?.body) {
        capturedBody = JSON.parse(init.body as string);
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const sentinel = new Sentinel({
      apiKey: "test-api-key",
      telemetry: true,
      shadowClassifier: "laya-multilingual",
    });

    sentinel.localAnalyze([
      { text: "secret text containing confidential information", sender: "user_alice_123" },
    ]);

    await sentinel.flushTelemetry();

    expect(capturedBody).not.toBeNull();
    const serialized = JSON.stringify(capturedBody);

    expect(serialized).not.toContain("secret text");
    expect(serialized).not.toContain("confidential");
    expect(serialized).not.toContain("user_alice_123");
    expect(capturedBody.shadow).toBeDefined();
    expect(capturedBody.shadow.models[LAYA_PLATT_CALIBRATION.modelId]).toBeDefined();

    vi.unstubAllGlobals();
  });
});

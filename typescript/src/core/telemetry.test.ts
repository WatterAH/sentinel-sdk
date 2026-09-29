import { afterEach, describe, expect, it, vi } from "vitest";
import { Sentinel } from "./sentinel.js";

const originalSendBeacon = globalThis.navigator?.sendBeacon;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (globalThis.navigator) {
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      configurable: true,
      value: originalSendBeacon,
    });
  }
});

describe("telemetría opt-in y privacidad", () => {
  it("jamás incluye texto de mensajes ni identificadores en el payload", async () => {
    const sent: Array<{ url: string; body: string }> = [];
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      configurable: true,
      value: (url: string, body: string) => {
        sent.push({ url, body });
        return true;
      },
    });
    const tokenFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: { token: "token-efimero-sin-datos-del-usuario" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", tokenFetch);

    const sentinel = new Sentinel({
      apiKey: "telemetry-test-key",
      telemetry: true,
      telemetryFlushAnalysisCount: 500,
      telemetryFlushIntervalMinutes: 60,
    });
    const secretText = "MENSAJE_ULTRASECRETO párate afuera y dime quién cruza";
    const secretSender = "menor-identificador-no-debe-salir";
    const result = sentinel.localAnalyze([
      { text: secretText, sender: secretSender, timestamp: 1_750_000_000_000 },
    ]);
    expect(result.error).toBeNull();
    await sentinel.flushTelemetry();

    expect(sent).toHaveLength(1);
    const serialized = sent[0]?.body ?? "";
    expect(serialized).not.toContain(secretText);
    expect(serialized).not.toContain("MENSAJE_ULTRASECRETO");
    expect(serialized).not.toContain(secretSender);
    expect(serialized).not.toContain("content");
    expect(serialized).not.toContain("message");
    expect(sent[0]?.url).not.toContain("telemetry-test-key");
    expect(sent[0]?.url).toContain("telemetry_token=");
    expect(tokenFetch).toHaveBeenCalledWith(
      expect.stringContaining("/telemetry/token"),
      expect.objectContaining({ headers: { "X-API-Key": "telemetry-test-key" } }),
    );

    const payload = JSON.parse(serialized);
    expect(Object.keys(payload).sort()).toEqual([
      "interventions",
      "resolutions",
      "riskCounts",
      "schemaVersion",
      "shadow",
      "topV3Terms",
      "totalAnalyses",
    ]);
    expect(payload.schemaVersion).toBe(3);
    expect(payload.interventions.observed).toBe(1);
    expect(payload.interventions.recruiterActions.ALLOW).toBe(1);
  });

  it("no envía nada cuando telemetry permanece en su default false", () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      configurable: true,
      value: beacon,
    });
    const sentinel = new Sentinel({ apiKey: "test-key" });
    sentinel.localAnalyze([{ text: "hola" }]);
    expect(beacon).not.toHaveBeenCalled();
  });

  it("no cambia ningún resultado del motor", () => {
    const messages = [
      { text: "hay jale", timestamp: 1_750_000_000_000 },
      { text: "manda tu ubicación", timestamp: 1_750_000_001_000 },
    ];
    const withoutTelemetry = new Sentinel({ apiKey: "test-key" }).localAnalyze(messages);
    const withTelemetry = new Sentinel({
      apiKey: "test-key",
      telemetry: true,
      telemetryFlushAnalysisCount: 500,
    }).localAnalyze(messages);
    expect(withTelemetry).toEqual(withoutTelemetry);
  });

  it("usa el ShadowObserver existente para contar concordancia", async () => {
    let body = "";
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      configurable: true,
      value: (_url: string, serialized: string) => {
        body = serialized;
        return true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ data: { token: "shadow-token" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const sentinel = new Sentinel({
      apiKey: "test-key",
      telemetry: true,
      telemetryFlushAnalysisCount: 500,
      telemetryFlushIntervalMinutes: 60,
    });
    sentinel.setShadowClassifier(() => 0.01);
    sentinel.localAnalyze([{ text: "hola, hacemos la tarea" }]);
    await sentinel.flushTelemetry();
    const payload = JSON.parse(body);
    expect(payload.shadow).toEqual({
      agreements: 1,
      disagreements: 0,
      models: {
        "custom-unversioned": {
          featureSchemaVersion: null,
          agreements: 1,
          disagreements: 0,
        },
      },
    });
  });

  it("activa el modelo incluido solo cuando la plataforma lo solicita", async () => {
    let body = "";
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      configurable: true,
      value: (_url: string, serialized: string) => {
        body = serialized;
        return true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ data: { token: "bundled-token" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const messages = [{ text: "hola, hacemos la tarea" }];
    const baseline = new Sentinel({ apiKey: "test-key" }).localAnalyze(messages);
    const sentinel = new Sentinel({
      apiKey: "test-key",
      telemetry: true,
      shadowClassifier: "bundled",
    });
    expect(sentinel.localAnalyze(messages)).toEqual(baseline);
    await sentinel.flushTelemetry();

    const payload = JSON.parse(body);
    expect(Object.keys(payload.shadow.models)).toEqual([
      "sentinel-linear-sv2-reviewed-185",
    ]);
    expect(
      payload.shadow.models["sentinel-linear-sv2-reviewed-185"].featureSchemaVersion,
    ).toBe(2);
  });
});

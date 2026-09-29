import { afterEach, describe, expect, it, vi } from "vitest";
import { injectFullDataset } from "../../benchmark/full-dataset.js";
import { Engine } from "../analyzer/engine.js";
import { Sentinel } from "./sentinel.js";
import {
  conversationKey,
  deserializeRiskMemory,
  serializeRiskMemory,
} from "./risk-memory.js";
import type { TemporalMemoryState } from "../types/SentinelEngine.js";

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_750_000_000_000;
const SECRET = "0123456789abcdef0123456789abcdef";

afterEach(() => vi.restoreAllMocks());

describe("memoria longitudinal privada", () => {
  it("conserva la cadena temporal entre motores sin conservar conversaciones", () => {
    let memory: TemporalMemoryState | undefined;

    const contact = new Engine();
    injectFullDataset(contact);
    contact.analyze([{ text: "hola, qué haces", timestamp: T0 }], {
      temporalMemoryObserver: (next) => { memory = next; },
    });

    const hook = new Engine();
    injectFullDataset(hook);
    hook.analyze([{ text: "hay una chambita por si te interesa", timestamp: T0 + 3 * DAY }], {
      temporalMemory: memory,
      temporalMemoryObserver: (next) => { memory = next; },
    });

    const isolation = new Engine();
    injectFullDataset(isolation);
    const result = isolation.analyze(
      [{ text: "primero dime, cuántos años tienes?", timestamp: T0 + 6 * DAY }],
      { temporalMemory: memory },
    );

    expect(result.layers.temporal.stagesPresent).toEqual([
      "CONTACTO",
      "ENGANCHE",
      "AISLAMIENTO",
    ]);
    expect(result.layers.temporal.triggeredRules).toContain("TCR-001");
    expect(result.risk).not.toBe("LOW");
  });

  it("pseudonimiza la sesión, autentica el snapshot y nunca serializa texto o usuario", async () => {
    const sessionId = "chat-menor-privado-991";
    const userId = "usuario-real-123";
    const messageText = "nadie tiene que saber lo que hablamos";
    const key = await conversationKey(SECRET, sessionId);
    const entries = new Map<string, TemporalMemoryState>([[key, {
      schemaVersion: 1,
      updatedAt: T0,
      stages: {
        AISLAMIENTO: {
          firstSeenAt: T0,
          lastSeenAt: T0,
          activeDays: [Math.floor(T0 / DAY)],
        },
      },
    }]]);
    const serialized = await serializeRiskMemory(entries, SECRET, 30, T0);

    expect(serialized).not.toContain(sessionId);
    expect(serialized).not.toContain(userId);
    expect(serialized).not.toContain(messageText);
    expect(serialized).not.toContain("nadie tiene que saber");
    const restored = await deserializeRiskMemory(serialized, SECRET, 30, 5_000, T0 + DAY);
    expect(restored.get(key)?.stages.AISLAMIENTO?.activeDays).toHaveLength(1);

    const tampered = serialized.replace('"updatedAt":1750000000000', '"updatedAt":1750000000001');
    await expect(
      deserializeRiskMemory(tampered, SECRET, 30, 5_000, T0 + DAY),
    ).rejects.toThrow(/authentication/);
    await expect(
      deserializeRiskMemory(serialized, `${SECRET}x`, 30, 5_000, T0 + DAY),
    ).rejects.toThrow(/authentication/);
  });

  it("expone persistencia segura opt-in en Sentinel y rechaza snapshots alterados", async () => {
    vi.spyOn(Date, "now").mockReturnValue(T0);
    const first = new Sentinel({ apiKey: "test", riskMemory: { secret: SECRET } });
    const analyzed = await first.analyze("hay un jale para ti", "sesion-super-secreta", "reclutador-7");
    expect(analyzed.error).toBeNull();
    const snapshot = await first.exportRiskMemory();
    expect(snapshot).not.toContain("hay un jale para ti");
    expect(snapshot).not.toContain("sesion-super-secreta");
    expect(snapshot).not.toContain("reclutador-7");

    const second = new Sentinel({ apiKey: "test", riskMemory: { secret: SECRET } });
    expect(await second.importRiskMemory(snapshot)).toBe(true);
    const parsed = JSON.parse(snapshot);
    parsed.body.entries[0].memory.updatedAt += 1;
    expect(await second.importRiskMemory(JSON.stringify(parsed))).toBe(false);
  });
});

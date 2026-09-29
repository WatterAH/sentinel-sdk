import type { TemporalMemoryState, TemporalStage } from "../types/SentinelEngine.js";

const encoder = new TextEncoder();
const STAGES: TemporalStage[] = ["CONTACTO", "ENGANCHE", "AISLAMIENTO", "LOGISTICA"];
const DAY = 24 * 60 * 60 * 1000;

export interface RiskMemorySnapshotBody {
  format: "sentinel.risk-memory.v1";
  generatedAt: number;
  expiresAt: number;
  entries: Array<{ conversationKey: string; memory: TemporalMemoryState }>;
}

interface RiskMemoryEnvelope {
  algorithm: "HMAC-SHA-256";
  body: RiskMemorySnapshotBody;
  authenticationTag: string;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function fromBase64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function canonicalBody(body: RiskMemorySnapshotBody): string {
  return JSON.stringify({
    entries: body.entries
      .map((entry) => ({
        conversationKey: entry.conversationKey,
        memory: {
          schemaVersion: 1,
          stages: Object.fromEntries(
            STAGES.flatMap((stage) => {
              const value = entry.memory.stages[stage];
              return value
                ? [[stage, {
                    activeDays: [...value.activeDays].sort((left, right) => left - right),
                    firstSeenAt: value.firstSeenAt,
                    lastSeenAt: value.lastSeenAt,
                  }]]
                : [];
            }),
          ),
          updatedAt: entry.memory.updatedAt,
        },
      }))
      .sort((left, right) => left.conversationKey.localeCompare(right.conversationKey)),
    expiresAt: body.expiresAt,
    format: body.format,
    generatedAt: body.generatedAt,
  });
}

function validMemory(value: unknown, cutoff: number, now: number): value is TemporalMemoryState {
  if (typeof value !== "object" || value === null) return false;
  const memory = value as Record<string, unknown>;
  if (memory.schemaVersion !== 1 || typeof memory.updatedAt !== "number") return false;
  if (memory.updatedAt < cutoff || memory.updatedAt > now + DAY) return false;
  if (typeof memory.stages !== "object" || memory.stages === null) return false;
  const stages = memory.stages as Record<string, unknown>;
  if (Object.keys(stages).some((stage) => !STAGES.includes(stage as TemporalStage))) return false;
  return Object.values(stages).every((raw) => {
    if (typeof raw !== "object" || raw === null) return false;
    const observation = raw as Record<string, unknown>;
    return (
      typeof observation.firstSeenAt === "number" &&
      typeof observation.lastSeenAt === "number" &&
      observation.firstSeenAt <= observation.lastSeenAt &&
      observation.firstSeenAt >= cutoff &&
      observation.lastSeenAt <= now + DAY &&
      Array.isArray(observation.activeDays) &&
      observation.activeDays.length <= 32 &&
      observation.activeDays.every((day) => Number.isInteger(day))
    );
  });
}

export async function conversationKey(secret: string, sessionId: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await key(secret),
    encoder.encode(`sentinel-risk-memory:conversation:${sessionId}`),
  );
  return base64url(new Uint8Array(signature));
}

export function pruneMemory(
  memory: TemporalMemoryState,
  cutoff: number,
): TemporalMemoryState | null {
  const cutoffDay = Math.floor(cutoff / DAY);
  const stages: TemporalMemoryState["stages"] = {};
  for (const stage of STAGES) {
    const value = memory.stages[stage];
    if (!value || value.lastSeenAt < cutoff) continue;
    const activeDays = value.activeDays.filter((day) => day >= cutoffDay).slice(-32);
    if (activeDays.length === 0) continue;
    stages[stage] = {
      // Si la primera señal expiró, la nueva primera aparición es la primera
      // actividad aún retenida, no el borde artificial de la ventana.
      firstSeenAt: Math.max(value.firstSeenAt, cutoff, activeDays[0] * DAY),
      lastSeenAt: value.lastSeenAt,
      activeDays,
    };
  }
  if (Object.keys(stages).length === 0) return null;
  return { schemaVersion: 1, updatedAt: memory.updatedAt, stages };
}

export async function serializeRiskMemory(
  entries: Map<string, TemporalMemoryState>,
  secret: string,
  retentionDays: number,
  now = Date.now(),
): Promise<string> {
  const cutoff = now - retentionDays * DAY;
  const body: RiskMemorySnapshotBody = {
    format: "sentinel.risk-memory.v1",
    generatedAt: now,
    expiresAt: now + retentionDays * DAY,
    entries: [...entries.entries()].flatMap(([conversationKey, memory]) => {
      const pruned = pruneMemory(memory, cutoff);
      return pruned ? [{ conversationKey, memory: pruned }] : [];
    }),
  };
  const tag = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(canonicalBody(body)));
  const envelope: RiskMemoryEnvelope = {
    algorithm: "HMAC-SHA-256",
    body,
    authenticationTag: base64url(new Uint8Array(tag)),
  };
  return JSON.stringify(envelope);
}

export async function deserializeRiskMemory(
  serialized: string,
  secret: string,
  retentionDays: number,
  maxConversations: number,
  now = Date.now(),
): Promise<Map<string, TemporalMemoryState>> {
  const envelope = JSON.parse(serialized) as RiskMemoryEnvelope;
  if (
    envelope.algorithm !== "HMAC-SHA-256" ||
    envelope.body?.format !== "sentinel.risk-memory.v1" ||
    !Array.isArray(envelope.body.entries) ||
    typeof envelope.body.generatedAt !== "number" ||
    typeof envelope.body.expiresAt !== "number" ||
    envelope.body.expiresAt < now ||
    envelope.body.generatedAt > now + DAY ||
    !/^[A-Za-z0-9_-]{43}$/u.test(envelope.authenticationTag)
  ) {
    throw new Error("Invalid or expired risk-memory envelope");
  }
  const authenticated = await crypto.subtle.verify(
    "HMAC",
    await key(secret),
    fromBase64url(envelope.authenticationTag).buffer as ArrayBuffer,
    encoder.encode(canonicalBody(envelope.body)),
  );
  if (!authenticated) throw new Error("Risk-memory authentication failed");

  const cutoff = now - retentionDays * DAY;
  const result = new Map<string, TemporalMemoryState>();
  for (const entry of envelope.body.entries.slice(0, maxConversations)) {
    if (
      typeof entry?.conversationKey !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/u.test(entry.conversationKey) ||
      !validMemory(entry.memory, cutoff, now)
    ) continue;
    const pruned = pruneMemory(entry.memory, cutoff);
    if (pruned) result.set(entry.conversationKey, pruned);
  }
  return result;
}

import type {
  ArtifactVerificationConfig,
  ArtifactVerificationStatus,
} from "../types/SentinelConfig.js";

export interface ArtifactEnvelope {
  algorithm: "Ed25519";
  format: "sentinel.envelope.v1";
  keyId: string;
  payload: string;
  signature: string;
}

export interface ArtifactBody<T = unknown> {
  artifactId: string;
  expiresAt: number;
  format: "sentinel.artifact.v1";
  issuedAt: number;
  kind: "region_pack" | "shadow_model";
  payload: T;
  version: string;
}

export class ArtifactVerificationError extends Error {
  constructor(
    message: string,
    readonly state: ArtifactVerificationStatus["state"] = "invalid_rejected",
  ) {
    super(message);
    this.name = "ArtifactVerificationError";
  }
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ArtifactVerificationError("Artifact contains invalid base64url");
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(-value.length & 3);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new ArtifactVerificationError("Artifact contains malformed base64url");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isEnvelope(value: unknown): value is ArtifactEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const envelope = value as Record<string, unknown>;
  return (
    envelope.algorithm === "Ed25519" &&
    envelope.format === "sentinel.envelope.v1" &&
    typeof envelope.keyId === "string" &&
    typeof envelope.payload === "string" &&
    typeof envelope.signature === "string"
  );
}

function parseBody<T>(payloadBytes: Uint8Array): ArtifactBody<T> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    throw new ArtifactVerificationError("Signed artifact payload is not valid JSON");
  }
  if (typeof value !== "object" || value === null) {
    throw new ArtifactVerificationError("Signed artifact payload must be an object");
  }
  const body = value as Record<string, unknown>;
  if (
    body.format !== "sentinel.artifact.v1" ||
    !["region_pack", "shadow_model"].includes(String(body.kind)) ||
    typeof body.artifactId !== "string" ||
    typeof body.version !== "string" ||
    typeof body.issuedAt !== "number" ||
    typeof body.expiresAt !== "number" ||
    !("payload" in body)
  ) {
    throw new ArtifactVerificationError("Signed artifact payload has an invalid contract");
  }
  return value as ArtifactBody<T>;
}

export async function verifyArtifact<T>(
  value: unknown,
  config: ArtifactVerificationConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ body: ArtifactBody<T>; keyId: string }> {
  if (!isEnvelope(value)) {
    throw new ArtifactVerificationError(
      "Signed artifact envelope is missing",
      "unsigned_rejected",
    );
  }
  const publicKeyValue = config.publicKeys[value.keyId];
  if (!publicKeyValue) {
    throw new ArtifactVerificationError(`Untrusted artifact keyId: ${value.keyId}`);
  }
  const publicKeyBytes = decodeBase64Url(publicKeyValue);
  if (publicKeyBytes.length !== 32) {
    throw new ArtifactVerificationError("Ed25519 public keys must contain 32 bytes");
  }
  const payloadBytes = decodeBase64Url(value.payload);
  const signatureBytes = decodeBase64Url(value.signature);
  if (signatureBytes.length !== 64) {
    throw new ArtifactVerificationError("Ed25519 signatures must contain 64 bytes");
  }

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "raw",
      publicKeyBytes as BufferSource,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
  } catch {
    throw new ArtifactVerificationError("This runtime cannot import Ed25519 keys");
  }
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    signatureBytes as BufferSource,
    payloadBytes as BufferSource,
  );
  if (!valid) throw new ArtifactVerificationError("Artifact signature is invalid");

  const body = parseBody<T>(payloadBytes);
  const clockSkew = config.maxClockSkewSeconds ?? 300;
  if (body.issuedAt > nowSeconds + clockSkew) {
    throw new ArtifactVerificationError("Artifact was issued in the future");
  }
  if (body.expiresAt <= nowSeconds) {
    throw new ArtifactVerificationError("Artifact has expired", "expired_rejected");
  }
  if (body.expiresAt <= body.issuedAt) {
    throw new ArtifactVerificationError("Artifact expiry precedes its issue time");
  }
  return { body, keyId: value.keyId };
}

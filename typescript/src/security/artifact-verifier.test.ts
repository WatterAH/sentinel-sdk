import { afterEach, describe, expect, it, vi } from "vitest";
import { Sentinel } from "../core/sentinel.js";
import modelJson from "../analyzer/shadow-model-v2.json" with { type: "json" };
import type { ArtifactVerificationConfig } from "../types/SentinelConfig.js";
import {
  type ArtifactVerificationError,
  type ArtifactBody,
  type ArtifactEnvelope,
  verifyArtifact,
} from "./artifact-verifier.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function b64url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function keyPair(): Promise<{
  privateKey: CryptoKey;
  publicKey: string;
}> {
  const pair = (await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { privateKey: pair.privateKey, publicKey: b64url(raw) };
}

async function envelope<T>(
  privateKey: CryptoKey,
  body: ArtifactBody<T>,
  keyId = "rotation-2026-b",
): Promise<ArtifactEnvelope> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(body));
  const signature = new Uint8Array(
    await crypto.subtle.sign("Ed25519", privateKey, payloadBytes as BufferSource),
  );
  return {
    algorithm: "Ed25519",
    format: "sentinel.envelope.v1",
    keyId,
    payload: b64url(payloadBytes),
    signature: b64url(signature),
  };
}

function packBody(
  datasetVersion: number,
  terms: Array<Record<string, unknown>>,
  issuedAt = 1_800_000_000,
): ArtifactBody<Record<string, unknown>> {
  return {
    artifactId: "MX",
    expiresAt: issuedAt + 3_600,
    format: "sentinel.artifact.v1",
    issuedAt,
    kind: "region_pack",
    payload: {
      basePackVersion: "3.0.0",
      datasetVersion,
      terms,
    },
    version: `3.0.0+dynamic.${datasetVersion}`,
  };
}

describe("artefactos firmados Ed25519", () => {
  it("acepta rotación por keyId y rechaza cualquier alteración", async () => {
    const oldKey = await keyPair();
    const currentKey = await keyPair();
    const body = packBody(7, []);
    const signed = await envelope(currentKey.privateKey, body);
    const config: ArtifactVerificationConfig = {
      publicKeys: {
        "rotation-2026-a": oldKey.publicKey,
        "rotation-2026-b": currentKey.publicKey,
      },
    };

    const result = await verifyArtifact(signed, config, body.issuedAt + 1);
    expect(result.body.version).toBe("3.0.0+dynamic.7");
    expect(result.keyId).toBe("rotation-2026-b");

    const tampered = {
      ...signed,
      payload: `${signed.payload.slice(0, -1)}${signed.payload.endsWith("A") ? "B" : "A"}`,
    };
    await expect(verifyArtifact(tampered, config, body.issuedAt + 1)).rejects.toThrow(
      "signature is invalid",
    );
  });

  it("rechaza artefactos expirados incluso con firma válida", async () => {
    const key = await keyPair();
    const body = packBody(4, [], 1_700_000_000);
    const signed = await envelope(key.privateKey, body);
    await expect(
      verifyArtifact(signed, { publicKeys: { "rotation-2026-b": key.publicKey } }, 1_800_000_000),
    ).rejects.toMatchObject({
      state: "expired_rejected",
    } satisfies Partial<ArtifactVerificationError>);
  });

  it("Sentinel inyecta el pack verificado y bloquea rollback", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_100_000);
    const key = await keyPair();
    const current = await envelope(
      key.privateKey,
      packBody(7, [
        {
          id: "REC-023",
          term: "zancudo",
          variants: [],
          category: "slang_operativo",
          weight: 9,
        },
      ]),
    );
    const rollback = await envelope(
      key.privateKey,
      packBody(6, [
        {
          id: "TEST-ROLLBACK",
          term: "terminoretroceso",
          variants: [],
          category: "reclutamiento",
          weight: 9,
        },
      ]),
    );
    const responses = [current, rollback];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ artifact: responses.shift(), data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const sentinel = new Sentinel({
      apiKey: "client-key",
      baseUrl: "https://api.example.test/api/v1",
      artifactVerification: {
        publicKeys: { "rotation-2026-b": key.publicKey },
      },
    });

    await sentinel.initialize();
    expect(sentinel.getArtifactVerificationStatus().state).toBe("verified");
    expect(sentinel.localAnalyze([{ text: "zancudo" }]).data?.layers.v3.terms).toContain(
      "REC-023",
    );

    await sentinel.initialize();
    expect(sentinel.getArtifactVerificationStatus().state).toBe("rollback_rejected");
    expect(
      sentinel.localAnalyze([{ text: "terminoretroceso" }]).data?.layers.v3.terms,
    ).not.toContain("TEST-ROLLBACK");
  });

  it("falla cerrado cuando la firma es obligatoria y la API responde legacy", async () => {
    const key = await keyPair();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "TEST-UNSIGNED",
                term: "terminosinfirma",
                category: "reclutamiento",
                weight: 9,
                variants: [],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const sentinel = new Sentinel({
      apiKey: "client-key",
      artifactVerification: {
        publicKeys: { "rotation-2026-b": key.publicKey },
      },
    });
    await sentinel.initialize();
    expect(sentinel.getArtifactVerificationStatus().state).toBe("unsigned_rejected");
    expect(sentinel.localAnalyze([{ text: "terminosinfirma" }]).data?.layers.v3.terms).not.toContain(
      "TEST-UNSIGNED",
    );
  });

  it("carga un modelo remoto firmado sin alterar el veredicto", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_100_000);
    const key = await keyPair();
    const pack = await envelope(key.privateKey, packBody(9, []));
    const model = await envelope(key.privateKey, {
      artifactId: "shadow-classifier",
      expiresAt: 1_800_003_600,
      format: "sentinel.artifact.v1",
      issuedAt: 1_800_000_000,
      kind: "shadow_model",
      payload: { releaseVersion: 3, model: modelJson },
      version: "release.3",
    });
    const responses = [pack, model];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ artifact: responses.shift(), data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const messages = [{ text: "párate en la esquina y dime quién pasa" }];
    const baseline = new Sentinel({ apiKey: "test-key" }).localAnalyze(messages);
    const sentinel = new Sentinel({
      apiKey: "test-key",
      shadowClassifier: "remote",
      artifactVerification: {
        publicKeys: { "rotation-2026-b": key.publicKey },
      },
    });
    await sentinel.initialize();

    expect(sentinel.getArtifactVerificationStatus("region_pack").state).toBe("verified");
    expect(sentinel.getArtifactVerificationStatus("shadow_model")).toMatchObject({
      state: "verified",
      version: "release.3",
    });
    expect(sentinel.localAnalyze(messages)).toEqual(baseline);
  });
});

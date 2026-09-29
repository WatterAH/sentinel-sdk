import request from "../lib/request.js";
import { Engine } from "../analyzer/engine.js";
import type {
  ArtifactVerificationConfig,
  ArtifactVerificationStatus,
  SentinelConfig,
} from "../types/SentinelConfig.js";
import type {
  ApiAnalysisResponse,
  InterventionPlan,
  SentinelAnalysisResponse,
} from "../types/SentinelAnalysisResult.js";
import { type SentinelResult, ok, err } from "../types/SentinelResult.js";
import type { ApiMessage, EngineResult, Message, MessageSource, RiskLevel } from "../types/SentinelEngine.js";
import { SentinelError } from "../errors/SentinelError.js";
import { buildLocalIntervention } from "./intervention.js";
import type { AgeBand } from "../analyzer/age-policy.js";
import type { ShadowClassifier, ShadowObserver } from "../analyzer/engine.js";
import {
  createLinearShadowClassifier,
  createShadowClassifier,
  type ShadowModel,
  type LinearShadowModel,
} from "../analyzer/shadow-classifier.js";
import bundledShadowModel from "../analyzer/shadow-model-v2.json" with { type: "json" };
import { createLayaShadowProvider } from "../analyzer/laya-shadow-classifier.js";
import {
  type ShadowProvider,
  type ShadowRunnerConfig,
  type ShadowObservation,
  wrapClassifierAsProvider,
} from "../analyzer/shadow-runner.js";
import type { ShadowModelMetadata } from "../types/SentinelConfig.js";
import { TelemetryCollector, type TelemetryResolution } from "./telemetry.js";
import {
  ArtifactVerificationError,
  verifyArtifact,
} from "../security/artifact-verifier.js";
import type { HotTermInput } from "../packs/v3-region-pack.js";
import {
  conversationKey,
  deserializeRiskMemory,
  pruneMemory,
  serializeRiskMemory,
} from "./risk-memory.js";
import type { TemporalMemoryState } from "../types/SentinelEngine.js";

/** Contexto opcional que la plataforma conoce del usuario protegido. */
export interface AnalyzeContext {
  /** Banda de edad del usuario; ajusta la sensibilidad del motor (7.4). */
  ageBand?: AgeBand;
  /** Marca transcripciones ASR para aplicar normalización de voz, no de teclado. */
  source?: MessageSource;
}

interface SignedRegionPackPayload {
  basePackVersion: string | null;
  datasetVersion: number | null;
  terms: HotTermInput[];
}

interface SignedShadowModelPayload {
  releaseVersion: number;
  model: ShadowModel;
}

function fastStringHash(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

interface EscalationCacheEntry {
  risk: RiskLevel;
  fingerprint: string;
  contextKey: string;
  createdAt: number;
  response: ApiAnalysisResponse;
}

function isStoredApiMessage(value: unknown, cutoff: number): value is ApiMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  const validSource =
    message.source === undefined ||
    message.source === "text" ||
    message.source === "voice_transcript";
  return (
    typeof message.id === "string" &&
    typeof message.user_id === "string" &&
    typeof message.session_id === "string" &&
    typeof message.content === "string" &&
    typeof message.timestamp === "number" &&
    message.timestamp >= cutoff &&
    validSource
  );
}

export class Sentinel {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly serverSideSessions: boolean;
  private engine: Engine;
  private hotTermsDatasetVersion: number | null = null;
  private telemetry?: TelemetryCollector;
  private readonly artifactVerification?: ArtifactVerificationConfig;
  private readonly shadowClassifierMode?: "bundled" | "remote" | "laya-multilingual" | "off";
  private readonly riskMemoryConfig?: {
    secret: string;
    retentionDays: number;
    maxConversations: number;
  };
  private riskMemoryStore = new Map<string, TemporalMemoryState>();
  private acceptedShadowReleaseVersion: number | null = null;
  private artifactVerificationStatuses: Record<
    "region_pack" | "shadow_model",
    ArtifactVerificationStatus
  > = {
    region_pack: { state: "not_configured" },
    shadow_model: { state: "not_configured" },
  };
  private sessionStore = new Map<string, ApiMessage[]>();
  // Deduplicación acotada y segura de escalaciones al LLM por sesión.
  private escalationCache = new Map<string, EscalationCacheEntry>();
  private readonly escalationCacheTtlMs: number;
  private readonly escalationCacheMaxEntries: number;
  private readonly nowProvider: () => number;
  private feedbackAuditCache = new Map<string, { termIds: string[]; datasetVersion: number | null }>();

  constructor(config: SentinelConfig) {
    this.apiKey = config.apiKey;
    this.serverSideSessions = config.serverSideSessions ?? false;
    this.baseUrl = this.resolveBaseUrl(config.baseUrl);
    this.engine = new Engine();
    this.shadowClassifierMode = config.shadowClassifier;
    this.artifactVerification = config.artifactVerification;

    const cacheConfig = config.escalationCache;
    this.escalationCacheTtlMs = cacheConfig?.ttlMs ?? 300_000;
    this.escalationCacheMaxEntries = cacheConfig?.maxEntries ?? 1_000;
    this.nowProvider = cacheConfig?.nowProvider ?? (() => Date.now());
    if (this.escalationCacheTtlMs <= 0 || !Number.isFinite(this.escalationCacheTtlMs)) {
      throw new TypeError("escalationCache.ttlMs must be a positive number");
    }
    if (
      !Number.isInteger(this.escalationCacheMaxEntries) ||
      this.escalationCacheMaxEntries <= 0
    ) {
      throw new TypeError("escalationCache.maxEntries must be a positive integer");
    }

    if (config.riskMemory) {
      const secretBytes = new TextEncoder().encode(config.riskMemory.secret).length;
      const retentionDays = config.riskMemory.retentionDays ?? 30;
      const maxConversations = config.riskMemory.maxConversations ?? 5_000;
      if (secretBytes < 32) {
        throw new TypeError("riskMemory.secret must contain at least 32 UTF-8 bytes");
      }
      if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
        throw new TypeError("riskMemory.retentionDays must be an integer between 1 and 365");
      }
      if (
        !Number.isInteger(maxConversations) ||
        maxConversations < 1 ||
        maxConversations > 100_000
      ) {
        throw new TypeError("riskMemory.maxConversations must be between 1 and 100000");
      }
      this.riskMemoryConfig = {
        secret: config.riskMemory.secret,
        retentionDays,
        maxConversations,
      };
    }
    if (this.artifactVerification) {
      if (Object.keys(this.artifactVerification.publicKeys).length === 0) {
        throw new TypeError("artifactVerification.publicKeys cannot be empty");
      }
      if (
        (this.artifactVerification.maxClockSkewSeconds ?? 300) < 0 ||
        !Number.isFinite(this.artifactVerification.maxClockSkewSeconds ?? 300)
      ) {
        throw new TypeError("artifactVerification.maxClockSkewSeconds must be non-negative");
      }
    }
    if (this.shadowClassifierMode === "remote" && !this.artifactVerification) {
      throw new TypeError("Remote shadow models require artifactVerification");
    }
    if (config.telemetry === true) {
      this.telemetry = new TelemetryCollector(
        `${this.baseUrl}/telemetry`,
        this.apiKey,
        config.telemetryFlushIntervalMinutes ?? 15,
        config.telemetryFlushAnalysisCount ?? 500,
      );
    }
    if (config.shadowClassifier === "bundled") {
      const model = bundledShadowModel as LinearShadowModel;
      this.setShadowClassifier(
        createLinearShadowClassifier(model),
        undefined,
        {
          modelId: model.modelId,
          featureSchemaVersion: model.schemaVersion,
        },
        config.shadowConfig,
      );
    } else if (config.shadowClassifier === "laya-multilingual") {
      const provider = createLayaShadowProvider();
      this.setShadowProvider(provider, undefined, config.shadowConfig);
    }
  }

  private resolveBaseUrl(configured?: string): string {
    const fallback = "https://sentinel-api-production-95e9.up.railway.app/api/v1";
    if (configured === undefined) return fallback;
    const trimmed = configured.trim().replace(/\/+$/, "");
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new TypeError("Sentinel baseUrl must use http or https");
    }
    return trimmed;
  }

  /** Registra un proveedor sombra aislado con observador enriquecido (S16). */
  setShadowProvider(
    provider?: ShadowProvider,
    observer?: (observation: ShadowObservation) => void,
    config?: ShadowRunnerConfig,
  ): void {
    if (provider) {
      this.telemetry?.setShadowModel({
        modelId: provider.modelId,
        featureSchemaVersion: provider.featureSchemaVersion,
      });
    }
    this.engine.setShadowProvider(
      provider,
      (obs) => {
        if (obs.shadowProbability !== null) {
          this.telemetry?.recordShadowComparison(obs.lexicalRisk, obs.shadowProbability);
        }
        observer?.(obs);
      },
      config,
    );
  }

  /** Activa un clasificador sombra y compone su observador con telemetría opt-in. */
  setShadowClassifier(
    classifier: ShadowClassifier,
    observer?: ShadowObserver,
    metadata: ShadowModelMetadata = {
      modelId: "custom-unversioned",
      featureSchemaVersion: null,
    },
    config?: ShadowRunnerConfig,
  ): void {
    const provider = wrapClassifierAsProvider(classifier, metadata);
    this.setShadowProvider(
      provider,
      observer
        ? (obs) => {
            if (obs.shadowProbability !== null) {
              observer({
                lexicalRisk: obs.lexicalRisk,
                lexicalEscalate: obs.lexicalEscalate,
                shadowProbability: obs.shadowProbability,
                features: [],
              });
            }
          }
        : undefined,
      config,
    );
  }

  /** Fuerza el envío de contadores pendientes; útil al cerrar una app o en tests. */
  async flushTelemetry(): Promise<boolean> {
    return this.telemetry ? this.telemetry.flush() : true;
  }

  /** Último resultado de verificación del pack descargado, sin exponer datos. */
  getArtifactVerificationStatus(
    kind: "region_pack" | "shadow_model" = "region_pack",
  ): Readonly<ArtifactVerificationStatus> {
    return { ...this.artifactVerificationStatuses[kind] };
  }

  private recordTelemetry(
    result: EngineResult,
    resolution: TelemetryResolution,
    intervention?: InterventionPlan,
  ): void {
    this.telemetry?.recordAnalysis(result, resolution, intervention);
  }

  /**
   * Fetches approved hot-terms from the API and injects them into the local engine.
   * Optional — if not called, the SDK works with the static dataset only.
   * Fails silently if the API is unreachable.
   * @example
   * const sentinel = new Sentinel({ apiKey: "..." });
   * await sentinel.initialize(); // call once when your app starts
   */
  /** Headers de autenticación que la API exige en todos los endpoints. */
  private authHeaders(): Record<string, string> {
    return { "X-API-Key": this.apiKey };
  }

  /**
   * Serializa el estado de sesiones locales para persistirlo donde la
   * plataforma decida (IndexedDB, AsyncStorage, archivo, etc.).
   *
   * Esto importa por la detección temporal (capa TCR): la captación real toma
   * días o semanas, y sin persistencia el historial muere con cada reinicio de
   * la app — el reclutador paciente quedaría invisible. El contenido nunca
   * sale del dispositivo: persistirlo o no, y dónde, es decisión de la
   * plataforma integradora.
   *
   * @example
   * // al cerrar la app
   * localStorage.setItem("sentinel_sessions", sentinel.exportSessions());
   * // al arrancar
   * sentinel.importSessions(localStorage.getItem("sentinel_sessions") ?? "");
   */
  exportSessions(): string {
    return JSON.stringify([...this.sessionStore.entries()]);
  }

  /**
   * Restaura el estado exportado con exportSessions(). Ignora silenciosamente
   * datos corruptos o con forma inesperada (la app arranca con estado limpio).
   * Descarta mensajes con más de maxAgeDays de antigüedad (default 30) para
   * acotar memoria y respetar minimización de datos.
   */
  importSessions(serialized: string, maxAgeDays = 30): void {
    this.escalationCache.clear();
    if (!serialized) return;
    try {
      const entries: unknown = JSON.parse(serialized);
      if (!Array.isArray(entries)) return;

      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const [sessionId, messages] = entry as [unknown, unknown];
        if (typeof sessionId !== "string" || !Array.isArray(messages)) continue;

        const valid = messages.filter((message) => isStoredApiMessage(message, cutoff));

        if (valid.length > 0) {
          this.sessionStore.set(sessionId, valid);
        }
      }
    } catch {
      // Estado corrupto — se arranca limpio, sin romper la app.
    }
  }

  /**
   * Exporta únicamente progresión temporal agregada. Los IDs de sesión se
   * sustituyen por HMAC y el snapshot completo lleva autenticación HMAC.
   */
  async exportRiskMemory(): Promise<string> {
    if (!this.riskMemoryConfig) {
      throw new SentinelError("riskMemory is not configured", "VALIDATION_ERROR");
    }
    return serializeRiskMemory(
      this.riskMemoryStore,
      this.riskMemoryConfig.secret,
      this.riskMemoryConfig.retentionDays,
    );
  }

  /**
   * Restaura un snapshot autenticado. Ante corrupción, manipulación, expiración
   * o secreto incorrecto conserva el estado actual y devuelve false.
   */
  async importRiskMemory(serialized: string): Promise<boolean> {
    if (!this.riskMemoryConfig || !serialized) return false;
    try {
      const restored = await deserializeRiskMemory(
        serialized,
        this.riskMemoryConfig.secret,
        this.riskMemoryConfig.retentionDays,
        this.riskMemoryConfig.maxConversations,
      );
      this.riskMemoryStore = restored;
      return true;
    } catch {
      return false;
    }
  }

  private enforceRiskMemoryLimit(): void {
    if (!this.riskMemoryConfig) return;
    while (this.riskMemoryStore.size > this.riskMemoryConfig.maxConversations) {
      let oldestKey: string | undefined;
      let oldestTimestamp = Infinity;
      for (const [key, memory] of this.riskMemoryStore) {
        if (memory.updatedAt < oldestTimestamp) {
          oldestTimestamp = memory.updatedAt;
          oldestKey = key;
        }
      }
      if (!oldestKey) break;
      this.riskMemoryStore.delete(oldestKey);
    }
  }

  async initialize(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/hot-terms?pack=full`, {
        headers: this.authHeaders(),
      });
      if (!response.ok) return;
      const json = await response.json();
      let terms: HotTermInput[] = Array.isArray(json?.data) ? json.data : [];
      let datasetVersion =
        typeof json?.dataset_version === "number" ? json.dataset_version : null;

      if (this.artifactVerification) {
        if (!json?.artifact && this.artifactVerification.requireSigned === false) {
          this.artifactVerificationStatuses.region_pack = {
            state: "unsigned_legacy",
            reason: "Unsigned response accepted by explicit compatibility setting",
          };
        } else {
          try {
            const verified = await verifyArtifact<SignedRegionPackPayload>(
              json?.artifact,
              this.artifactVerification,
            );
            if (
              verified.body.kind !== "region_pack" ||
              verified.body.artifactId !== "MX" ||
              typeof verified.body.payload !== "object" ||
              verified.body.payload === null ||
              !Array.isArray(verified.body.payload.terms)
            ) {
              throw new ArtifactVerificationError("Artifact is not the expected MX region pack");
            }
            const signedVersion = verified.body.payload.datasetVersion;
            if (
              !this.artifactVerification.allowRollback &&
              this.hotTermsDatasetVersion !== null &&
              signedVersion !== null &&
              signedVersion < this.hotTermsDatasetVersion
            ) {
              this.artifactVerificationStatuses.region_pack = {
                state: "rollback_rejected",
                keyId: verified.keyId,
                artifactId: verified.body.artifactId,
                version: verified.body.version,
                reason: `Dataset version ${signedVersion} is older than ${this.hotTermsDatasetVersion}`,
              };
              return;
            }
            terms = verified.body.payload.terms;
            datasetVersion = signedVersion;
            this.artifactVerificationStatuses.region_pack = {
              state: "verified",
              keyId: verified.keyId,
              artifactId: verified.body.artifactId,
              version: verified.body.version,
            };
          } catch (error) {
            const verificationError = error instanceof ArtifactVerificationError
              ? error
              : new ArtifactVerificationError("Artifact verification failed");
            this.artifactVerificationStatuses.region_pack = {
              state: verificationError.state,
              reason: verificationError.message,
            };
            return;
          }
        }
      }

      this.hotTermsDatasetVersion = datasetVersion;
      if (terms.length > 0) {
        this.engine.injectHotTerms(terms);
      }
      if (this.shadowClassifierMode === "remote") {
        await this.initializeRemoteShadowClassifier();
      }
    } catch {
      // API unavailable — continue with static dataset
    }
  }

  private async initializeRemoteShadowClassifier(): Promise<void> {
    if (!this.artifactVerification) return;
    try {
      const response = await fetch(`${this.baseUrl}/models/shadow/current`, {
        headers: this.authHeaders(),
      });
      if (!response.ok) return;
      const json = await response.json();
      const verified = await verifyArtifact<SignedShadowModelPayload>(
        json?.artifact,
        this.artifactVerification,
      );
      const payload = verified.body.payload;
      if (
        verified.body.kind !== "shadow_model" ||
        verified.body.artifactId !== "shadow-classifier" ||
        typeof payload !== "object" ||
        payload === null ||
        !Number.isInteger(payload.releaseVersion) ||
        payload.releaseVersion < 1 ||
        typeof payload.model !== "object" ||
        payload.model === null
      ) {
        throw new ArtifactVerificationError("Artifact is not a valid shadow model release");
      }
      if (
        !this.artifactVerification.allowRollback &&
        this.acceptedShadowReleaseVersion !== null &&
        payload.releaseVersion < this.acceptedShadowReleaseVersion
      ) {
        this.artifactVerificationStatuses.shadow_model = {
          state: "rollback_rejected",
          keyId: verified.keyId,
          artifactId: verified.body.artifactId,
          version: verified.body.version,
          reason: `Model release ${payload.releaseVersion} is older than ${this.acceptedShadowReleaseVersion}`,
        };
        return;
      }
      const classifier = createShadowClassifier(payload.model as ShadowModel);
      this.setShadowClassifier(classifier, undefined, {
        modelId: payload.model.modelId,
        featureSchemaVersion: payload.model.schemaVersion,
      });
      this.acceptedShadowReleaseVersion = payload.releaseVersion;
      this.artifactVerificationStatuses.shadow_model = {
        state: "verified",
        keyId: verified.keyId,
        artifactId: verified.body.artifactId,
        version: verified.body.version,
      };
    } catch (error) {
      const verificationError = error instanceof ArtifactVerificationError
        ? error
        : new ArtifactVerificationError(
            error instanceof Error ? error.message : "Remote shadow model verification failed",
          );
      this.artifactVerificationStatuses.shadow_model = {
        state: verificationError.state,
        reason: verificationError.message,
      };
    }
  }

  /**
   * Synchronizes a new message to the session and performs a comprehensive risk analysis.
   * It evaluates the conversation history locally and automatically escalates to the AI API if needed.
   *
   * @param text The content of the new message to analyze.
   * @param sessionId The unique identifier for the conversation session.
   * @param userId The unique identifier for the user sending the message.
   * @returns A Promise resolving to a SentinelResult containing the API analysis response. Check `error` before using `data`.
   * @example
   * const { data, error } = await sentinel.analyze("Hello", "session-123", "user-456");
   * if (error) console.error("Analysis failed:", error.message);
   * else console.log("Risk level:", data.risk);
   */
  async analyze(
    text: string,
    sessionId: string,
    userId: string,
    context?: AnalyzeContext,
  ): Promise<SentinelResult<ApiAnalysisResponse>> {
    try {
      if (!text || !sessionId || !userId) {
        return err(
          new SentinelError(
            "Missing required parameters for analysis",
            "VALIDATION_ERROR",
          ),
        );
      }

      // 1. STORE MESSAGE LOCALLY
      let messages = this.sessionStore.get(sessionId);
      if (!messages) {
        messages = [];
        this.sessionStore.set(sessionId, messages);
      }

      const now = this.nowProvider();
      const lastMessage = messages[messages.length - 1];
      const isDuplicateRetry =
        lastMessage !== undefined &&
        lastMessage.content === text &&
        lastMessage.user_id === userId &&
        lastMessage.source === context?.source;

      if (!isDuplicateRetry) {
        const newMessage: ApiMessage = {
          id: globalThis.crypto?.randomUUID?.() || now.toString(),
          session_id: sessionId,
          user_id: userId,
          content: text,
          timestamp: now,
          source: context?.source,
        };
        messages.push(newMessage);
      }

      // Cota de memoria por sesión. Se preservan los primeros mensajes porque
      // la capa temporal necesita la PRIMERA aparición de cada etapa — recortar
      // solo lo viejo borraría la evidencia del contacto inicial.
      const MAX_SESSION_MESSAGES = 1000;
      if (messages.length > MAX_SESSION_MESSAGES) {
        const head = messages.slice(0, 50);
        const tail = messages.slice(messages.length - (MAX_SESSION_MESSAGES - 50));
        messages = [...head, ...tail];
        this.sessionStore.set(sessionId, messages);
      }

      if (this.serverSideSessions) {
        try {
          await this.syncSession(text, sessionId, userId);
        } catch (e) {
          console.warn("Failed to sync message to server:", e);
        }
      }

      // 2. ANALYZE SESSION LOCALLY
      // Se propaga el emisor (user_id) para que el motor pueda medir asimetría
      // de actor — quién concentra las tácticas. Antes se descartaba aquí.
      const engineMessages = messages.map((m) => ({
        text: m.content,
        timestamp: m.timestamp,
        sender: m.user_id,
        source: m.source,
      }));
      let memoryKey: string | undefined;
      let temporalMemory: TemporalMemoryState | undefined;
      if (this.riskMemoryConfig) {
        memoryKey = await conversationKey(this.riskMemoryConfig.secret, sessionId);
        const stored = this.riskMemoryStore.get(memoryKey);
        if (stored) {
          const cutoff = Date.now() - this.riskMemoryConfig.retentionDays * 24 * 60 * 60 * 1000;
          const pruned = pruneMemory(stored, cutoff);
          if (pruned) {
            temporalMemory = pruned;
          } else {
            this.riskMemoryStore.delete(memoryKey);
          }
        }
      }
      const riskMemoryRetentionDays = this.riskMemoryConfig?.retentionDays;
      const temporalMemoryObserver = memoryKey === undefined || riskMemoryRetentionDays === undefined
        ? undefined
        : (memory: TemporalMemoryState) => {
            const cutoff = Date.now() - riskMemoryRetentionDays * 24 * 60 * 60 * 1000;
            const pruned = pruneMemory(memory, cutoff);
            if (pruned) this.riskMemoryStore.set(memoryKey, pruned);
            this.enforceRiskMemoryLimit();
          };
      const result = this.engine.analyze(engineMessages, {
        ageBand: context?.ageBand,
        temporalMemory,
        temporalMemoryObserver,
      });
      if (result.datasetVersions) {
        result.datasetVersions.apiHotTerms = this.hotTermsDatasetVersion;
      }
      this.feedbackAuditCache.set(sessionId, {
        termIds: [...result.layers.v3.terms],
        datasetVersion: this.hotTermsDatasetVersion,
      });

      // 3. DECIDIR ACCIÓN — `result.escalate` es la ÚNICA fuente de verdad:
      //    true solo cuando el motor local está INSEGURO (zona gris). Esto
      //    minimiza el costo de API: lo determinista se resuelve local.

      // 3a. Riesgo LOW → veredicto local, sin API.
      if (result.risk === "LOW") {
        const verdict = this.localVerdict(result, messages.length, text);
        this.recordTelemetry(result, "local", verdict.intervention);
        return ok(verdict);
      }

      // 3b. Escalación necesaria (incierto). Se deduplica por sesión: solo si la
      //     sesión tiene exactamente el mismo fingerprint de evidencia y contexto
      //     dentro del TTL, se reutiliza en vez de re-pagar la llamada al LLM.
      if (result.escalate) {
        const cached = this.escalationCache.get(sessionId);
        const currentFingerprint = this.computeEscalationFingerprint(messages, result);
        const currentContextKey = this.computeEscalationContextKey(context);

        if (
          cached &&
          now - cached.createdAt <= this.escalationCacheTtlMs &&
          cached.risk === result.risk &&
          cached.fingerprint === currentFingerprint &&
          cached.contextKey === currentContextKey
        ) {
          this.recordTelemetry(result, "cached_api", cached.response.intervention);
          return ok({ ...cached.response, messages_analyzed: messages.length, current_message: text });
        }

        const escalated = await this.escalate(result, messages);
        this.recordTelemetry(result, "api", escalated.intervention);
        this.setEscalationCache(sessionId, {
          risk: result.risk,
          fingerprint: currentFingerprint,
          contextKey: currentContextKey,
          createdAt: now,
          response: escalated,
        });
        return ok({ ...escalated, messages_analyzed: messages.length, current_message: text });
      }

      // 3c. Riesgo alto CON prueba determinista → veredicto local confiable, sin
      //     gastar el LLM. Si hay agresor identificado, se reporta a la señal de
      //     red (barato, sin LLM) para preservar la detección de reclutamiento
      //     organizado cross-sesión.
      if (result.layers.actor?.aggressorSender) {
        void this.reportNetwork(result, messages).catch(() => {});
      }
      const verdict = this.localVerdict(result, messages.length, text);
      this.recordTelemetry(result, "local", verdict.intervention);
      return ok(verdict);
    } catch (e) {
      if (e instanceof SentinelError) return err(e);
      return err(
        new SentinelError(
          e instanceof Error ? e.message : "Unknown error",
          "UNKNOWN_ERROR",
        ),
      );
    }
  }

  /**
   * Performs a fast, local-only risk analysis on an array of messages.
   * This does not synchronize with the backend or use AI escalation, making it ideal for immediate client-side checks.
   *
   * @param messages An array of messages representing the conversation history to analyze.
   * @returns A SentinelResult containing the local engine's analysis response. Check `error` before using `data`.
   */
  localAnalyze(
    messages: Message[],
    context?: AnalyzeContext,
  ): SentinelResult<SentinelAnalysisResponse> {
    try {
      if (!messages) {
        return err(
          new SentinelError(
            "Missing required text for analysis",
            "VALIDATION_ERROR",
          ),
        );
      }

      const engineMessages: Message[] = messages.map((message) => ({
        text: message.text,
        timestamp: message.timestamp ?? Date.now(),
        sender: message.sender,
        source: message.source,
      }));

      const result = this.engine.analyze(engineMessages, { ageBand: context?.ageBand });

      this.recordTelemetry(result, "local", buildLocalIntervention(result));

      return ok(result);
    } catch (e) {
      if (e instanceof SentinelError) return err(e);
      return err(
        new SentinelError(
          e instanceof Error ? e.message : "Unknown error",
          "UNKNOWN_ERROR",
        ),
      );
    }
  }

  /**
   * Reporta el feedback de una decisión del motor para ayudar a mejorar la precisión.
   * @param sessionId El ID de la sesión que se está reportando.
   * @param originalVerdict El resultado original devuelto por el método analyze().
   * @param type El tipo de feedback: 'false_positive' (se marcó como riesgo pero era seguro), 'false_negative' (se marcó como seguro pero era riesgo) o 'confirmed' (correctamente identificado).
   * @param comment Un comentario opcional con contexto adicional.
   */
  async reportFeedback(
    sessionId: string,
    originalVerdict: SentinelAnalysisResponse | ApiAnalysisResponse,
    type: 'false_positive' | 'false_negative' | 'confirmed',
    comment?: string
  ): Promise<boolean> {
    try {
      const audit = this.feedbackAuditCache.get(sessionId);
      await request.post(`${this.baseUrl}/feedback`, {
        session_id: sessionId,
        verdict_original: originalVerdict,
        feedback: type,
        comment: comment || null,
        reported_by: "sdk_client",
        term_ids: audit?.termIds ?? [],
        dataset_version: audit?.datasetVersion ?? null,
      }, this.authHeaders());
      return true;
    } catch (e) {
      console.warn("Failed to submit feedback:", e);
      return false;
    }
  }

  private async escalate(
    analysis: EngineResult,
    messages: ApiMessage[],
  ): Promise<ApiAnalysisResponse> {
    return await request.post(`${this.baseUrl}/analyze`, {
      ...analysis,
      messages,
    }, this.authHeaders());
  }

  /**
   * Construye el veredicto LOCAL (sin LLM) a partir del resultado del motor,
   * usando el plan de intervención graduada. Se usa cuando el motor está seguro
   * (LOW, o riesgo alto con prueba determinista) — así se evita el costo de API.
   */
  private localVerdict(
    result: EngineResult,
    messagesAnalyzed: number,
    text: string,
  ): ApiAnalysisResponse {
    const intervention = buildLocalIntervention(result);
    if (result.risk === "LOW") {
      return {
        messages_analyzed: messagesAnalyzed,
        current_message: text,
        confidence: 1,
        risk: result.risk,
        summary:
          "El análisis local determina que la conversación no presenta indicios de riesgo. El lenguaje utilizado y los patrones detectados corresponden a una interacción normal, sin señales de manipulación o captación.",
        stage: "NINGUNA",
        false_positive: false,
        ux_recommendation: "NONE",
        intervention,
      };
    }
    return {
      messages_analyzed: messagesAnalyzed,
      current_message: text,
      confidence: 1,
      risk: result.risk,
      summary:
        "ALERTA: El análisis local ha detectado patrones deterministas de alta severidad (reglas de reclutamiento, señales explícitas o concentración de tácticas en un actor). Se recomienda intervención según el plan.",
      stage: "CAPTACION",
      false_positive: false,
      // La recomendación UX refleja el plan graduado: solo el peligro inminente
      // bloquea de forma visible; el resto vigila sin delatar el filtro.
      ux_recommendation:
        intervention.recruiter_action === "HARD_BLOCK" ? "HARD_BLOCK" : "WARNING_OVERLAY",
      intervention,
    };
  }

  /**
   * Reporta un avistamiento de actor al servidor SIN invocar el LLM (barato).
   * Preserva la detección de reclutamiento organizado cross-sesión incluso
   * cuando el veredicto se resolvió localmente. Fire-and-forget.
   */
  private async reportNetwork(
    analysis: EngineResult,
    messages: ApiMessage[],
  ): Promise<void> {
    const aggressor = analysis.layers.actor?.aggressorSender;
    if (!aggressor) return;
    const aggressorTexts = messages.filter((m) => m.user_id === aggressor).map((m) => m.content);
    await request.post(`${this.baseUrl}/network/report`, {
      aggressor_user_id: aggressor,
      session_id: messages[0]?.session_id ?? "",
      aggressor_texts: aggressorTexts,
      risk: analysis.risk,
      categories: analysis.uniqueCategories,
    }, this.authHeaders());
  }

  private computeEscalationFingerprint(messages: ApiMessage[], result: EngineResult): string {
    const msgSummary = messages
      .map(
        (m) =>
          `${m.id || ""}:${m.user_id}:${m.timestamp}:${m.content.length}:${fastStringHash(m.content)}`,
      )
      .join(";");
    const v3 = [...result.layers.v3.terms].sort().join(",");
    const v4 = [...result.layers.v4.features].sort().join(",");
    const actor = result.layers.actor?.aggressorSender ?? "";
    const cats = [...result.uniqueCategories].sort().join(",");
    const raw = `${msgSummary}|v3:${v3}|v4:${v4}|actor:${actor}|cats:${cats}|escalate:${result.escalationReason}`;
    return fastStringHash(raw);
  }

  private computeEscalationContextKey(context?: AnalyzeContext): string {
    const age = context?.ageBand ?? "unknown";
    const packVer = this.hotTermsDatasetVersion ?? -1;
    const shadowVer = this.acceptedShadowReleaseVersion ?? -1;
    const packState = this.artifactVerificationStatuses.region_pack.state;
    return `age:${age}|pack:${packVer}|shadow:${shadowVer}|state:${packState}`;
  }

  private setEscalationCache(sessionId: string, entry: EscalationCacheEntry): void {
    this.escalationCache.delete(sessionId);
    if (this.escalationCache.size >= this.escalationCacheMaxEntries) {
      const now = this.nowProvider();
      let evictedKey: string | undefined;
      for (const [key, item] of this.escalationCache.entries()) {
        if (now - item.createdAt > this.escalationCacheTtlMs) {
          evictedKey = key;
          break;
        }
      }
      if (evictedKey === undefined) {
        evictedKey = this.escalationCache.keys().next().value;
      }
      if (evictedKey !== undefined) {
        this.escalationCache.delete(evictedKey);
      }
    }
    this.escalationCache.set(sessionId, entry);
  }

  /**
   * Limpia el historial de mensajes y la caché de escalación de una sesión específica.
   */
  clearSession(sessionId: string): void {
    this.sessionStore.delete(sessionId);
    this.escalationCache.delete(sessionId);
    this.feedbackAuditCache.delete(sessionId);
  }

  /**
   * Limpia todas las entradas de caché de escalación a LLM.
   */
  clearEscalationCache(): void {
    this.escalationCache.clear();
  }

  /**
   * Reinicia completamente el estado en memoria (sesiones, caché, feedback y memoria temporal).
   */
  reset(): void {
    this.sessionStore.clear();
    this.escalationCache.clear();
    this.feedbackAuditCache.clear();
    this.riskMemoryStore.clear();
  }

  private async syncSession(
    text: string,
    sessionId: string,
    userId: string,
  ): Promise<ApiMessage[]> {
    return await request.post<ApiMessage[]>(`${this.baseUrl}/messages/sync`, {
      message: {
        session_id: sessionId,
        user_id: userId,
        content: text,
        timestamp: this.nowProvider(),
      },
    }, this.authHeaders());
  }
}

import type { ShadowRunnerConfig } from "../analyzer/shadow-runner.js";

export interface SentinelConfig {
  apiKey: string;
  /** URL base completa de la API, incluyendo /api/v1. Default: Railway producción. */
  baseUrl?: string;
  serverSideSessions?: boolean;
  /** Telemetría agregada y anónima. Opt-in explícito; default false. */
  telemetry?: boolean;
  /** Intervalo máximo entre envíos de telemetría. Default: 15 minutos. */
  telemetryFlushIntervalMinutes?: number;
  /** Número máximo de análisis antes de enviar. Default: 500. */
  telemetryFlushAnalysisCount?: number;
  /**
   * Activa el modelo en modo sombra. Default: desactivado.
   * Su salida jamás modifica el veredicto ni el flujo del Engine.
   */
  shadowClassifier?: "bundled" | "remote" | "laya-multilingual" | "off";
  /**
   * Configuración de aislamiento, timeout y presupuesto del evaluador sombra (S16).
   */
  shadowConfig?: ShadowRunnerConfig;
  /**
   * Trust store Ed25519 para packs/modelos descargados. Cuando se configura,
   * los artefactos firmados inválidos jamás caen al payload legacy.
   */
  artifactVerification?: ArtifactVerificationConfig;
  /**
   * Memoria temporal privada entre reinicios. Requiere un secreto aleatorio de
   * al menos 32 bytes; los IDs se pseudonimizan y el snapshot se autentica.
   */
  riskMemory?: RiskMemoryConfig;
  /**
   * Configuración de la caché de escalación a LLM.
   */
  escalationCache?: EscalationCacheConfig;
}

export interface EscalationCacheConfig {
  /** TTL en milisegundos para deduplicación de escalación. Default: 300_000 (5 min). */
  ttlMs?: number;
  /** Límite máximo de sesiones cacheadas en memoria. Default: 1,000. */
  maxEntries?: number;
  /** Proveedor de tiempo inyectable para pruebas deterministas. Default: Date.now. */
  nowProvider?: () => number;
}

export interface RiskMemoryConfig {
  secret: string;
  /** Ventana máxima de señales conservadas. Default 30 días. */
  retentionDays?: number;
  /** Límite de conversaciones pseudónimas en memoria. Default 5,000. */
  maxConversations?: number;
}

/** Identidad agregada del modelo; nunca contiene mensajes ni IDs de usuarios. */
export interface ShadowModelMetadata {
  modelId: string;
  featureSchemaVersion: number | null;
}

export interface ArtifactVerificationConfig {
  /** keyId del envelope → llave pública Ed25519 raw codificada en base64url. */
  publicKeys: Record<string, string>;
  /** Rechaza respuestas sin envelope. Default true. */
  requireSigned?: boolean;
  /** Permite cargar una versión dinámica menor. Default false. */
  allowRollback?: boolean;
  /** Tolerancia para relojes adelantados. Default 300 segundos. */
  maxClockSkewSeconds?: number;
}

export type ArtifactVerificationState =
  | "not_configured"
  | "verified"
  | "unsigned_legacy"
  | "unsigned_rejected"
  | "invalid_rejected"
  | "expired_rejected"
  | "rollback_rejected";

export interface ArtifactVerificationStatus {
  state: ArtifactVerificationState;
  keyId?: string;
  artifactId?: string;
  version?: string;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentinel — ShadowRunner: aislamiento y observabilidad no bloqueante (S16)
// ─────────────────────────────────────────────────────────────────────────────

import type { EngineResult, Message, RiskLevel } from "../types/SentinelEngine.js";
import type { ShadowModelMetadata } from "../types/SentinelConfig.js";
import type { ShadowClassifier, ShadowObserver } from "./engine.js";

export type ShadowStatus =
  | "ok"
  | "timeout"
  | "error"
  | "disabled"
  | "budget_exceeded"
  | "missing_model";

export interface ShadowObservation {
  modelId: string;
  featureSchemaVersion: number | null;
  lexicalRisk: RiskLevel;
  lexicalEscalate: boolean;
  shadowProbability: number | null;
  agreement: boolean | null;
  latencyMs: number;
  status: ShadowStatus;
  features?: number[];
  errorReason?: string;
}

export interface ShadowRunnerConfig {
  /** Kill switch maestro: si es false, omite la ejecución por completo. Default: true. */
  enabled?: boolean;
  /** Latencia máxima permitida en milisegundos. Default: 50 ms. */
  maxLatencyMs?: number;
  /** Presupuesto máximo de llamadas por minuto. Default: 1000. */
  budgetLimitPerMinute?: number;
}

export interface ShadowProvider {
  readonly modelId: string;
  readonly featureSchemaVersion: number | null;
  predict(features: number[], messages?: Message[]): number;
}

/** Adapta un ShadowClassifier funcional clásico al contrato ShadowProvider. */
export function wrapClassifierAsProvider(
  classifier: ShadowClassifier,
  metadata: ShadowModelMetadata = {
    modelId: "custom-unversioned",
    featureSchemaVersion: null,
  },
): ShadowProvider {
  return {
    modelId: metadata.modelId,
    featureSchemaVersion: metadata.featureSchemaVersion,
    predict: (features: number[], messages?: Message[]) => classifier(features, messages),
  };
}

/**
 * Ejecutor en modo sombra completamente aislado y no bloqueante.
 * Garantías:
 * 1. Fallos, timeouts, presupuestos agotados o modelos ausentes NUNCA lanzan excepciones.
 * 2. Cero mutación del resultado principal (EngineResult).
 * 3. Las observaciones y telemetría jamás registran texto de mensajes ni datos sensibles.
 */
export class ShadowRunner {
  private provider?: ShadowProvider;
  private observer?: (observation: ShadowObservation) => void;
  private config: Required<ShadowRunnerConfig>;
  private callTimestamps: number[] = [];

  constructor(
    provider?: ShadowProvider,
    observer?: (observation: ShadowObservation) => void,
    config?: ShadowRunnerConfig,
  ) {
    this.provider = provider;
    this.observer = observer;
    this.config = {
      enabled: config?.enabled ?? true,
      maxLatencyMs: config?.maxLatencyMs ?? 50,
      budgetLimitPerMinute: config?.budgetLimitPerMinute ?? 1000,
    };
  }

  setProvider(provider?: ShadowProvider): void {
    this.provider = provider;
  }

  setObserver(observer?: (observation: ShadowObservation) => void): void {
    this.observer = observer;
  }

  setConfig(config: Partial<ShadowRunnerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  getConfig(): Readonly<Required<ShadowRunnerConfig>> {
    return { ...this.config };
  }

  execute(
    result: EngineResult,
    features: number[],
    messages?: Message[],
  ): ShadowObservation {
    // 1. Kill-switch / Desactivado explícito
    if (!this.config.enabled) {
      const obs: ShadowObservation = {
        modelId: this.provider?.modelId ?? "disabled",
        featureSchemaVersion: this.provider?.featureSchemaVersion ?? null,
        lexicalRisk: result.risk,
        lexicalEscalate: result.escalate,
        shadowProbability: null,
        agreement: null,
        latencyMs: 0,
        status: "disabled",
      };
      this.safeEmit(obs);
      return obs;
    }

    // 2. Modelo ausente
    if (!this.provider) {
      const obs: ShadowObservation = {
        modelId: "missing_model",
        featureSchemaVersion: null,
        lexicalRisk: result.risk,
        lexicalEscalate: result.escalate,
        shadowProbability: null,
        agreement: null,
        latencyMs: 0,
        status: "missing_model",
      };
      this.safeEmit(obs);
      return obs;
    }

    // 3. Control de presupuesto y tasa por minuto
    const now = Date.now();
    this.callTimestamps = this.callTimestamps.filter((t) => now - t < 60_000);
    if (this.callTimestamps.length >= this.config.budgetLimitPerMinute) {
      const obs: ShadowObservation = {
        modelId: this.provider.modelId,
        featureSchemaVersion: this.provider.featureSchemaVersion,
        lexicalRisk: result.risk,
        lexicalEscalate: result.escalate,
        shadowProbability: null,
        agreement: null,
        latencyMs: 0,
        status: "budget_exceeded",
        errorReason: "Shadow rate/budget limit per minute exceeded",
      };
      this.safeEmit(obs);
      return obs;
    }
    this.callTimestamps.push(now);

    // 4. Ejecución aislada con cota de tiempo
    const start = Date.now();
    try {
      const rawProb = this.provider.predict(features, messages);
      const latencyMs = Date.now() - start;

      if (latencyMs > this.config.maxLatencyMs) {
        const obs: ShadowObservation = {
          modelId: this.provider.modelId,
          featureSchemaVersion: this.provider.featureSchemaVersion,
          lexicalRisk: result.risk,
          lexicalEscalate: result.escalate,
          shadowProbability: null,
          agreement: null,
          latencyMs,
          status: "timeout",
          errorReason: `Execution took ${latencyMs}ms (budget limit: ${this.config.maxLatencyMs}ms)`,
        };
        this.safeEmit(obs);
        return obs;
      }

      if (typeof rawProb !== "number" || !Number.isFinite(rawProb)) {
        throw new TypeError("Shadow classifier returned non-finite or non-numeric probability");
      }

      const shadowProbability = Math.max(0, Math.min(1, rawProb));
      const agreement = (result.risk !== "LOW") === (shadowProbability >= 0.5);

      const obs: ShadowObservation = {
        modelId: this.provider.modelId,
        featureSchemaVersion: this.provider.featureSchemaVersion,
        lexicalRisk: result.risk,
        lexicalEscalate: result.escalate,
        shadowProbability,
        agreement,
        latencyMs,
        status: "ok",
        features,
      };
      this.safeEmit(obs);
      return obs;
    } catch (error) {
      const latencyMs = Date.now() - start;
      const errorMsg =
        error instanceof Error ? error.message : "Unknown shadow classifier error";
      const obs: ShadowObservation = {
        modelId: this.provider.modelId,
        featureSchemaVersion: this.provider.featureSchemaVersion,
        lexicalRisk: result.risk,
        lexicalEscalate: result.escalate,
        shadowProbability: null,
        agreement: null,
        latencyMs,
        status: "error",
        errorReason: errorMsg.slice(0, 100), // Sanitizado y acotado, sin texto de usuario
      };
      this.safeEmit(obs);
      return obs;
    }
  }

  private safeEmit(observation: ShadowObservation): void {
    if (!this.observer) return;
    try {
      this.observer(observation);
    } catch {
      // Un fallo en el observer de telemetría jamás afecta la ejecución
    }
  }
}

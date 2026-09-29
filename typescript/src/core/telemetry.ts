import type { EngineResult, RiskLevel } from "../types/SentinelEngine.js";
import type { InterventionPlan, RecruiterAction } from "../types/SentinelAnalysisResult.js";
import type { ShadowModelMetadata } from "../types/SentinelConfig.js";

export type TelemetryResolution = "api" | "local" | "cached_api";

export interface TelemetryPayload {
  schemaVersion: 3;
  totalAnalyses: number;
  riskCounts: Record<RiskLevel, number>;
  topV3Terms: Record<string, number>;
  resolutions: {
    apiEscalations: number;
    local: number;
    cachedApiVerdicts: number;
  };
  shadow: {
    agreements: number;
    disagreements: number;
    models: Record<
      string,
      { featureSchemaVersion: number | null; agreements: number; disagreements: number }
    >;
  };
  interventions: {
    observed: number;
    recruiterActions: Record<RecruiterAction, number>;
    protectiveActions: Record<string, number>;
  };
}

function emptyPayload(): TelemetryPayload {
  return {
    schemaVersion: 3,
    totalAnalyses: 0,
    riskCounts: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
    topV3Terms: {},
    resolutions: { apiEscalations: 0, local: 0, cachedApiVerdicts: 0 },
    shadow: { agreements: 0, disagreements: 0, models: {} },
    interventions: {
      observed: 0,
      recruiterActions: { ALLOW: 0, SILENT_OBSERVE: 0, SOFT_WARN: 0, HARD_BLOCK: 0 },
      protectiveActions: {},
    },
  };
}

function mergePayload(target: TelemetryPayload, source: TelemetryPayload): void {
  target.totalAnalyses += source.totalAnalyses;
  for (const risk of ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const) {
    target.riskCounts[risk] += source.riskCounts[risk];
  }
  for (const [id, count] of Object.entries(source.topV3Terms)) {
    target.topV3Terms[id] = (target.topV3Terms[id] ?? 0) + count;
  }
  target.resolutions.apiEscalations += source.resolutions.apiEscalations;
  target.resolutions.local += source.resolutions.local;
  target.resolutions.cachedApiVerdicts += source.resolutions.cachedApiVerdicts;
  target.shadow.agreements += source.shadow.agreements;
  target.shadow.disagreements += source.shadow.disagreements;
  for (const [modelId, counts] of Object.entries(source.shadow.models)) {
    const current = target.shadow.models[modelId] ?? {
      featureSchemaVersion: counts.featureSchemaVersion,
      agreements: 0,
      disagreements: 0,
    };
    current.agreements += counts.agreements;
    current.disagreements += counts.disagreements;
    target.shadow.models[modelId] = current;
  }
  target.interventions.observed += source.interventions.observed;
  for (const action of ["ALLOW", "SILENT_OBSERVE", "SOFT_WARN", "HARD_BLOCK"] as const) {
    target.interventions.recruiterActions[action] +=
      source.interventions.recruiterActions[action];
  }
  for (const [action, count] of Object.entries(source.interventions.protectiveActions)) {
    target.interventions.protectiveActions[action] =
      (target.interventions.protectiveActions[action] ?? 0) + count;
  }
}

function withTopTerms(source: TelemetryPayload, limit = 25): TelemetryPayload {
  const payload = JSON.parse(JSON.stringify(source)) as TelemetryPayload;
  payload.topV3Terms = Object.fromEntries(
    Object.entries(source.topV3Terms)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, limit),
  );
  return payload;
}

export class TelemetryCollector {
  private counters = emptyPayload();
  private timer?: ReturnType<typeof setTimeout>;
  private shadowModel: ShadowModelMetadata = {
    modelId: "custom-unversioned",
    featureSchemaVersion: null,
  };

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly intervalMinutes = 15,
    private readonly analysisThreshold = 500,
  ) {
    this.schedule();
  }

  recordAnalysis(
    result: EngineResult,
    resolution: TelemetryResolution,
    intervention?: InterventionPlan,
  ): void {
    this.counters.totalAnalyses++;
    this.counters.riskCounts[result.risk]++;
    for (const id of result.layers.v3.terms) {
      this.counters.topV3Terms[id] = (this.counters.topV3Terms[id] ?? 0) + 1;
    }
    if (resolution === "api") this.counters.resolutions.apiEscalations++;
    else if (resolution === "cached_api") this.counters.resolutions.cachedApiVerdicts++;
    else this.counters.resolutions.local++;

    if (intervention) {
      this.counters.interventions.observed++;
      this.counters.interventions.recruiterActions[intervention.recruiter_action]++;
      for (const action of new Set(intervention.protective_actions)) {
        this.counters.interventions.protectiveActions[action] =
          (this.counters.interventions.protectiveActions[action] ?? 0) + 1;
      }
    }

    if (this.counters.totalAnalyses >= this.analysisThreshold) void this.flush();
  }

  recordShadowComparison(lexicalRisk: RiskLevel, shadowProbability: number): void {
    const lexicalRisky = lexicalRisk !== "LOW";
    const shadowRisky = shadowProbability >= 0.5;
    if (lexicalRisky === shadowRisky) this.counters.shadow.agreements++;
    else this.counters.shadow.disagreements++;
    const model = this.counters.shadow.models[this.shadowModel.modelId] ?? {
      featureSchemaVersion: this.shadowModel.featureSchemaVersion,
      agreements: 0,
      disagreements: 0,
    };
    if (lexicalRisky === shadowRisky) model.agreements++;
    else model.disagreements++;
    this.counters.shadow.models[this.shadowModel.modelId] = model;
  }

  setShadowModel(metadata: ShadowModelMetadata): void {
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(metadata.modelId)) {
      throw new TypeError("Telemetry shadow modelId must be a short opaque identifier");
    }
    this.shadowModel = metadata;
  }

  snapshot(): TelemetryPayload {
    return withTopTerms(this.counters);
  }

  async flush(): Promise<boolean> {
    if (this.counters.totalAnalyses === 0) return true;
    const pending = this.counters;
    this.counters = emptyPayload();
    const outgoing = withTopTerms(pending);
    const serialized = JSON.stringify(outgoing);

    try {
      const beacon = globalThis.navigator?.sendBeacon;
      if (typeof beacon === "function") {
        const telemetryToken = await this.requestBeaconToken();
        if (telemetryToken) {
          const beaconUrl = `${this.endpoint}?telemetry_token=${encodeURIComponent(telemetryToken)}`;
          if (beacon.call(globalThis.navigator, beaconUrl, serialized)) return true;
        }
      }

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: serialized,
        keepalive: true,
      });
      if (response.ok) return true;
    } catch {
      // La telemetría nunca rompe el análisis ni incluye errores en el payload.
    }

    mergePayload(this.counters, pending);
    return false;
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(): void {
    const delay = Math.max(this.intervalMinutes, 0.01) * 60_000;
    this.timer = setTimeout(() => {
      void this.flush().finally(() => this.schedule());
    }, delay);
    const timerWithUnref = this.timer as ReturnType<typeof setTimeout> & { unref?: () => void };
    timerWithUnref.unref?.();
  }

  /**
   * sendBeacon no permite headers custom. Se intercambia la API key por un
   * token efímero, limitado a telemetría, para que la credencial larga jamás
   * aparezca en URLs ni logs de proxies. Si falla, flush usa fetch keepalive.
   */
  private async requestBeaconToken(): Promise<string | null> {
    try {
      const response = await fetch(`${this.endpoint}/token`, {
        method: "POST",
        headers: { "X-API-Key": this.apiKey },
        keepalive: true,
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { data?: { token?: unknown } };
      return typeof body.data?.token === "string" ? body.data.token : null;
    } catch {
      return null;
    }
  }
}

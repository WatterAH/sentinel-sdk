// ─── Contrato de Decisión y Política Versionada (S05) ──────────────────────────

export type PolicyMode = "shadow" | "review" | "enforce";

export type DecisionRiskBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";

export type DecisionDisposition = "ALLOW" | "REVIEW" | "INTERVENE" | "ABSTAIN";

export type SignalState = "present" | "absent" | "unknown";

export type UncertaintyStatus =
  | "calibrated"
  | "uncalibrated"
  | "insufficient_context"
  | "timeout"
  | "provider_error";

export type ConfidenceLevel = "low" | "medium" | "high" | "unknown";

export interface DecisionSignal {
  kind: string;
  state: SignalState;
  score?: number | null;
  /** Índices numéricos de turno o IDs de mensaje existentes. Prohibido texto inventado. */
  evidenceRefs: Array<number | string>;
}

export interface DecisionUncertainty {
  status: UncertaintyStatus;
  /** Probabilidad calibrada en [0.0, 1.0]. Omitida o null si no está calibrada. */
  calibratedScore?: number | null;
  confidence: ConfidenceLevel;
  reason?: string | null;
}

export interface DecisionVersions {
  engine: string;
  policy: string;
  regionPack?: string;
  model?: string | null;
}

export interface DecisionRecord {
  schemaVersion: 1;
  policyMode: PolicyMode;
  caseRef: string;
  riskBand: DecisionRiskBand;
  disposition: DecisionDisposition;
  signals: DecisionSignal[];
  uncertainty: DecisionUncertainty;
  versions: DecisionVersions;
  createdAt?: number;
}

/**
 * Validador determinista de paridad para DecisionRecord en TypeScript.
 */
export function validateDecisionRecord(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["DecisionRecord must be a non-null object"] };
  }

  const rec = input as Partial<DecisionRecord>;

  if (rec.schemaVersion !== 1) {
    errors.push(`Invalid schemaVersion: expected 1, got ${rec.schemaVersion}`);
  }

  const validModes: PolicyMode[] = ["shadow", "review", "enforce"];
  if (!rec.policyMode || !validModes.includes(rec.policyMode)) {
    errors.push(`Invalid policyMode: ${rec.policyMode}`);
  }

  if (typeof rec.caseRef !== "string" || rec.caseRef.trim().length === 0) {
    errors.push("caseRef must be a non-empty string");
  }

  const validRiskBands: DecisionRiskBand[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"];
  if (!rec.riskBand || !validRiskBands.includes(rec.riskBand)) {
    errors.push(`Invalid riskBand: ${rec.riskBand}`);
  }

  const validDispositions: DecisionDisposition[] = ["ALLOW", "REVIEW", "INTERVENE", "ABSTAIN"];
  if (!rec.disposition || !validDispositions.includes(rec.disposition)) {
    errors.push(`Invalid disposition: ${rec.disposition}`);
  }

  if (!Array.isArray(rec.signals)) {
    errors.push("signals must be an array");
  } else {
    for (let i = 0; i < rec.signals.length; i++) {
      const sig = rec.signals[i];
      if (!sig || typeof sig !== "object") {
        errors.push(`signals[${i}] must be an object`);
        continue;
      }
      if (typeof sig.kind !== "string" || sig.kind.trim().length === 0) {
        errors.push(`signals[${i}].kind must be a non-empty string`);
      }
      const validStates: SignalState[] = ["present", "absent", "unknown"];
      if (!sig.state || !validStates.includes(sig.state)) {
        errors.push(`signals[${i}].state must be one of ${validStates.join(", ")}`);
      }
      if (sig.score !== undefined && sig.score !== null) {
        if (typeof sig.score !== "number" || sig.score < 0 || sig.score > 1 || Number.isNaN(sig.score)) {
          errors.push(`signals[${i}].score must be in [0.0, 1.0] if provided`);
        }
      }
      if (!Array.isArray(sig.evidenceRefs)) {
        errors.push(`signals[${i}].evidenceRefs must be an array`);
      }
    }
  }

  if (!rec.uncertainty || typeof rec.uncertainty !== "object") {
    errors.push("uncertainty must be an object");
  } else {
    const validUncertaintyStatus: UncertaintyStatus[] = [
      "calibrated",
      "uncalibrated",
      "insufficient_context",
      "timeout",
      "provider_error",
    ];
    if (!rec.uncertainty.status || !validUncertaintyStatus.includes(rec.uncertainty.status)) {
      errors.push(`uncertainty.status must be one of ${validUncertaintyStatus.join(", ")}`);
    }
    if (rec.uncertainty.calibratedScore !== undefined && rec.uncertainty.calibratedScore !== null) {
      if (
        typeof rec.uncertainty.calibratedScore !== "number" ||
        rec.uncertainty.calibratedScore < 0 ||
        rec.uncertainty.calibratedScore > 1 ||
        Number.isNaN(rec.uncertainty.calibratedScore)
      ) {
        errors.push("uncertainty.calibratedScore must be a number in [0.0, 1.0]");
      }
    }
  }

  if (!rec.versions || typeof rec.versions !== "object") {
    errors.push("versions must be an object");
  } else {
    if (typeof rec.versions.engine !== "string" || !rec.versions.engine) {
      errors.push("versions.engine must be a non-empty string");
    }
    if (typeof rec.versions.policy !== "string" || !rec.versions.policy) {
      errors.push("versions.policy must be a non-empty string");
    }
  }

  return { valid: errors.length === 0, errors };
}

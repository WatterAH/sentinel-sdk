import type { RiskLevel } from "./SentinelEngine.js";

export type { RiskLevel };

/** Envelope estándar de todas las respuestas de la Sentinel API. */
export interface ApiResponse<T> {
  success: boolean;
  status_code: number;
  data: T;
  details?: string;
}

export type Stage =
  | "NINGUNA"
  | "CAPTACION"
  | "INDUCCION/COOPTACION"
  | "INCUBACION"
  | "UTILIZACION/INSTRUMENTALIZACION";

export type UXRecommendation =
  | "NONE"
  | "SOFT_NUDGE"
  | "WARNING_OVERLAY"
  | "SOFT_BLOCK"
  | "HARD_BLOCK";

export interface SentinelAnalysisResponse {
  score: number;
  risk: RiskLevel;
  escalate: boolean;

  layers: {
    normalizer: {
      score: number;
      features: string[];
      triggeredRules: string[];
      transformations: string[];
    };
    v3: {
      score: number;
      terms: string[];
      categories: string[];
      triggeredRules: string[];
    };
    v4: {
      score: number;
      features: string[];
      triggeredRules: string[];
      explicitSignals: string[];
    };
    temporal?: {
      stagesPresent: string[];
      orderedProgression: boolean;
      spanDays: number;
      triggeredRules: string[];
      timeline: Array<{ stage: string; firstSeenAt: number }>;
    };
    actor?: {
      analyzed: boolean;
      aggressorSender: string | null;
      concentration: number;
      triggeredRules: string[];
    };
  };

  velocityFlag: boolean;
  velocityWindow: number;
  messagesAnalyzed: number;
  uniqueCategories: string[];
}

export type RecruiterAction = "ALLOW" | "SILENT_OBSERVE" | "SOFT_WARN" | "HARD_BLOCK";

/**
 * Plan de intervención graduada: decopla lo que ve el reclutador de las acciones
 * que protegen a la víctima. La plataforma lo aplica o ajusta según su política.
 */
export interface InterventionPlan {
  recruiter_action: RecruiterAction;
  protective_actions: string[]; // SHADOW_FLAG, WARN_MINOR, NOTIFY_GUARDIAN, RESTRICT_CONTACT, PRESERVE_EVIDENCE, REPORT_AUTHORITY
  minor_message: string | null;
  rationale: string;
}

export interface ApiAnalysisResponse {
  risk: RiskLevel;
  ux_recommendation: UXRecommendation;
  stage: Stage;
  confidence: number;
  summary: string;
  false_positive: boolean;
  messages_analyzed: number;
  current_message: string;
  intervention?: InterventionPlan;
}

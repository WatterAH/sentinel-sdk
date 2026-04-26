import type { RiskLevel } from "./SentinelEngine.js";

export type { RiskLevel };

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
  };

  velocityFlag: boolean;
  velocityWindow: number;
  messagesAnalyzed: number;
  uniqueCategories: string[];
}

export interface ApiAnalysisResponse {
  ux_recommendation: UXRecommendation;
  stage: Stage;
  confidence: number;
  summary: string;
  false_positive: boolean;
  messages_analyzed: number;
  current_message: string;
}

// ─── Tipos públicos del Engine ────────────────────────────────────────────────

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Message {
  text: string;
  timestamp?: number; // Unix ms
}

export interface ApiMessage {
  id: string;
  user_id: string;
  session_id: string;
  content: string;
  timestamp: number;
}

// ─── Desglose por capa ───────────────────────────────────────────────────────

export interface NormalizerLayerResult {
  score: number;
  features: string[]; // ["N0-F001", "N0-F007"]
  triggeredRules: string[]; // ["N0-CR-001"]
  transformations: string[]; // ["pakete→paquete", "k→que", "📦→paquete"]
}

export interface V3LayerResult {
  score: number;
  terms: string[]; // ["REC-001", "REC-005"]
  categories: string[];
  triggeredRules: string[]; // ["MCR-001"]
}

export interface V4LayerResult {
  score: number;
  features: string[]; // ["ambiguous_opportunity", "call_to_action"]
  triggeredRules: string[]; // ["CR-002"]
  explicitSignals: string[]; // ["EX-002"]
}

// ─── Resultado principal del Engine ──────────────────────────────────────────

export interface EngineResult {
  // Decisión principal
  score: number;
  risk: RiskLevel;
  escalate: boolean;

  // Desglose por capa — para el prompt a Gemini y auditoría
  layers: {
    normalizer: NormalizerLayerResult;
    v3: V3LayerResult;
    v4: V4LayerResult;
  };

  // Contexto temporal
  velocityFlag: boolean;
  velocityWindow: number; // segundos (0 si no aplica)

  // Metadata
  messagesAnalyzed: number;
  uniqueCategories: string[];
}

// ─── Tipos internos compartidos entre capas ──────────────────────────────────

export interface Hit {
  id: string;
  score: number;
  category?: string;
  timestamp: number;
}

export interface NormalizerOutput {
  messages: Message[]; // mensajes con texto ya normalizado
  score: number;
  features: string[];
  triggeredRules: string[];
  transformations: string[];
  hits: Hit[];
}

export interface V3Output {
  score: number;
  terms: string[];
  categories: string[];
  triggeredRules: string[];
  hits: Hit[];
}

export interface V4Output {
  score: number;
  features: string[];
  triggeredRules: string[];
  explicitSignals: string[];
  hits: Hit[];
}

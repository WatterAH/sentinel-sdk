// ─── Tipos públicos del Engine ────────────────────────────────────────────────

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Message {
  text: string;
  timestamp?: number; // Unix ms
  sender?: string; // id del emisor — habilita el análisis de asimetría de actor
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
  originalScore?: number;
  dampenersApplied?: string[];
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

export interface ActorProfile {
  sender: string;
  /** Categorías de riesgo que ESTE emisor produce. */
  categories: string[];
  /** Cuántas de esas son de acción dirigida al otro (oferta, logística, etc.). */
  directedActionCount: number;
  score: number;
}

export interface ActorLayerResult {
  /** true si hubo ≥2 emisores distinguibles (si no, el análisis no aplica). */
  analyzed: boolean;
  profiles: ActorProfile[];
  /** El emisor que más concentra tácticas de acción dirigida, si alguno destaca. */
  aggressorSender: string | null;
  /** Fracción del total de señal de acción dirigida que concentra ese emisor (0–1). */
  concentration: number;
  triggeredRules: string[]; // ["ACR-001"]
}

export interface TemporalLayerResult {
  /** Etapas del guion de captación detectadas, en orden de primera aparición. */
  stagesPresent: string[]; // ["CONTACTO", "ENGANCHE", "AISLAMIENTO"]
  /** true si las primeras apariciones respetan el orden del guion (contacto→enganche→aislamiento→logística). */
  orderedProgression: boolean;
  /** Días entre el primer y el último hit con categoría mapeable. */
  spanDays: number;
  triggeredRules: string[]; // ["TCR-001"]
  /** Primera aparición de cada etapa, para auditoría y para el prompt del LLM. */
  timeline: Array<{ stage: string; firstSeenAt: number }>;
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
    temporal: TemporalLayerResult;
    actor: ActorLayerResult;
  };

  // Contexto temporal
  velocityFlag: boolean;
  velocityWindow: number; // segundos (0 si no aplica)

  // Metadata
  messagesAnalyzed: number;
  uniqueCategories: string[];
  /** Banda de edad usada para ajustar el análisis (7.4), si la plataforma la pasó. */
  ageBand?: "under13" | "13-15" | "16-17" | "adult";
  /**
   * Por qué (no) se escala al LLM. `escalate` es true solo en `uncertain_needs_llm`.
   * - none_low_risk: sin riesgo, acción local.
   * - confident_local_proof: riesgo con prueba determinista → veredicto local, sin API.
   * - uncertain_needs_llm: zona gris → el LLM aporta valor.
   */
  escalationReason?: "none_low_risk" | "confident_local_proof" | "uncertain_needs_llm";
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

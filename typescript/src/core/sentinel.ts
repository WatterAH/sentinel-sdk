import request from "../lib/request.js";
import { Engine } from "../analyzer/engine.js";
import type { SentinelConfig } from "../types/SentinelConfig.js";
import type {
  ApiAnalysisResponse,
  SentinelAnalysisResponse,
} from "../types/SentinelAnalysisResult.js";
import { type SentinelResult, ok, err } from "../types/SentinelResult.js";
import type { ApiMessage, EngineResult, Message, MessageSource, RiskLevel } from "../types/SentinelEngine.js";
import { SentinelError } from "../errors/SentinelError.js";
import { buildLocalIntervention } from "./intervention.js";
import type { AgeBand } from "../analyzer/age-policy.js";

/** Contexto opcional que la plataforma conoce del usuario protegido. */
export interface AnalyzeContext {
  /** Banda de edad del usuario; ajusta la sensibilidad del motor (7.4). */
  ageBand?: AgeBand;
  /** Marca transcripciones ASR para aplicar normalización de voz, no de teclado. */
  source?: MessageSource;
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
  private sessionStore = new Map<string, ApiMessage[]>();
  // Deduplicación de escalaciones: cachea el último veredicto del LLM por sesión
  // y el nivel de riesgo con que se obtuvo. Evita re-escalar (y re-pagar) en cada
  // mensaje de una conversación que ya fue evaluada, salvo que el riesgo suba.
  private escalationCache = new Map<string, { risk: RiskLevel; response: ApiAnalysisResponse }>();
  private readonly RISK_ORDER: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

  constructor(config: SentinelConfig) {
    this.apiKey = config.apiKey;
    this.serverSideSessions = config.serverSideSessions ?? false;
    this.baseUrl = "https://sentinel-api-production-95e9.up.railway.app/api/v1";
    this.engine = new Engine();
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

  async initialize(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/hot-terms`, {
        headers: this.authHeaders(),
      });
      if (!response.ok) return;
      const json = await response.json();
      const terms = json?.data ?? [];
      this.hotTermsDatasetVersion =
        typeof json?.dataset_version === "number" ? json.dataset_version : null;
      if (terms.length > 0) {
        this.engine.injectHotTerms(terms);
      }
    } catch {
      // API unavailable — continue with static dataset
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

      const newMessage: ApiMessage = {
        id: globalThis.crypto?.randomUUID?.() || Date.now().toString(),
        session_id: sessionId,
        user_id: userId,
        content: text,
        timestamp: Date.now(),
        source: context?.source,
      };
      
      messages.push(newMessage);

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
      const result = this.engine.analyze(engineMessages, { ageBand: context?.ageBand });
      if (result.datasetVersions) {
        result.datasetVersions.apiHotTerms = this.hotTermsDatasetVersion;
      }

      // 3. DECIDIR ACCIÓN — `result.escalate` es la ÚNICA fuente de verdad:
      //    true solo cuando el motor local está INSEGURO (zona gris). Esto
      //    minimiza el costo de API: lo determinista se resuelve local.

      // 3a. Riesgo LOW → veredicto local, sin API.
      if (result.risk === "LOW") {
        return ok(this.localVerdict(result, messages.length, text));
      }

      // 3b. Escalación necesaria (incierto). Se deduplica por sesión: si esta
      //     sesión ya tiene veredicto del LLM al mismo nivel de riesgo o mayor,
      //     se reutiliza en vez de re-pagar la llamada.
      if (result.escalate) {
        const cached = this.escalationCache.get(sessionId);
        if (cached && this.RISK_ORDER.indexOf(cached.risk) >= this.RISK_ORDER.indexOf(result.risk)) {
          return ok({ ...cached.response, messages_analyzed: messages.length, current_message: text });
        }
        const escalated = await this.escalate(result, messages);
        this.escalationCache.set(sessionId, { risk: result.risk, response: escalated });
        return ok({ ...escalated, messages_analyzed: messages.length, current_message: text });
      }

      // 3c. Riesgo alto CON prueba determinista → veredicto local confiable, sin
      //     gastar el LLM. Si hay agresor identificado, se reporta a la señal de
      //     red (barato, sin LLM) para preservar la detección de reclutamiento
      //     organizado cross-sesión.
      if (result.layers.actor?.aggressorSender) {
        void this.reportNetwork(result, messages).catch(() => {});
      }
      return ok(this.localVerdict(result, messages.length, text));
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
      await request.post(`${this.baseUrl}/feedback`, {
        session_id: sessionId,
        verdict_original: originalVerdict,
        feedback: type,
        comment: comment || null,
        reported_by: "sdk_client"
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
        timestamp: Date.now(),
      },
    }, this.authHeaders());
  }
}

import request from "../lib/request.js";
import { Engine } from "../analyzer/engine.js";
import { SentinelConfig } from "../types/SentinelConfig.js";
import {
  ApiAnalysisResponse,
  SentinelAnalysisResponse,
} from "../types/SentinelAnalysisResult.js";
import { SentinelResult, ok, err } from "../types/SentinelResult.js";
import { ApiMessage, EngineResult, Message } from "../types/SentinelEngine.js";
import { SentinelError } from "../errors/SentinelError.js";
import { buildLocalIntervention } from "./intervention.js";
import type { AgeBand } from "../analyzer/age-policy.js";

/** Contexto opcional que la plataforma conoce del usuario protegido. */
export interface AnalyzeContext {
  /** Banda de edad del usuario; ajusta la sensibilidad del motor (7.4). */
  ageBand?: AgeBand;
}

export class Sentinel {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly serverSideSessions: boolean;
  private engine: Engine;
  private sessionStore = new Map<string, ApiMessage[]>();

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

        const valid = messages.filter(
          (m: any) =>
            m &&
            typeof m.content === "string" &&
            typeof m.timestamp === "number" &&
            m.timestamp >= cutoff,
        ) as ApiMessage[];

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
        timestamp: new Date().getTime(),
      };
      
      messages.push(newMessage);

      // Cota de memoria por sesión. Se preservan los primeros mensajes porque
      // la capa temporal necesita la PRIMERA aparición de cada etapa — recortar
      // solo lo viejo borraría la evidencia del contacto inicial.
      const MAX_SESSION_MESSAGES = 1000;
      if (messages.length > MAX_SESSION_MESSAGES) {
        const head = messages.slice(0, 50);
        const tail = messages.slice(messages.length - (MAX_SESSION_MESSAGES - 50));
        this.sessionStore.set(sessionId, [...head, ...tail]);
        messages = this.sessionStore.get(sessionId)!;
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
      }));
      const result = this.engine.analyze(engineMessages, { ageBand: context?.ageBand });

      // 3. DETERMINE ACTION BASED ON SCORE
      if (result.risk === "LOW") {
        return ok({
          messages_analyzed: messages.length,
          current_message: text,
          confidence: 1,
          risk: result.risk,
          summary:
            "El análisis local determina que la conversación no presenta indicios de riesgo. El lenguaje utilizado y los patrones detectados corresponden a una interacción normal, sin señales de manipulación o captación.",
          stage: "NINGUNA",
          false_positive: false,
          ux_recommendation: "NONE",
          intervention: buildLocalIntervention(result),
        });
      } else if (result.risk === "MEDIUM") {
        // 4. ESCALATE IF NEEDED
        const escalated = await this.escalate(result, messages);
        return ok({
          ...escalated,
          messages_analyzed: messages.length,
          current_message: text,
        });
      } else {
        const intervention = buildLocalIntervention(result);
        return ok({
          messages_analyzed: messages.length,
          current_message: text,
          confidence: 1,
          risk: result.risk,
          summary:
            "ALERTA: El análisis local ha detectado patrones críticos de alta severidad. Las señales extraídas coinciden de manera explícita con tácticas coercitivas, de captación o grooming. Se requiere bloqueo o intervención inmediata.",
          stage: "CAPTACION",
          false_positive: false,
          // La recomendación UX ahora refleja el plan graduado: un HIGH no
          // inminente no bloquea de forma visible (evita el oráculo), escala a
          // fricción/vigilancia. Solo el peligro inminente da HARD_BLOCK.
          ux_recommendation:
            intervention.recruiter_action === "HARD_BLOCK" ? "HARD_BLOCK" : "WARNING_OVERLAY",
          intervention,
        });
      }
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
        timestamp: new Date().getTime(),
      },
    }, this.authHeaders());
  }
}

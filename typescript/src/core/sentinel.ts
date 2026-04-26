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

export class Sentinel {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private engine: Engine;

  constructor(config: SentinelConfig) {
    this.apiKey = config.apiKey;
    // this.baseUrl = "https://sentinel-api-production-95e9.up.railway.app/api/v1";
    this.baseUrl = "https://sentinel-api-production-95e9.up.railway.app/api/v1";
    this.engine = new Engine();
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

      const messages = await this.syncSession(text, sessionId, userId);

      // 2. ANALYZE SESSION LOCALLY
      const engineMessages = messages.map((m) => ({
        text: m.content,
        timestamp: m.timestamp,
      }));
      const result = this.engine.analyze(engineMessages);

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
        return ok({
          messages_analyzed: messages.length,
          current_message: text,
          confidence: 1,
          risk: result.risk,
          summary:
            "ALERTA: El análisis local ha detectado patrones críticos de alta severidad. Las señales extraídas coinciden de manera explícita con tácticas coercitivas, de captación o grooming. Se requiere bloqueo o intervención inmediata.",
          stage: "CAPTACION",
          false_positive: false,
          ux_recommendation: "HARD_BLOCK",
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
  localAnalyze(messages: Message[]): SentinelResult<SentinelAnalysisResponse> {
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
      }));

      const result = this.engine.analyze(engineMessages);

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

  private async escalate(
    analysis: EngineResult,
    messages: ApiMessage[],
  ): Promise<ApiAnalysisResponse> {
    return await request.post(`${this.baseUrl}/analyze`, {
      ...analysis,
      messages,
    });
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
    });
  }
}

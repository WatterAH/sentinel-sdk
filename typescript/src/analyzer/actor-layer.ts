// ─────────────────────────────────────────────────────────────────────────────
// ActorLayer — análisis de asimetría de emisor
//
// El resto del motor trata la conversación como una bolsa de mensajes: pierde la
// señal más importante del reclutamiento/grooming, que es ASIMÉTRICO. "manda tu
// ubicación" de un adulto AL menor es peligro; entre dos amigos es logística de
// una fiesta. Una captación real es UN actor empujando tácticas (ofrece, aísla,
// pide datos, cambia de canal) hacia el otro; una conversación entre pares
// reparte o no tiene esas tácticas.
//
// Esta capa reagrupa por emisor (concatenando los mensajes de cada uno — lo que
// además vuelve a unir palabras partidas entre mensajes consecutivos, cerrando
// esa evasión) y mide si un solo actor concentra la acción dirigida.
// ─────────────────────────────────────────────────────────────────────────────

import type { Message, ActorLayerResult, ActorProfile } from "../types/SentinelEngine.js";
import type { V3Layer } from "./v3-layer.js";

// Categorías donde el emisor ejerce una ACCIÓN sobre el otro (no solo describe).
// Son las que, concentradas en un actor, delatan al agresor.
const DIRECTED_ACTION_CATEGORIES = new Set([
  "oferta_economica",
  "logistica_fisica",
  "solicitud_informacion",
  "cambio_canal",
  "aislamiento",
  "formalidad_deceptiva",
  "reclutamiento",
]);

export class ActorLayer {
  /** Un actor debe concentrar al menos esta señal para considerarse agresor. */
  private minConcentration: number;
  /** Y emitir al menos esta cantidad de categorías de acción dirigida distintas. */
  private minDirectedCategories: number;

  constructor(minConcentration = 0.75, minDirectedCategories = 2) {
    this.minConcentration = minConcentration;
    this.minDirectedCategories = minDirectedCategories;
  }

  /**
   * @param messages mensajes normalizados con `sender`.
   * @param v3 la capa léxica, para reescanear por emisor.
   */
  analyze(messages: Message[], v3: V3Layer): ActorLayerResult {
    const empty: ActorLayerResult = {
      analyzed: false,
      profiles: [],
      aggressorSender: null,
      concentration: 0,
      triggeredRules: [],
    };

    const senders = new Set(messages.map((m) => m.sender).filter((s): s is string => !!s));
    if (senders.size < 2) return empty; // sin ≥2 emisores no hay asimetría que medir

    // Un perfil por emisor: se concatenan sus mensajes (reúne palabras partidas)
    // y se reescanea con la capa léxica.
    const profiles: ActorProfile[] = [];
    for (const sender of senders) {
      const own = messages.filter((m) => m.sender === sender);
      // Concatenar en un solo "mensaje" por emisor cierra la partición de
      // términos entre mensajes consecutivos del mismo actor.
      const joined: Message = {
        text: own.map((m) => m.text).join(" "),
        timestamp: own[0]?.timestamp,
        sender,
      };
      const scan = v3.scan([joined]);
      const directed = scan.categories.filter((c) => DIRECTED_ACTION_CATEGORIES.has(c));
      profiles.push({
        sender,
        categories: scan.categories,
        directedActionCount: directed.length,
        score: scan.score,
      });
    }

    // ¿Qué fracción de toda la "acción dirigida" concentra el actor que más tiene?
    const totalDirected = profiles.reduce((s, p) => s + p.directedActionCount, 0);
    let aggressorSender: string | null = null;
    let concentration = 0;
    if (totalDirected > 0) {
      const top = profiles.reduce((a, b) => (b.directedActionCount > a.directedActionCount ? b : a));
      concentration = top.directedActionCount / totalDirected;
      const triggers =
        top.directedActionCount >= this.minDirectedCategories &&
        concentration >= this.minConcentration;
      if (triggers) aggressorSender = top.sender;
    }

    const triggeredRules = aggressorSender ? ["ACR-001"] : [];

    return {
      analyzed: true,
      profiles,
      aggressorSender,
      concentration: Math.round(concentration * 100) / 100,
      triggeredRules,
    };
  }
}

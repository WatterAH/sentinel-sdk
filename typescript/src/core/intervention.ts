// ─────────────────────────────────────────────────────────────────────────────
// Intervención graduada — versión local del SDK.
//
// Espejo de la política del servidor (`intervention.py`), pero con las señales
// que el SDK tiene sin el LLM (risk + asimetría de actor + cadena temporal +
// logística). Se usa en el camino LOCAL (LOW/HIGH/CRITICAL) donde no se llama a
// la API. Mismo principio: proteger a la víctima en silencio primero; solo
// bloquear de forma visible ante peligro inminente (no darle al reclutador el
// oráculo de qué lo delató).
// ─────────────────────────────────────────────────────────────────────────────

import type { EngineResult } from "../types/SentinelEngine.js";
import type { InterventionPlan, RecruiterAction } from "../types/SentinelAnalysisResult.js";

const HELP_RESOURCE =
  "Si algo te incomoda o te da miedo, cuéntale a un adulto de confianza. También puedes marcar al 088 (Guardia Nacional) o escribir a Te Protejo México.";

function minorMessage(urgent: boolean): string {
  return urgent
    ? "Esta persona podría estar tratando de involucrarte en algo peligroso. No vayas a ningún lado ni compartas tu ubicación. " +
        HELP_RESOURCE
    : "Notamos algo en esta conversación que podría no ser seguro para ti. No tienes que responder si algo te incomoda. " +
        HELP_RESOURCE;
}

/**
 * Construye el plan local a partir del resultado del motor. La logística física
 * en curso o la instrumentalización marcan peligro inminente (bloqueo visible);
 * el resto se protege en silencio.
 */
export function buildLocalIntervention(result: EngineResult): InterventionPlan {
  const risk = result.risk;
  const categories = result.uniqueCategories ?? [];
  const logistics = categories.includes("logistica_fisica");
  const hasAggressor = result.layers.actor?.aggressorSender != null;
  const temporalFullScript =
    (result.layers.temporal?.triggeredRules ?? []).includes("TCR-001") &&
    (result.layers.temporal?.stagesPresent?.length ?? 0) >= 4;

  const plan = (
    recruiter_action: RecruiterAction,
    protective_actions: string[],
    minor_message: string | null,
    rationale: string,
  ): InterventionPlan => ({ recruiter_action, protective_actions, minor_message, rationale });

  if (risk === "LOW") {
    return plan("ALLOW", [], null, "Sin indicios de riesgo.");
  }

  // Peligro inminente local: CRITICAL con logística dirigida, o guion temporal
  // completo. Acción visible + protección fuerte.
  const imminent = (risk === "CRITICAL" && logistics) || temporalFullScript;
  if (imminent) {
    return plan(
      "HARD_BLOCK",
      ["PRESERVE_EVIDENCE", "NOTIFY_GUARDIAN", "RESTRICT_CONTACT", "WARN_MINOR"],
      minorMessage(true),
      "Peligro inminente detectado localmente: se corta el contacto, se preserva evidencia y se protege al menor.",
    );
  }

  // HIGH/CRITICAL no inminente: NO tipificar al agresor (evitar oráculo),
  // proteger al menor en silencio.
  if (risk === "HIGH" || risk === "CRITICAL") {
    const protective = ["SHADOW_FLAG", "WARN_MINOR"];
    if (hasAggressor) protective.push("RESTRICT_CONTACT");
    return plan(
      "SILENT_OBSERVE",
      protective,
      minorMessage(false),
      "Riesgo alto sin peligro inmediato: se vigila al emisor sin avisarle y se avisa al menor en privado.",
    );
  }

  // MEDIUM se escala a la API, que arma su propio plan; por si acaso, fricción suave.
  return plan("SOFT_WARN", ["SHADOW_FLAG"], null, "Zona gris: fricción suave y vigilancia.");
}

import { describe, expect, it } from "vitest";
import { buildLocalIntervention } from "./intervention.js";
import type { EngineResult } from "../types/SentinelEngine.js";

// Helper: EngineResult mínimo con overrides.
function result(over: Partial<EngineResult> & { risk: EngineResult["risk"] }): EngineResult {
  return {
    score: 0,
    escalate: false,
    velocityFlag: false,
    velocityWindow: 0,
    messagesAnalyzed: 1,
    uniqueCategories: [],
    layers: {
      normalizer: { score: 0, features: [], triggeredRules: [], transformations: [] },
      v3: { score: 0, terms: [], categories: [], triggeredRules: [] },
      v4: { score: 0, features: [], triggeredRules: [], explicitSignals: [] },
      temporal: { stagesPresent: [], orderedProgression: false, spanDays: 0, triggeredRules: [], timeline: [] },
      actor: { analyzed: false, profiles: [], aggressorSender: null, concentration: 0, triggeredRules: [] },
    },
    ...over,
  } as EngineResult;
}

describe("Intervención local del SDK", () => {
  it("LOW no interviene", () => {
    const p = buildLocalIntervention(result({ risk: "LOW" }));
    expect(p.recruiter_action).toBe("ALLOW");
    expect(p.protective_actions).toHaveLength(0);
  });

  it("HIGH no inminente NO tipifica al agresor (evita el oráculo)", () => {
    const p = buildLocalIntervention(result({ risk: "HIGH" }));
    expect(p.recruiter_action).toBe("SILENT_OBSERVE"); // NO HARD_BLOCK
    expect(p.protective_actions).toContain("SHADOW_FLAG");
    expect(p.protective_actions).toContain("WARN_MINOR");
    expect(p.minor_message).toBeTruthy();
  });

  it("CRITICAL con logística en curso es peligro inminente → bloqueo visible", () => {
    const p = buildLocalIntervention(
      result({ risk: "CRITICAL", uniqueCategories: ["reclutamiento", "logistica_fisica"] }),
    );
    expect(p.recruiter_action).toBe("HARD_BLOCK");
    expect(p.protective_actions).toContain("PRESERVE_EVIDENCE");
    expect(p.protective_actions).toContain("NOTIFY_GUARDIAN");
  });

  it("guion temporal completo es inminente aunque el score sea moderado", () => {
    const p = buildLocalIntervention(
      result({
        risk: "MEDIUM",
        layers: {
          normalizer: { score: 0, features: [], triggeredRules: [], transformations: [] },
          v3: { score: 0, terms: [], categories: [], triggeredRules: [] },
          v4: { score: 0, features: [], triggeredRules: [], explicitSignals: [] },
          temporal: {
            stagesPresent: ["CONTACTO", "ENGANCHE", "AISLAMIENTO", "LOGISTICA"],
            orderedProgression: true, spanDays: 14, triggeredRules: ["TCR-001"], timeline: [],
          },
          actor: { analyzed: false, profiles: [], aggressorSender: null, concentration: 0, triggeredRules: [] },
        } as EngineResult["layers"],
      }),
    );
    expect(p.recruiter_action).toBe("HARD_BLOCK");
  });

  it("agresor por asimetría agrega restringir contacto", () => {
    const p = buildLocalIntervention(
      result({
        risk: "HIGH",
        layers: {
          normalizer: { score: 0, features: [], triggeredRules: [], transformations: [] },
          v3: { score: 0, terms: [], categories: [], triggeredRules: [] },
          v4: { score: 0, features: [], triggeredRules: [], explicitSignals: [] },
          temporal: { stagesPresent: [], orderedProgression: false, spanDays: 0, triggeredRules: [], timeline: [] },
          actor: { analyzed: true, profiles: [], aggressorSender: "adulto-1", concentration: 1, triggeredRules: ["ACR-001"] },
        } as EngineResult["layers"],
      }),
    );
    expect(p.protective_actions).toContain("RESTRICT_CONTACT");
  });

  it("el mensaje al menor incluye recurso de ayuda", () => {
    const p = buildLocalIntervention(result({ risk: "HIGH" }));
    expect(p.minor_message).toMatch(/088|Te Protejo/);
  });
});

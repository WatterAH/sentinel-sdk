import { describe, expect, it } from "vitest";
import { type DecisionRecord, validateDecisionRecord } from "./SentinelDecision.js";

describe("DecisionRecord contract & policy validator (S05)", () => {
  const validRecord: DecisionRecord = {
    schemaVersion: 1,
    policyMode: "shadow",
    caseRef: "case-mx-001",
    riskBand: "MEDIUM",
    disposition: "REVIEW",
    signals: [
      {
        kind: "surveillance_task",
        state: "present",
        score: 0.85,
        evidenceRefs: [1, 3],
      },
    ],
    uncertainty: {
      status: "calibrated",
      calibratedScore: 0.78,
      confidence: "high",
      reason: "corroborated_with_actor_layer",
    },
    versions: {
      engine: "1.0.3",
      policy: "v1.0",
      regionPack: "mx-v1",
      model: "shadow-model-hashed-v1",
    },
    createdAt: 1727500000000,
  };

  it("accepts a fully compliant DecisionRecord in shadow mode", () => {
    const res = validateDecisionRecord(validRecord);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("accepts an ABSTAIN / UNKNOWN record with insufficient context", () => {
    const abstainRecord: DecisionRecord = {
      ...validRecord,
      riskBand: "UNKNOWN",
      disposition: "ABSTAIN",
      uncertainty: {
        status: "insufficient_context",
        calibratedScore: null,
        confidence: "unknown",
        reason: "truncated_dialogue_no_intent",
      },
    };
    const res = validateDecisionRecord(abstainRecord);
    expect(res.valid).toBe(true);
  });

  it("rejects invalid schemaVersion", () => {
    const invalid = { ...validRecord, schemaVersion: 2 };
    const res = validateDecisionRecord(invalid);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("schemaVersion"))).toBe(true);
  });

  it("rejects invalid policyMode", () => {
    const invalid = { ...validRecord, policyMode: "auto_ban_everyone" };
    const res = validateDecisionRecord(invalid);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("policyMode"))).toBe(true);
  });

  it("rejects out-of-range signal score", () => {
    const invalid: DecisionRecord = {
      ...validRecord,
      signals: [
        {
          kind: "isolation_request",
          state: "present",
          score: 1.5, // invalid > 1.0
          evidenceRefs: [0],
        },
      ],
    };
    const res = validateDecisionRecord(invalid);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("score must be in [0.0, 1.0]"))).toBe(true);
  });

  it("rejects out-of-range calibrated uncertainty score", () => {
    const invalid: DecisionRecord = {
      ...validRecord,
      uncertainty: {
        status: "calibrated",
        calibratedScore: -0.1, // invalid < 0.0
        confidence: "low",
      },
    };
    const res = validateDecisionRecord(invalid);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("calibratedScore"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SENTINEL MX — Benchmark Runner
// Corre el corpus etiquetado contra el Engine local y calcula métricas de
// detección (precision / recall / F1 / FPR) y de latencia (p50 / p95 / max).
//
// Un caso cuenta como "marcado" (flagged) cuando risk !== "LOW", que es el
// mismo criterio que usa Sentinel.analyze() para decidir si actúa.
// Se reporta por separado la tasa de escalación (escalate === true), porque
// cada escalación tiene costo de API/LLM.
// ─────────────────────────────────────────────────────────────────────────────

import { Engine } from "../src/analyzer/engine.js";
import type { Message, RiskLevel } from "../src/types/SentinelEngine.js";

export interface CorpusCase {
  id: string;
  group: string;
  label: "RISK" | "BENIGN";
  description: string;
  messages: Array<{ text: string; offset_s: number; sender?: string }>;
}

export interface Corpus {
  metadata: Record<string, unknown>;
  cases: CorpusCase[];
}

export interface CaseResult {
  id: string;
  group: string;
  label: "RISK" | "BENIGN";
  description: string;
  risk: RiskLevel;
  score: number;
  escalate: boolean;
  flagged: boolean;
  correct: boolean;
  latencyMs: number; // mediana de las corridas medidas
  termsMatched: string[];
  triggeredRules: string[];
}

export interface GroupStats {
  group: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface BenchmarkReport {
  timestamp: string;
  totalCases: number;
  detection: {
    truePositives: number;
    falsePositives: number;
    trueNegatives: number;
    falseNegatives: number;
    precision: number;
    recall: number;
    f1: number;
    falsePositiveRate: number;
    accuracy: number;
  };
  escalation: {
    /** % de casos BENIGN que escalarían a la API (costo innecesario) */
    benignEscalationRate: number;
    /** % de casos RISK que escalarían o se marcarían localmente */
    riskCoverage: number;
  };
  /**
   * Modelo de acción de 2 capas — más fiel a cómo funciona el producto que la
   * métrica binaria flagged/no-flagged. En la arquitectura SDK+LLM:
   *  - HIGH/CRITICAL = bloqueo local automático, sin pasar por el LLM.
   *  - MEDIUM = escala a la capa cognitiva para que el LLM decida.
   *  - LOW = pasa sin acción.
   * Por eso los errores no son simétricos: un BENIGN en HIGH/CRITICAL es un
   * bloqueo falso (grave); un BENIGN en MEDIUM solo gasta una escalación que el
   * LLM resuelve (barato). Un RISK en LOW es un miss real (no lo ve nadie); un
   * RISK en MEDIUM sí llega al LLM (cubierto).
   */
  action: {
    /** BENIGN que llega a HIGH/CRITICAL: bloqueo falso. Debe ser 0. */
    falseBlocks: number;
    falseBlockRate: number;
    /** BENIGN que llega a MEDIUM: escala al LLM. Tolerable en casos ambiguos. */
    benignReviewRate: number;
    /** RISK que NO llega ni a MEDIUM: invisible para todo el sistema. El error caro. */
    missedRisks: number;
    missRate: number;
    /** RISK que llega al menos a MEDIUM: lo ve el LLM o se bloquea. */
    riskReachRate: number;
  };
  latency: {
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
    meanMs: number;
  };
  byGroup: GroupStats[];
  failures: Array<{
    id: string;
    group: string;
    expected: string;
    got: RiskLevel;
    score: number;
    description: string;
    termsMatched: string[];
  }>;
  cases: CaseResult[];
}

const BASE_EPOCH_MS = 1_750_000_000_000;
const WARMUP_RUNS = 3;
const TIMED_RUNS = 15;

function toMessages(c: CorpusCase): Message[] {
  return c.messages.map((m) => ({
    text: m.text,
    timestamp: BASE_EPOCH_MS + m.offset_s * 1000,
    sender: m.sender,
  }));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function round(n: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function runBenchmark(corpus: Corpus): BenchmarkReport {
  const results: CaseResult[] = [];
  const allLatencies: number[] = [];

  for (const c of corpus.cases) {
    const messages = toMessages(c);

    // Engine nuevo por caso: VelocityDetector y estado de sesión no deben
    // contaminarse entre casos.
    const engine = new Engine();

    for (let i = 0; i < WARMUP_RUNS; i++) engine.analyze(messages);

    const latencies: number[] = [];
    let result = engine.analyze(messages);
    for (let i = 0; i < TIMED_RUNS; i++) {
      const t0 = performance.now();
      result = engine.analyze(messages);
      latencies.push(performance.now() - t0);
    }
    latencies.sort((a, b) => a - b);
    const median = latencies[Math.floor(latencies.length / 2)];
    allLatencies.push(...latencies);

    const flagged = result.risk !== "LOW";
    const correct = c.label === "RISK" ? flagged : !flagged;

    results.push({
      id: c.id,
      group: c.group,
      label: c.label,
      description: c.description,
      risk: result.risk,
      score: result.score,
      escalate: result.escalate,
      flagged,
      correct,
      latencyMs: round(median, 3),
      termsMatched: result.layers.v3.terms,
      triggeredRules: [
        ...result.layers.normalizer.triggeredRules,
        ...result.layers.v3.triggeredRules,
        ...result.layers.v4.triggeredRules,
        ...result.layers.temporal.triggeredRules,
      ],
    });
  }

  const tp = results.filter((r) => r.label === "RISK" && r.flagged).length;
  const fn = results.filter((r) => r.label === "RISK" && !r.flagged).length;
  const fp = results.filter((r) => r.label === "BENIGN" && r.flagged).length;
  const tn = results.filter((r) => r.label === "BENIGN" && !r.flagged).length;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;

  const benignCases = results.filter((r) => r.label === "BENIGN");
  const riskCases = results.filter((r) => r.label === "RISK");
  const benignEscalations = benignCases.filter((r) => r.escalate).length;
  const riskCovered = riskCases.filter((r) => r.flagged || r.escalate).length;

  // Modelo de acción de 2 capas
  const isBlock = (risk: RiskLevel) => risk === "HIGH" || risk === "CRITICAL";
  const isReach = (risk: RiskLevel) => risk !== "LOW";
  const falseBlocks = benignCases.filter((r) => isBlock(r.risk)).length;
  const benignReviews = benignCases.filter((r) => r.risk === "MEDIUM").length;
  const missedRisks = riskCases.filter((r) => !isReach(r.risk)).length;
  const riskReached = riskCases.filter((r) => isReach(r.risk)).length;

  const groups = [...new Set(results.map((r) => r.group))];
  const byGroup: GroupStats[] = groups.map((g) => {
    const inGroup = results.filter((r) => r.group === g);
    const correct = inGroup.filter((r) => r.correct).length;
    return {
      group: g,
      total: inGroup.length,
      correct,
      accuracy: round(correct / inGroup.length),
    };
  });

  allLatencies.sort((a, b) => a - b);

  return {
    timestamp: new Date().toISOString(),
    totalCases: results.length,
    detection: {
      truePositives: tp,
      falsePositives: fp,
      trueNegatives: tn,
      falseNegatives: fn,
      precision: round(precision),
      recall: round(recall),
      f1: round(f1),
      falsePositiveRate: round(fpr),
      accuracy: round((tp + tn) / results.length),
    },
    escalation: {
      benignEscalationRate: round(benignCases.length ? benignEscalations / benignCases.length : 0),
      riskCoverage: round(riskCases.length ? riskCovered / riskCases.length : 0),
    },
    action: {
      falseBlocks,
      falseBlockRate: round(benignCases.length ? falseBlocks / benignCases.length : 0),
      benignReviewRate: round(benignCases.length ? benignReviews / benignCases.length : 0),
      missedRisks,
      missRate: round(riskCases.length ? missedRisks / riskCases.length : 0),
      riskReachRate: round(riskCases.length ? riskReached / riskCases.length : 0),
    },
    latency: {
      p50Ms: round(percentile(allLatencies, 50), 3),
      p95Ms: round(percentile(allLatencies, 95), 3),
      maxMs: round(allLatencies[allLatencies.length - 1] ?? 0, 3),
      meanMs: round(allLatencies.reduce((a, b) => a + b, 0) / (allLatencies.length || 1), 3),
    },
    byGroup,
    failures: results
      .filter((r) => !r.correct)
      .map((r) => ({
        id: r.id,
        group: r.group,
        expected: r.label,
        got: r.risk,
        score: r.score,
        description: r.description,
        termsMatched: r.termsMatched,
      })),
    cases: results,
  };
}

export function formatReport(report: BenchmarkReport): string {
  const d = report.detection;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const lines: string[] = [];

  lines.push("");
  lines.push("═══════════════════════════════════════════════════");
  lines.push(" SENTINEL — Benchmark del motor local");
  lines.push("═══════════════════════════════════════════════════");
  lines.push(`Casos: ${report.totalCases}  ·  ${report.timestamp}`);
  lines.push("");
  lines.push("── Detección (flagged = risk ≥ MEDIUM) ──");
  lines.push(`  Precision:            ${pct(d.precision)}   (${d.truePositives}/${d.truePositives + d.falsePositives} marcados son riesgo real)`);
  lines.push(`  Recall:               ${pct(d.recall)}   (${d.truePositives}/${d.truePositives + d.falseNegatives} riesgos detectados)`);
  lines.push(`  F1:                   ${pct(d.f1)}`);
  lines.push(`  Falsos positivos:     ${pct(d.falsePositiveRate)}   (${d.falsePositives}/${d.falsePositives + d.trueNegatives} benignos marcados)`);
  lines.push(`  Accuracy:             ${pct(d.accuracy)}`);
  lines.push("");
  lines.push("── Modelo de acción de 2 capas (lo que importa en producción) ──");
  const a = report.action;
  lines.push(`  Bloqueos falsos:      ${pct(a.falseBlockRate)}   (${a.falseBlocks} benignos → HIGH/CRITICAL · DEBE ser 0)`);
  lines.push(`  Benignos a revisión:  ${pct(a.benignReviewRate)}   (→ MEDIUM · escalan al LLM, tolerable)`);
  lines.push(`  Riesgos no vistos:    ${pct(a.missRate)}   (${a.missedRisks} riesgos → LOW · el error caro)`);
  lines.push(`  Riesgos que el sistema alcanza a ver: ${pct(a.riskReachRate)}`);
  lines.push("");
  lines.push("── Escalación (costo de API) ──");
  lines.push(`  Benignos que escalan: ${pct(report.escalation.benignEscalationRate)}`);
  lines.push(`  Cobertura de riesgo:  ${pct(report.escalation.riskCoverage)}`);
  lines.push("");
  lines.push("── Latencia por analyze() ──");
  lines.push(`  p50: ${report.latency.p50Ms}ms · p95: ${report.latency.p95Ms}ms · max: ${report.latency.maxMs}ms`);
  lines.push("");
  lines.push("── Accuracy por grupo ──");
  for (const g of report.byGroup) {
    lines.push(`  ${g.group.padEnd(28)} ${g.correct}/${g.total}  (${pct(g.accuracy)})`);
  }

  if (report.failures.length > 0) {
    lines.push("");
    lines.push(`── Fallas (${report.failures.length}) ──`);
    for (const f of report.failures) {
      lines.push(`  [${f.id}] esperado=${f.expected} obtuvo=${f.got} score=${f.score}`);
      lines.push(`      ${f.description}`);
      if (f.termsMatched.length) lines.push(`      términos: ${f.termsMatched.join(", ")}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

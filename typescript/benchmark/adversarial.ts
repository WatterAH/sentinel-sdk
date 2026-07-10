// ─────────────────────────────────────────────────────────────────────────────
// Red-team adversarial — genera evasiones de los casos RISK y mide cuántas
// siguen detectándose. Un reclutador que aprende el filtro lo va a evadir; esto
// mide QUÉ transformación lo rompe ANTES de que la descubra en la calle.
// ─────────────────────────────────────────────────────────────────────────────

import { Engine } from "../src/analyzer/engine.js";
import type { CorpusCase, Corpus } from "./runner.js";

const BASE = 1_750_000_000_000;

// Ataque de homóglifos: reemplaza letras latinas por caracteres cirílicos/
// griegos visualmente idénticos (a→а cirílica, e→е, o→о, etc.).
const LATIN_TO_CONFUSABLE: Record<string, string> = {
  a: "а", e: "е", o: "о", p: "р", c: "с", y: "у", x: "х", i: "і",
  s: "ѕ", j: "ј", d: "ԁ", n: "ո", m: "м", t: "т", k: "к", v: "ѵ",
};

function applyConfusables(s: string): string {
  return [...s].map((ch) => LATIN_TO_CONFUSABLE[ch.toLowerCase()] ?? ch).join("");
}

function insertInvisibles(s: string): string {
  // Inserta zero-width space entre cada par de letras de cada palabra.
  return s.replace(/(\p{L})(?=\p{L})/gu, "$1​");
}

function toFullwidth(s: string): string {
  return [...s].map((ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 0x21 && code <= 0x7e) return String.fromCharCode(code + 0xfee0);
    return ch;
  }).join("");
}

function aggressiveLeet(s: string): string {
  const map: Record<string, string> = { a: "4", e: "3", i: "1", o: "0", s: "$", t: "7", l: "1" };
  return [...s].map((ch) => (Math.random() < 0.5 ? map[ch.toLowerCase()] ?? ch : ch)).join("");
}

function intraWordSpaces(s: string): string {
  // Ataque realista: espaciar solo las palabras largas (probables términos clave),
  // dejando intactas las funcionales — como lo haría un humano evadiendo.
  return s.replace(/\p{L}{4,}/gu, (word) => [...word].join(" "));
}

export interface Transform {
  name: string;
  apply: (messages: CorpusCase["messages"]) => CorpusCase["messages"];
}

// Transformaciones que modifican el texto de cada mensaje.
const TEXT_TRANSFORMS: Array<{ name: string; fn: (t: string) => string }> = [
  { name: "homoglyphs", fn: applyConfusables },
  { name: "invisibles", fn: insertInvisibles },
  { name: "fullwidth", fn: toFullwidth },
  { name: "leet_aggressive", fn: aggressiveLeet },
  { name: "intra_word_spaces", fn: intraWordSpaces },
];

export const TRANSFORMS: Transform[] = TEXT_TRANSFORMS.map((t) => ({
  name: t.name,
  apply: (messages) => messages.map((m) => ({ ...m, text: t.fn(m.text) })),
}));

// Partición: corta cada mensaje en dos, repartiendo el término entre mensajes
// consecutivos (evade el matching que asume el término en un solo mensaje).
TRANSFORMS.push({
  name: "message_splitting",
  apply: (messages) => {
    const out: CorpusCase["messages"] = [];
    for (const m of messages) {
      const mid = Math.floor(m.text.length / 2);
      out.push({ text: m.text.slice(0, mid), offset_s: m.offset_s });
      out.push({ text: m.text.slice(mid), offset_s: m.offset_s });
    }
    return out;
  },
});

export interface AdversarialReport {
  timestamp: string;
  baselineDetectionRate: number;
  byTransform: Array<{
    transform: string;
    riskCases: number;
    stillDetected: number;
    survivalRate: number; // % de casos RISK que SIGUEN detectándose tras la evasión
    broken: string[]; // ids que dejaron de detectarse
  }>;
}

function detected(engine: Engine, msgs: CorpusCase["messages"]): boolean {
  const r = engine.analyze(msgs.map((m) => ({ text: m.text, timestamp: BASE + m.offset_s * 1000 })));
  return r.risk !== "LOW";
}

export function runAdversarial(corpus: Corpus): AdversarialReport {
  const riskCases = corpus.cases.filter((c) => c.label === "RISK");

  // Baseline: cuántos RISK se detectan SIN transformar (para medir supervivencia relativa).
  const baseDetected = riskCases.filter((c) => detected(new Engine(), c.messages));
  const baselineRate = baseDetected.length / riskCases.length;

  const byTransform = TRANSFORMS.map((t) => {
    // Solo cuentan los casos que SÍ se detectaban antes de la transformación.
    const broken: string[] = [];
    let stillDetected = 0;
    for (const c of baseDetected) {
      const transformed = t.apply(c.messages);
      if (detected(new Engine(), transformed)) stillDetected++;
      else broken.push(c.id);
    }
    return {
      transform: t.name,
      riskCases: baseDetected.length,
      stillDetected,
      survivalRate: Math.round((stillDetected / baseDetected.length) * 1000) / 1000,
      broken,
    };
  });

  return {
    timestamp: new Date().toISOString(),
    baselineDetectionRate: Math.round(baselineRate * 1000) / 1000,
    byTransform,
  };
}

export function formatAdversarial(r: AdversarialReport): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("═══ Red-team adversarial ═══");
  lines.push(`Baseline: ${(r.baselineDetectionRate * 100).toFixed(1)}% de casos RISK detectados sin evasión`);
  lines.push("");
  lines.push("Supervivencia de detección por transformación de evasión:");
  for (const t of [...r.byTransform].sort((a, b) => a.survivalRate - b.survivalRate)) {
    const bar = t.survivalRate < 0.5 ? "  ⚠️ ROTO" : t.survivalRate < 0.9 ? "  ⚠️" : "";
    lines.push(`  ${t.transform.padEnd(20)} ${(t.survivalRate * 100).toFixed(0).padStart(3)}% sobrevive  (${t.stillDetected}/${t.riskCases})${bar}`);
  }
  return lines.join("\n");
}

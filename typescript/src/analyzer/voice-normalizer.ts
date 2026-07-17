import { sanitizeUnicode } from "./text-utils.js";

/**
 * Muletillas deliberadamente cortas y conservadoras para español mexicano.
 *
 * - eh/em/mmm: vacilaciones no léxicas producidas por el habla o el ASR.
 * - este: marcador de planificación muy frecuente; también puede ser
 *   demostrativo, pero retirarlo no agrega vocabulario de riesgo, solo evita
 *   que parta una frase ya existente ("hay este jale" → "hay jale").
 * - pues: marcador discursivo que suele intercalarse entre verbo y complemento.
 * - o sea: reformulación; no cambia la intención de la frase que conecta.
 *
 * No se retiran "oye", "mira", "bueno", "nomás" ni negaciones: pueden portar
 * intención o cambiar el significado y borrarlas abriría falsos positivos.
 */
const VOICE_FILLERS: Array<{ label: string; pattern: RegExp }> = [
  { label: "hesitation", pattern: /(?<![\p{L}\p{N}])(?:eh+|em+|m{2,})(?![\p{L}\p{N}])/giu },
  { label: "este", pattern: /(?<![\p{L}\p{N}])este(?![\p{L}\p{N}])/giu },
  { label: "pues", pattern: /(?<![\p{L}\p{N}])pues(?![\p{L}\p{N}])/giu },
  { label: "o-sea", pattern: /(?<![\p{L}\p{N}])o\s+sea(?![\p{L}\p{N}])/giu },
];

export interface VoicePreprocessResult {
  text: string;
  transformations: string[];
}

/**
 * Preprocesa una transcripción antes del normalizador léxico compartido.
 *
 * La ruta de voz NO ejecuta deLeet ni collapseIntraWordSpacing: son defensas
 * contra evasión por teclado y no describen ruido acústico. sanitizeUnicode se
 * conserva únicamente como higiene de entrada, pero se etiqueta como voz y no
 * activa N0-EVASION. Las pausas/puntuación del ASR se convierten en espacios y
 * se retiran muletillas para que el matching multi-palabra existente tolere
 * "hay... este... jale" sin relajar fronteras ni umbrales globales.
 */
export function preprocessVoiceTranscript(raw: string): VoicePreprocessResult {
  const transformations: string[] = [];
  const sanitized = sanitizeUnicode(raw);
  if (sanitized !== raw) transformations.push("voice-unicode-sanitize");

  let text = sanitized.toLowerCase().trim();
  const withoutPauses = text.replace(/[.,;:!?¡¿…—–-]+/gu, " ");
  if (withoutPauses !== text) transformations.push("voice-pause-cleanup");
  text = withoutPauses;

  for (const filler of VOICE_FILLERS) {
    const stripped = text.replace(filler.pattern, " ");
    if (stripped !== text) transformations.push(`voice-filler:${filler.label}`);
    text = stripped;
  }

  text = text.replace(/\s+/g, " ").trim();
  return { text, transformations };
}

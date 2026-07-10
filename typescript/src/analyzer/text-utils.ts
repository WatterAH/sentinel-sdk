// ─── Utilidades de normalización de texto ────────────────────────────────────

/** Elimina acentos y diacríticos unicode. */
export function removeAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Colapsa 3+ caracteres repetidos a 2: "jaleeeee" → "jalee". */
export function collapseRepeated(text: string): string {
  return text.replace(/(.)\1{2,}/g, "$1$1");
}

// ─── Blindaje anti-evasión (red-team) ────────────────────────────────────────

// Homóglifos cirílicos/griegos visualmente idénticos a letras latinas. NFKC no
// los toca (son letras distintas, no de compatibilidad) — hay que mapearlos.
const CONFUSABLE_FOLD: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i",
  "ѕ": "s", "ј": "j", "ԁ": "d", "ո": "n", "м": "m", "т": "t", "к": "k", "ѵ": "v",
  "α": "a", "ο": "o", "ν": "v", "ρ": "p", "τ": "t", "κ": "k", "ⅼ": "l", "ⅰ": "i",
  "ｇ": "g",
};

// Caracteres invisibles / de formato insertados dentro de palabras para romper
// el matching (zero-width space/joiner, word joiner, soft hyphen, BOM, marcas
// de dirección bidi).
const INVISIBLE_CHARS = /[​-‏‪-‮⁠-⁩­﻿᠎؜]/g;

// De-leet: solo se aplica a tokens que MEZCLAN letra y dígito/símbolo (h4lc0n),
// nunca a números puros ("5 mil" se preserva).
const LEET_FOLD: Record<string, string> = {
  "4": "a", "3": "e", "1": "i", "0": "o", "5": "s", "7": "t", "9": "g",
  "$": "s", "@": "a", "€": "e", "!": "i", "|": "i",
};

/**
 * Sanea evasiones a nivel de carácter ANTES de toda otra normalización:
 * NFKC (colapsa fullwidth ｆ→f y compatibilidad) + elimina invisibles +
 * pliega homóglifos cirílicos/griegos a latino.
 */
export function sanitizeUnicode(text: string): string {
  const out = text.normalize("NFKC").replace(INVISIBLE_CHARS, "");
  return [...out].map((ch) => CONFUSABLE_FOLD[ch] ?? ch).join("");
}

/**
 * Colapsa espaciado intra-palabra insertado como evasión:
 * "f a c e b o o k" → "facebook". Solo une secuencias de ≥4 tokens de un solo
 * carácter, preservando palabras cortas legítimas sueltas ("a", "y", "de").
 */
export function collapseIntraWordSpacing(text: string): string {
  return text.replace(
    /(?:(?<=\s)|^)((?:[\p{L}\p{N}]\s+){3,}[\p{L}\p{N}])(?=\s|$|[.,!?])/gu,
    (match) => match.replace(/\s+/g, ""),
  );
}

/**
 * De-leet condicional: en tokens que mezclan letras y símbolos-leet (h4lc0n,
 * bi$ne) traduce los símbolos a su letra; los números puros ("5000") quedan
 * intactos para no corromper cantidades.
 */
export function deLeet(text: string): string {
  return text.replace(/[\p{L}\p{N}$@€!|]+/gu, (token) => {
    const hasLetter = /\p{L}/u.test(token);
    const hasLeet = /[0-9$@€!|]/.test(token);
    if (!hasLetter || !hasLeet) return token;
    return [...token].map((ch) => LEET_FOLD[ch] ?? ch).join("");
  });
}

/** Construye una expresión regular con límites de palabra Unicode. */
export function buildRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexible = escaped.replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${flexible}(?![\\p{L}\\p{N}])`, 'ui');
}


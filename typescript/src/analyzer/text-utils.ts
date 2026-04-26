// ─── Utilidades de normalización de texto ────────────────────────────────────

/** Elimina acentos y diacríticos unicode. */
export function removeAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Colapsa 3+ caracteres repetidos a 2: "jaleeeee" → "jalee". */
export function collapseRepeated(text: string): string {
  return text.replace(/(.)\1{2,}/g, "$1$1");
}

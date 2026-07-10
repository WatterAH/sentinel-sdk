// ─────────────────────────────────────────────────────────────────────────────
// Política por banda de edad (roadmap 7.4)
//
// La misma conversación no es igual de riesgosa para un niño de 12 que para un
// adulto, y la plataforma SÍ conoce la edad (la pide al registrarse). Sin este
// contexto el motor usa un umbral único, lo que produce falsos positivos con
// adultos (una oferta de trabajo real entre adultos usa el mismo léxico) y falta
// de sensibilidad con menores (pedir la edad/aislar a un niño es más grave).
//
// El ajuste se hace por CATEGORÍA sobre los pesos del léxico V3:
//   - En menores se AMPLIFICAN las categorías predatorias hacia la infancia
//     (solicitud de información, aislamiento, vectores de juego/redes).
//   - En adultos se AMORTIGUAN las categorías que son legítimas entre adultos
//     (oferta económica, formalidad laboral, reclutamiento genérico).
// Sin banda de edad, todos los multiplicadores son 1 (comportamiento previo).
// ─────────────────────────────────────────────────────────────────────────────

export type AgeBand = "under13" | "13-15" | "16-17" | "adult";

const MULTIPLIERS: Record<AgeBand, Record<string, number>> = {
  under13: {
    solicitud_informacion: 1.6,
    aislamiento: 1.5,
    videojuegos_vector: 1.5,
    redes_sociales_vector: 1.4,
    señal_emoji: 1.3,
    manipulacion_social: 1.3,
  },
  "13-15": {
    solicitud_informacion: 1.4,
    aislamiento: 1.3,
    videojuegos_vector: 1.3,
    redes_sociales_vector: 1.2,
  },
  "16-17": {
    solicitud_informacion: 1.15,
    aislamiento: 1.15,
  },
  adult: {
    // Entre adultos, ofertas de trabajo y jerga laboral son legítimas.
    oferta_economica: 0.5,
    formalidad_deceptiva: 0.4,
    reclutamiento: 0.7,
    videojuegos_vector: 0.6,
    solicitud_informacion: 0.6,
  },
};

/** Multiplicador de peso para una categoría dada la banda de edad. 1 si no aplica. */
export function ageCategoryMultiplier(ageBand: AgeBand | undefined, category: string | undefined): number {
  if (!ageBand || !category) return 1;
  return MULTIPLIERS[ageBand]?.[category] ?? 1;
}

const VALID: ReadonlySet<string> = new Set(["under13", "13-15", "16-17", "adult"]);

/** Valida/normaliza la banda de edad recibida; devuelve undefined si no es válida. */
export function normalizeAgeBand(value: unknown): AgeBand | undefined {
  return typeof value === "string" && VALID.has(value) ? (value as AgeBand) : undefined;
}

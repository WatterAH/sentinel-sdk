# Dataset Card — Sentinel Mexican Exploitation & Recruitment Corpus (v1.0)

- **Nombre:** Sentinel Mexican Spanish Grooming & Recruitment Corpus
- **Versión:** 1.0 (2026-09-28)
- **Tarea asociada:** S09
- **Idioma:** Español mexicano (coloquial, jerga juvenil, narcocultura pop, modismos regionales)
- **Licencia:** CC-BY 4.0 para pares contrastivos sintéticos; uso restringido a investigación/evaluación para corpus histórico.

---

## 1. Resumen y Propósito del Dataset

Este dataset fue diseñado para entrenar, calibrar y evaluar motores de detección temprana de captación infantil y reclutamiento del crimen organizado en plataformas de mensajería y gaming en México.

El dataset combate activamente el sesgo de memorización superficial y los falsos positivos culturales (música, gaming, jerga coloquial de "jalar" o "paro") mediante **pares contrastivos** que conservan el mismo vocabulario pero modifican la intención y asimetría de la conducta.

---

## 2. Composición y Estado de Revisión del Corpus

| Segmento | Casos | Estado de Aceptación | Uso Autorizado | Procedencia / Fuente |
|---|---:|---|---|---|
| **Línea Base Histórica** | 143 | Aceptado como desarrollo/regresión | Entrenamiento, Evaluación | `src_expert_curated_mexican_rubric` / Baseline |
| **Muestra de Expansión (20%)** | 42 | Aceptado por el dueño (2026-07-18) | Entrenamiento, Evaluación | `src_expert_curated_mexican_rubric` |
| **Segunda Opinión Recomendada** | 2 | Pendiente de experto (`RP-023`, `NC-023`) | Holdout / Evaluación | `src_expert_curated_mexican_rubric` |
| **Cola de Revisión Pendiente** | 168 | Pendiente (7 lotes cegados exportados) | **Excluido de entrenamiento** | `SHADOW_REVIEW_QUEUE.md` / `evidence/S09/batches/` |
| **Pares Contrastivos Sintéticos** | 100 | Adjudicado (50 familias emparejadas) | Entrenamiento, Benchmark, Holdout | `src_synth_contrast_mx` (CC-BY 4.0) |
| **Total General** | **453** | **285 activos autorizados / 168 pendientes** | — | — |

---

## 3. Niveles de Validación Humana y Trazabilidad

Para evitar falsas afirmaciones de revisión especializada, Sentinel diferencia tres niveles formales:

1. **Nivel 1 — Revisión del Dueño (Owner Review):**
   - Validación del lenguaje, naturalidad del español mexicano y consistencia de etiquetas por Luis Merida (`rev_luis`).
   - Cubre los 143 base, los 42 de muestra y los 100 contrastivos sintéticos.

2. **Nivel 2 — Doble Revisión Ciega (Inter-Annotator Agreement):**
   - Dos revisores humanos independientes anotan sin ver predicciones ni etiquetas previas.
   - Cálculo de Cohen's Kappa y adjudicación de discrepancias mediante `scripts/adjudicate_annotations.py`.

3. **Nivel 3 — Validación Especializada Externa:**
   - Validación por peritos en criminología infantil, fiscales o psicólogos de ONGs de protección infantil.
   - Requerido antes de la promoción a producción (Gate G5).
   - Casos como `RP-023` (prueba de obediencia débil) y `NC-023` permanecen expresamente marcados para este nivel.

---

## 4. Distribución por Clases y Familias

- **Distribución de Clases:**
  - `RISK`: 50% (Captación, halconeo, transporte ilícito, enganche por deuda, aislamiento).
  - `BENIGN`: 50% (Empleo legítimo, supervisión familiar explícita, narcocultura pop citada, jerga juvenil inocente, gaming).
- **Aislamiento por Familia (`family_id`):**
  - Cada par contrastivo comparte `family_id` y es asignado al mismo `split` (`train`, `validation`, `holdout_test`, `benchmark`) para prevenir fuga de datos (*data leakage*) entre entrenamiento y prueba.

---

## 5. Manifiesto de Permisos y Gobernanza

- **Exclusión de Entrenamiento:** Ningún caso con estatus `pending_review` (168 casos) o procedente de fuentes `discovery_only` (como Reddit o RSS) puede ser incluido en el conjunto de entrenamiento de modelos supervisados o destilados.
- **Formato y Esquema:** Validado al 100% contra `sentinel-sdk/docs/plan-2026-09/schemas/conversation_annotation.schema.json`.

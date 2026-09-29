# Evidencia S09 — Adjudicar Corpus y Crear Contrastes Mexicanos

- **Tarea:** S09 (T3, ~10h)
- **Fecha de ejecución:** 2026-09-28
- **Estado:** DONE

---

## 1. Resumen de Trabajo Realizado

1. **Exportación de Lotes Cegados para Revisión Humana (`scripts/export_review_batches.py`):**
   - Se procesó el corpus completo de 353 casos en `typescript/benchmark/corpus.json`.
   - Se aislaron los 168 casos pendientes en 7 lotes de 24 casos bajo `evidence/S09/batches/review_batch_01.json` a `review_batch_07.json`.
   - Las predicciones y etiquetas previas se encuentran ocultas (`blinded_prediction: true`, `expected_label_hidden: true`) para garantizar independencia en la anotación humana.
   - Se exportó el lote especial `special_second_opinion_batch.json` para los dos casos que requieren segunda opinión especializada (`RP-023` y `NC-023`).

2. **Generación de 100 Casos Contrastivos Mexicanos (50 Pares) (`scripts/synthesize_contrastive_pairs.py`):**
   - Se sintetizaron 100 conversaciones organizadas en 50 familias (`family_id`) emparejadas:
     - Vertiente `RISK`: Halconeo, transporte/mula ilícito, enganche por deuda, triangulación de canales, engaño laboral.
     - Vertiente `BENIGN`: Empleo legítimo familiar, favores escolares, gaming/intercambio de skins, corridos citados, modismos coloquiales ("paro", "jale", "topón").
   - Licenciamiento explícito bajo CC-BY 4.0 (`license_or_permission_ref: "cc_by_4_0_synthetic_contrastive"`), con asignación de splits atada por familia (`train`, `validation`, `holdout_test`, `benchmark`) para evitar *data leakage*.

3. **Herramienta de Adjudicación e Inter-Annotator Agreement (`scripts/adjudicate_annotations.py`):**
   - Cálculo determinista de concordancia observada ($P_o$), concordancia por azar ($P_e$), Cohen's Kappa ($\kappa$) y extracción automática de discrepancias.

4. **Dataset Card Formal (`docs/DATASET_CARD_MEXICAN_CORPUS_v1.md`):**
   - Documentación exhaustiva de los 453 casos totales (143 base, 42 muestra aceptada, 168 pendientes cegados y 100 contrastivos sintéticos).
   - Distinción rigurosa de niveles de revisión: Nivel 1 (Revisión del dueño), Nivel 2 (Doble revisión ciega), Nivel 3 (Validación especializada externa).

---

## 2. Verificación y Resultados

```bash
$ python3 scripts/verify_annotation_schema.py
✓ All 10 training fixtures are 100% valid against the schema.
✓ All 100 contrastive Mexican pairs (S09) are 100% valid against the schema.
  ✓ Rejected invalid case: 'missing_family_id' as expected ('family_id' is a required property)
  ✓ Rejected invalid case: 'invalid_label' as expected ('MALICIOUS_CRIMINAL' is not one of ['BENIGN', 'RISK', 'INSUFFICIENT_CONTEXT'])
  ✓ Rejected invalid case: 'invalid_reviewer_format' as expected ('ai_agent_01' does not match '^rev_[a-z0-9]{4,16}$')
  ✓ Rejected invalid case: 'negative_turn_index' as expected (-1 is less than the minimum of 0)
  ✓ Rejected invalid case: 'invalid_source_type' as expected ('unauthorized_web_scraping' is not one of ['synthetic_authored', 'adversarial_paraphrase', 'contrastive_pair', 'deidentified_sample', 'curated_negative'])
  ✓ Rejected invalid case: 'empty_turns' as expected ([] should be non-empty)
SCHEMA_VALIDATION_OK: Schema correctly accepts valid fixtures and rejects invalid test variations.
```

### Verificación Global de Fast Checks (`scripts/run_fast_checks.py --all`)

```bash
═══════════════════════════════════════════════
All 5 fast check suites passed successfully:
  ✓ plan-check         exit=0
  ✓ plan-tools         exit=0
  ✓ sdk-typecheck      exit=0
  ✓ sdk-unit-tests     exit=0 [128 passed]
  ✓ api-unit-tests     exit=0 [88 passed]
═══════════════════════════════════════════════
```

---

## 3. Limitaciones y Próxima Acción

- Los 168 casos pendientes permanecen deliberadamente excluidos del entrenamiento hasta que se completen las sesiones de anotación humana correspondientes.
- Los pares contrastivos sintéticos quedan listos para el congelamiento de protocolo, splits y métricas en **S10**.

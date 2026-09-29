# Evidencia S04 — Rúbrica Mexicana y Protocolo de Anotación

Fecha de ejecución: 2026-09-28.
Responsable: T3 / Astra — Sol / Medium (Antigravity).

---

## 1. Entregables Elaborados y Estructurados

1. **Rúbrica Mexicana y Protocolo (v1.0):**
   - Archivo: `sentinel-sdk/docs/plan-2026-09/annotation_rubric_v1.md`.
   - Clases formales: `BENIGN`, `RISK`, `INSUFFICIENT_CONTEXT`.
   - Cobertura explícita de fenómenos del español mexicano: jerga cotidiana, gaming, citas de narcocultura/corridos en tono cultural, reportes de terceros, supervisión familiar y rechazo explícito.
   - Prohibición expresa de vincular modismos regionales, errores ortográficos o acentos a delincuencia.
2. **Schema JSON Validable:**
   - Archivo: `sentinel-sdk/docs/plan-2026-09/schemas/conversation_annotation.schema.json` (JSON Schema Draft 2020-12).
   - Exige linaje estricto (`family_id`, `parent_id`, `source_id`, `source_type`, `allowed_uses`, `license_or_permission_ref`).
   - Restringe revisores al patrón `^rev_[a-z0-9]{4,16}$` para impedir auto-asignación por modelos de IA o scripts.
3. **10 Ejemplos Ficticios de Entrenamiento para Anotadores:**
   - Archivo: `sentinel-sdk/docs/plan-2026-09/evidence/S04/training_examples_10.json`.
   - Cobertura de 10 casos diversos (halconeo parafraseado, gaming, narcocultura citada, transporte ilícito, mandado cotidiano, contexto insuficiente, coacción por deuda, noticias de terceros, triangulación a Telegram, rechazo con tutor).

---

## 2. Verificación Determinista del Esquema

Se ejecutó la suite de verificación automatizada:
```bash
python3 sentinel-sdk/scripts/verify_annotation_schema.py
```
**Resultado:** Exit code **0**.

```text
✓ All 10 training fixtures are 100% valid against the schema.
  ✓ Rejected invalid case: 'missing_family_id' as expected ('family_id' is a required property)
  ✓ Rejected invalid case: 'invalid_label' as expected ('MALICIOUS_CRIMINAL' is not one of ['BENIGN', 'RISK', 'INSUFFICIENT_CONTEXT'])
  ✓ Rejected invalid case: 'invalid_reviewer_format' as expected ('ai_agent_01' does not match '^rev_[a-z0-9]{4,16}$')
  ✓ Rejected invalid case: 'negative_turn_index' as expected (-1 is less than the minimum of 0)
  ✓ Rejected invalid case: 'invalid_source_type' as expected ('unauthorized_web_scraping' is not one of ['synthetic_authored', 'adversarial_paraphrase', 'contrastive_pair', 'deidentified_sample', 'curated_negative'])
  ✓ Rejected invalid case: 'empty_turns' as expected ([] should be non-empty)
SCHEMA_VALIDATION_OK: Schema correctly accepts valid fixtures and rejects invalid test variations.
```

---

## 3. Protocolo de Doble Revisión y Adjudicación

- **Doble lectura ciega obligatoria:** Aplicable al 100% de los casos de frontera semántica (`RP-*`), hard negatives sensibles (`BT-*`) y a una muestra aleatoria del 20% del corpus restante.
- **Aislamiento de predicciones:** Durante la primera pasada de anotación, los revisores no visualizan la predicción de modelos ni la descripción editorial para evitar sesgo de confirmación.
- **Gestión de desacuerdos:** Las discrepancias se documentan en `discrepancy_log` y se escalan a un panel de adjudicación con especialistas en derechos de la infancia y criminología.

---

## 4. Estado de Validación y Límites

- **Preparación técnica y de ingeniería:** Completa y validada (S04).
- **Aprobación experta externa:** Queda documentada como requerimiento formal previo a la ejecución del piloto supervisado (habilitación en `S08` y `S20`).

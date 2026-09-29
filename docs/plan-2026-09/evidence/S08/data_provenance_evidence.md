# Evidencia S08 — Procedencia y Permisos de los Datos

- **Tarea:** S08 (T2, ~4h)
- **Fecha de ejecución:** 2026-09-28
- **Estado:** DONE

---

## 1. Resumen de Cambios Implementados

Se implementó el marco formal de procedencia, permisos y derechos de uso de datos para Sentinel (`sentinel-api`), asegurando que ninguna fuente sin derechos o en cuarentena se mezcle con datos aprobados de entrenamiento/evaluación:

1. **Modelo Formal de Procedencia (`DataSource` en `src/models/db_models.py`):**
   - Atributos: `id`, `name`, `canonical_origin`, `source_type`, `permission_status` (`approved`, `quarantine`, `unknown`, `revoked`), `allowed_uses` (`discovery`, `training`, `evaluation`, `redistribution`), `license_or_permission_ref`, `reviewed_by` (formato seudónimo `rev_XXXX`), `reviewed_at`, `parent_source_id`.
   - Columnas `canonical_origin`, `content_hash` y `source_id` agregadas a `HotTerm` y `CandidateSighting`.

2. **Servicio de Gobernanza y Exportación (`src/services/data_provenance_service.py`):**
   - Inicialización automática de fuentes canónicas:
     - `src_legacy_seed`: estatus `unknown`, uso restringido a `discovery`, excluido de entrenamiento.
     - `src_reddit_discovery`: estatus `approved`, uso `discovery` (según Data API Terms de Reddit), excluido de entrenamiento/redistribución.
     - `src_borderlandbeat_discovery` / `src_rss_mexico_news`: estatus `approved`, uso `discovery`.
     - `src_expert_curated_mexican_rubric`: estatus `approved`, usos `discovery,training,evaluation`.
     - `src_synthetic_contrastive_mexican`: estatus `approved`, usos `discovery,training,evaluation,redistribution` (CC-BY 4.0).
   - Función `export_dataset_by_usage(db, target_use, category)` que filtra estrictamente por permisos del origen canónico y genera un manifiesto de auditoría con el desglose de exclusiones (`unauthorized_usage_rights`, `quarantined_source`, `unknown_permissions`, `revoked_source`, `unreviewed_term`).

3. **Deduplicación por Origen Canónico y Hash de Contenido (`src/services/candidate_scorer.py`):**
   - En `get_mature_candidates`: dos URLs distintas del mismo medio/dominio o con el mismo hash de contenido normalizado cuentan como una sola fuente. La regla de maduración exige `>=2` orígenes canónicos distintos y `>=2` hashes de contenido distintos.

4. **Gobernanza y Cuarentena de Nuevas Fuentes:**
   - Nuevas fuentes entran en estado `quarantine` por defecto.
   - Publicación y promoción de términos exige revisión humana explícita (`reviewed=True`).

5. **Endpoints de Administración (`src/routes/admin.py`):**
   - `GET /admin/api/sources`: Listado de fuentes registradas.
   - `POST /admin/api/sources`: Registro de fuentes (por defecto en cuarentena).
   - `POST /admin/api/sources/{source_id}/review`: Revisión humana de fuentes con ID `rev_XXXX`.
   - `GET /admin/api/dataset/export?target_use=...`: Export de datasets auditado según derechos de uso.

---

## 2. Verificación y Resultados de Pruebas

### Suite de Procedencia y Permisos (`tests/test_data_provenance.py`)

Se ejecutó la suite completa con 7 tests unitarios deterministas:

```bash
$ venv/bin/pytest tests/test_data_provenance.py -v
============================= test session starts ==============================
platform darwin -- Python 3.14.7, pytest-9.1.1, pluggy-1.6.0
rootdir: /Users/luismerida/Documents/Sentinel - DreamTeam/sentinel-api
plugins: anyio-4.13.0
collected 7 items

tests/test_data_provenance.py::test_deduplication_different_urls_same_origin_and_content PASSED [ 14%]
tests/test_data_provenance.py::test_unreviewed_terms_cannot_be_published PASSED [ 28%]
tests/test_data_provenance.py::test_legacy_unknown_permissions_excluded_from_training_export PASSED [ 42%]
tests/test_data_provenance.py::test_quarantined_and_revoked_sources_excluded PASSED [ 57%]
tests/test_data_provenance.py::test_rights_differentiation_discovery_vs_training_vs_redistribution PASSED [ 71%]
tests/test_data_provenance.py::test_human_review_of_source_requires_pseudonym PASSED [ 85%]
tests/test_data_provenance.py::test_admin_api_endpoints_for_provenance PASSED [100%]

============================== 7 passed in 0.45s ===============================
```

### Verificación Global de Fast Checks (`sentinel-sdk/scripts/run_fast_checks.py`)

```bash
$ python3 scripts/run_fast_checks.py --all
═══════════════════════════════════════════════
All 5 fast check suites passed successfully:
  ✓ plan-check         exit=0 (0.05s)
  ✓ plan-tools         exit=0 (0.27s)
  ✓ sdk-typecheck      exit=0 (0.73s)
  ✓ sdk-unit-tests     exit=0 (3.26s) [128 passed]
  ✓ api-unit-tests     exit=0 (1.19s) [88 passed]
═══════════════════════════════════════════════
```

---

## 3. Limitaciones

- El scraping en vivo a Reddit, Genius o YouTube permanece desactivado en entornos de desarrollo y pruebas; toda la validación se realiza mediante fixtures locales y feeds controlados.
- Los derechos de redistribución se reservan exclusivamente para activos sintéticos o de panel experto con consentimiento formal.

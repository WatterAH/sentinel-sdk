# Evidencia S07 — Aislamiento y Ownership del Piloto

- **Tarea:** S07 (T4, ~5h)
- **Fecha de ejecución:** 2026-09-28
- **Estado:** DONE
- **Decisión Arquitectónica:** `sentinel-sdk/docs/plan-2026-09/decisions/ADR-002-client-isolation-and-tenancy.md`

---

## 1. Resumen de Cambios Implementados

Se implementó el aislamiento estricto por cliente (tenant) en todas las rutas de datos de `sentinel-api` sin comprometer la privacidad ni la compatibilidad:

1. **Autenticación y Derivación de Tenant:**
   - Middleware `require_client_key` verifica las claves en `SENTINEL_API_KEYS` y rechaza revocadas (`SENTINEL_REVOKED_KEYS` con 401).
   - Generación determinista de `api_key_hash` para identificar al tenant en todas las capas.

2. **Modelos y Base de Datos (`src/models/db_models.py`, `src/services/db_service.py`):**
   - Agregada columna `api_key_hash` en modelos `Session` y `ActorSighting`.
   - Namespace en IDs de sesión internos `f"{api_key_hash[:16]}:{session_uuid}"` para evitar colisiones de IDs idénticos entre clientes.
   - Función `_public_session_id` para devolver al SDK el ID limpio transparente.
   - Filtrado mandatorio por `api_key_hash` en todas las consultas de sesión, mensajes y feedback.

3. **Rutas y Controladores:**
   - `/api/v1/messages/sync` (`src/routes/messages.py`, `src/controllers/message_controller.py`): Protegido con `require_client_key`, almacenamiento e historiales aislados por tenant.
   - `/api/v1/analyze` (`src/routes/analyze.py`, `src/controllers/analysis_controller.py`): Propaga `api_key_hash` al servicio de red.
   - `/api/v1/evidence/{session_id}` (`src/routes/evidence.py`): Valida pertenencia de la sesión antes de generar ZIP de cadena de custodia (retorna 404 si la sesión pertenece a otro tenant).
   - `/api/v1/feedback` (`src/routes/feedback.py`): Asocia feedback recibido al tenant autenticado.
   - `/api/v1/network/report` (`src/routes/network.py`, `src/services/network_service.py`): Salteado criptográfico por tenant en hashes de agresor, sesión y huella de guion (`script_fp`), previniendo correlaciones cruzadas no autorizadas.
   - `/api/v1/value-report/monthly` (`src/routes/value_report.py`, `src/services/monthly_value_service.py`): Agregación mensual exclusiva de los snapshots de telemetría del tenant solicitante.

4. **Separación de Roles Client vs Admin:**
   - Rutas maestras y de publicación protegidas con `require_admin_key`.

---

## 2. Verificación y Resultados de Pruebas

### Suite de Aislamiento Multitenant (`tests/test_tenant_isolation.py`)

Se ejecutó la suite completa de pruebas en `sentinel-api` cubriendo 8 escenarios de aislamiento:

```bash
$ venv/bin/pytest tests/test_tenant_isolation.py -v
============================= test session starts ==============================
platform darwin -- Python 3.14.7, pytest-9.1.1, pluggy-1.6.0
rootdir: /Users/luismerida/Documents/Sentinel - DreamTeam/sentinel-api
plugins: anyio-4.13.0
collected 8 items

tests/test_tenant_isolation.py::test_message_sync_isolation_same_session_id PASSED [ 12%]
tests/test_tenant_isolation.py::test_session_history_isolation PASSED          [ 25%]
tests/test_tenant_isolation.py::test_evidence_generation_rejects_other_tenant_session PASSED [ 37%]
tests/test_tenant_isolation.py::test_analyze_pipeline_propagates_tenant_isolation PASSED [ 50%]
tests/test_tenant_isolation.py::test_network_actor_isolation_no_cross_tenant_recidivism PASSED [ 62%]
tests/test_tenant_isolation.py::test_feedback_submission_and_tenant_partitioning PASSED [ 75%]
tests/test_tenant_isolation.py::test_value_report_isolation_by_tenant PASSED    [ 87%]
tests/test_tenant_isolation.py::test_revoked_key_rejected PASSED                [100%]

============================== 8 passed in 0.28s ===============================
```

### Verificación Global de Fast Checks (`sentinel-sdk/scripts/run_fast_checks.py`)

```bash
$ python3 scripts/run_fast_checks.py --all
═══════════════════════════════════════════════
All 5 fast check suites passed successfully:
  ✓ plan-check         exit=0 (0.04s)
  ✓ plan-tools         exit=0 (0.23s)
  ✓ sdk-typecheck      exit=0 (0.65s)
  ✓ sdk-unit-tests     exit=0 (3.14s) [128 passed]
  ✓ api-unit-tests     exit=0 (1.00s) [81 passed]
═══════════════════════════════════════════════
```

---

## 3. Limitaciones y Fronteras

- El salting por tenant previene deliberadamente la detección federada inter-organización en esta fase para garantizar privacidad absoluta.
- Los despliegues que requieran segregación física absoluta de base de datos pueden ejecutarse como instancias independientes configurando una única API key por contenedor sin cambios de código.

# Evidencia S21: Operación reproducible del piloto

## Resumen de Ejecución
- **Fecha:** 2026-09-28
- **Tarea:** S21 — Operación reproducible del piloto
- **Estado:** DONE
- **Preparación Operativa:** `READY_FOR_PILOT`

## Componentes y Procedimientos Operativos Entregados

1. **Manual Operativo Completo ([`PILOT_OPERATIONS_RUNBOOK.md`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-api/docs/PILOT_OPERATIONS_RUNBOOK.md)):**
   - Requisitos de entorno e infraestructura mínima ($1\text{ GB RAM}$, $5\text{ GB SSD}$).
   - Configuración auditada sin secretos expuestos ([`.env.example`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-api/.env.example)).
   - Migración idempotente del esquema relacional (SQLite y PostgreSQL).
   - Verificación de salud y monitoreo con `GET /health`.

2. **Servicio de Mantenimiento y Retención Legal ([`maintenance_service.py`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-api/src/services/maintenance_service.py)):**
   - **Respaldo y Restauración Deterministas:** Implementación de `backup_sqlite_database()` y `restore_sqlite_database()` con verificación atómica de integridad (`PRAGMA quick_check`).
   - **Purga y Legal Hold:** Función `purge_expired_messages()` que elimina mensajes crudos regulares tras 30 días (`MESSAGE_RETENTION_DAYS=30`), preservando los paquetes de evidencia seudónima de incidentes confirmados bajo Legal Hold por hasta 365 días.

3. **Kill Switches y Resiliencia en Fallos:**
   - **Kill Switch de Sombra:** `SENTINEL_SHADOW_ENABLED=false` desactiva de forma inmediata el evaluador candidato sin afectar el motor determinista en producción.
   - **Kill Switch de LLM:** `SENTINEL_DISABLE_LLM=true` activa el modo fail-closed local con reglas de corroboración, garantizando protección continua sin depender de proveedores externos.
   - **Rollback de Términos:** Procedimiento para revertir complementos calientes al pack base autenticado (`dataset_v3_seed.json`).

4. **Matriz de Alertas y Presupuesto:**
   - Límites operativos preestablecidos ($p95 < 250\text{ ms}$, presupuesto de LLM $\le \$25\text{ USD/semana}$).

## Resultados de Verificación Automatizada

Evaluación ejecutada con [`evaluate_pilot_runbook.py`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/scripts/evaluate_pilot_runbook.py):
- `CONFIG_AUDIT`: **PASSED** (cero secretos filtrados).
- `IDEMPOTENT_MIGRATION`: **PASSED** (tablas creadas e inicializadas).
- `BACKUP_AND_RESTORE`: **PASSED** (respaldo, corrupción simulada, restauración y validación exitosas).
- `LEGAL_HOLD_PURGE`: **PASSED** (mensajes viejos purgados, evidencia bajo legal hold retenida).
- `KILL_SWITCH_TESTS`: **PASSED** (apagado en sombra y fallback fail-closed verificados).
- `HEALTH_CHECK_ENDPOINT`: **PASSED** (status `ok`, latency $<5\text{ ms}$).

Reporte exportado en [`evidence/S21/pilot_operations_report.json`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/docs/plan-2026-09/evidence/S21/pilot_operations_report.json).

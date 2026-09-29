# ADR-002 — Aislamiento Criptográfico y Multitenancy por Organización

- **Estado:** Aceptado (2026-09-28)
- **Tarea asociada:** S07
- **Autores / Responsables:** Equipo Sentinel

---

## 1. Contexto y Problema

Sentinel opera como servicio central de detección temprana, preservación de evidencia para cadena de custodia y señales de red contra reclutamiento organizado. En un entorno multi-organización (plataformas de mensajería, juegos o comunidades independientes):

1. Múltiples clientes pueden usar esquemas de identificadores de sesión o usuario colisionantes (`session_1`, `user_100`).
2. No debe ocurrir fuga horizontal de datos: un cliente jamás debe acceder a mensajes, historiales de sesión, paquetes de evidencia forense, reportes mensuales ni señales de red de otro cliente.
3. El servicio de red (`NetworkService`) detecta agresores seriales y reutilización de guiones; dicha correlación debe ocurrir estrictamente dentro del espacio del tenant y no cruzar organizaciones sin consentimiento explícito.
4. Las claves maestras de administración (`admin`) nunca deben exponerse a interfaces web o navegadores de clientes estándar.

---

## 2. Decisión Arquitectónica

Se implementa un modelo de **Multitenancy Lógico con Namespaces y Salting Criptográfico por Tenant**, respaldado por autenticación basada en API Key:

### A. Extracción e Identificación de Tenant
- Cada cliente envía su credencial mediante el encabezado `X-API-Key`.
- El middleware `require_client_key` verifica la clave contra `SENTINEL_API_KEYS` (lista JSON de claves válidas) y `SENTINEL_REVOKED_KEYS`.
- Se deriva un hash determinista SHA-256 (`api_key_hash`) de la clave del cliente. Este hash identifica unívocamente al tenant sin almacenar ni exponer la clave en texto plano.

### B. Namespace Aislado en Base de Datos (DB Layer)
- **Sesiones e Historial de Mensajes:** Los identificadores internos de sesión se estructuran como `{api_key_hash[:16]}:{public_session_id}`. Esto previene colisiones de clave primaria cuando dos clientes usan el mismo ID público (`sess-001`). Al serializar respuestas al SDK, `_public_session_id` restaura el identificador transparente para el cliente.
- **Filtrado en Lectura y Escritura:** Todas las consultas a `Session`, `Message`, `ActorSighting`, `Feedback` y `TelemetrySnapshot` filtran obligatoriamente por `api_key_hash`.

### C. Aislamiento Criptográfico en Detección de Red (Network Signals)
- Los identificadores de agresor y sesión se hashean con `SHA-256(ACTOR_HASH_SALT : api_key_hash : value)`.
- La huella del guion (`script_fp`) incorpora el `api_key_hash` como sal.
- Las consultas de reincidencia (`RECIDIVISM`), ráfaga (`SPRAY`) y reutilización de guion (`SCRIPT_REUSE`) se ejecutan con filtro estricto por `api_key_hash`, eliminando cualquier falso positivo de red cruzado entre organizaciones independientes.

### D. Aislamiento de Evidencia Forense y Reportes
- `/api/v1/evidence/{session_id}` valida que la sesión pertenezca al `api_key_hash` autenticado antes de generar el ZIP firmado con cadena de custodia.
- `/api/v1/value-report/monthly` agrega únicamente los `TelemetrySnapshot` asociados al `api_key_hash` solicitante.

### E. Separación de Roles (Client vs Admin)
- Clientes solo acceden a rutas operativas (`/analyze`, `/messages/sync`, `/evidence`, `/feedback`, `/network/report`, `/value-report`).
- Rutas maestras (`/admin/sessions`, `/admin/hot-terms/publish`, `/shadow-models`) requieren `require_admin_key` con clave de administrador independiente.

---

## 3. Estrategia de Migración y Despliegue Aislado

1. **Migración Retrocompatible Local:** Las sesiones y mensajes creados con anterioridad sin `api_key_hash` (entornos de desarrollo heredados) se manejan con fallback a consulta global solo cuando `api_key_hash is None`.
2. **Opción de Despliegue Físicamente Aislado (Single-Tenant Deployment):** Para clientes gubernamentales o corporativos que requieran aislamiento físico absoluto (Regulación GDPR / NOM), Sentinel puede desplegarse en instancias y bases de datos SQLite/PostgreSQL independientes configurando una única API key por contenedor sin necesidad de cambios en el código.

---

## 4. Consecuencias y Verificación

- **Verificación:** Suite de pruebas en `sentinel-api/tests/test_tenant_isolation.py` verificando:
  - Particionado de mensajes e historiales con IDs colisionantes.
  - Rechazo 404 al intentar generar evidencia de sesión ajena.
  - Aislamiento total de señales de red (reincidencia y reutilización de guion).
  - Particionado de métricas en reporte mensual de valor.
  - Rechazo 401 a claves revocadas.
- **Límites:** El salting por tenant previene deliberadamente la detección federada inter-cliente en esta fase. Cualquier federación inter-institucional requerirá un protocolo de prueba de conocimiento cero o consentimiento mutuo explícito en fases posteriores.

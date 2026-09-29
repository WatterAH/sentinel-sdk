# Evidencia de S06 — Invalidación segura de la caché de escalación

Fecha de ejecución: 2026-09-28
Tarea: S06 — Invalidación segura de la caché
Estado: DONE

## 1. Contexto y Diagnóstico del Fallo Previo
En la implementación anterior de `Sentinel` (`sentinel.ts`), la deduplicación de llamadas de escalación al LLM indexaba las respuestas exclusivamente por `sessionId` con la comparación:
```ts
if (cached && this.RISK_ORDER.indexOf(cached.risk) >= this.RISK_ORDER.indexOf(result.risk)) {
  return ok({ ...cached.response, messages_analyzed: messages.length, current_message: text });
}
```
Esto causaba los siguientes problemas de seguridad y precisión:
1. **Reutilización de veredictos obsoletos tras nuevo contenido:** Si una conversación recibía un nuevo mensaje o evidencia adicional manteniendo la misma banda de riesgo (`MEDIUM`), el SDK devolvía el veredicto previo del LLM sin analizar los nuevos mensajes ni la nueva evidencia.
2. **Ausencia de TTL y tamaño acotado:** La caché crecía de forma no acotada en memoria sin expiración temporal.
3. **Ceguera contextual y de versiones:** Cambios en `ageBand`, versión de region packs o modelos no invalidaban la caché de la sesión.
4. **Falta de invalidación en ciclo de vida:** `clearSession`, `reset` o `importSessions` no limpiaban las entradas cacheadas.

## 2. Solución Implementada

### 2.1 Estructura de Entrada y Huella Determinista (Fingerprint)
Se diseñó `EscalationCacheEntry`:
```typescript
interface EscalationCacheEntry {
  risk: RiskLevel;
  fingerprint: string;
  contextKey: string;
  createdAt: number;
  response: ApiAnalysisResponse;
}
```
- `fingerprint`: Resumen hash no reversible (FNV-1a 32-bit `fastStringHash`) calculado sobre los IDs, senders, timestamps, longitudes y hashes de cada mensaje de la sesión, combinado con los términos V3 disparados, features V4, agresor detectado, categorías únicas y motivo de escalación.
- `contextKey`: Clave compuesta por `ageBand`, `hotTermsDatasetVersion`, `acceptedShadowReleaseVersion` y estado de verificación del pack de región.
- **Sin texto plano en telemetría ni fugas:** Ningún texto plano de usuario se persiste ni se envía en telemetría para calcular las huellas o claves.

### 2.2 Política de Deduplicación y Reutilización
- **Reutilización permitida:** Solo si la solicitud dentro del TTL (`ttlMs`, default 5 min) coincide exactamente en:
  1. `cached.risk === result.risk`
  2. `cached.fingerprint === currentFingerprint`
  3. `cached.contextKey === currentContextKey`
  4. `now - cached.createdAt <= escalationCacheTtlMs`
- **Invalidación ante nuevo contenido:** Si la conversación recibe nuevos mensajes o nueva evidencia (incluso manteniendo `risk === 'MEDIUM'`), la huella cambia deterministamente, forzando una nueva evaluación y llamada al LLM.
- **Idempotencia sin duplicación de mensajes:** Se evita duplicar mensajes idénticos consecutivos por reintentos de red o render.

### 2.3 Capacidad Acotada y Reloj Controlable
- **Cota de memoria y LRU:** `maxEntries` (default 1,000). Al alcanzar la capacidad máxima, se expulsan primero las entradas expiradas por TTL o la más antigua en orden de inserción.
- **Reloj inyectable:** Parámetro `nowProvider` en `EscalationCacheConfig` para control determinista del tiempo en pruebas unitarias sin sleeps.

### 2.4 Métodos de Invalidación y Ciclo de Vida
Se incorporaron métodos públicos:
- `sentinel.clearSession(sessionId)`: Elimina mensajes, auditoría de feedback y caché de escalación de la sesión.
- `sentinel.clearEscalationCache()`: Limpia todas las entradas de caché de escalación.
- `sentinel.reset()`: Reinicia todo el estado en memoria (sesiones, caché, feedback, memoria temporal).
- `sentinel.importSessions(...)`: Limpia automáticamente la caché para evitar inconsistencias con estados serializados previos.

## 3. Pruebas Unitarias Ejecutadas y Resultados

Archivo: `sentinel-sdk/typescript/src/core/escalation-cache.test.ts`
Suite completa: 7 tests unitarios deterministas:
1. `deduplica solicitudes idénticas dentro del TTL sin repetir llamada a la API` -> PASSED
2. `invalida la caché cuando cambia el contenido en la misma sesión aunque mantenga banda MEDIUM` -> PASSED
3. `expira la caché cuando transcurre el TTL` -> PASSED
4. `invalida la caché si cambia el contexto (ej. ageBand)` -> PASSED
5. `invalida la caché explícitamente mediante clearSession, clearEscalationCache, reset e importSessions` -> PASSED
6. `mantiene un tamaño acotado y expulsa las entradas más antiguas (LRU)` -> PASSED
7. `valida parámetros de configuración de la caché` -> PASSED

### Resultados de Verificación Global
- `npm run typecheck` en SDK: exit=0
- `npx vitest run src/` (21 test files, 128 tests): exit=0 (128 passed)
- `python3 scripts/run_fast_checks.py --all`:
  - `plan-check`: exit=0
  - `plan-tools`: exit=0
  - `sdk-typecheck`: exit=0
  - `sdk-unit-tests`: exit=0 (128 passed)
  - `api-unit-tests`: exit=0 (73 passed)
  - Total exit=0

## 4. Limitaciones y Alcance
- La caché de escalación opera en la capa del cliente/SDK en memoria. No reemplaza los mecanismos de caché o rate limiting que el servidor API implemente a nivel de gateway.
- La persistencia mediante `exportSessions`/`importSessions` no persiste la caché de escalación por diseño para evitar veredictos caducos tras reinicios.

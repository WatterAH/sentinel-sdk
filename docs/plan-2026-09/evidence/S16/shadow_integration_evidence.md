# Evidencia de S16 — Integración mínima en sombra

Fecha de ejecución: 2026-09-28.
Responsable: T2 / Sol — Medium (Antigravity).
Estado: **DONE**.

---

## 1. Resumen de la integración y garantías técnicas

Se completó la integración del modelo sombra (`laya-multilingual-v1.2.0-shadow`, aprobado en S14 / ADR-003) en el SDK y la API de Sentinel bajo estrictas garantías de aislamiento, observabilidad no bloqueante y privacidad:

1. **Aislamiento Estricto y No Bloqueante (`ShadowRunner` en SDK y API):**
   - El evaluador en sombra se ejecuta en un contexto protegido contra fallos (`try/catch`), límites de tiempo (`maxLatencyMs`) y cuotas de tasa (`budgetLimitPerMinute`).
   - Excepciones, timeouts, modelos ausentes o presupuestos excedidos devuelven estados descriptivos (`status: "error" | "timeout" | "missing_model" | "budget_exceeded" | "disabled"`) **sin arrojar excepciones ni mutar el resultado contractual principal (`EngineResult`)**.
   - Se verificó formalmente la invariancia de veredicto: `EngineResult` con o sin clasificador sombra es idéntico a nivel de bits.

2. **Kill Switch Maestro y Configuración Opt-In:**
   - Desactivación inmediata mediante `enabled: false` (o `SENTINEL_SHADOW_ENABLED=false` en API).
   - Opciones tipadas en `SentinelConfig`: `shadowClassifier: "bundled" | "remote" | "laya-multilingual" | "off"` y `shadowConfig: ShadowRunnerConfig`.

3. **Adaptador Calibrado de Laya Multilingüe (`laya-shadow-classifier.ts`):**
   - Aplica los parámetros de calibración de Platt congelados en S14 sobre `dev_cal` ($a=0.7993, b=-0.8124$).
   - Combina featurizer v2 estructurado con representaciones dispersas de hashing n-gramas locales.

4. **Privacidad de Telemetría (Cero PII):**
   - Los registros de observación sombra contienen únicamente identificador opaco del modelo, nivel léxico, probabilidad numérica calibrada, acuerdo booleano y latencia.
   - Jamás se registra contenido textual, transcripciones de mensajes, identificadores de usuario ni tokens de sesión.

5. **Evaluación de Replay Local en Conjunto Pre-registrado ($N=453$):**
   - **Cobertura en casos Benignos / LOW:** 302/302 ($100.0\%$) clasificados con probabilidad $<0.5$.
   - **Concordancia global:** 407/453 ($89.8\%$).
   - **Latencia promedio de evaluación sombra:** $0.028\text{ ms}$ por caso.

---

## 2. Comandos ejecutados y verificación

| Comando | CWD | Resultado | Duración |
|---|---|---|---|
| `npx vitest run src/analyzer/shadow-integration.test.ts` | `sentinel-sdk/typescript` | Exit 0 (8/8 tests passed) | 0.32s |
| `npm run typecheck` | `sentinel-sdk/typescript` | Exit 0 | 0.70s |
| `venv/bin/pytest tests/test_shadow_integration.py` | `sentinel-api` | Exit 0 (6/6 tests passed) | 0.05s |
| `python3 model-training/evaluate_shadow_replay.py` | `sentinel-sdk` | Exit 0 ($N=453$ replayed) | 0.013s |
| `python3 scripts/run_fast_checks.py --all` | `sentinel-sdk` | Exit 0 (11/11 suites passed) | 5.1s |
| `python3 scripts/sentinel_plan.py check` | `sentinel-sdk` | Exit 0 | 0.04s |

Reporte de replay cuantitativo guardado en: [`shadow_replay_evaluation_report.json`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/docs/plan-2026-09/evidence/S16/shadow_replay_evaluation_report.json).

---

## 3. Limitaciones y declaraciones metodológicas

1. **Modo Sombra Pasivo:** La salida de `laya-multilingual` no toma acciones directas sobre los usuarios ni modifica el flujo de escalación de la API.
2. **Sin fuga de datos remota:** La evaluación del modelo candidato se ejecuta estrictamente on-device o de forma local en backend, sin transmitir mensajes crudos a proveedores externos sin autorización expresa.

---

## 4. Continuidad y siguientes tareas

S16 queda completada (**DONE**).
- Tareas desbloqueadas / READY en `tasks.json`:
  - **S17 — Extensión de cobertura y enriquecimiento de paquetes regionales** (T2, ~4h).
  - **S18 — Bandeja mínima para moderadores** (T2, ~4h).
  - **S13 — Comparador Kev bajo presupuesto** (T3, opcional).

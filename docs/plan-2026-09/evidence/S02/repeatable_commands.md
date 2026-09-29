# Evidencia S02 — Comandos repetibles y entrega de terminal

Fecha de ejecución: 2026-09-28.
Responsable: T1 / Luna — Sol / Medium (Antigravity).

---

## 1. Verificación de Wrappers y Herramientas del Plan

Se ejecutó la suite completa de smoke tests deterministas:
```bash
python3 sentinel-sdk/scripts/verify_plan_tools.py
```
**Resultado:** Exit code **0**. Salida: `TOOLS_OK: plan, cycle/dependency/evidence guards, prompt assembly, success/failure/missing command/cancellation`.

### Casos de prueba validados de forma aislada
1. **Detección de ciclos:** La inyección sintética de una dependencia circular es detectada inmediatamente por `sentinel_plan.py check`.
2. **Exigencia de evidencia para DONE:** Marcar una tarea en estado `DONE` sin referencias de evidencia válidas en el árbol local genera error de validación.
3. **Guardrail de dependencias:** Una tarea dependiente no puede pasar a `READY` o `IN_PROGRESS` si sus dependencias no están `DONE`.
4. **Ensamblado de prompts:** `sentinel_plan.py prompt <TASK>` genera correctamente el prompt compuesto de instrucciones comunes, estado, handoff y tarea para tareas READY; rechaza con código 2 la invocación de tareas bloqueadas a menos que se use explícitamente `--draft`.
5. **Ejecución exitosa con wrapper:** `run_local_job.py` ejecuta comandos en subproceso aislado, preserva la salida completa en `output.log` y escribe `status.json` con `status: "SUCCEEDED"` y `exit_code: 0`.
6. **Manejo de códigos de error:** Fallos intencionales (p. ej. exit 7 o exit 42) registran `status: "FAILED"` y conservan el exit code exacto.
7. **Comando inexistente:** Intento de ejecutar un binario inexistente produce código `127` y registro de error limpio.
8. **Interrupción / Cancelación (SIGTERM):** Señal SIGTERM propaga la terminación al grupo de procesos, escribe `status: "INTERRUPTED"` y finaliza con código `130`.

---

## 2. Catálogo de Comandos Verificados

| Componente | Directorio | Comando directo | Wrapper para terminal | Duración | Efectos / Salida |
|---|---|---|---|:---:|---|
| **Integridad del Plan** | `sentinel-sdk` | `python3 scripts/sentinel_plan.py check` | N/A | <0.1 s | Valida 24 tareas, enlaces locales y referencias |
| **Smoke tests de herramientas** | `sentinel-sdk` | `python3 scripts/verify_plan_tools.py` | N/A | ~0.3 s | Verifica wrappers sin tocar producto |
| **SDK Typecheck** | `sentinel-sdk/typescript` | `npm run typecheck` | N/A | ~0.7 s | Typechecking TypeScript (`tsc --noEmit`) |
| **SDK Unit Tests** | `sentinel-sdk/typescript` | `npx --no-install vitest run src/` | N/A | ~3.2 s | 19 suites, 115 unit tests aislados |
| **SDK Benchmark** | `sentinel-sdk/typescript` | `npm run bench` | `python3 scripts/run_local_job.py --label sdk-bench --cwd typescript -- npm run bench` | ~12.2 s | Evalúa 353 casos; actualiza `report.json`, `reviewed-report.json`, `seed-report.json` |
| **SDK Shadow & Adversarial** | `sentinel-sdk/typescript` | `npx --no-install vitest run benchmark/shadow-classifier.test.ts benchmark/adversarial.test.ts` | `python3 scripts/run_local_job.py --label sdk-shadow-adv --cwd typescript -- npx --no-install vitest run benchmark/shadow-classifier.test.ts benchmark/adversarial.test.ts` | ~12.8 s | Escribe `adversarial-report.json` |
| **SDK Model Bakeoff** | `sentinel-sdk/model-training` | `./.venv/bin/python bakeoff_models.py` | `python3 ../scripts/run_local_job.py --label sdk-bakeoff --cwd . -- ./.venv/bin/python bakeoff_models.py` | ~1.0 s | Escribe `model-bakeoff-report.json` |
| **SDK Cascade Simulation** | `sentinel-sdk/model-training` | `./.venv/bin/python simulate_cascade.py` | `python3 ../scripts/run_local_job.py --label sdk-cascade --cwd . -- ./.venv/bin/python simulate_cascade.py` | ~1.0 s | Escribe `cascade-simulation-report.json` |
| **API Unit Tests** | `sentinel-api` | `venv/bin/pytest tests/` | `python3 ../sentinel-sdk/scripts/run_local_job.py --label api-pytest --cwd . -- venv/bin/pytest tests/` | ~0.7 s | 69 tests pasando con SQLite en memoria |
| **API Auto-calibration** | `sentinel-api` | `venv/bin/python scripts/auto_calibrate.py` | `python3 ../sentinel-sdk/scripts/run_local_job.py --label api-calibrate --cwd . -- venv/bin/python scripts/auto_calibrate.py` | ~0.5 s | Evaluación de propuestas de umbral |

---

## 3. Protocolo de Entrega de Terminal (>60 segundos)

Cuando un comando requiera más de 60 segundos (entrenamientos pesados, benchmarks masivos, descargas de pesos):
1. **Lanzamiento:** Ejecutar con `run_local_job.py`:
   ```bash
   python3 scripts/run_local_job.py --label <NOMBRE> --cwd <DIR> -- <COMANDO>
   ```
2. **Registro obligatorio:** El agente debe anotar:
   - Comando exacto y carpeta de ejecución (`cwd`).
   - Ubicación de logs: `~/.local/state/sentinel-jobs/<NOMBRE>-<ID>/output.log`.
   - Ubicación de estado: `~/.local/state/sentinel-jobs/<NOMBRE>-<ID>/status.json`.
   - Hora de inicio y estimación de tiempo.
   - Criterio de éxito (`status: "SUCCEEDED"`, `exit_code: 0`).
3. **Parada sin polling:** El agente establece estado `WAITING_TERMINAL`, termina su turno y no realiza loops ni llamadas intermedias.
4. **Reanudación:** Cuando el usuario indique "sigue", el agente lee `status.json` una sola vez y reanuda el flujo de trabajo según el resultado registrado.

---

## 4. Automatización Rápida Unificada (`run_fast_checks.py`)

Se implementó el script `sentinel-sdk/scripts/run_fast_checks.py` para correr todas las comprobaciones deterministas y rápidas de ambos repositorios en un único comando seguro:
```bash
python3 scripts/run_fast_checks.py --all
```
**Resultado de ejecución:**
```text
All 5 fast check suites passed successfully:
  ✓ plan-check         exit=0 (0.03s)
  ✓ plan-tools         exit=0 (0.26s)
  ✓ sdk-typecheck      exit=0 (0.66s)
  ✓ sdk-unit-tests     exit=0 (3.15s)
  ✓ api-unit-tests     exit=0 (0.99s)
Total: ~5.1s
```

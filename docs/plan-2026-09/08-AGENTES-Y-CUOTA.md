# Trabajar con Codex, Copilot o Anti-Gravity

## Regla de continuidad

La memoria vive en archivos versionables, no en el historial de un proveedor. Abrir la carpeta padre con ambos repos cuando la tarea lo requiera. Entrada canónica: este plan en `sentinel-sdk/docs/plan-2026-09`. Los `AGENTS.md` y punteros de Copilot remiten aquí; si una herramienta no carga instrucciones automáticamente, pegar el prompt compuesto. No asumir reglas especiales de Anti-Gravity: lectura explícita funciona como mecanismo portable.

Leer solo `ESTADO.md`, `HANDOFF.md`, el prompt elegido y sus referencias. Consultar memoria pequeña antes de reexplorar; `project-git-status` para inventario. No cargar todos los prompts ni corpus completos. No usar subagentes salvo petición explícita de Luis.

## Potencia por tarea

| Nivel | Elección orientativa en Codex | En otra herramienta | Cuándo |
|---|---|---|---|
| T0 | Sin modelo: script | Terminal/CI | Ejecutar, contar, validar enlaces, recopilar resultado |
| T1 | Luna / low | Modelo económico capaz disponible | Edición mecánica acotada y docs desde evidencia |
| T2 | Sol / medium | Modelo intermedio de programación | Implementación normal, contratos conocidos, UI y tests |
| T3 | Astra / medium | Modelo fuerte disponible; Opus si está en tu plan | Diseño de evaluación, arquitectura, interpretación de errores |
| T4 | Astra / high | Modelo fuerte con razonamiento alto si lo ofrece | Aislamiento, política de seguridad, revisión científica difícil |

Son recomendaciones de enrutamiento, no equivalencias de calidad o precio entre proveedores. La guía oficial distingue Astra para mayor capacidad, Sol para trabajo exigente y Luna para eficiencia. Luna admite `low`; «Lite» no es un nivel universal. Disponibilidad y consumo en Codex/Copilot/Anti-Gravity dependen del selector y suscripción. [Guía OpenAI](https://developers.openai.com/api/docs/guides/latest-model), [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).

No recomendar `high` para todo. Empezar con nivel asignado; tras dos intentos fallidos, resumir diagnóstico y subir un nivel o dividir tarea. No repetir el mismo prompt indefinidamente. Revisión fuerte después de cambios en intervención, partición de datos, aislamiento o calibración; para docs triviales basta validación determinista.

## Protocolo de sesión

1. Seleccionar una tarea READY en el registro, confirmar dependencias y comparar estado con archivos reales.
2. Registrar responsable/herramienta y marcar IN_PROGRESS antes de editar. Un solo escritor por archivo.
3. Inspeccionar exclusivamente rutas de la tarea y cambios previos; no limpiar ni reescribir trabajo existente.
4. Implementar el entregable menor que satisfaga aceptación; reusar scripts. No hacer commit/push/deploy implícitos como parte de «continuar».
5. Ejecutar verificación relevante, registrar comando, fecha, salida/exit code y limitaciones. Pruebas no ejecutadas se dicen explícitamente.
6. Actualizar `tasks.json`, `ESTADO.md`, `HANDOFF.md` y `CHANGELOG.md`. DONE exige evidencia de aceptación, no solo código.

Estados: READY, IN_PROGRESS, WAITING_TERMINAL, BLOCKED_HUMAN, BLOCKED_DEPENDENCY, DONE, DEFERRED. No avanzar a una dependencia marcada DONE sin evidencia. Tareas diferidas no cuentan como terminadas; una sustitución necesita ADR.

## Cómputo largo sin agente esperando

Si probablemente dura >60 s, usar una terminal persistente **visible** y el wrapper `scripts/run_local_job.py` (desde `sentinel-sdk`). Ejemplo para benchmark, tras comprobar entorno:

```bash
python3 scripts/run_local_job.py --label sdk-bench --cwd typescript -- npm run bench
```

El wrapper ejecuta el comando sin shell, imprime y guarda log, escribe estado y termina con `JOB_FINISHED ... exit=0` si pasó. No crea procesos por su cuenta hasta ejecutar este comando. La terminal debe quedar abierta mediante la herramienta del agente o una ventana del sistema; el wrapper por sí solo no abre una ventana ni garantiza sobrevivir al cierre de su terminal.

En Codex, abrir la terminal persistente en el panel; si la herramienta no puede dejarla visible y viva, preparar el comando para que Luis lo lance. En cualquier agente: guardar ruta del log/estado, comando, carpeta, hora y sesión; poner WAITING_TERMINAL; terminar el turno indicando duración estimada, cómo reconocer éxito y qué decir para reanudar. **No quedarse haciendo polling, no usar sleeps ni agentes vigilantes.** Al volver Luis, leer una vez resultado/exit code. Si falta marca final, sigue incompleto; no asumir éxito.

Esperar no implica necesariamente consumo continuo de tokens en todas las plataformas; el ahorro buscado es evitar bucles, turnos y supervisión innecesarios, sin prometer porcentajes de cuota.

## Automatización disponible y catálogo de comandos

Ya preparado y verificado en S02:
1. **Validación del plan:** `python3 scripts/sentinel_plan.py check` (validador estricto sin red).
2. **Smoke test de utilidades:** `python3 scripts/verify_plan_tools.py` (cubre éxito, fallo, inexistente, cancelación y dependencias).
3. **Suite rápida unificada:** `python3 scripts/run_fast_checks.py --all` (ejecuta plan, SDK typecheck/vitest y API pytest en ~5s sin llamadas externas).
4. **Ejecución protegida de cómputo largo:** `python3 scripts/run_local_job.py --label <nombre> --cwd <dir> -- <comando>`.

### Catálogo de comandos verificados

| Categoría | Directorio | Comando directo | Wrapper para terminal | Salida / Efectos |
|---|---|---|---|---|
| **Plan / Tools** | `sentinel-sdk` | `python3 scripts/run_fast_checks.py --plan` | N/A (<1s) | Exit 0 si plan y guardrails son válidos |
| **SDK Typecheck** | `sentinel-sdk/typescript` | `npm run typecheck` | N/A (~1s) | Tipos TS sin emitir archivos |
| **SDK Unit Tests** | `sentinel-sdk/typescript` | `npx --no-install vitest run src/` | N/A (~3s) | 19 suites, 115 tests de unidad |
| **SDK Benchmark** | `sentinel-sdk/typescript` | `npm run bench` | `python3 scripts/run_local_job.py --label sdk-bench --cwd typescript -- npm run bench` | Actualiza `report.json`, `reviewed-report.json`, `seed-report.json` |
| **SDK Shadow / Adv** | `sentinel-sdk/typescript` | `npx --no-install vitest run benchmark/shadow-classifier.test.ts benchmark/adversarial.test.ts` | `python3 scripts/run_local_job.py --label sdk-shadow-adv --cwd typescript -- npx --no-install vitest run benchmark/shadow-classifier.test.ts benchmark/adversarial.test.ts` | Escribe `adversarial-report.json` |
| **Model Bakeoff** | `sentinel-sdk/model-training` | `./.venv/bin/python bakeoff_models.py` | `python3 ../scripts/run_local_job.py --label sdk-bakeoff --cwd . -- ./.venv/bin/python bakeoff_models.py` | Escribe `model-bakeoff-report.json` |
| **Cascade Sim** | `sentinel-sdk/model-training` | `./.venv/bin/python simulate_cascade.py` | `python3 ../scripts/run_local_job.py --label sdk-cascade --cwd . -- ./.venv/bin/python simulate_cascade.py` | Escribe `cascade-simulation-report.json` |
| **API Unit Tests** | `sentinel-api` | `venv/bin/pytest tests/` | `python3 ../sentinel-sdk/scripts/run_local_job.py --label api-pytest --cwd . -- venv/bin/pytest tests/` | 69 tests aislados con SQLite in-memory |
| **API Auto-calibrate**| `sentinel-api` | `venv/bin/python scripts/auto_calibrate.py` | `python3 ../sentinel-sdk/scripts/run_local_job.py --label api-calibrate --cwd . -- venv/bin/python scripts/auto_calibrate.py` | Evalúa propuestas de umbral |


## Git y publicación

Ambos repos tienen mucho trabajo previo sin commit. S01 registra baseline y propone grupos; no `git add .`, reset, clean ni stash automático. Autor y committer para commits nuevos: `Luis Merida <tatomerida21@gmail.com>`. Antes de push autorizado: `gh auth status` con `isntle` activo, comprobar autores/committers de cada commit; después comprobar asociación en GitHub. No atribuir contribuciones a asistentes. No reescribir historia remota salvo instrucción explícita.

La carpeta padre contiene documentos históricos fuera de estos repos. El plan canónico vive dentro del SDK; API tiene un puntero al repo hermano. Al clonar API por separado, traer la carpeta del plan o el SDK compañero; si falta, pedir ese contexto, no reconstruir ni inventar el estado.

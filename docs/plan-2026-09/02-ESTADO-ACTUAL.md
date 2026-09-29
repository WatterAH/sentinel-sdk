# Estado técnico verificado por lectura

Corte: 2026-09-26. Se consultó `codebase-memory-query` con presupuesto 1500; devolvió principalmente referencias al portafolio y no una memoria suficiente de estos repos. Se continuó desde la auditoría local de agosto y se verificaron archivos concretos. `project-git-status` mostró SDK/master: 67 entradas de cambios y API/master: 35, ambas con 0 ahead/behind según refs locales. No se hizo fetch en esta sesión: esto no certifica sincronía con GitHub. Las cifras cuentan entradas del script, no archivos individuales dentro de directorios sin seguimiento.

## Mapa real

| Pieza | Evidencia actual | Estado |
|---|---|---|
| Motor multicapa TS | `typescript/src/analyzer/engine.ts` | Implementación local |
| LOW se resuelve local; zona gris escala | `engine.ts`, sección política de escalación | Confirmado por lectura |
| Modelo sombra no cambia resultado | `engine.ts`, `shadow-classifier.ts` | Confirmado por lectura |
| Caché por sesión/riesgo | `typescript/src/core/sentinel.ts`, `escalationCache` | Invalidación semántica/TTL por estudiar |
| Groq y OpenRouter | API `src/services/llm_providers.py` | Código; disponibilidad real no probada |
| Corpus | `typescript/benchmark/corpus.json` | 353 casos; 185 habilitados según gate histórico; 168 excluidos |
| Evaluación | `bench.test.ts`, `guardrails.json` | CI compara línea base revisada; 75% es meta, no resultado |
| Entrenamiento y comparación | `model-training/`, scripts npm | Lineal/hash existentes; no volver a construir desde cero |
| Enriquecimiento | API `scraper_service.py`, `candidate_scorer.py`, `hot_terms_service.py` | Descubrimiento + staging; no scraping ejecutado ahora |
| Publicación de términos | `publish_version` exige `staged` y `reviewed` | Ya existe revisión; ampliar procedencia y gates |
| Firmas, memoria, packs, voz transcrita | `typescript/src/security/`, `core/risk-memory.ts`, `packs/`, `voice-normalizer.ts` | Código local y auditoría previa; no prueba de producción |
| Auth/scopes | API `src/core/security.py` | Existente; scopes no prueban aislamiento por cliente |
| Aislamiento | API `db_models.py`, `network_service.py` | No se encontró tenant en las rutas/modelos inspeccionados; auditoría dirigida pendiente |
| Producto operado | Deploy, cron, migraciones, clientes | No verificado |

Las rutas TS son relativas a `sentinel-sdk`; API designa el repo hermano `sentinel-api`. No se tocaron runtime, datasets, secretos, despliegues ni HCKMX26 en esta planificación.

## Métricas guardadas, NO vueltas a ejecutar en esta sesión

Fuente: `typescript/benchmark/report.json`, `reviewed-report.json`, `shadow-training-report.json`, y documentación de julio. No presentarlas como medidas frescas.

| Medición | Casos | Resultado |
|---|---:|---|
| Motor, corpus completo parcialmente revisado | 353 | Recall 44.37%; precision 91.78%; 84 FN / 151 positivos |
| Motor, gate histórico revisado | 185 | Recall 59.77%; precision 92.86%; 35 FN / 87 positivos |
| Bloqueos falsos en revisados | 98 benignos | 0 observados; límite superior Wilson 95% ≈3.77% |
| Clasificador sombra, validación agrupada | 185 | Recall 62.07%; precision 84.38% |

Los 143 casos base se consideran aceptados por el gate histórico, más 42 confirmados por el dueño. Eso **no acredita doble anotación especializada de los 185**. La auditoría de agosto registró 115 pruebas SDK y 69 API aprobadas; aquí se citan como historia, no como ejecución actual.

## Brechas de mayor prioridad

1. Un detector semántico solo detrás de `escalate=true` no arregla los falsos negativos que el SDK llama LOW. Comparar todos los niveles offline y una muestra LOW consentida en piloto.
2. La caché basada en que el riesgo no suba puede reutilizar una decisión ante contexto nuevo. Validar invalidación por contenido/versiones/edad/actor y TTL antes de optimizar llamadas.
3. Datos no independientes: derivados/paráfrasis deben compartir split. Falta holdout externo y revisión de casos pendientes.
4. La API permite scopes; hace falta verificar pertenencia de sesiones, evidencias, feedback y red. Un despliegue compartido requiere aislamiento probado o se elige instancia por cliente.
5. Letras y publicaciones dan vocabulario, no etiquetas de reclutamiento. Genius busca por API pero el código extrae letras de HTML; Reddit usa `/search.json`, no una integración OAuth demostrada.
6. Mucho código existe solo como cambios locales. Consolidarlo por grupos preservando trabajo previo es requisito de reproducibilidad.
7. Intervención, notificación a tutores y reportes requieren política del piloto. Un hash no vuelve anónimos los datos por definición.

## Contradicciones documentales resueltas para este plan

`START_HERE.md` antiguo dice que npm no se publicó; `CONTEXT.md` y la auditoría describen versiones históricas publicadas. Estado local confirmado: `private: true`. Verificar registro en S01 antes de afirmar disponibilidad pública. El documento viejo también describe un guardrail roto; el test actual compara regresiones contra 59.77% y conserva 75% como objetivo visible. No bajar metas para aparentar avances.

Identidad vigente por instrucción de Luis: **Luis Merida <tatomerida21@gmail.com>**, autor y committer. Esto sustituye ejemplos viejos que usaban `isntle` como nombre del autor. `isntle` sigue siendo la cuenta de GitHub que debe estar activa antes del push.

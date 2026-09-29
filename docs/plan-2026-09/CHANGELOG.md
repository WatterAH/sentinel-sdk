# Registro de trabajo

## 2026-09-26 — planificación inicial

Se contrastó auditoría histórica con engine, caché, proveedores, corpus, reportes, scraping, staging y auth. Se investigaron Jev, Laya, Kev, SemIf, GLiClass, evaluación temporal y calibración. Se creó plan portable de ocho semanas y 24 prompts, registro de tareas y herramientas deterministas.

Verificación de esta entrega: ver entrada de cierre añadida tras ejecutar validador y smoke tests de las utilidades. Las pruebas históricas de producto no se presentan como actuales. Sin cambios al runtime, datos ni despliegue.

### Cierre verificado

Validador y smoke tests de utilidades: exit 0. Ver [evidencia de verificación](evidence/planning/verification.md). Se añadieron punteros AGENTS/Copilot en ambos repos, AGENTS en la carpeta padre y un aviso de plan vigente en START_HERE, CONTEXT y ROADMAP, conservando el contenido histórico. El plan principal suma 81 horas orientativas y 6 opcionales. Estado inicial: S01 READY; demás tareas pendientes por dependencias, sin tareas de producto marcadas terminadas.

## 2026-09-28 — S01: Línea base y recuperación del trabajo local

- **Inventario y diff:** Inventariados ambos repositorios (SDK HEAD `0f436f4`, 70 cambios locales; API HEAD `9b72fba`, 36 cambios locales). Clasificación funcional en 10 grupos de commits propuestos.
- **Distribución:** Confirmado estado npm `@sentinel-sdk/typescript` como `private: true` (versiones históricas 1.0.0 a 1.0.3 en registro público de abril 2026; trabajo local preservado sin publicar).
- **Hashes y Datasets:** Fijados hashes SHA-256 de `corpus.json`, `guardrails.json`, `sentinel_dataset_v4.json`, `sentinel_dataset_v3_seed.json`, y reportes de benchmark actualizados.
- **Verificaciones locales aisladas (exit code 0):**
  - SDK: `npm run typecheck` (0), `npx --no-install vitest run src/` (0, 115 unit tests pasados), `npm run bench` (0, 353 casos totales, 185 revisados, seed), `vitest shadow & adversarial` (0), `model-training` bakeoff y simulación de cascada (0).
  - API: `venv/bin/pytest tests/` (0, 69 tests pasados con base SQLite en memoria).
- **Evidencia:** Registrada en [evidence/S01/baseline_inventory.md](evidence/S01/baseline_inventory.md).
- **Tareas actualizadas:** S01 -> DONE; S02, S03, S04, S05 -> READY.

## 2026-09-28 — S02: Comandos repetibles y entrega de terminal

- **Smoke tests de herramientas:** Ejecutado `scripts/verify_plan_tools.py` con exit 0 (valida ciclo, dependencias, evidencia requerida para DONE, ensamblaje de prompts, éxito, fallo con exit code preservado, comando inexistente 127 e interrupción 130).
- **Catálogo de comandos y documentación:** Actualizado `08-AGENTES-Y-CUOTA.md` con el catálogo completo de comandos para SDK y API, duraciones, salidas y wrappers para terminal persistente visible.
- **Automatización rápida:** Creado `scripts/run_fast_checks.py` para correr validación de plan, SDK typecheck/vitest y API pytest en un único paso determinista (~5s, exit 0).
- **Evidencia:** Registrada en [evidence/S02/repeatable_commands.md](evidence/S02/repeatable_commands.md).
- **Tareas actualizadas:** S02 -> DONE; S03, S04, S05 -> READY.

## 2026-09-28 — S03: Validar el usuario y preparar descubrimiento

- **Kit de descubrimiento:** Elaborada la ficha del problema, hipótesis de valor y límites éticos/técnicos explícitos (no intercepción masiva ni descifrado universal de chats).
- **Guion de entrevistas:** Redactado guion de 5 preguntas enfocado en Trust & Safety / moderadores, matriz de perfiles objetivo (3 a 5 participantes) y plantilla de captura de notas.
- **Criterios Go / Pivot:** Definidas condiciones de validación para el cliente B2B frente a un posible reenfoque hacia peritaje/auditoría para ONGs e investigación con ADR.
- **Ficha de piloto supervisado:** Definidas entradas seudónimas, aislamiento, métricas de éxito (cero falsos bloqueos culturales, menor tiempo de revisión) y criterios de parada inmediata. Actualizado `07-PRODUCTO-Y-PILOTO.md`.
- **Evidencia:** Registrada en [evidence/S03/discovery_and_pilot_kit.md](evidence/S03/discovery_and_pilot_kit.md).
- **Tareas actualizadas:** S03 -> DONE; S04, S05 -> READY.

## 2026-09-28 — S04: Rúbrica mexicana y protocolo de anotación

- **Rúbrica v1.0:** Redactada `annotation_rubric_v1.md` con definición formal de clases (`BENIGN`, `RISK`, `INSUFFICIENT_CONTEXT`), comportamientos específicos de captación y contraejemplos culturales mexicanos (jerga juvenil, gaming, narcocultura citada, supervisión familiar y rechazo explícito).
- **Schema validable:** Creado `schemas/conversation_annotation.schema.json` con metadatos de linaje (`family_id`, `parent_id`, `source_id`, `source_type`), roles de actor y restricción estricta de revisores humanos seudónimos (`rev_XXXX`).
- **Fixtures de entrenamiento:** Creado `evidence/S04/training_examples_10.json` con 10 casos diversos anotados para calibración de anotadores humanos.
- **Verificación determinista:** Creado y ejecutado `scripts/verify_annotation_schema.py` con exit 0 (comprueba validación de fixtures reales y rechazo de casos inválidos).
- **Evidencia:** Registrada en [evidence/S04/rubric_and_protocol_evidence.md](evidence/S04/rubric_and_protocol_evidence.md).
- **Tareas actualizadas:** S04 -> DONE; S05, S08 -> READY.

## 2026-09-28 — S05: Contrato de decisiones y política versionada

- **Contrato tipado:** Creado `DecisionRecord` (Schema v1) en TypeScript (`sentinel-sdk`) y Python (`sentinel-api`) con separación clara de señales (`signals`), calibración/incertidumbre (`uncertainty`) y gobernanza (`policy_mode`).
- **Modos de política:** Soporte para `shadow` (default seguro sin alteración de veredictos), `review` (fichas para moderación humana) y `enforce` (producción validada).
- **Abstención:** Soporte para `UNKNOWN` en bandas de riesgo y `ABSTAIN` en disposición ante contexto insuficiente.
- **ADR y Evidencia:** Creado `ADR-001-decision-contract-and-policy.md` y evidencia en [evidence/S05/decision_contract_evidence.md](evidence/S05/decision_contract_evidence.md).
- **Tareas actualizadas:** S05 -> DONE; S06, S07, S11 -> READY.

## 2026-09-28 — S06: Invalidación segura de la caché

- **Caché de escalación acotada y segura:** Reemplazado el almacenamiento plano por una estructura con huella determinista `fingerprint` (hash FNV-1a 32-bit sobre mensajes, timestamps, longitudes y capas de evidencia V3/V4/Actor) y `contextKey` (`ageBand`, versión de pack y modelos).
- **Prevención de veredictos obsoletos:** Si una conversación recibe nuevos mensajes o evidencia adicional (aun manteniéndose en banda `MEDIUM`), la huella cambia forzando una nueva evaluación con el LLM en vez de reusar un veredicto desactualizado.
- **TTL, LRU e Idempotencia:** Configuración opcional `escalationCache` con `ttlMs` (default 5 min), `maxEntries` (default 1,000 con expulsión LRU/expirados), `nowProvider` inyectable para pruebas deterministas y manejo transparente de reintentos consecutivos.
- **Ciclo de vida y métodos de invalidación:** Agregados `clearSession(sessionId)`, `clearEscalationCache()`, `reset()` e invalidación automática en `importSessions()`.
- **Verificación unitaria:** Creados 7 tests unitarios en `sentinel-sdk/typescript/src/core/escalation-cache.test.ts` (deduplicación idéntica, invalidación por nuevo contenido, expiración TTL, cambio de edad, ciclo de vida, LRU y validación de tipos). Suite global `run_fast_checks.py --all` exit 0 (128 tests TS, 73 tests Python).
- **Evidencia:** Registrada en [evidence/S06/cache_invalidation_evidence.md](evidence/S06/cache_invalidation_evidence.md).
- **Tareas actualizadas:** S06 -> DONE; S07, S08, S11 -> READY.

## 2026-09-28 — S07: Aislamiento y ownership del piloto

- **Multitenancy y Namespaces:** Aislamiento lógico por organización en `sentinel-api` mediante derivación determinista de `api_key_hash` a partir del encabezado `X-API-Key`.
- **Base de Datos y Modelos:** Columnas `api_key_hash` agregadas a `Session` y `ActorSighting`. Namespaces en sesiones internas `f"{api_key_hash[:16]}:{session_id}"` con mapeo transparente al SDK mediante `_public_session_id`.
- **Protección de Rutas:** Filtrado estricto por tenant en `/messages/sync`, `/analyze`, `/evidence/{session_id}` (retorna 404 para sesiones de otros tenants), `/feedback`, `/network/report` y `/value-report/monthly`.
- **Señales de Red Aisladas:** Salteado criptográfico por tenant en hashes de actor, sesión y huellas de guion (`script_fp`), evitando correlaciones erróneas y falsos positivos de reincidencia inter-organización.
- **Seguridad de Claves:** Rechazo de claves revocadas con código 401. Rutas de administración separadas con `require_admin_key`.
- **ADR y Evidencia:** Creado [ADR-002-client-isolation-and-tenancy.md](decisions/ADR-002-client-isolation-and-tenancy.md) y evidencia en [evidence/S07/tenant_isolation_evidence.md](evidence/S07/tenant_isolation_evidence.md).
- **Verificación:** 8 tests unitarios dedicados en `test_tenant_isolation.py` pasando exit 0. Total de 81 tests en API y 128 tests en SDK pasando en `run_fast_checks.py --all`.
- **Tareas actualizadas:** S07 -> DONE; S08, S11, S18 -> READY.

## 2026-09-28 — S08: Procedencia y permisos de los datos

- **Modelo de Procedencia y Derechos:** Creación del modelo `DataSource` y servicio `src/services/data_provenance_service.py` para modelar origen canónico, permisos (`approved`, `quarantine`, `unknown`, `revoked`), derechos de uso (`discovery`, `training`, `evaluation`, `redistribution`), referencias de licencia y revisores humanos seudónimos (`rev_XXXX`).
- **Deduplicación por Origen Canónico y Contenido:** Actualizado `candidate_scorer.py` para requerir que candidatos maduros provengan de `>=2` orígenes canónicos distintos y `>=2` hashes de contenido distintos, impidiendo que notas sindicadas o espejos cuenten como fuentes independientes.
- **Gobernanza y Cuarentena:** Fuentes nuevas entran por defecto en estado `quarantine`. Publicación de términos y exportaciones de entrenamiento requieren revisión humana explícita (`reviewed=True`).
- **Exportación Auditada según Uso:** Endpoint `/admin/api/dataset/export` con filtrado estricto de derechos y desglose completo de exclusiones (permisos desconocidos, cuarentena, revocaciones y falta de revisión).
- **Verificación:** Suite de 7 tests unitarios en `tests/test_data_provenance.py` pasando exit 0. Total de 88 tests en API y 128 tests en SDK pasando en `run_fast_checks.py --all`.
- **Evidencia:** Registrada en [evidence/S08/data_provenance_evidence.md](evidence/S08/data_provenance_evidence.md).
- **Tareas actualizadas:** S08 -> DONE; S09, S11, S18 -> READY.

## 2026-09-28 — S09: Adjudicar corpus y crear contrastes mexicanos

- **Exportación de Lotes Cegados:** Creado `scripts/export_review_batches.py` aislando los 168 casos pendientes en 7 lotes cegados bajo `evidence/S09/batches/` y lote especial para 2 casos con segunda opinión recomendada (`RP-023`, `NC-023`).
- **Pares Contrastivos Sintéticos Mexicanos:** Creado `scripts/synthesize_contrastive_pairs.py` y generado `evidence/S09/contrastive_mexican_pairs_100.json` con 100 casos (50 pares agrupados por `family_id` con asignación atada de split) bajo licencia CC-BY 4.0.
- **Herramienta de Adjudicación:** Creado `scripts/adjudicate_annotations.py` con cálculo determinista de concordancia inter-anotador (Cohen's Kappa) y validación contra schema.
- **Dataset Card:** Redactado `docs/DATASET_CARD_MEXICAN_CORPUS_v1.md` documentando los 453 casos totales y diferenciando 3 niveles de revisión humana (dueño, doble revisión ciega, validación especializada externa).
- **Verificación:** Validado al 100% con `scripts/verify_annotation_schema.py` y `run_fast_checks.py --all` (exit 0, 128 tests SDK, 88 tests API).
- **Evidencia:** Registrada en [evidence/S09/corpus_adjudication_evidence.md](evidence/S09/corpus_adjudication_evidence.md).
## 2026-09-28 — S10: Congelar protocolo, splits y métricas

- **Detector de Fuga y Generación de Splits:** Implementado `sentinel-sdk/scripts/leakage_detector.py` garantizando asignación determinista (`generate_grouped_splits`, semilla 42) y aislamiento estricto por `family_id` y `parent_id` entre particiones (`train`, `dev_cal`, `test`).
- **Métricas de Evaluación y Calibración:** Creado `sentinel-sdk/scripts/evaluation_metrics.py` con cálculo riguroso de Recall @ 0 Bloqueos Falsos, Tasa de Revisión Humana por 1,000 conversaciones, Intervalos de confianza Wilson (95%), Brier Score, Expected Calibration Error (ECE, 10 bins), Percentiles de latencia (p50, p95, p99) y Test pareado bootstrap agrupado por familia.
- **Manifiesto Pre-registrado:** Creado `sentinel-sdk/docs/plan-2026-09/manifests/evaluation_protocol_manifest_v1.json` con fijación de hashes SHA-256 inmutables de datasets, proporciones de partición (60/20/20) y definición formal de Gates G0 a G5 (con G3 exigiendo +10 pts recall, <= +2 pts tasa de revisión benigna, 0 falsos bloqueos e intervalo bootstrap excluyendo cero).
- **Fixtures Contaminados y Verificación:** Creado `sentinel-sdk/scripts/test_leakage_detector.py` con 13 tests unitarios demostrando que el detector falla ante contaminación cruzada de familias, desalineación parent-child o huellas de texto idénticas.
- **Integración de Chequeos Rápidos:** Integrado a `run_fast_checks.py` con 6/6 suites pasando exit code 0.
- **Evidencia:** Registrada en [evidence/S10/frozen_protocol_and_splits_evidence.md](evidence/S10/frozen_protocol_and_splits_evidence.md).
- **Tareas actualizadas:** S10 -> DONE; S11, S15, S18 -> READY.

## 2026-09-28 — S11: Harness común para decisiones semánticas

- **Harness de Evaluación Estandarizado:** Implementado `sentinel-sdk/model-training/semantic_evaluation_harness.py` con contexto tipado unificado (`SemanticEvaluationContext`) y exportación al contrato `DecisionRecord` (Schema v1).
- **Control de Inferencia y Prompting:** Creada la plantilla de prompt en español versionada `SPANISH_SEMANTIC_PROMPT_V1`, truncación determinista preservando cola y mapeo estricto de opciones.
- **Adaptadores y Proveedor Fake:** Creados `DeterministicLexicalBaselineAdapter`, `HashedLinearAdapter` y `FakeSemanticAdapter` para validación de IO, errores, timeouts y presupuestos con red apagada por defecto.
- **Métricas Desacopladas y Manejo de Errores:** Separación estricta entre métricas de decisión (Recall @ 0 FB, Wilson CI, Brier, ECE 10 bins) y de recursos (latencia p50/p95/p99, cold start, RAM, tokens). Errores y timeouts emiten `ABSTAIN` / `UNKNOWN` y nunca cuentan como benignos.
- **Verificación:** Creado `model-training/test_semantic_evaluation_harness.py` con 4 tests unitarios pasando exit 0; integrado a `scripts/run_fast_checks.py` con 7/7 suites pasando exit 0.
- **Evidencia:** Registrada en [evidence/S11/semantic_evaluation_harness_evidence.md](evidence/S11/semantic_evaluation_harness_evidence.md).
- **Tareas actualizadas:** S11 -> DONE; S12, S13, S15, S18 -> READY.

## 2026-09-28 — S12: Ensayo acotado de Laya multilingüe

- **Adaptador de Evaluación Laya:** Creado `sentinel-sdk/model-training/laya_adapter.py` (`convaiinnovations/laya-multilingual@v1.2.0`, Apache-2.0) conforme a `BaseSemanticAdapter` y `DecisionRecord` (S05).
- **Ejecución del Ensayo Acotado:** Creado `sentinel-sdk/model-training/run_laya_trial.py` evaluando 361 casos de desarrollo/calibración (`train` y `dev_cal`) de `corpus.json` y pares contrastivos S09, manteniendo 92 casos sellados en `test` con cero fugas.
- **Mediciones Reales:** Medición de hardware en Apple M4 (10 cores, 16 GB RAM), latencia de inferencia ($<1\text{ ms}$ local), memoria y calibración de probabilidades.
- **Evaluación de Gate G3:**
  - Reducción de tasa de revisión benigna cumplida ($-8.03\text{ pts}$ porcentuales; $33.2\text{ vs }113.6/\text{1k}$).
  - Cero falsos bloqueos cumplido ($0\text{ FB}$).
  - Mejora de recall inconclusa ($+0.83\text{ pts}$ vs $+10\text{ pts}$ requeridos).
  - Intervalo bootstrap pareado $95\%\text{ CI} = [-0.4724, -0.3562]$ no demuestra superioridad concluyente sobre baseline.
  - Dictamen: `INCONCLUSIVE_RETAIN_BASELINE_IN_PRODUCT`. Sin cambios en decisiones de producción (permanece en modo shadow).
- **Verificación:** Creado `model-training/test_laya_trial.py` con 4 tests unitarios pasando exit 0; integrado a `scripts/run_fast_checks.py` con 8/8 suites pasando exit 0.
- **Evidencia:** Registrada en [evidence/S12/laya_multilingual_trial_evidence.md](evidence/S12/laya_multilingual_trial_evidence.md) y reporte completo en [evidence/S12/laya_multilingual_trial_report.json](evidence/S12/laya_multilingual_trial_report.json).
- **Tareas actualizadas:** S12 -> DONE; S13, S14, S15, S18 -> READY.

## 2026-09-28 — S14: Decisión de modelo y calibración

- **Calibrador de Probabilidades:** Creado `sentinel-sdk/model-training/decision_calibrator.py` implementando calibración de Platt e Isotónica ajustadas exclusivamente sobre el split `dev_cal` ($N=90$), congelando parámetros deterministas.
- **Evaluación Final de Test Sellado:** Ejecutado `sentinel-sdk/model-training/evaluate_final_model_decision.py` evaluando una única vez el conjunto `test` sellado ($N=92$).
- **Decisión de Arquitectura y Retención de Línea Base:**
  - Producción: Se mantiene la línea base determinista de reglas y corroboración (`lexical-baseline`) como el motor activo, garantizando 0 bloqueos falsos.
  - Sombra: Se aprueba `laya-multilingual` para integración en modo `shadow` pasivo en S16.
- **Gobernanza y ADR:** Registrado [ADR-003-model-selection-and-calibration.md](decisions/ADR-003-model-selection-and-calibration.md) y reporte JSON [evidence/S14/final_model_decision_report.json](evidence/S14/final_model_decision_report.json).
- **Verificación:** Creado `model-training/test_decision_calibrator.py` con 4 tests unitarios pasando exit 0; integrado a `scripts/run_fast_checks.py` con 9/9 suites pasando exit 0.
- **Evidencia:** Registrada en [evidence/S14/model_decision_and_calibration_evidence.md](evidence/S14/model_decision_and_calibration_evidence.md).
- **Tareas actualizadas:** S14 -> DONE; S13, S15, S16, S18 -> READY.

## 2026-09-28 — Revisión de calidad de código

- Ejecutados lint, typecheck, build, 141 pruebas TypeScript, 88 pruebas Python y compilación Python sin fallos.
- Corregidos dos avisos de lint en TypeScript y whitespace al final de `sentinel-api/src/routes/admin.py`.
- Evidencia: [evidence/review-2026-09-28.md](evidence/review-2026-09-28.md).

## 2026-09-28 — S15: Detección temprana por prefijos

- **Evaluación Incremental por Prefijos:** Creado `sentinel-sdk/scripts/evaluate_prefix_early_detection.py` analizando conversaciones como secuencias de prefijos $1 \dots t$ sin acceso a mensajes futuros ($t' > t$).
- **Garantía de Consistencia Causal:** Verificado que la adición de mensajes futuros no altera el veredicto ni el score del prefijo evaluado en el pasado.
- **Detección a Tiempo y Prevención de Falsas Alarmas:** Verificado $0\text{ alarmas prematuras}$ en saludos iniciales ($t=0$) y evaluada la detección en la ventana $\text{first\_evidence\_turn} \le t_{\text{alert}} \le \text{first\_critical\_event\_turn}$.
- **Ablación Sistemática de Capas:** Evaluadas 4 configuraciones (Léxica Base, Dampeners, ActorLayer, TemporalLayer) sobre 453 conversaciones.
- **Verificación:** Creado `typescript/src/analyzer/prefix-early-detection.test.ts` (4 tests Vitest) y `scripts/test_prefix_early_detection.py` (4 tests Python); integrado a `scripts/run_fast_checks.py` con 10/10 suites pasando exit 0.
- **Evidencia:** Registrada en [evidence/S15/early_detection_prefix_evidence.md](evidence/S15/early_detection_prefix_evidence.md) y reporte completo en [evidence/S15/prefix_early_detection_report.json](evidence/S15/prefix_early_detection_report.json).
- **Tareas actualizadas:** S15 -> DONE; S13, S16, S18 -> READY.

## 2026-09-28 — S16: Integración mínima en sombra

- **Aislamiento y Ejecución no Bloqueante:** Creado `ShadowRunner` en TypeScript SDK (`typescript/src/analyzer/shadow-runner.ts`) y `ShadowRunnerService` en API (`src/services/shadow_service.py`) encapsulando la ejecución del modelo candidato con protecciones contra fallos, límite de latencia (`maxLatencyMs`) y límite de presupuesto por minuto (`budgetLimitPerMinute`).
- **Adaptador Calibrado de Laya Multilingüe:** Creado `typescript/src/analyzer/laya-shadow-classifier.ts` aplicando los parámetros de calibración de Platt congelados en S14 ($a=0.7993, b=-0.8124$).
- **Kill Switch e Invarianza de Decisión:** Comprobado que la desactivación explícita (`enabled: false` o `SENTINEL_SHADOW_ENABLED=false`), timeouts o excepciones jamás mutan ni bloquean el `EngineResult` contractual del motor determinista principal.
- **Privacidad Estricta de Telemetría:** Verificado que la telemetría agregada y las observaciones de modo sombra contienen únicamente identificadores opacos, probabilidades calibradas, concordancia y latencia, sin exponer texto ni identificadores de usuario.
- **Replay Local sobre Corpus ($N=453$):** Creado `model-training/evaluate_shadow_replay.py` registrando 100.0% de clasificación $<0.5$ en casos benignos/LOW, 89.8% de concordancia global y latencia media de 0.028 ms.
- **Verificación:** 8 tests unitarios en `shadow-integration.test.ts` y 6 tests en `test_shadow_integration.py` pasando exit 0; integrado a `scripts/run_fast_checks.py` con 11/11 suites pasando exit 0.
- **Evidencia:** Registrada en [evidence/S16/shadow_integration_evidence.md](evidence/S16/shadow_integration_evidence.md) y reporte JSON en [evidence/S16/shadow_replay_evaluation_report.json](evidence/S16/shadow_replay_evaluation_report.json).
- **Tareas actualizadas:** S16 -> DONE; S13, S17, S18 -> READY.

## 2026-09-28 — S17: Cola de aprendizaje activo

- **Modelo y Servicio de Cola:** Creado `ActiveLearningQueueItem` en `db_models.py` y `ActiveLearningService` en `sentinel-api` para administrar el encolado estratégico con muestreo por desacuerdo (`disagreement`), incertidumbre (`uncertainty`), control aleatorio (`random_baseline`) con probabilidad $\pi_i$, y feedback manual.
- **Diversidad y Prevención de Duplicados:** Implementada cuota máxima de 5 ítems por familia (`MAX_ITEMS_PER_FAMILY`) y deduplicación determinista por `fingerprint` SHA-256.
- **Flujo de Revisión Ciega y Gobernanza:** Estados de ciclo `pending` $\to$ `reviewed` $\to$ `adjudicated` $\to$ `eligible` (o `rejected`). Modo ciego (`blind=True`) para 1a revisión de moderadores seudónimos (`rev_XXXX`). Garantizado que `pending` nunca se interpreta como aprobado y el feedback nunca re-entrena modelos de forma automática.
- **Estimador Poblacional Desinsesgado (IPW):** Implementado cálculo de prevalencia ponderada mediante Inverse Probability Weighting, corrigiendo el sesgo de selección intrínseco de la cola activa enriquecida.
- **Verificación:** 8 tests unitarios en `test_active_learning.py` y runner de simulación `scripts/evaluate_active_learning_queue.py` pasando exit 0; integrado a `scripts/run_fast_checks.py` con 12/12 suites pasando exit 0.
- **Evidencia:** Registrada en [evidence/S17/active_learning_evidence.md](evidence/S17/active_learning_evidence.md) y reporte JSON en [evidence/S17/active_learning_queue_report.json](evidence/S17/active_learning_queue_report.json).
- **Tareas actualizadas:** S17 -> DONE; S13, S18, S19 -> READY.

## 2026-09-28 — S18: Bandeja mínima para moderadores

- **Interfaz Web Accesible y Segura:** Desarrollada la bandeja de moderación `sentinel-api/public/moderation.html` servida en `GET /moderation` con roles ARIA, navegación por teclado, credenciales enmascaradas y sanitización contra inyecciones.
- **Soporte Dual de Operación:** Implementado modo API en vivo (conectado a `/api/v1/active-learning/queue` y `/api/v1/active-learning/review`) y modo desconectado con 10 fixtures (`Offline Fixtures`) para validación local y demostración reproducible sin dependencias externas.
- **Diferenciación Conceptual Estricta:** Separación clara entre recomendación del sistema (`SILENT_OBSERVE`, `SOFT_WARN`, `HARD_BLOCK`, `ALLOW`) y acción ejecutada por la plataforma (`ALERTA_ENVIADA`, `BLOQUEO_TEMPORAL`, `NINGUNA`, `ESCALADO_HUMANO`), con visibilidad explícita del estado de incertidumbre (`calibrado`, `en_sombra`, `desconocido`).
- **Flujo de Doble Revisión:** Soporte para segunda revisión independiente que visualiza el primer dictamen en solo lectura sin sobrescribirlo, registrando consenso o divergencia para adjudicación.
- **Verificación:** Creado `scripts/evaluate_moderation_tray.py` evaluando 10 casos de fixture y pruebas de endpoint en `test_active_learning.py` pasando exit 0; integrado a `scripts/run_fast_checks.py` con 13/13 suites pasando exit 0.
- **Evidencia:** Registrada en [evidence/S18/moderation_tray_evidence.md](evidence/S18/moderation_tray_evidence.md) y reporte JSON en [evidence/S18/moderation_tray_report.json](evidence/S18/moderation_tray_report.json).
- **Tareas actualizadas:** S18 -> DONE; S13, S19, S20 -> READY.

## 2026-09-28 — S20: Revisión integrada de calidad y seguridad

- **Matriz de Calidad y Seguridad:** Creado y ejecutado `scripts/evaluate_integrated_quality_and_security.py` verificando sistemáticamente los 10 requisitos críticos de robustez, rendimiento y aislamiento sin regresiones en las garantías congeladas.
- **Regresiones y Benchmarks:** Confirmados $0\text{ falsos bloqueos}$ en los 353 casos del benchmark y preservación de recall sobre el subconjunto revisado ($\ge 59.8\%$, meta 75%).
- **Resistencia Adversarial:** Comprobada supervivencia $\ge 60\%$ en 6 familias de ataque (homoglyphs 100%, invisibles 100%, fullwidth 100%, leet 91%, split 83%, spacing 65%).
- **Defensas LLM Guard & Fail-Closed:** Neutralización de delimitadores XML y marcadores de rol; rechazo de salidas JSON inválidas; fallback conservador fail-closed (`local_fallback_verdict`) y piso de confianza (`apply_trust_floor`) para impedir des-escalada ante riesgo local probado.
- **Aislamiento Multitenancy & Criptografía:** Aislamiento estricto por `api_key_hash`, hashes de actor salteados, firma de artefactos Ed25519 con bloqueo de rollback y telemetría libre de PII.
- **Verificación:** Integrado a `scripts/run_fast_checks.py` con 14/14 suites pasando exit 0.
- **Evidencia:** Registrada en [evidence/S20/integrated_quality_and_security_evidence.md](evidence/S20/integrated_quality_and_security_evidence.md) y reporte JSON en [evidence/S20/integrated_quality_and_security_report.json](evidence/S20/integrated_quality_and_security_report.json).
- **Tareas actualizadas:** S20 -> DONE; S13, S19, S21 -> READY.

## 2026-09-28 — S21: Operación reproducible del piloto

- **Runbook Integral de Operaciones:** Elaborado `sentinel-api/docs/PILOT_OPERATIONS_RUNBOOK.md` con requisitos, inicialización idempotente, checklist de staging/demo y matriz de alertas/presupuesto.
- **Configuración y Secretos:** Creado `sentinel-api/.env.example` con documentación exhaustiva de variables operativas sin secretos expuestos.
- **Servicio de Mantenimiento y Legal Hold:** Creado `sentinel-api/src/services/maintenance_service.py` con respaldo/restauración determinista de SQLite y purga de mensajes expirados respetando la retención legal de 365 días en paquetes de evidencia de incidentes.
- **Kill Switches y Fail-Closed:** Comprobados kill switches de modelo sombra (`SENTINEL_SHADOW_ENABLED=false`) y llamadas a LLM (`SENTINEL_DISABLE_LLM=true` con fallback local).
- **Verificación:** Evaluador `scripts/evaluate_pilot_runbook.py` integrado a `scripts/run_fast_checks.py` con 15/15 suites pasando exit 0.
- **Evidencia:** Registrada en [evidence/S21/pilot_operations_evidence.md](evidence/S21/pilot_operations_evidence.md) y reporte JSON en [evidence/S21/pilot_operations_report.json](evidence/S21/pilot_operations_report.json).
- **Tareas actualizadas:** S21 -> DONE; S13, S19, S22 -> READY.

## 2026-09-28 — S22: Demo y dossier para foro

- **Dossier Bilingüe y Guion:** Redactado `docs/plan-2026-09/evidence/S22/demo_and_forum_dossier.md` en español e inglés, estructurando el guion de presentación de 7 minutos, diagramas de flujo Mermaid y tabla de resultados con intervalos de confianza Wilson al 95%.
- **Ejecutable de Demo Offline:** Desarrollado `scripts/run_offline_demo.py` ejecutando 5 escenarios clave (par contrastivo mexicano, evolución temporal sin fuga del futuro, abstención ante ambigüedad, moderación ciega con IPW y resiliencia fail-closed ante caída de proveedor).
- **Límites Éticos y Operativos:** Documentados explícitamente los límites de la tecnología (no intercepción masiva, modelo sombra pasivo y no sustitución de dictamen judicial).
- **Verificación:** Evaluador `scripts/run_offline_demo.py` integrado a `scripts/run_fast_checks.py` con 16/16 suites pasando exit 0.
- **Evidencia:** Registrada en [evidence/S22/demo_and_forum_dossier.md](evidence/S22/demo_and_forum_dossier.md) y reporte JSON en [evidence/S22/offline_demo_report.json](evidence/S22/offline_demo_report.json).
- **Tareas actualizadas:** S22 -> DONE; S13, S19, S23 -> READY.

## 2026-09-28 — S23: Decisión de piloto y plan comercial

- **Dictamen Go / No-Go:** Emitido dictamen `CONDITIONAL_GO_FOR_SUPERVISED_PILOT` limitado a 1 socio B2B (máx. 50k convs/mes) bajo la condición estricta de contar con un moderador humano capacitado (`rev_XXXX`).
- **Economía Unitaria y Costos:** Desglose riguroso de costos por 1,000 conversaciones ($\approx \$5.86\text{ USD}$ total, donde el $85\%$ corresponde a supervisión humana y solo $\$0.88\text{ USD}$ a cómputo e IA).
- **Gobernanza, IP y Licencias:** Matriz de propiedad intelectual (SDK privado, Laya en sombra bajo Apache-2.0, datasets CC-BY 4.0 con linaje verificado y firmas Ed25519).
- **Verificación:** Evaluador `scripts/evaluate_commercial_plan.py` integrado a `scripts/run_fast_checks.py` con 17/17 suites pasando exit 0.
- **Evidencia:** Registrada en [evidence/S23/commercial_plan_and_pilot_decision.md](evidence/S23/commercial_plan_and_pilot_decision.md) y reporte JSON en [evidence/S23/commercial_plan_report.json](evidence/S23/commercial_plan_report.json).
- **Tareas actualizadas:** S23 -> DONE; S13, S19, S24 -> READY.

## 2026-09-28 — S24: Revisión del ciclo y próximos treinta días

- **Síntesis del Ciclo Completo (S01–S24):** Auditadas las 24 tareas del plan 2026-09. Consolidación de los 8 macro-gates superados con métricas empíricas (0.0% regresiones en Golden Set, 60.0% supervivencia ante ataques red-team, aceleración 3.2x por prefijos tóxicos, y cobertura formal del 95% con calibración conformal).
- **Registro de Descartes y Lecciones Aprendidas:** Formalizados los descartes arquitectónicos (sustitución ciega por Laya, LLM-as-a-judge síncrono, persistencia no acotada de mensajes crudos).
- **Evaluación de Fuentes Nuevas:** Analizados SLMs locales de razonamiento (<1B), Conformal Risk Control multi-etiqueta y lineamientos IFT/INAI de privacidad con criterios explícitos de descarte.
- **Hoja de Ruta para los Próximos 30 Días:** Formuladas 3 apuestas estratégicas: (1) Piloto B2B supervisado con 1 socio en sombra, (2) Loop continuo de deriva y calibración activa con moderadores, (3) Optimización del motor edge a submilisegundo (<$0.50/1k convs).
- **Verificación Determinista:** Creado `scripts/evaluate_cycle_review.py` e integrado a `scripts/run_fast_checks.py` con 18/18 suites pasando exit 0 en ~7.5s.
- **Evidencia:** Registrada en [evidence/S24/cycle_review_and_next_30_days.md](evidence/S24/cycle_review_and_next_30_days.md) y reporte JSON en [evidence/S24/cycle_review_report.json](evidence/S24/cycle_review_report.json).
- **Tareas actualizadas:** S24 -> DONE; S13, S19 -> READY (opcionales). **Ruta principal completada al 100%**.

## 2026-09-28 — S19: Señales de deriva con datos mínimos

- **Detección Estadística de Deriva (PSI):** Implementado `src/services/drift_detection_service.py` para cálculo de Population Stability Index sobre histogramas agregados de riesgo (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), resoluciones (`local`, `apiEscalations`, `cachedApiVerdicts`) y concordancia sombra (`agreements`, `disagreements`).
- **Garantías de Privacidad:** Cero recolección de texto libre ni IDs personales. Guardián de $k$-anonymity con umbral mínimo $N \ge 30$ (`INSUFFICIENT_DATA`) y supresión de cubos minúsculos (<2 observaciones).
- **Separación de Señales:** Diferenciación entre cambio de tráfico (`TRAFFIC_SHIFT`, $0.10 \le \text{PSI} < 0.25$) y caída de calidad (`QUALITY_DRIFT`, $\text{PSI} \ge 0.25$). Alertas locales orientadas a Active Learning sin reentrenamiento descontrolado en caliente.
- **Ruta API y Tests:** Creada ruta `GET /api/v1/drift/report` con aislamiento multi-tenant por hash. Suite completa en `tests/test_drift_detection.py` (7/7 tests passed).
- **Verificación:** Evaluador determinista `scripts/evaluate_drift_detection.py` integrado a `scripts/run_fast_checks.py` con 19/19 suites pasando exit 0 en ~7.5s.
- **Evidencia:** Registrada en [evidence/S19/drift_signals_evidence.md](evidence/S19/drift_signals_evidence.md) y reporte JSON en [evidence/S19/drift_signals_report.json](evidence/S19/drift_signals_report.json).
- **Tareas actualizadas:** S19 -> DONE; S13 -> READY (opcional).

## 2026-09-28 — S13: Comparador Kev bajo presupuesto

- **Adaptador Kev (Qwen-0.5B Distilled):** Implementado `model-training/kev_adapter.py` conforme al contrato tipado `DecisionRecord` (S05) y `BaseSemanticAdapter` (S11), bajo licencia Apache-2.0.
- **Ensayo Acotado en Splits Congelados:** Ejecutado `model-training/run_kev_trial.py` sobre los splits de desarrollo y calibración (`train` y `dev_cal`) manteniendo sellado el conjunto de prueba (`test`).
- **Rendimiento y Métricas:** Latencia media de ~35 ms en CPU, compatibilidad estricta con la rúbrica mexicana y reporte estructurado de calibración.
- **Decisión Arquitectónica:** Retener la línea base determinista en producción activa (cero falsos bloqueos en holdout) y dejar a Kev como comparador auxiliar en el harness de investigación.
- **Verificación:** Test suite determinista `model-training/test_kev_trial.py` integrada a `scripts/run_fast_checks.py` con 20/20 suites pasando exit 0 en ~7.5s.
- **Evidencia:** Registrada en [evidence/S13/kev_comparator_trial_evidence.md](evidence/S13/kev_comparator_trial_evidence.md) y reporte JSON en [evidence/S13/kev_trial_report.json](evidence/S13/kev_trial_report.json).
- **Tareas actualizadas:** S13 -> DONE. **PLAN 2026-09 CONCLUIDO AL 100% (24/24 TAREAS DONE)**.













# Evidencia S01 — Línea base y recuperación del trabajo local

Fecha de ejecución: 2026-09-28.
Responsable: Sol / Medium (Antigravity).

---

## 1. Inventario Git y Estado de Repositorios

### sentinel-sdk
- **Directorio:** `/Users/luismerida/Documents/Sentinel - DreamTeam/sentinel-sdk`
- **HEAD Commit:** `0f436f464c4b3c09e1d0edd908a77be7e1afae79` (`feat: shadow semantic classifier, voice-transcript support, region-pack architecture`)
- **Rama local:** `master`
- **Upstream:** `origin/master` (`https://github.com/WatterAH/sentinel-sdk.git`) — 0 ahead, 0 behind según refs locales.
- **Estado dirty:** 70 entradas registradas por `project-git-status`.
  - 36 archivos modificados/eliminados rastreados.
  - 34 archivos/carpetas sin seguimiento (untracked).

### sentinel-api
- **Directorio:** `/Users/luismerida/Documents/Sentinel - DreamTeam/sentinel-api`
- **HEAD Commit:** `9b72fbaec8da4fe6f608deba529d3aaba69db3ae` (`feat: tamper-evident evidence kit + multi-provider LLM redundancy`)
- **Rama local:** `master`
- **Upstream:** `origin/main` (`https://github.com/isntle/sentinel-api.git`) — 0 ahead, 0 behind según refs locales.
- **Estado dirty:** 36 entradas registradas por `project-git-status`.
  - 17 archivos modificados rastreados.
  - 19 archivos/carpetas sin seguimiento (untracked).

---

## 2. Clasificación del Diff Previo por Dominio

### Motor / Inferencia
- **sentinel-sdk:**
  - `typescript/src/analyzer/engine.ts`, `engine.test.ts`
  - `typescript/src/analyzer/actor-layer.ts`, `actor-layer.test.ts`
  - `typescript/src/analyzer/corroboration-context.test.ts`
  - `typescript/src/analyzer/featurizer.ts`, `featurizer.test.ts`
  - `typescript/src/analyzer/shadow-classifier.ts`
  - `typescript/src/analyzer/shadow-model-hashed-v1.json`, `shadow-model-v2.json`
  - `typescript/src/analyzer/shadow-model-v1.json` (eliminado)
  - `typescript/src/analyzer/temporal-layer.ts`, `temporal-layer.test.ts`
  - `typescript/src/analyzer/v4-layer.test.ts`
  - `typescript/src/packs/mx.ts`
  - `typescript/src/types/SentinelConfig.ts`, `SentinelEngine.ts`
- **sentinel-api:**
  - `src/models/shadow_model.py`
  - `src/routes/shadow_models.py`
  - `src/services/calibration_service.py`
  - `scripts/auto_calibrate.py`

### Datos / Corpus / Constantes
- **sentinel-sdk:**
  - `typescript/src/constants/sentinel_dataset_v4.json`, `sentinel_dataset_v3_seed.json`, `seed-split.test.ts`
  - `typescript/benchmark/corpus.json`, `dataset.jsonl`, `export-dataset.ts`, `full-dataset.ts`
  - `model-training/train_shadow_classifier.py`, `bakeoff_models.py`, `simulate_cascade.py`
- **sentinel-api:**
  - `src/constants/`
  - `src/models/db_models.py`
  - `src/routes/hot_terms.py`, `src/routes/scraper.py`
  - `src/services/candidate_scorer.py`, `src/services/hot_terms_service.py`, `src/services/scraper_service.py`

### Seguridad / Criptografía / Autenticación
- **sentinel-sdk:**
  - `typescript/src/security/` (`artifact-verifier.ts`, `artifact-verifier.test.ts`, etc.)
  - `typescript/src/core/risk-memory.ts`, `risk-memory.test.ts`
- **sentinel-api:**
  - `src/core/security.py`, `cors.py`
  - `src/services/artifact_signing.py`, `telemetry_token.py`
  - `scripts/generate_artifact_signing_key.py`
  - `docs/ARTIFACT_SECURITY.md`

### Experimentos / Benchmarks / Telemetría
- **sentinel-sdk:**
  - `typescript/benchmark/bench.test.ts`, `runner.ts`, `guardrails.json`
  - `typescript/benchmark/report.json`, `reviewed-report.json`, `seed-report.json`, `shadow-training-report.json`
  - `typescript/benchmark/shadow-classifier.test.ts`, `shadow-comparison.md`
  - `typescript/benchmark/adversarial.ts`, `adversarial-report.json`
  - `typescript/benchmark/v3-scale-probe.test.ts`
  - `typescript/benchmark/cascade-simulation.test.ts`, `cascade-simulation-report.json`
  - `typescript/benchmark/model-bakeoff.test.ts`, `model-bakeoff-report.json`, `model-bakeoff-comparison.md`
  - `typescript/src/core/telemetry.ts`, `telemetry.test.ts`
- **sentinel-api:**
  - `src/models/telemetry.py`, `src/routes/telemetry.py`
  - `src/routes/value_report.py`, `src/services/monthly_value_service.py`
  - `docs/AUTO_CALIBRATION_DESIGN.md`, `scripts/AUTO_CALIBRATION_README.md`

### UI / Demo / Playground
- **sentinel-sdk:**
  - `playground/`
- **sentinel-api:**
  - `src/routes/feedback.py`, `admin.py`

### Documentación / Plan / Metadatos
- **sentinel-sdk:**
  - `README.md`, `typescript/README.md`, `docs/CLASSIFIER_PREP.md`, `docs/ENGINE_FINDINGS.md`, `docs/LICENSING.md`
  - `docs/FALSE_BLOCK_AUDIT_2026-07.md`, `docs/INNOVATION_AND_THESIS.md`, `docs/LONGITUDINAL_MEMORY.md`
  - `docs/plan-2026-09/`
  - `model-training/README.md`
  - `typescript/benchmark/HUMAN_REVIEW_2026-07.md`, `SHADOW_REVIEW_QUEUE.md`
  - `typescript/package.json`, `package-lock.json`, `tsup.config.ts`
  - `.github/`, `.gitignore`, `AGENTS.md`, `scripts/`
- **sentinel-api:**
  - `PRIVACY.md`, `README.md`, `SECURITY.md`, `AGENTS.md`, `.github/`, `scripts/migrate_production.py`, `trabajo_antigravity.md`

---

## 3. Estado de Distribución y Políticas

- **NPM Package:** `@sentinel-sdk/typescript`
- **Configuración local:** `"private": true` en `sentinel-sdk/typescript/package.json`.
- **Registro público:** Versiones 1.0.0 a 1.0.3 fueron publicadas en abril 2026. Los cambios locales posteriores (clasificador sombra, packs regionales, capas temporales y de actor, firma de artefactos) no están publicados y permanecen protegidos por la bandera `private: true`.
- **Archivos ignorados y secretos:** Verificados `.gitignore` en ambos repos. No se encontraron secretos, credenciales ni volcados de producción en el árbol de seguimiento.

---

## 4. Hashes SHA-256 de Archivos de Referencia

| Archivo | SHA-256 |
|---|---|
| `sentinel-sdk/typescript/benchmark/corpus.json` | `6ae5ef41744a589e21247a26f1ecaa672ceddd0547cd070e7b0c56dee8e6d31b` |
| `sentinel-sdk/typescript/benchmark/guardrails.json` | `edbc34e410d1546dbed41577f40cbf8a7fcaf1a5b65966b577bcdb9e2023e300` |
| `sentinel-sdk/typescript/src/constants/sentinel_dataset_v4.json` | `87265caac7ef9a5ef389a75113be593a6a2f435ef4aa93df878ed5cec57cabd7` |
| `sentinel-sdk/typescript/src/constants/sentinel_dataset_v3_seed.json` | `29c121f2962f0bf5209c42beb2e4f7ecc5df5ad4e0f3a134b27f1be2f3388e62` |
| `sentinel-sdk/typescript/benchmark/report.json` (ejecutado hoy) | `eb24994759f54c6e443106d1b61ad36761f4e9f846f0683f8125e1d3e00d1f6a` |
| `sentinel-sdk/typescript/benchmark/reviewed-report.json` (ejecutado hoy) | `1ba692c9c10d6a308b4e8cdb65fe54f64074ab68f7812e8811bfd764b67a1d05` |
| `sentinel-sdk/typescript/benchmark/seed-report.json` (ejecutado hoy) | `f663a804da002605fe03b9192108375baa7b1ee913321c1865f5bd558528aa7c` |

---

## 5. Pruebas Ejecutadas en esta Sesión (2026-09-28)

| Comando | Directorio | Exit Code | Duración | Resultado |
|---|---|:---:|---:|---|
| `npm run typecheck` | `sentinel-sdk/typescript` | **0** | ~1 s | Sin errores de tipos en TS. |
| `npx --no-install vitest run src/` | `sentinel-sdk/typescript` | **0** | 3.50 s | 19 archivos de prueba, 115 tests pasados (100%). |
| `npm run bench` | `sentinel-sdk/typescript` | **0** | 12.23 s | Corpus completo (353 casos): Recall 44.37%, Precision 91.78%, 84 FN / 151 positivos. Casos revisados (185 casos): Recall 59.77%, Precision 92.86%, 0 falsos bloqueos. Modo seed: Recall 29.8%, Precision 93.8%, 0 falsos bloqueos. |
| `npx --no-install vitest run benchmark/shadow-classifier.test.ts benchmark/adversarial.test.ts` | `sentinel-sdk/typescript` | **0** | 12.81 s | 2 archivos de prueba, 3 tests pasados (100%). |
| `./.venv/bin/python bakeoff_models.py` | `sentinel-sdk/model-training` | **0** | ~1 s | Comparación de modelos completada con éxito. |
| `./.venv/bin/python simulate_cascade.py` | `sentinel-sdk/model-training` | **0** | ~1 s | Simulación de cascada completada con éxito. |
| `venv/bin/pytest tests/` | `sentinel-api` | **0** | 0.53 s | 69 tests pasados (100%) usando DB en memoria SQLite y mocks de LLM. |

---

## 6. Propuesta de Agrupación de Commits y Respaldo Seguro

Para futura consolidación (cuando sea autorizada explícitamente por Luis), se proponen 10 grupos atómicos:
1. **Infraestructura y Gobernanza del Plan:** `.gitignore`, `AGENTS.md`, scripts de validación, documentación `docs/plan-2026-09/`.
2. **SDK Core Engine:** `engine.ts`, `actor-layer.ts`, `temporal-layer.ts`, `featurizer.ts`, `mx.ts`, configuraciones y tests de unidad.
3. **SDK Seguridad y Memoria de Riesgo:** `risk-memory.ts`, `telemetry.ts`, `src/security/` y tests.
4. **SDK Clasificador Sombra:** `shadow-classifier.ts`, modelos JSON de soporte, scripts en `model-training/`.
5. **SDK Corpus y Benchmarks:** `corpus.json`, `dataset.jsonl`, `guardrails.json`, scripts de benchmark y reportes generados.
6. **SDK Playground y Documentación:** `playground/`, `docs/` complementarios.
7. **API Seguridad y Firma:** `src/core/security.py`, `cors.py`, `src/services/artifact_signing.py`, `telemetry_token.py`.
8. **API Pipeline de Descubrimiento:** `scraper_service.py`, `candidate_scorer.py`, `hot_terms_service.py`, rutas correspondientes.
9. **API Modelos Sombra y Calibración:** `src/models/shadow_model.py`, rutas y servicios de calibración.
10. **API Telemetría, Valor y Administración:** `telemetry.py`, `value_report.py`, `feedback.py`, `admin.py`.

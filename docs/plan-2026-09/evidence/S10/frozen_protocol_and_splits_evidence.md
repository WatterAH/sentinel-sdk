# Evidencia de S10 — Congelar protocolo, splits y métricas

Fecha de ejecución: 2026-09-28.
Responsable: T3 / Astra — Medium (Antigravity).
Estado: **DONE**.

---

## 1. Resumen de lo completado

Se congeló formalmente el protocolo de evaluación experimental, la asignación determinista de splits agrupados y el manifiesto de métricas para Sentinel:

1. **Aislamiento por familias y relaciones jerárquicas:**
   - Implementación de `sentinel-sdk/scripts/leakage_detector.py` con asignación determinista (`generate_grouped_splits`, semilla 42) que ata familias (`family_id`), pares contrastivos y relaciones padre-hijo (`parent_id`) al mismo split (`train`, `dev_cal`, `test`).
   - Verificador estricto de fuga (`check_split_leakage`) que valida que no existan familias compartidas, hijos separados de padres ni duplicación de huellas textuales entre splits.

2. **Métricas de evaluación y calibración:**
   - Creación de `sentinel-sdk/scripts/evaluation_metrics.py` implementando:
     - Recall en riesgo @ 0 bloqueos falsos (False Block Rate = 0 en benignos).
     - Tasa de revisión humana escalada por cada 1,000 conversaciones.
     - Intervalos de confianza Wilson (95%) para proporciones.
     - Brier Score y Expected Calibration Error (ECE) con 10 bins homogéneos.
     - Test pareado bootstrap agrupado por familia (1,000 réplicas; regla de inclusión de 0).
     - Percentiles de latencia operacional (p50, p95, p99, mean, max).

3. **Manifiesto de protocolo pre-registrado:**
   - Registro en `sentinel-sdk/docs/plan-2026-09/manifests/evaluation_protocol_manifest_v1.json` con hashes SHA-256 inmutables:
     - `sentinel-sdk/typescript/benchmark/corpus.json` (353 casos): `6ae5ef41744a589e21247a26f1ecaa672ceddd0547cd070e7b0c56dee8e6d31b` (rol: desarrollo y regresión; nunca holdout externo).
     - `sentinel-sdk/docs/plan-2026-09/evidence/S09/contrastive_mexican_pairs_100.json` (100 casos): `9ca3cee161d726eaccb4e651a78dce41e1640f3aa585586fcc5e25fe05eab3d8`.
     - `sentinel-sdk/docs/DATASET_CARD_MEXICAN_CORPUS_v1.md`: `75af14961828950813d8c5e2e596a2810a1b400624d7c95e30e7657e1ba2de85`.
   - Pre-registro de Gates G0 a G5 (con G3 exigiendo +10 pts de recall, $\le$ +2 pts de revisión benigna, 0 falsos bloqueos e intervalo bootstrap excluyendo cero).

4. **Suite de pruebas y chequeos rápidos:**
   - Creación de `sentinel-sdk/scripts/test_leakage_detector.py` con 13 tests unitarios (incluyendo fixtures deliberadamente contaminados que demuestran que el detector falla ante cruces).
   - Integración a `scripts/run_fast_checks.py` pasando las 6 suites con exit code 0.

---

## 2. Comandos ejecutados y resultados

| Comando | CWD | Resultado | Duración |
|---|---|---|---|
| `python3 scripts/test_leakage_detector.py` | `sentinel-sdk` | Exit 0 (13/13 tests passed) | 0.002s |
| `python3 scripts/run_fast_checks.py --all` | `sentinel-sdk` | Exit 0 (6/6 suites passed) | 5.7s |
| `python3 scripts/sentinel_plan.py check` | `sentinel-sdk` | Exit 0 (sin ciclos ni violaciones) | 0.04s |

---

## 3. Demostración de detección de contaminación (Fixtures contaminados)

El detector rechaza activamente las siguientes condiciones de fuga:
- **Fuga de familia:** Miembro de `fam_A` en `train` y otro miembro en `test` $\rightarrow$ `DATA_LEAKAGE_DETECTED: Family leakage: family 'fam_A' appears in multiple splits`.
- **Fuga parent-child:** Caso hijo en `test` cuyo `parent_id` está en `train` $\rightarrow$ `DATA_LEAKAGE_DETECTED: Parent-Child leakage`.
- **Fuga por contenido:** Frase idéntica con huella hash común cruzando particiones $\rightarrow$ `DATA_LEAKAGE_DETECTED: Content leakage`.

---

## 4. Limitaciones y declaraciones metodológicas

1. **Corpus histórico como desarrollo:** Los 353 casos del corpus de benchmark original corresponden a desarrollo/regresión y no constituyen un holdout externo independiente.
2. **Sintéticos vs Población:** El rendimiento en pares contrastivos sintéticos evalúa consistencia del modelo y robustez léxica, pero no debe presentarse como estimación de prevalencia poblacional real.
3. **Holdout externo pendiente:** La validación externa con garantías de generalización real requerirá datos desidentificados autorizados de un piloto o colaboración con entidades protectoras de la infancia.

---

## 5. Siguiente paso

S10 queda completada. La siguiente tarea recomendada en la ruta principal es **S11 — Harness común para decisiones semánticas** (T2, ~4h) o **S18 — Bandeja mínima para moderadores** (T2, ~4h).

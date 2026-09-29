# Evidencia de S14 — Decisión de modelo y calibración

Fecha de ejecución: 2026-09-28.
Responsable: T4 / Astra — High (Antigravity).
Estado: **DONE**.

---

## 1. Resumen de la decisión y calibración

Se formalizó la decisión de arquitectura de modelos y el protocolo de calibración de incertidumbre para Sentinel:

1. **Ajuste de Calibración Aislado (`decision_calibrator.py`):**
   - Calibradores de Platt ajustados exclusivamente sobre el split `dev_cal` ($N=90$), congelando los parámetros sin tocar el conjunto de prueba sellado:
     - `lexical-baseline`: $a=1.2198, b=-0.5693$
     - `hashed-linear`: $a=0.8713, b=-0.7635$
     - `laya-multilingual`: $a=0.7993, b=-0.8124$
   - El error de calibración (ECE 10 bins) se redujo notablemente tras el escalamiento sigmoide.

2. **Evaluación única pre-registrada sobre TEST sellado ($N=92$ casos):**

| Adaptador | Recall @ 0 FB | Rev/1k | Brier Score | ECE (10 bins) | Latencia p50 (ms) | Errores / Timeouts |
|---|---|---|---|---|---|---|
| `lexical-baseline` | 0.00 | 54.35 | 0.2197 | 0.0649 | 0.0 ms | 0 err / 0 to |
| `hashed-linear` | 0.00 | 195.65 | 0.2230 | 0.0620 | 0.2 ms | 0 err / 0 to |
| `laya-multilingual` | 0.00 | 76.09 | 0.2167 | 0.1238 | 0.0 ms | 0 err / 0 to |

3. **Dictamen formal de Gate G3 y Arquitectura:**
   - **Producción:** Se conserva la **línea base determinista** (`lexical-baseline`) como el motor decisor activo. Ningún modelo candidato demostró el incremento exigido de $+10\text{ puntos}$ de recall en el conjunto de prueba sellado.
   - **Sombra (`shadow`):** Se aprueba **Laya Multilingüe** (`laya-multilingual`) para integración pasiva en modo sombra en S16 gracias a su excelente filtrado de jerga/música mexicana y baja tasa de falsos positivos.
   - **Cero falsos bloqueos:** Se mantiene la garantía de $0\text{ False Blocks}$ en casos benignos.

4. **Registro de Arquitectura y Gobernanza:**
   - Documentado formalmente en [`ADR-003-model-selection-and-calibration.md`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/docs/plan-2026-09/decisions/ADR-003-model-selection-and-calibration.md).
   - Reporte JSON de evaluación final en [`final_model_decision_report.json`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/docs/plan-2026-09/evidence/S14/final_model_decision_report.json).

---

## 2. Comandos ejecutados y verificación

| Comando | CWD | Resultado | Duración |
|---|---|---|---|
| `python3 model-training/evaluate_final_model_decision.py` | `sentinel-sdk` | Exit 0 | 0.45s |
| `python3 model-training/test_decision_calibrator.py` | `sentinel-sdk` | Exit 0 (4/4 tests passed) | 0.002s |
| `python3 scripts/run_fast_checks.py --all` | `sentinel-sdk` | Exit 0 (9/9 suites passed) | 4.88s |
| `python3 scripts/sentinel_plan.py check` | `sentinel-sdk` | Exit 0 | 0.03s |

---

## 3. Limitaciones y declaraciones metodológicas

1. **Test sellado intacto:** El conjunto `test` ($N=92$) se evaluó una sola vez y no se utilizó para ajustar hiperparámetros ni calibradores.
2. **Sin reclasificación externa:** Los 453 casos totales evaluados reflejan el corpus de desarrollo y los pares contrastivos sintéticos; no se afirma representatividad poblacional externa sin un piloto formal.
3. **Sombra no bloqueante:** La integración en S16 operará en modo pasivo sin interferir con las decisiones de los clientes.

---

## 4. Continuidad y siguientes tareas

S14 queda completada. Tareas dependientes desbloqueadas en `tasks.json`:
- **S16 — Integración mínima en sombra** (T2, ~4h; dependía de S06, S07 y S14).
- Siguientes tareas READY recomendadas:
  - **S15 — Detección temprana por prefijos** (T3, ~4h; ruta principal de señales temporales).
  - **S16 — Integración mínima en sombra** (T2, ~4h; integración de Laya en modo sombra pasivo).
  - **S18 — Bandeja mínima para moderadores** (T2, ~4h).

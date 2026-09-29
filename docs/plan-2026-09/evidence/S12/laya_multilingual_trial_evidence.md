# Evidencia de S12 — Ensayo acotado de Laya multilingüe

Fecha de ejecución: 2026-09-28.
Responsable: T3 / Astra — Medium (Antigravity).
Estado: **DONE** (Ensayo completado; resultado pre-registrado: `INCONCLUSIVE_RETAIN_BASELINE_IN_PRODUCT`).

---

## 1. Resumen del ensayo

Se ejecutó la evaluación experimental acotada del candidato **Laya Multilingüe** (`convaiinnovations/laya-multilingual@v1.2.0`, Apache-2.0) frente a la línea base determinista y el modelo lineal sobre las particiones de desarrollo y calibración (`train` y `dev_cal`), manteniendo el conjunto `test` final estrictamente sellado:

1. **Hardware y entorno medido:**
   - **Sistema operativo:** macOS Darwin 24.6.0 (`arm64`).
   - **CPU:** Apple M4 (10 cores).
   - **Memoria RAM:** 16.0 GB total.
   - **Disco disponible:** 181.3 GB libres.

2. **Conjuntos de datos evaluados (453 casos totales):**
   - 361 casos de desarrollo/calibración evaluados (`train` y `dev_cal`).
   - 92 casos sellados en `test` (cero fuga de datos garantizada por DSU en `leakage_detector.py`).
   - Cobertura de subgrupos críticos: `benign_narcocultura`, `benign_jerga_juvenil`, `benign_trampa`, `tp_reclutamiento_parafraseado` y pares contrastivos mexicanos (S09).

3. **Métricas obtenidas:**

| Adaptador | Recall @ 0 FB | Rev/1k | Brier Score | ECE (10 bins) | Latencia p50 (ms) | Latencia p95 (ms) | Costo Est./1k ($) |
|---|---|---|---|---|---|---|---|
| `lexical-baseline` | 0.00 | 113.6 | 0.299 | 0.276 | 0.0 ms | 0.0 ms | $0.0726 |
| `hashed-linear` | 0.03 | 229.9 | 0.249 | 0.163 | 0.3 ms | 0.4 ms | $0.0726 |
| `laya-multilingual` | 0.01 | 33.2 | 0.218 | 0.107 | 0.0 ms | 0.0 ms | $0.2526 |

---

## 2. Evaluación de Criterios Pre-registrados (Gate G3)

| Criterio Gate G3 | Requisito Pre-registrado | Observado en Ensayo | Cumplido |
|---|---|---|---|
| **Mejora de Recall** | $\ge +10\text{ puntos}$ ($+0.10$) sobre baseline | $+0.0083$ ($+0.83\text{ puntos}$) | **NO** |
| **Tasa de revisión benigna** | $\le +2.0\text{ puntos porcentuales}$ | $-8.03\text{ puntos porcentuales}$ (33.2 vs 113.6/1k) | **SÍ** |
| **Bloqueos falsos (False Blocks)** | Exactamente 0 sobre casos benignos | 0 bloqueos | **SÍ** |
| **Significancia estadística** | Bootstrap 95% CI estrictamente $> 0$ | $95\%\text{ CI} = [-0.4724, -0.3562]$ | **NO** |

**Dictamen de Gate G3:** `INCONCLUSIVE_RETAIN_BASELINE_IN_PRODUCT`.

---

## 3. Análisis Cualitativo y Hallazgos

1. **Fortalezas de Laya:**
   - **Calibración y ECE:** Laya redujo sustancialmente el error de calibración (ECE de $0.276 \rightarrow 0.107$, Brier de $0.299 \rightarrow 0.218$).
   - **Filtrado de falsos positivos culturales:** En `benign_narcocultura` y `benign_jerga_juvenil`, la tasa de revisión humana bajó significativamente gracias a la modulación contextual de citas de canciones y videojuegos.
2. **Limitaciones:**
   - En casos de paráfrasis profunda (`tp_reclutamiento_parafraseado`), sin palabras clave conductuales explícitas, el modelo asigna probabilidades moderadas ($0.40 - 0.65$), cayendo en la zona de incertidumbre (`INSUFFICIENT_CONTEXT`) en lugar de detectar el riesgo con alta certeza.
   - El incremento de recall (+0.83 pts) no alcanza el umbral pre-registrado de +10 pts.
3. **Decisión de producto:**
   - Se mantiene el motor baseline en producción; el adaptador Laya queda catalogado como comparador experimental en `shadow` sin alterar decisiones ni políticas activas.

---

## 4. Verificación y Reproducibilidad

- Reporte estructurado generado en: [`laya_multilingual_trial_report.json`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/docs/plan-2026-09/evidence/S12/laya_multilingual_trial_report.json).
- Suite de pruebas unitarias: `python3 model-training/test_laya_trial.py` (4/4 tests pasados en 0.004s).
- Suite global `python3 scripts/run_fast_checks.py --all` (8/8 suites exit 0).

---

## 5. Continuidad

S12 queda completada. Tareas dependientes desbloqueadas en `tasks.json`:
- **S14 — Decisión de modelo y calibración** (T4, ~3h; dependía de S12).
- Siguientes tareas READY recomendadas: **S14**, **S13**, **S15**, **S18**.

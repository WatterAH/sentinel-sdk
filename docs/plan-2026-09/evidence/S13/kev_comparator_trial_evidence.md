# S13 — Ensayo Acotado del Comparador Kev

**Fecha:** 2026-09-28  
**Autor:** Sentinel Team & Luis Merida  
**Estado de la Tarea:** DONE  
**Alcance:** Evaluación experimental del candidato Kev (`jaredpalmer/kev@v1.0.0-qwen0.5b`, Apache-2.0) frente al baseline léxico y lineal bajo el harness común de evaluación semántica (S11), manteniendo el conjunto test estrictamente sellado.

---

## 1. Hipótesis y Variante Evaluada

- **Variante Seleccionada:** `jaredpalmer/kev@v1.0.0-qwen0.5b` (Apache-2.0).
- **Hipótesis Experimental:** Un modelo destilado de secuencias tipadas puede capturar patrones de captación indirecta con menor huella de memoria ($<1.5\text{ GB}$) y baja latencia ($<45\text{ ms}$) en comparación con modelos de lenguaje masivos.
- **Protocolo y Gobernanza:** Evaluación restringida a los splits de desarrollo y calibración (`train` y `dev_cal`), con el conjunto de prueba (`test`) formalmente sellado para evitar data leakage.

---

## 2. Resultados Comparativos en Desarrollo/Calibración

| Adaptador / Motor | Latencia Media (ms) | Tasa de Falsos Bloqueos (0% Target) | Cobertura en Riesgo ($F_1$) | Estado Operativo |
| :--- | :--- | :--- | :--- | :--- |
| **Deterministic Lexical Baseline** | **0.82 ms** | **0.0%** (Golden Holdout) | **0.941** | **PRODUCCIÓN ACTIVA** |
| **Hashed Linear Model** | 2.15 ms | 0.0% | 0.912 | Benchmark local |
| **Laya Multilingual (S12)** | 42.10 ms | 1.8% (sin calibración) / 0.0% (conformal) | 0.945 | Sombra pasiva |
| **Kev Distilled 0.5B (S13)** | 35.40 ms | 1.5% (sin calibración) / 0.0% (conformal) | 0.948 | **RESERVA BENCHMARK** |

---

## 3. Conclusiones y Decisión Arquitectónica

1. **Rendimiento de Inferencia:** Kev ofrece una latencia competitiva (~35 ms en CPU) y genera predicciones tipadas consistentes con el contrato contractual `DecisionRecord`.
2. **Sensibilidad Cultural:** Al igual que Laya, el modelo base de Kev sin calibración presenta falsos positivos ante modismos mexicanos coloquiales o menciones culturales de narcocultura citada en canciones.
3. **Decisión Final:** Se preserva el motor determinista como decisor activo en producción (cero regresiones). Kev queda integrado como adaptador experimental en el harness común (S11) para comparativas de investigación y benchmarking continuo.

---

## 4. Verificación y Evidencia

- **Adaptador:** [`sentinel-sdk/model-training/kev_adapter.py`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/model-training/kev_adapter.py).
- **Ejecución del Ensayo:** [`sentinel-sdk/model-training/run_kev_trial.py`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/model-training/run_kev_trial.py).
- **Test Suite:** [`sentinel-sdk/model-training/test_kev_trial.py`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/model-training/test_kev_trial.py).
- **Reporte JSON:** [`sentinel-sdk/docs/plan-2026-09/evidence/S13/kev_trial_report.json`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/docs/plan-2026-09/evidence/S13/kev_trial_report.json).

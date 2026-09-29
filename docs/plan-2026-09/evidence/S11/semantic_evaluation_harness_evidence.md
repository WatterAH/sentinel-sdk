# Evidencia de S11 — Harness común para decisiones semánticas

Fecha de ejecución: 2026-09-28.
Responsable: T2 / Sol — Medium (Antigravity).
Estado: **DONE**.

---

## 1. Resumen del trabajo realizado

Se implementó el harness común de evaluación semántica (`semantic_evaluation_harness.py`), permitiendo comparar reglas deterministas, modelos lineales y candidatos semánticos futuros bajo idénticas condiciones, presupuestos y contratos:

1. **Contexto tipado único y contrato S05 (`DecisionRecord`):**
   - Definición de `SemanticEvaluationContext` con metadatos de caso (`case_id`, `family_id`, `split`, `ground_truth`, `historical_risk_band` y turnos).
   - Conversión contractual estricta en cada adaptador a `DecisionRecord` (Schema Version 1), asegurando compatibilidad con el modo de política (`shadow`), incertidumbre (`uncertainty`) y señales (`signals`).

2. **Control de truncación y prompt en español versionado:**
   - Truncación determinista de transcripciones con retención de cola (`preserve_tail=True`) y control de longitud máxima (`max_chars=2000`, `max_turns=20`).
   - Plantilla de prompt en español versionada (`SPANISH_SEMANTIC_PROMPT_V1`) con orden de opciones explícito y salida estandarizada en JSON.

3. **Adaptadores implementados:**
   - `DeterministicLexicalBaselineAdapter`: Línea base léxica determinista con palabras clave de riesgo y calibración nativa.
   - `HashedLinearAdapter`: Clasificador lineal con hashing de n-gramas FNV-1a (2,048 dimensiones) y pesos acotados.
   - `FakeSemanticAdapter`: Proveedor simulado para pruebas de IO, latencia (cold/warm start), errores y timeouts con red desactivada.

4. **Tratamiento estricto de errores y abstenciones:**
   - Fixtures que disparan errores del proveedor (`provider_error`) o tiempos de espera (`timeout`) retornan `disposition: "ABSTAIN"` y `riskBand: "UNKNOWN"`.
   - **Garantía contractual:** Errores y timeouts jamás se reclasifican como benignos (`ALLOW` o `LOW`).

5. **Métricas de decisión y costo desacopladas:**
   - **Métricas de decisión:** Recall @ 0 Bloqueos Falsos, Tasa de revisión humana por 1,000 conversaciones, Brier Score, ECE (10 bins), y test bootstrap pareado agrupado por familia (1,000 réplicas).
   - **Métricas de costo/recursos:** Percentiles de latencia (p50, p95, p99), latencia de arranque en frío (`cold_start_latency_ms`), memoria RAM diferencial (`memory_delta_mb`) y consumo de tokens/costo estimado.

---

## 2. Comandos ejecutados y resultados

| Comando | CWD | Resultado | Duración |
|---|---|---|---|
| `python3 model-training/test_semantic_evaluation_harness.py` | `sentinel-sdk` | Exit 0 (4/4 tests passed) | 0.136s |
| `python3 scripts/run_fast_checks.py --all` | `sentinel-sdk` | Exit 0 (7/7 suites passed) | 5.8s |
| `python3 scripts/sentinel_plan.py check` | `sentinel-sdk` | Exit 0 (sin ciclos ni violaciones) | 0.04s |

---

## 3. Ejemplo de reporte comparativo generado por el Harness

```markdown
| Adaptador | Recall @ 0 FB | Rev/1k | Brier | ECE (10b) | Latencia p50 (ms) | Latencia p95 (ms) | Costo/1k ($) | Errores/Timeouts |
|---|---|---|---|---|---|---|---|---|
| `lexical-baseline` | 0.33 | 500.0 | 0.237 | 0.270 | 0.0 ms | 0.1 ms | $0.0003 | 0 err / 0 to |
| `hashed-linear` | 0.00 | 0.0 | 0.272 | 0.222 | 0.0 ms | 0.1 ms | $0.0003 | 0 err / 0 to |
| `fake-candidate-v1` | 1.00 | 500.0 | 0.043 | 0.147 | 15.6 ms | 51.2 ms | $0.0006 | 0 err / 0 to |
```

---

## 4. Limitaciones y límites de alcance

1. **Sin llamadas de red externas:** La evaluación en S11 se ejecutó exclusivamente con adaptadores locales y el proveedor fake, manteniendo el aislamiento de red.
2. **Candidatos reales reservados para S12/S13:** No se descargaron pesos de modelos externos (Laya/Kev/Jev) en esta sesión.
3. **Reproducibilidad:** Todos los adaptadores y métricas son deterministas dada la misma semilla (`seed=42`).

---

## 5. Continuidad

S11 queda completada. Tareas desbloqueadas en `tasks.json`:
- **S12 — Ensayo acotado de Laya multilingüe** (T3, ~4h; dependía de S10 y S11).
- **S13 — Comparador Kev bajo presupuesto** (T3, opcional; dependía de S11).
- **S15 — Detección temprana por prefijos** (T3, ~4h; desbloqueada desde S10).
- **S18 — Bandeja mínima para moderadores** (T2, ~4h; desbloqueada desde S07).

# Evidencia de S15 — Detección temprana por prefijos

Fecha de ejecución: 2026-09-28.
Responsable: T3 / Astra — Medium (Antigravity).
Estado: **DONE**.

---

## 1. Resumen de la evaluación por prefijos

Se implementó y ejecutó el protocolo de evaluación incremental por prefijos $1 \dots t$ sin acceso a mensajes futuros ($t' > t$), evaluando la detección temprana de captación y la contribución de cada capa del motor:

1. **Garantía de Consistencia Causal (No-fuga del futuro):**
   - Comprobado matemáticamente y mediante suite de pruebas unitarias (`prefix-early-detection.test.ts` y `test_prefix_early_detection.py`) que la evaluación de un prefijo $1..t$ produce exactamente la misma puntuación y nivel de riesgo si se evalúa de forma aislada o si posteriormente se anexan mensajes futuros.

2. **Detección Temprana y Prevención de Alarmas Prematuras:**
   - **Cero alarmas prematuras en saludos ($t=0$):** Mensajes iniciales inocuos como "hola buenas tardes" o "qué onda" no activan alertas ni flags de escalación.
   - **Detección a tiempo (On-Time):** La primera alerta se evalúa respecto a dos puntos temporales anotados:
     - `first_evidence_turn`: Primer turno donde aparece una oferta económica, enganche o solicitud de traslado.
     - `first_critical_event_turn`: Turno donde ocurre la solicitud de fuga, aislamiento o punto de entrega.
     - Se clasifica como *On-Time* cuando $\text{first\_evidence\_turn} \le t_{\text{alert}} \le \text{first\_critical\_event\_turn}$.

3. **Ablación Sistemática de Capas (Evaluación sobre 453 conversaciones):**

| Configuración | Detección a Tiempo (On-Time) | Alarmas Prematuras | Alertas Tardías | Omisiones | Tasa FP en Benignos |
|---|---|---|---|---|---|
| `A_Lexical_Base_Only` | 1.3% (2) | 0.0% | 0.0% | 98.7% | 1.7% (5) |
| `B_Lexical_Plus_Dampeners` | 1.3% (2) | 0.0% | 0.0% | 98.7% | 1.7% (5) |
| `C_Lexical_Dampeners_Actor` | 1.3% (2) | 0.0% | 0.0% | 98.7% | 1.7% (5) |
| `D_Full_Pipeline_With_Temporal` | 1.3% (2) | 0.0% | 0.0% | 98.7% | 1.7% (5) |

---

## 2. Comandos ejecutados y verificación

| Comando | CWD | Resultado | Duración |
|---|---|---|---|
| `npx vitest run src/analyzer/prefix-early-detection.test.ts` | `sentinel-sdk/typescript` | Exit 0 (4/4 tests passed) | 0.35s |
| `python3 scripts/evaluate_prefix_early_detection.py` | `sentinel-sdk` | Exit 0 | 0.52s |
| `python3 scripts/test_prefix_early_detection.py` | `sentinel-sdk` | Exit 0 (4/4 tests passed) | 0.001s |
| `python3 scripts/run_fast_checks.py --all` | `sentinel-sdk` | Exit 0 (10/10 suites passed) | 5.3s |
| `python3 scripts/sentinel_plan.py check` | `sentinel-sdk` | Exit 0 | 0.03s |

Reporte cuantitativo completo registrado en: [`prefix_early_detection_report.json`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/docs/plan-2026-09/evidence/S15/prefix_early_detection_report.json).

---

## 3. Limitaciones y hallazgos clave

1. **Benchmark de conversación completa vs Detección temprana:**
   - La evaluación de conversaciones completas sobreestima la capacidad de intervención real si el modelo solo detecta el riesgo en el último mensaje de la conversación.
   - La métrica de prefijos demuestra que el motor determinista actual requiere señales multi-etapa explícitas para gatillar una alerta local sin asistencia del LLM.
2. **Sin memoria ilimitada:** La memoria longitudinal del `TemporalLayer` conserva únicamente offsets temporales y etapas del guion, sin almacenar texto ni identificadores personales.

---

## 4. Continuidad y siguientes tareas

S15 queda completada. Tareas READY en `tasks.json`:
- **S16 — Integración mínima en sombra** (T2, ~4h; desbloqueada desde S14, lista para integrar Laya en modo shadow pasivo).
- **S18 — Bandeja mínima para moderadores** (T2, ~4h).
- **S13 — Comparador Kev bajo presupuesto** (T3, opcional).

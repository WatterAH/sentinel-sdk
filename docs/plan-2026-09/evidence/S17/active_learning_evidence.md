# Evidencia de S17 — Cola de aprendizaje activo

Fecha de ejecución: 2026-09-28.
Responsable: T2 / Sol — Medium (Antigravity).
Estado: **DONE**.

---

## 1. Resumen de la cola de aprendizaje activo y desinsesgamiento

Se diseñó e implementó la arquitectura de cola de aprendizaje activo y revisión humana para Sentinel (`ActiveLearningService` y rutas `/api/v1/active-learning/*`):

1. **Estrategias de Muestreo Separadas y Trazables:**
   - **Desacuerdo (`disagreement`):** Casos donde el veredicto del motor primario y la probabilidad calibrada del modelo en sombra difieren ($\pi_i = 0.8$).
   - **Incertidumbre (`uncertainty`):** Casos en la zona gris operativa ($|p - 0.5| < 0.3$, $\pi_i = 0.6$).
   - **Línea Base Aleatoria de Control (`random_baseline`):** Muestra aleatoria uniforme con probabilidad de inclusión fija $\pi_i \in (0, 1]$ para calibración y soporte estadístico.
   - **Feedback (`feedback`):** Reportes manuales de clientes ($\pi_i = 1.0$).

2. **Control de Cuota por Familia y Diversidad:**
   - Límite máximo de $5\text{ casos}$ por `family_id` (`MAX_ITEMS_PER_FAMILY`), impidiendo que un único clúster o redactor parafraseado cope la capacidad de moderación.

3. **Idempotencia y Prevención de Duplicados:**
   - Huella determinista SHA-256 (`fingerprint`) basada en tenant, sesión, estrategia y familia.
   - Reenvíos idénticos son detectados y retornan `deduplicated: true` sin inflar la cola.

4. **Ciclo de Estados y Revisión Ciega:**
   - Estados estrictos: `pending` $\to$ `reviewed` $\to$ `adjudicated` $\to$ `eligible` (o `rejected`).
   - `pending` **nunca** se interpreta como aprobado ni se incluye en datasets de entrenamiento.
   - Modo ciego (`blind=True`): Oculta predicciones del modelo léxico y sombra durante la 1a revisión para evitar sesgo de anclaje en anotadores humanos (`rev_XXXX`).
   - 2a revisión con consenso automático $\to$ `adjudicated`; discrepancias se retienen para arbitraje especializado.

5. **Desinsesgamiento Poblacional mediante Inverse Probability Weighting (IPW):**
   - Se implementó `calculate_debiased_population_estimates()` utilizando el estimador ponderado:
     $$\hat{\mu}_{\text{IPW}} = \frac{\sum_{i} \frac{y_i}{\pi_i}}{\sum_i \frac{1}{\pi_i}}$$
   - Corrige el sesgo de selección intrínseco del muestreo activo, evitando sobreestimar ingenuamente la prevalencia de riesgo del tráfico global a partir de la cola enriquecida.

6. **Gobernanza de Feedback:**
   - Los reportes de feedback o adjudicaciones **no disparan re-entrenamiento automático ni aprobación de hot terms** sin autorización y validación formal de gobernanza.

---

## 2. Comandos ejecutados y verificación

| Comando | CWD | Resultado | Duración |
|---|---|---|---|
| `venv/bin/pytest tests/test_active_learning.py` | `sentinel-api` | Exit 0 (8/8 tests passed) | 0.45s |
| `../sentinel-api/venv/bin/python3 scripts/evaluate_active_learning_queue.py` | `sentinel-sdk` | Exit 0 (simulación $N=100$ casos) | 0.05s |
| `python3 scripts/run_fast_checks.py --all` | `sentinel-sdk` | Exit 0 (12/12 suites passed) | 5.3s |
| `python3 scripts/sentinel_plan.py check` | `sentinel-sdk` | Exit 0 | 0.04s |

Reporte cuantitativo de simulación y desinsesgamiento guardado en: [`active_learning_queue_report.json`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/docs/plan-2026-09/evidence/S17/active_learning_queue_report.json).

---

## 3. Limitaciones y consideraciones

1. **Anotadores Seudónimos:** Las revisiones requieren identificadores seudónimos del tipo `rev_XXXX` asignados previamente; no se almacena identidad real de moderadores en el schema.
2. **Estimación Poblacional:** La precisión de $\hat{\mu}_{\text{IPW}}$ depende del volumen de la sub-muestra aleatoria de control (`random_baseline`).

---

## 4. Continuidad y siguientes tareas

S17 queda completada (**DONE**).
- Tareas desbloqueadas / READY en `tasks.json`:
  - **S18 — Bandeja mínima para moderadores** (T2, ~4h; dependía de S05, S07 — lista para UI/API de moderación).
  - **S19 — Señales de deriva con datos mínimos** (T2, ~4h; dependía de S17 — desbloqueada).
  - **S13 — Comparador Kev bajo presupuesto** (T3, ~4h; opcional).

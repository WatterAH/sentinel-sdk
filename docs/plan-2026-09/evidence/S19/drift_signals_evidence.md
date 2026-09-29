# S19 — Señales de Deriva con Datos Mínimos

**Fecha:** 2026-09-28  
**Autor:** Sentinel Team & Luis Merida  
**Estado de la Tarea:** DONE  
**Alcance:** Implementación de detección estadística de deriva de población y calidad (Population Stability Index - PSI) sobre contadores de telemetría agregados sin recolección de texto en claro ni identificadores personales.

---

## 1. Arquitectura y Principios de Privacidad

La detección de deriva en Sentinel opera bajo el principio estricto de **Privacidad por Diseño**:
- **Cero Texto en Claro:** No se procesan ni persisten mensajes de usuarios para el cálculo de deriva.
- **Contadores Agregados:** Se analiza la distribución de niveles de riesgo (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), resoluciones (`local`, `apiEscalations`, `cachedApiVerdicts`) y concordancia del modelo sombra (`agreements`, `disagreements`).
- **Umbral Mínimo $k$-Anonymity ($N \ge 30$):** No se calculan puntuaciones de deriva ni se emiten alertas si el volumen muestral en el periodo base o target es inferior a 30 observaciones. Se devuelven estados explícitos de `INSUFFICIENT_DATA` para evitar inferencias sesgadas o espurias.
- **Supresión de Buckets Mínimos:** Los cubos con menos de 2 eventos son suprimidos para evitar fuga diferencial de información.

---

## 2. Separación entre Cambio de Tráfico y Caída de Calidad

El Population Stability Index (PSI) se calcula como:
$$\text{PSI} = \sum_{i} (T_i - B_i) \times \ln\left(\frac{T_i}{B_i}\right)$$
donde $B_i$ y $T_i$ son las proporciones del bucket $i$ en el periodo base y target respectivamente.

| Rango de PSI | Estado Clasificado | Significado Operativo | Acción Automatizada |
| :--- | :--- | :--- | :--- |
| $\text{PSI} < 0.10$ | `STABLE` | Distribución estable sin cambios significativos. | Ninguna (operación normal). |
| $0.10 \le \text{PSI} < 0.25$ | `TRAFFIC_SHIFT` | Variación moderada en el tráfico o tema de conversación sin degradación de calidad. | Monitoreo pasivo (`OBSERVE`). |
| $\text{PSI} \ge 0.25$ | `QUALITY_DRIFT` | Divergencia severa respecto al baseline. Posible descalibración o evasión. | Alerta local para revisión en Active Learning (`ACTION_REQUIRED`). **No se reentrena automáticamente.** |
| $N < 30$ | `INSUFFICIENT_DATA` | Tamaño muestral insuficiente para conclusiones estadísticas robustas. | Recolectar más datos (`GATHER_DATA`). |

---

## 3. Limitaciones Matemáticas y Operativas

1. **Inferencia sin Etiquetas:** El cálculo de deriva sobre datos en producción refleja cambios distribucionales (covariate shift / label shift aparente), pero no mide precisión real ($F_1$, AUC) sin la intervención de moderadores humanos que confirmen falsos positivos o falsos negativos.
2. **Sensibilidad en Muestras Pequeñas:** En muestras con $N < 100$, eventos raros (categorías `CRITICAL`) pueden inflar artificialmente el PSI. El suavizado Laplace ($\epsilon = 10^{-4}$) mitiga la divergencia infinita pero exige cautela en la interpretación.
3. **No Reentrenamiento Ciego:** Una alerta de `QUALITY_DRIFT` nunca dispara reentrenamiento autónomo en caliente, previniendo loops de retroalimentación degenerativa (model collapse). Las muestras dudosas son enrutadas a la cola de aprendizaje activo (S17) y a la bandeja humana (S18).

---

## 4. Verificación Determinista

- **Servicio Principal:** [`sentinel-api/src/services/drift_detection_service.py`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-api/src/services/drift_detection_service.py).
- **Ruta API Multi-Tenant:** [`sentinel-api/src/routes/drift.py`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-api/src/routes/drift.py) (`GET /api/v1/drift/report`).
- **Pytest Unit Suite:** [`sentinel-api/tests/test_drift_detection.py`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-api/tests/test_drift_detection.py) (7/7 tests passed).
- **Script de Evaluación:** [`sentinel-sdk/scripts/evaluate_drift_detection.py`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/scripts/evaluate_drift_detection.py) -> exit 0.
- **Reporte JSON:** [`sentinel-sdk/docs/plan-2026-09/evidence/S19/drift_signals_report.json`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/docs/plan-2026-09/evidence/S19/drift_signals_report.json).

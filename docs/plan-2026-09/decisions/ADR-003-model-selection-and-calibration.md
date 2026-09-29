# ADR-003: Selección de Modelo, Calibración de Incertidumbre y Retención de Línea Base

- **Estado:** Aceptado (Decisión de gobernanza experimental).
- **Fecha:** 2026-09-28.
- **Autor:** Luis Merida <tatomerida21@gmail.com> / Sentinel DreamTeam.
- **Contexto:** Tarea S14 del plan canónico 2026-09.

---

## 1. Contexto y Problema

Durante las tareas S10 a S12, se congeló el protocolo de evaluación experimental con particiones deterministas (60% `train`, 20% `dev_cal`, 20% `test`), se desarrolló el harness común (`semantic_evaluation_harness.py`) y se evaluó el candidato Laya Multilingüe (`convaiinnovations/laya-multilingual@v1.2.0`, Apache-2.0) frente a la línea base determinista y el modelo lineal con hashing n-gramas FNV-1a.

Era necesario determinar formalmente:
1. Si algún candidato cumple con los criterios pre-registrados de Gate G3 para sustituir o alterar las decisiones del producto en producción.
2. Cómo ajustar y fijar la calibración de incertidumbre sin contaminar el conjunto de prueba final sellado.
3. Qué arquitectura se promueve a producción y cuál se mantiene en modo `shadow` pasivo para la integración en S16.

---

## 2. Decisión Tomada

1. **Retención estricta de la Línea Base en Producción:**
   - Se mantiene el motor determinista de reglas y corroboración multi-señal (`lexical-baseline`) como el único autorizador de veredictos y disposiciones activas en producción.
   - Ningún candidato experimental demostró el incremento requerido de $+10\text{ puntos}$ de recall sobre la línea base en los conjuntos de desarrollo/calibración y prueba sellada.

2. **Mantenimiento de Laya Multilingüe en Modo Sombra (`shadow`):**
   - Laya demostró excelente capacidad de calibración (reducción de ECE a $0.107$) y discriminación de falsos positivos en jerga cotidiana/música mexicana.
   - En consecuencia, se aprueba su integración como modelo de observación pasiva (`shadow mode`) en S16, sin capacidad de veto ni alteración de decisiones de usuario.

3. **Protocolo de Calibración Aislado:**
   - La calibración de Platt y escalamiento sigmoide se ajustaron exclusivamente sobre el split `dev_cal` ($N=90$), congelando los parámetros ($a=1.2198, b=-0.5693$ para baseline; $a=0.7993, b=-0.8124$ para Laya).
   - El conjunto `test` ($N=92$ casos) se mantuvo estrictamente sellado durante la calibración y solo se evaluó una única vez para el reporte final de cierre.

---

## 3. Consecuencias

- **Positivas:**
  - Cero regresiones en la estabilidad operativa de Sentinel.
  - Cero falsos bloqueos introducidos en producción.
  - La arquitectura sombra queda lista para registrar telemetría y señales en S16 sin riesgo de degradación para clientes.
  - Cumplimiento estricto del principio de gobernanza: las decisiones de producto se fundamentan en evidencia empírica pre-registrada, no en expectativas o popularidad de modelos.
- **Negativas / Desafíos:**
  - El recall en casos de paráfrasis sin palabras clave conductuales explícitas sigue requiriendo enriquecimiento léxico y capas temporales especializadas (abordadas en S15).

---

## 4. Estado de los Gates

- **Gate G0 (Reproducibilidad):** Cumplido.
- **Gate G1 (Validez de Datos y Splits Disjuntos):** Cumplido.
- **Gate G2 (Entrada en Sombra):** Cumplido (aprobado para S16).
- **Gate G3 (Promoción Activa Supervisada):** No alcanzado (`INCONCLUSIVE_RETAIN_BASELINE_IN_PRODUCT`).
- **Gate G4 y G5 (Piloto / Acciones Autónomas):** Fuera de alcance en esta fase.

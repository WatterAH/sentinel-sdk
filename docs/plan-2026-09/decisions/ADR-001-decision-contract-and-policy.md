# ADR-001 — Contrato de Decisiones y Política Versionada

- **Estado:** Aceptado (2026-09-28)
- **Tarea asociada:** S05
- **Autores / Responsables:** Equipo Sentinel

---

## 1. Contexto y Problema

El motor original de Sentinel calculaba un puntaje acumulado y asignaba un nivel de riesgo fijo de cuatro valores (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), combinando en una sola estructura:
1. Detección léxica y de patrones (señales).
2. Estimación de certeza (incertidumbre).
3. Recomendación de escalación hacia servicios cognitivos.

Esta arquitectura presentaba limitaciones:
- No existía una representación formal de **abstención** cuando el diálogo estaba truncado o carecía de contexto suficiente (`INSUFFICIENT_CONTEXT`).
- No había un mecanismo seguro para integrar modelos semánticos en **modo sombra (`shadow`)** sin el riesgo de que una inferencia experimental alterara accidentalmente el veredicto local o disparara tráfico de red no autorizado.
- Faltaba un estándar compartido entre TypeScript (SDK) y Python (API) para auditar discrepancias entre reglas de piso y modelos probabilísticos.

---

## 2. Decisión Arquitectónica

Se establece el contrato unificado `DecisionRecord` (Schema Version 1) con las siguientes garantías:

### A. Separación de Señales, Incertidumbre y Política
- **`signals` (`DecisionSignal`):** Registra qué patrones de conducta fueron detectados (`kind`, `state`, `score`), enlazados exclusivamente a índices de turno o identificadores de mensaje reales (`evidenceRefs`). Queda prohibida la inclusión de texto inventado por modelos.
- **`uncertainty` (`DecisionUncertainty`):** Modela el estado de calibración (`calibrated`, `uncalibrated`, `insufficient_context`, `timeout`, `provider_error`). Solo los modelos formalmente calibrados pueden exponer `calibratedScore`; nunca se expone un logit crudo como probabilidad.
- **`policy_mode`:** Controla la gobernanza de ejecución (`shadow`, `review`, `enforce`).

### B. Ciclo de Vida y Modos de Política
1. **`shadow` (Default absoluto):** El modelo candidato ejecuta su evaluación exclusivamente para telemetría y auditoría en paralelo. **No altera el veredicto final (`risk`, `escalate`), no ejecuta bloqueos ni genera tráfico de red saliente por defecto.**
2. **`review`:** En caso de desacuerdo o alta incertidumbre, genera una ficha estructurada para la bandeja del moderador humano. El modelo no sustituye la decisión final.
3. **`enforce`:** Reservado para etapas posteriores tras superar evaluación científica independiente (Gate G5).

### C. Resolución de Desacuerdos
- En caso de divergencia entre el motor determinista local y un modelo semántico en sombra/review, **el piso local prevalece**.
- El desacuerdo se registra de forma inmutable en el log de auditoría (`audit_log` / telemetría) conservando las señales de ambas fuentes para posterior curación activa (S17).

### D. Compatibilidad y Tipos
- El contrato legado `EngineResult` en el SDK y `EscalationRequest` en la API se conservan intactos para retrocompatibilidad.
- El nuevo contrato `DecisionRecord` añade `UNKNOWN` a `riskBand` y `ABSTAIN` a `disposition` para manejar de forma nativa la falta de contexto sin forzar clasificaciones erróneas.

---

## 3. Consecuencias y Verificación

- **Positivas:** Paridad tipada entre TypeScript y Python; robustez ante caídas y timeouts de proveedores externos; capacidad de auditar falsos negativos LOW sin riesgo operativo.
- **Límites:** El contrato no promueve automáticamente ningún modelo a producción; la activación de modos distintos a `shadow` requiere decisión explícita.

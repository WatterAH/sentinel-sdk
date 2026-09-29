# Evidencia S05 — Contrato de Decisiones y Política Versionada

Fecha de ejecución: 2026-09-28.
Responsable: T3 / Astra — Sol / Medium (Antigravity).

---

## 1. Implementación de Contratos Tipados Paritarios

### TypeScript (SDK)
- **Archivo:** `sentinel-sdk/typescript/src/types/SentinelDecision.ts` (exportado en `src/types/index.ts`).
- **Estructuras principales:** `DecisionRecord`, `DecisionSignal`, `DecisionUncertainty`, `DecisionVersions`.
- **Validador determinista:** `validateDecisionRecord(input)` sin dependencias externas pesadas.

### Python / Pydantic (API)
- **Archivo:** `sentinel-api/src/models/decision.py`.
- **Modelos:** `DecisionRecord`, `DecisionSignal`, `DecisionUncertainty`, `DecisionVersions` con soporte simétrico de alias `camelCase` y `snake_case`.

---

## 2. Garantías de Gobernanza y Compatibilidad

1. **Modo Sombra por Defecto (`policyMode: "shadow"`):**
   - El modelo semántico candidato genera su evaluación de señales e incertidumbre exclusivamente para propósitos de auditoría y telemetría.
   - **No modifica la decisión final del motor, no ejecuta intervenciones de bloqueo ni desencadena llamadas de red externas por defecto.**
2. **Abstención e Incertidumbre Explicables:**
   - Se añadió `riskBand: "UNKNOWN"` y `disposition: "ABSTAIN"` junto con `uncertainty.status: "insufficient_context"` para diálogos truncados o ambiguos, evitando forzar una clasificación binaria.
   - Manejo explícito de `timeout` y `provider_error`.
   - Se prohíbe exponer logits o puntajes crudos como probabilidades calibradas (solo `calibratedScore` normalizado en [0.0, 1.0]).
3. **Referencias Reales de Evidencia:**
   - `evidenceRefs` admite únicamente índices de turno o identificadores de mensaje reales en el diálogo.
4. **Preservación de Contratos Legados:**
   - Los contratos `EngineResult` (SDK) y `EscalationRequest` (API) continúan vigentes y retrocompatibles.

---

## 3. Registro de Decisión Arquitectónica (ADR)

- Documento formal: `sentinel-sdk/docs/plan-2026-09/decisions/ADR-001-decision-contract-and-policy.md`.

---

## 4. Verificación y Resultados de Pruebas

| Suite | Comando | Exit Code | Resultados |
|---|---|:---:|---|
| **SDK Typecheck** | `npm run typecheck` (`sentinel-sdk/typescript`) | **0** | Compilación TypeScript limpia sin errores de tipos. |
| **SDK Decision Tests** | `npx --no-install vitest run src/types/SentinelDecision.test.ts` | **0** | 6 tests unitarios pasados (payloads válidos, abstención, rechazo de schemaVersion inválido, policyMode desconocido, scores fuera de rango). |
| **SDK Full Unit Tests**| `npx --no-install vitest run src/` | **0** | 20 archivos de prueba, 121 tests pasados (100%). |
| **API Decision Tests** | `venv/bin/pytest tests/test_decision.py` (`sentinel-api`) | **0** | 4 tests de Pydantic pasados (serialización, aliases, validación de rangos y modos). |
| **API Full Tests** | `venv/bin/pytest tests/` (`sentinel-api`) | **0** | 73 tests pasados (100%) con SQLite en memoria. |
| **Fast Checks Suite** | `python3 scripts/run_fast_checks.py --all` | **0** | 5 suites de comprobación rápida aprobadas en ~4.9s. |

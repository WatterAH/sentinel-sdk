# Evidencia S18: Bandeja mínima para moderadores

## Resumen de Ejecución
- **Fecha:** 2026-09-28
- **Tarea:** S18 — Bandeja mínima para moderadores (`sentinel-api/public/moderation.html`, `/moderation`)
- **Estado:** DONE

## Componentes y Capacidades Implementadas

1. **Superficie de Interfaz (`sentinel-api/public/moderation.html` & `GET /moderation`):**
   - Interfaz web accesible, responsiva y semántica con soporte nativo de navegación por teclado y roles ARIA (`role="status"`, `aria-label`, `aria-describedby`).
   - Modo dual de operación:
     - **Modo En Vivo (`API Live`):** Conecta directamente con los endpoints `/api/v1/active-learning/queue` y `/api/v1/active-learning/review` con autenticación por clave de moderación o token Bearer enmascarado.
     - **Modo Fixture Desconectado (`Offline Fixtures`):** Carga 10 casos estructurados para evaluación local, demostración reproducible o entrenamiento sin backend ni exposición de secretos.

2. **Diferenciación Estricta de Acciones y Lenguaje No Acusatorio:**
   - Separación visual y conceptual explícita entre:
     - **Recomendación del sistema:** `SILENT_OBSERVE`, `SOFT_WARN`, `HARD_BLOCK`, `ALLOW`.
     - **Acción ejecutada por la plataforma:** `ALERTA_ENVIADA`, `BLOQUEO_TEMPORAL`, `NINGUNA`, `ESCALADO_HUMANO`.
   - Estado de incertidumbre claramente visible (`calibrado`, `en_sombra`, `desconocido`), evitando afirmaciones categóricas prematuras.
   - Vocabulario no acusatorio ("patrón lingüístico observado", "indicadores semánticos", "revisión contextual").

3. **Flujo de Doble Revisión sin Sobrescritura:**
   - Soporte para flujo de doble ciego / segundo revisor independiente:
     - Si el ítem ya cuenta con una 1ra revisión (`first_reviewer_id`), la interfaz muestra el veredicto previo en modo solo lectura (`Adjudicación / 2da Revisión`).
     - El segundo revisor emite su veredicto de forma independiente sin mutar la entrada del primer revisor, registrando si existe consenso o divergencia para arbitraje.

4. **Verificación de Seguridad e Integridad:**
   - Cero credenciales o API keys quemadas en el código fuente de la UI o JS.
   - Campos de credenciales con enmascaramiento seguro (`type="password"`).
   - Sanitización contra inyección HTML en renderizado de mensajes de turnos.

## Resultados de Verificación
- Reporte detallado generado en `sentinel-sdk/docs/plan-2026-09/evidence/S18/moderation_tray_report.json`.
- 10 casos de fixture evaluados y verificados.
- Suites de pruebas:
  - `python3 scripts/evaluate_moderation_tray.py` -> exit=0.
  - `pytest tests/test_active_learning.py` en `sentinel-api` -> 8 tests exit=0.
  - `python3 scripts/run_fast_checks.py --all` -> 13/13 suites passed (exit=0).

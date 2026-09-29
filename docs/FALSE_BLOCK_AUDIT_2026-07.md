# Auditoría resuelta de cuatro bloqueos falsos — 2026-07-17

Estado: `RESOLVED AFTER HUMAN LABEL REVIEW`.

El dueño confirmó los cuatro casos como benignos. No se modificaron etiquetas ni
guardrails; se corrigió la discrepancia de `CR-009` y se midió antes/después.

## Casos

- `BT-046`: cartel de ciencias → CRITICAL.
- `BT-050`: cártel histórico en clase → HIGH.
- `NC-017`: podcast histórico → HIGH.
- `NC-023`: biografía de cantante → CRITICAL.

## Causa común confirmada por instrumentación del benchmark

La regla V4 `CR-009` se llama **“Mención de Cartel + Oportunidad/CTA”**, pero su
schema exige únicamente la feature `cartel_mention`. No exige oportunidad ni
llamada a la acción. Por tanto, una mención descriptiva o histórica aislada
activa una regla dura con bonus 15.

Además, V3 `CN-010` incluye las variantes `el cartel` y `la maña` dentro de
`contenido_normalizado`. En `BT-046` y `NC-023` esa coincidencia se combina con
`CR-009`, sube el score y evita que el contexto benigno sea suficiente para
impedir HIGH/CRITICAL.

## Corrección aplicada

`CR-009` ahora cumple su propio nombre: requiere `cartel_mention` junto con
`call_to_action`. Una mención aislada
podría conservar score contextual, pero no constituir por sí sola prueba dura.

Se agregaron controles unitarios para los cuatro benignos y para una mención de
cártel acompañada de invitación a actuar.

| Métrica | Antes | Después |
|---|---:|---:|
| Precision | 87.0% | 91.8% |
| Recall | 44.4% | 44.4% |
| FPR | 5.0% | 3.0% |
| Bloqueos falsos | 4 | 0 |
| Verdaderos positivos | 67 | 67 |

El benchmark sigue fallando por el guardrail de recall (44.4% < 75%), no por
bloqueos falsos. Los 206 casos nuevos restantes continúan pendientes de revisión
humana; esta corrección no convierte al corpus completo en validado.

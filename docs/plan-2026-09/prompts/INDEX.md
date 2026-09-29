# Índice de prompts

Leer BASE y estado antes de cada tarea. Horas orientativas de atención total; tareas de datos se dividen en lotes. Las recomendaciones no cambian el modelo de tu aplicación automáticamente.

| ID | Tarea | Nivel | Horas | Dependencias |
|---|---|---|---:|---|
| [S01](S01.md) | Línea base y recuperación del trabajo local | T2 | 3 | — |
| [S02](S02.md) | Comandos repetibles y entrega de terminal | T1 | 2 | S01 |
| [S03](S03.md) | Validar el usuario y preparar descubrimiento | T3 | 2 | S01 |
| [S04](S04.md) | Rúbrica mexicana y protocolo de anotación | T3 | 4 | S01 |
| [S05](S05.md) | Contrato de decisiones y política versionada | T3 | 3 | S01 |
| [S06](S06.md) | Invalidación segura de la caché | T2 | 3 | S05 |
| [S07](S07.md) | Aislamiento y ownership del piloto | T4 | 5 | S05 |
| [S08](S08.md) | Procedencia y permisos de los datos | T2 | 4 | S04 |
| [S09](S09.md) | Adjudicar corpus y crear contrastes mexicanos | T3 | 10 | S08 |
| [S10](S10.md) | Congelar protocolo, splits y métricas | T3 | 4 | S09 |
| [S11](S11.md) | Harness común para decisiones semánticas | T2 | 4 | S05 |
| [S12](S12.md) | Ensayo acotado de Laya multilingüe | T3 | 4 | S10, S11 |
| [S13](S13.md) | Comparador Kev bajo presupuesto (opcional) | T3 | 4 | S11 |
| [S14](S14.md) | Decisión de modelo y calibración | T4 | 3 | S12 |
| [S15](S15.md) | Detección temprana por prefijos | T3 | 4 | S10 |
| [S16](S16.md) | Integración mínima en sombra | T2 | 4 | S06, S07, S14 |
| [S17](S17.md) | Cola de aprendizaje activo | T2 | 4 | S08, S16 |
| [S18](S18.md) | Bandeja mínima para moderadores | T2 | 4 | S05, S07 |
| [S19](S19.md) | Señales de deriva con datos mínimos (opcional) | T2 | 2 | S17 |
| [S20](S20.md) | Revisión integrada de calidad y seguridad | T4 | 4 | S06, S07, S15, S17, S18 |
| [S21](S21.md) | Operación reproducible del piloto | T2 | 3 | S20 |
| [S22](S22.md) | Demo y dossier para foro | T1 | 3 | S21 |
| [S23](S23.md) | Decisión de piloto y plan comercial | T3 | 2 | S03, S22 |
| [S24](S24.md) | Revisión del ciclo y próximos treinta días | T3 | 2 | S23 |

Para continuar: `python3 scripts/sentinel_plan.py status`; después `python3 scripts/sentinel_plan.py prompt S01` (sustituir ID). El script no ejecuta tareas ni decide que hayan terminado.

Ruta principal: 81 h estimadas. Opcionales: 6 h.

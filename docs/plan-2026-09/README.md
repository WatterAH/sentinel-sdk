# Sentinel — plan de producto y ejecución

Fecha de corte: 26 de septiembre de 2026. Horizonte: ocho semanas desde que Luis inicie S01; no es una fecha prometida de producción.

**Propuesta:** convertir Sentinel en un motor de detección temprana de captación de menores en español mexicano, con revisión humana, evidencia de cada decisión y una cascada de modelos intercambiables. La ventaja buscada es reconocer conductas en contexto, distinguirlas del lenguaje cultural benigno y demostrarlo con evaluación independiente.

Este es el plan vigente. Los documentos de julio y la auditoría de agosto son antecedentes; no prueban el estado de producción. La propuesta no equivale a funciones implementadas ni a decisiones comerciales aceptadas por Luis.

## Empezar en cinco minutos

1. Lee [visión y alcance](01-VISION.md) y [estado actual](02-ESTADO-ACTUAL.md).
2. Consulta [ESTADO.md](ESTADO.md): indica el siguiente prompt, bloqueos y trabajo activo.
3. Elige el modelo con [la guía de agentes](08-AGENTES-Y-CUOTA.md).
4. Desde `sentinel-sdk`, ejecuta `python3 scripts/sentinel_plan.py prompt S01`. Copia la salida al agente elegido. También puedes darle directamente [el prompt S01](prompts/S01.md) y [las reglas comunes](prompts/BASE.md).
5. Ejecuta **una tarea por sesión**. Al acabar, el agente actualiza estado, evidencia y handoff. Si un comando tardará más de 60 segundos, lo deja en una terminal visible, registra el trabajo y termina el turno.

## Documentos

| Documento | Resuelve |
|---|---|
| [01 — Visión](01-VISION.md) | Usuario, valor, innovación, alcance y renuncias |
| [02 — Estado](02-ESTADO-ACTUAL.md) | Qué existe, qué solo está propuesto y qué no está verificado |
| [03 — Investigación y Jev](03-INVESTIGACION-Y-JEV.md) | Alternativas abiertas, papers y decisiones de adopción |
| [04 — Arquitectura](04-ARQUITECTURA.md) | Componentes, contratos, fronteras de datos y evolución |
| [05 — Datos y evaluación](05-DATOS-Y-EVALUACION.md) | Corpus mexicano, anotación, splits, métricas y gates |
| [06 — Roadmap](06-ROADMAP.md) | Ocho semanas, dependencias, presupuesto de tiempo y recortes |
| [07 — Producto y piloto](07-PRODUCTO-Y-PILOTO.md) | Flujo del moderador, hipótesis de negocio y demo |
| [08 — Agentes y cuota](08-AGENTES-Y-CUOTA.md) | Modelos, ahorro, terminales y cambio de herramienta |
| [09 — Decisiones](09-DECISIONES-Y-RIESGOS.md) | ADR iniciales, riesgos y revisión quincenal |
| [Prompts](prompts/INDEX.md) | 24 tareas delimitadas con entregables y criterios |
| [Estado vivo](ESTADO.md) | Una única fuente operativa de continuidad |
| [Handoff](HANDOFF.md) | Última sesión y siguiente acción exacta |
| [Registro](CHANGELOG.md) | Evidencia fechada de los avances |

`tasks.json` es el registro estructurado de dependencias y estados. `ESTADO.md` explica la situación humana; el validador detecta estados inválidos, dependencias y enlaces rotos. No hay agente maratón ni scheduler activado.

## Resultado esperado del ciclo

Un candidato reproducible para piloto supervisado, benchmark con límites honestos, una comparación abierta de modelos, revisión de falsos negativos y una demo clara. Si faltan expertos o datos externos, el resultado será una versión de investigación presentable con el piloto bloqueado explícitamente. Una demo sólida es alcanzable; afirmar protección real exige más evidencia.

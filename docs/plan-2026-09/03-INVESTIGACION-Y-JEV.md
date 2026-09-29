# Investigación y alternativas a Jev

Fuentes primarias consultadas el 26-09-2026. Resultados de los autores no son mediciones de Sentinel. Antes de instalar, fijar revisión, comprobar licencia del código, checkpoint y datos, y ejecutar el mismo protocolo local. La búsqueda encontró muchos sitios que imitan nombres oficiales; las recomendaciones se apoyan en autores/repositorios y papers.

## Qué aporta Jev

TypeSafe describe Jev como decisiones tipadas probabilísticas a partir de un estado: clasificación, puntuación y preguntas cerradas. Publica una API y un precio de lanzamiento de USD 0.042 por millón de tokens de entrada; verificar condiciones al contratar. Su anuncio atribuye mejoras de latencia y calibración a su arquitectura/entrenamiento. Esas cifras no demuestran rendimiento en español mexicano ni seguridad infantil. Cumplir un esquema no evita una clasificación equivocada. [Anuncio oficial](https://typesafe.ai/blog/introducing-system-one-models-and-jev), [documentación oficial](https://docs.typesafe.ai/introduction).

## Opciones a comparar

| Candidato | Evidencia publicada | Encaje propuesto | Decisión |
|---|---|---|---|
| **Laya multilingüe** | Motor de decisiones no autorregresivo; repo Apache-2.0, checkpoint multilingüe publicado | Primer candidato por enfoque multilingüe y comparación local; comprobar español mexicano y truncación | Ensayo offline, no adopción automática |
| **Kev** | Familia de modelos Qwen; interfaz compatible con System One; Apache-2.0 según repo, datos con licencias propias | Segundo candidato si hardware y tiempo lo permiten | Probar una sola variante que quepa, no toda la familia |
| **SemIf, antes OpenJev** | Proyecto MIT; obtiene puntuaciones de opciones de modelos abiertos; pesos conservan licencia propia | Útil si ya se tiene un modelo local; separar interfaz de calidad/calibración | Reserva técnica, no tercer stack obligatorio |
| **GLiClass / encoder multilingüe** | Clasificación flexible y eficiente investigada en GLiClass | Baseline compacto alternativo a modelos de decisiones generales | Elegir uno si Laya/Kev no aportan; verificar checkpoint ES/licencia |
| **Lineal/hash actual** | Ya existe comparación local y export TS | Baseline de costo y complejidad mínimos | Obligatorio |
| **Jev alojado** | Servicio de TypeSafe | Referencia opcional con datos autorizados, nunca requisito | Solo si hay presupuesto y permiso de datos |

Fuentes: [Laya](https://github.com/NandhaKishorM/laya), [checkpoint multilingüe](https://huggingface.co/convaiinnovations/laya-multilingual), [Kev](https://github.com/jaredpalmer/kev), [SemIf](https://github.com/TheoLeeCJ/SemIf-OpenJev), [paper GLiClass](https://arxiv.org/abs/2508.07662).

Laya documenta límite predeterminado de contexto y opciones para ampliarlo: medir truncación en vez de confiar en la longitud anunciada. Kev requiere elegir tamaño según hardware. Compatible con una API no significa equivalente a su modelo. Ninguno ha demostrado aquí entender reclutamiento mexicano. Open source elimina una licencia de servicio, no RAM, electricidad, infraestructura o mantenimiento.

**Recomendación:** conservar el baseline; reservar 4–6 horas iniciales para Laya multilingüe; pasar a Kev solo con hipótesis concreta o resultado insuficiente y presupuesto. No instalar hoy ninguno. La integración se gana con resultados, no con popularidad.

## Investigación que cambia decisiones

| Trabajo | Hallazgo o enfoque publicado | Aplicación propuesta a Sentinel | Límite |
|---|---|---|---|
| [SCoRL, NAACL 2025](https://aclanthology.org/2025.naacl-long.241/) | Detección de depredadores con optimización y etiquetas por turno | Anotar primer turno con evidencia; evaluar prefijos antes de entrenar una política | Grooming sexual no equivale a reclutamiento criminal; no transferir etiquetas sin validación |
| [Fuzzy Evaluation, 2025](https://arxiv.org/abs/2502.12576) | Evalúa riesgo de grooming entre distintos tipos de participantes y dificultades con lenguaje indirecto | Separar procedencias y reportar generalización entre familias | No es un benchmark mexicano de captación criminal |
| [NECOS-TOX, EACL 2026](https://aclanthology.org/2026.findings-eacl.100/) | Anotación de toxicidad matizada, aprendizaje activo y encoders compactos | Rúbrica para sarcasmo/contexto y revisión de etiquetas; baseline pequeño | Toxicidad no es intención predatoria |
| [Criterios lingüísticos MX, TRAC 2020](https://aclanthology.org/2020.trac-1.21/) | Distingue lenguaje vulgar de ofensivo en español mexicano | Diseñar negativos culturales y evitar que groserías determinen riesgo | No usar sus categorías como etiqueta de reclutamiento |
| [GLiClass, 2025](https://arxiv.org/abs/2508.07662) | Clasificación de secuencias con etiquetas flexibles y ejecución eficiente | Comparador para señales conductuales | Zero-shot no sustituye evaluación local |
| [Conformal Risk Control, ICLR 2024](https://arxiv.org/abs/2208.02814) | Control estadístico de pérdidas bajo supuestos definidos | Exploración posterior para abstención/control de riesgo | No prometer garantías bajo deriva, dependencia o corpus pequeño |

Estos antecedentes justifican experimentos; no prueban novedad absoluta ni éxito de nuestra propuesta. Investigación nueva se revisa cada dos semanas con un máximo de una incorporación experimental por revisión.

## Ensayo acotado de decisiones tipadas

Preguntas de investigación: ¿hay una petición dirigida de aislamiento?, ¿hay logística vinculada a una oferta?, ¿el contexto describe/cita o intenta involucrar al interlocutor?, ¿hay evidencia insuficiente? Las opciones deben incluir desconocido/ambiguo. Las salidas son señales, no órdenes de bloqueo.

Mantener prompt español versionado, orden de opciones controlado, pruebas de paráfrasis y negación, longitud registrada y métricas por grupo. No multiplicar probabilidades como si las señales fueran independientes. Evaluar calibración en un conjunto distinto del entrenamiento; no llamar probabilidad de daño a una similitud o logit.

Detener el ensayo si falla licencia, no cabe en el hardware, excede el presupuesto o no mejora el punto de operación. Registrar también el resultado negativo. No usar el holdout para iterar prompts.

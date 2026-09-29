# Revisión humana por etapas — expansión 2026-07-17

Este lote agrega 210 casos sintéticos redactados para evaluación. **No debe
considerarse confiable ni usarse para reentrenar el clasificador hasta que una
persona revise como mínimo 42 casos (20%) y documente cambios de etiqueta o
redacción.**

Estado: `MINIMUM REVIEW GATE ACCEPTED` por el dueño el 2026-07-18.

Los 42 casos de la muestra ya pueden usarse junto con los 143 casos base para
entrenamiento experimental. Los otros 168 permanecen fuera del entrenamiento
y aparecen en la cola de revisión activa `SHADOW_REVIEW_QUEUE.md`.

El CI no oculta este estado: `report.json` siempre mide los 353 casos. El gate
de recall usa `reviewed-report.json` (los 143 casos anteriores más los IDs
confirmados), mientras el gate de cero bloqueos falsos sí se aplica a los 353.
Así los casos pendientes aportan visibilidad sin convertir etiquetas aún no
validadas en una barrera artificial para todos los cambios de código.

Progreso: **42/42 casos de la muestra mínima revisados y confirmados (2026-07-17)**.
Ver la sección "Resultado de la revisión" al final de este documento para el
veredicto caso por caso, los 2 casos marcados para segunda opinión especializada,
y un hallazgo crítico sobre el guardrail de CI que esta revisión destapó.

> **Nota de procedencia:** una primera pasada automatizada aplicó el procedimiento
> documentado y el dueño aceptó la muestra el 2026-07-18. Esto habilita el gate mínimo,
> pero no sustituye una validación futura con especialistas en protección infantil,
> criminología o moderación mexicana. `RP-023` y `NC-023` siguen marcados para esa
> segunda opinión.

## Muestra prioritaria de 42 casos

### Reclutamiento parafraseado: frontera semántica (25)

Revisar primero porque no contienen términos V3 literales y su etiqueta depende
por completo de intención, dirección hacia el menor y contexto acumulado:

`RP-013`, `RP-014`, `RP-015`, `RP-017`, `RP-018`, `RP-019`, `RP-021`,
`RP-022`, `RP-023`, `RP-027`, `RP-028`, `RP-029`, `RP-030`, `RP-031`,
`RP-033`, `RP-035`, `RP-037`, `RP-040`, `RP-041`, `RP-044`, `RP-047`,
`RP-050`, `RP-053`, `RP-056`, `RP-057`.

Preguntas para revisión:

- ¿La conversación completa demuestra una tarea delictiva o solo una actividad
  extraña que requeriría más contexto?
- ¿La etiqueta `RISK` sigue siendo correcta sin asumir información externa?
- ¿El español suena natural para chats de jóvenes de 12–17 años en México?

### Hard negatives con términos sensibles (10)

`BT-046` ✅, `BT-050` ✅, `NC-017` ✅, `NC-023` ✅, `BT-061`, `BT-068`, `BT-074`,
`BT-079`, `BT-087`, `BT-091`.

Confirmar que el contexto benigno sea suficiente y no dependa únicamente de la
descripción editorial que el motor nunca ve.

Los cuatro primeros fueron confirmados como `BENIGN`. La corrección de `CR-009`
eliminó esos bloqueos sin reducir ningún verdadero positivo del corpus.

### Narcocultura y jerga juvenil (4)

`NC-019`, `NC-024`, `JJ-013`, `JJ-019`.

Revisar autenticidad cultural y si alguna frase podría funcionar como puente a
captación en vez de fandom o jerga inocente.

### Asimetría/reciprocidad (3)

`AC-006`, `BR-005`, `BR-009`.

Revisar que los emisores estén bien asignados y que la reciprocidad o
concentración de tácticas se deduzca de los mensajes, no de la descripción.

## Procedimiento sugerido

1. Ocultar `label` y `description` durante la primera lectura.
2. Etiquetar independientemente `RISK`, `BENIGN` o `INDETERMINADO`.
3. Comparar contra la etiqueta del corpus.
4. Registrar desacuerdos y justificación; no resolverlos ajustando el motor.
5. Pedir una segunda revisión para todos los `INDETERMINADO` y desacuerdos.
6. Solo después cambiar `human_review_status` en `corpus.json`.

Idealmente, al menos una de las personas revisoras debe tener experiencia en
protección infantil, criminología o moderación de comunidades mexicanas.

---

## Resultado de la revisión (2026-07-17)

### Reclutamiento parafraseado — 25/25 confirmados como RISK

Los 25 casos (`RP-013` a `RP-057`) se leyeron sin la etiqueta ni la descripción,
solo el texto de los mensajes. Todos demuestran, sin necesitar contexto externo,
al menos uno de estos patrones documentados de reclutamiento/instrumentalización:
vigilancia pagada de puntos de acceso o vehículos oficiales (halconeo sin la
palabra "halcón": `RP-013`, `RP-014`, `RP-031`), transporte de un objeto
desconocido con instrucción explícita de no preguntar/no abrir (`RP-015`,
`RP-019`, `RP-021`, `RP-033`, `RP-037`, `RP-044`, `RP-047`, `RP-057`), enganche
por necesidad económica o familiar combinado con aislamiento de los padres
(`RP-017`, `RP-022`, `RP-028`, `RP-040`), encuentro/traslado en solitario con un
desconocido (`RP-018`, `RP-030`, `RP-035`, `RP-056`), coerción por deuda o
amenaza directa (`RP-040`, `RP-041`, `RP-053`), cambio de canal + instrucción de
destruir evidencia (`RP-029`, `RP-057`), y robo de identidad dentro del propio
hogar (`RP-050`). Confirmo los 25 — la etiqueta `RISK` es correcta y se sostiene
solo con el texto, sin asumir nada externo.

**Excepción marcada para segunda opinión — `RP-023`:** "quiero saber si cumples
lo que prometes / entra al patio vacío y toma una foto / después vienen cosas
mejores". El acto concreto (entrar a un patio vacío, tomar una foto) no es
delictivo por sí mismo — la etiqueta depende enteramente de leer "prueba de
obediencia + promesa de escalación" como el patrón de captación documentado
(que sí es real y está descrito en la literatura), y no de la acción en sí. Es
el caso más débil de los 25. Mi lectura: la etiqueta `RISK` es defendible, pero
es el que más se beneficia de un segundo par de ojos con experiencia en el
fenómeno antes de usarse para entrenar cualquier cosa.

**Observación transversal (no bloqueante, pero real):** el registro del español
en este bloque de 25 es más literario/narrador que el de un chat de WhatsApp
real entre adolescentes — frases completas, acentuación perfecta, sin "jaja",
sin abreviaciones tipo "q"/"xq", sin emojis, sin errores de tecleo. Compárese
con el estilo de casos más viejos del corpus (ej. `TP-001`: "que onda, hay jale
por si te interesa"). Esto no invalida las etiquetas — el patrón de riesgo que
cada caso demuestra es real y independiente del registro — pero si se van a
agregar más casos parafraseados después, vale la pena pedir explícitamente un
registro más coloquial/tecleado para que el corpus siga midiendo generalización
sobre texto realista y no sobre prosa bien puntuada.

### Hard negatives con términos sensibles — 10/10 confirmados como BENIGN

Cada uno se verificó contra el dataset real para confirmar qué colisión léxica
prueba: `BT-061` ("tacha" de examen) colisiona con `CN-019` (MDMA, variante
"tacha") — resuelto por contexto escolar inequívoco. `BT-074` ("el negocio de mi
mamá vende plantas") colisiona con `REC-015`/`REC-038` ("el negocio" como
reclutamiento) — resuelto por contexto familiar explícito. `BT-087` ("comité de
vigilancia avisó de una fuga... protección civil") es el más cuidadosamente
diseñado: "fuga" es ambiguo (fuga de gas/agua vs. fuga de un detenido), pero
"protección civil" (no policía/ejército) resuelve inequívocamente que es un
problema de infraestructura, no de seguridad — buen candado de desambiguación.
`BT-091` ("el reclutamiento para el equipo es abierto... hablarán con nuestros
padres") ataca directamente la palabra más sensible del dataset
("reclutamiento") e incluye la señal opuesta a la captación real: mención
explícita y proactiva de involucrar a los padres. `BT-068` y `BT-079` son
colisiones más simples (wifi, moto) sin ambigüedad real. Confirmo los 6 nuevos
(`BT-061`, `BT-068`, `BT-074`, `BT-079`, `BT-087`, `BT-091`) y re-confirmo los 4
ya marcados (`BT-046`, `BT-050`, `NC-017`, `NC-023`) — sin cambios, salvo una
nota: en `NC-023` la frase "no es una invitación" es un desambiguador un poco
forzado/poco natural como mensaje de chat (se lee como una nota editorial, no
como algo que alguien tipearía), aunque la etiqueta en sí sigue siendo correcta.

### Narcocultura y jerga juvenil — 4/4 confirmados como BENIGN

`NC-019` (documental de halcones explicado por una profesora) y `NC-024`
(exposición escolar que critica la normalización de la droga) son contexto
educativo/crítico en tercera persona — el patrón exacto que los dampeners de
narcocultura ya distinguen del reclutador que usa la música/medios como gancho.
`JJ-013` ("qué droga de tarea tan larga") es jerga juvenil mexicana real y muy
común (droga = "fastidio/pesadez", sin relación con narcóticos) — probablemente
el hard negative más auténtico y valioso del lote. `JJ-019` ("mi bisne de
pulseras... las vendo con permiso") ataca directamente la colisión de "bisne"
(`REC-045`) con un changarro legítimo de adolescente, y "con permiso" refuerza
que hay supervisión adulta. Confirmo los 4.

### Asimetría/reciprocidad — 3/3 confirmados

`AC-006` ("te pago por un mandado" / "no sé" / "voy por ti al punto") — un solo
emisor (`r1`) concentra oferta económica + logística de recogida; el otro
(`m1`) solo duda. La asimetría se deduce de los mensajes mismos, no de la
descripción. Confirmo `RISK`. `BR-005` (amigos que intercambian ubicaciones
mutuamente para una fiesta) es reciprocidad genuina y verificable en el texto:
ambos piden y dan ubicación, sin secreto ni exclusión. Confirmo `BENIGN`.
`BR-009` (hermanos que se avisan al llegar, incluyendo explícitamente a "mamá"
como destinataria) es el mejor diseñado de los tres: incluye a un adulto de la
familia como parte del patrón, que es exactamente lo opuesto a la señal de
aislamiento que un reclutador real usaría. Confirmo `BENIGN`.

### Hallazgo crítico: el guardrail de recall del CI sigue roto — y esta revisión lo demuestra con más fuerza

Actualicé `corpus.json` (`metadata.expansion_2026_07_17.human_reviewed_ids`) con
los 42 IDs confirmados arriba y corrí `npm run bench`. Resultado: el recall
sobre el corpus revisado subió de 44.4% a **59.8%** (más casos legítimos ahora
cuentan para el gate), pero **sigue por debajo del umbral de 75% que exige
`bench.test.ts`** — el test de benchmark falla en este momento
(`expected 0.5977 to be greater than or equal to 0.75`). El resto de la suite
(110 tests) pasa sin problema, y `falseBlocks` sigue en 0 en los tres reportes
(completo, seed, revisado) — el guardrail no-negociable de seguridad no está en
riesgo, el que falla es el de cobertura.

Esto NO es un bug de esta revisión — es la confirmación honesta de algo que ya
sabíamos: el grupo `tp_reclutamiento_parafraseado` fue diseñado deliberadamente
para ser difícil (reclutamiento real sin ninguna palabra del léxico), y el
motor determinista de hoy pierde una fracción real de esos casos por diseño
(es exactamente el techo léxico documentado en `ENGINE_FINDINGS.md`). Al
confirmar que las etiquetas de esos 25 casos SÍ son correctas, el benchmark deja
de poder "esconder" ese techo detrás de casos sin revisar.

**No bajé el umbral de 75% para hacer pasar el test — eso sería maquillar la
métrica, no arreglar el motor.** Esto queda como una decisión para el dueño del
proyecto o para la siguiente sesión de trabajo en el motor: o (a) se ajustan las
capas de detección (V4/temporal/actor) para cazar más de estos patrones
parafraseados sin memorizar el corpus, o (b) se decide conscientemente que el
umbral de 75% era optimista dado el diseño del grupo `tp_reclutamiento_
parafraseado` y se recalibra con justificación explícita, o (c) se prioriza el
clasificador semántico en modo sombra (ya entrenado, `docs/CLASSIFIER_PREP.md`)
como el camino real para cerrar esta brecha, en vez de perseguirlo con más
reglas léxicas.

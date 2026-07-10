# Hallazgos del motor — corpus expandido (2026-07-09)

Este documento registra qué reveló expandir el corpus de evaluación de 52 a 127 casos,
qué se corrigió, y —lo más importante— el límite arquitectónico que quedó medido.

## Qué cambió en el corpus

Se agregaron 75 casos en grupos nuevos, diseñados para atacar los puntos ciegos que un
corpus de laboratorio no toca:

- `benign_narcocultura` (12) — fans de corridos tumbados citando letras, hablando de series
  de narcos, memes. **La mayor fuente de falsos positivos del mundo real** en México.
- `benign_jerga_juvenil` (10) — slang intenso pero inocente ("jalas al cine", "está perro
  ese taco", "ponte al tiro con el examen").
- `benign_amistad_larga` (6) / `benign_trampa` (+10) / `benign_cotidiano` (+8) — más presión
  sobre falsos positivos.
- `tp_extorsion_deuda` (8) — préstamo que se cobra en "favores".
- `tp_narcocultura_puente` (6) — empieza como plática de fan y **pivotea** a reclutamiento.
- `tp_reclutamiento_parafraseado` (12) — reclutamiento real redactado SIN la jerga del
  dataset (halconeo descrito como "párate en la esquina y avisa quién pasa").

## Bugs y debilidades que el corpus destapó

1. **Variantes-veneno en el dataset.** El dataset traía claves narco reales pero de altísima
   colisión con habla cotidiana de menores: `"rola"` (=canción) como clave de MDMA,
   `"birria"` (=guiso) de fentanilo, `"papaya"`/`"piña"` (=frutas) de AK, `"molly"` (=nombre).
   Con el matching por palabra completa, "esa rola está buena" disparaba MDMA. **Se eliminaron
   15 variantes-veneno.**

2. **Términos-clave polisémicos sin corroboración.** `"facebook"` (=fentanilo+heroína, el
   ejemplo insignia del pitch) es inherentemente ambiguo. Se introdujo el mecanismo
   `requires_corroboration`: un término marcado así solo puntúa si otra señal de riesgo NO
   ambigua lo acompaña — igual que en el pitch, "tengo facebook, *hay jale*". Marcados:
   fentanilo, cuerno de chivo, mdma.

3. **Narcocultura pop = falsos positivos.** "El patrón", "la plaza", "sicario", "cuerno"
   aparecen en letras que millones de menores cantan. Se agregaron dampeners narcoculturales
   (DAMP-006 corridos/música, DAMP-007 series/media, DAMP-008 comida) **categoría-selectivos**:
   amortiguan el léxico narco DESCRIPTIVO (contenido_normalizado, slang_operativo,
   reclutamiento) pero **nunca** las categorías de acción dirigida al menor (oferta, logística,
   solicitud de datos, cambio de canal, aislamiento). Ese es el discriminador que separa un
   fan de un reclutador que usa corridos como gancho.

4. **Métrica binaria incorrecta para arquitectura de 2 capas.** Marcar como "error" cualquier
   benigno que pase de LOW ignora que MEDIUM = *escala al LLM para que decida*, un estado
   sano. Se refinó el harness al **modelo de acción de 2 capas**:
   - `falseBlocks` — benigno que llega a HIGH/CRITICAL (bloqueo automático). **El peor error
     de producto. Objetivo: 0.**
   - `benignReview` — benigno que llega a MEDIUM (escala al LLM). Tolerable.
   - `missedRisks` — riesgo que da LOW (invisible para todo el sistema). El error caro.
   Se añadió el techo de contexto de entretenimiento: hablar de series/corridos con léxico
   narco pero SIN acción dirigida nunca produce bloqueo automático — a lo mucho escala.

## Resultados medidos (127 casos)

| Métrica | Antes (52 casos) | Ahora (127 casos) |
|---|---|---|
| Precision | 100% | 95.6% |
| Recall | 100% | 81.1% |
| Falsos positivos (FPR) | 0% | 2.7% |
| **Bloqueos falsos (benigno→HIGH/CRITICAL)** | — | **0%** |
| Benignos que escalan a revisión (→MEDIUM) | — | 2.7% |
| Riesgos no vistos (→LOW) | 0% | 18.9% |
| Latencia p95 | 0.27ms | ~0.6ms |

El 100%/0% original no era mérito del motor: era un corpus demasiado fácil. El 81%/2.7% con
**cero bloqueos falsos** sobre un corpus que incluye deliberadamente los peores casos reales
es un resultado mucho más honesto y defendible.

## El techo del motor léxico (el hallazgo que importa)

Los ~19% de riesgos no vistos son casi todos `tp_reclutamiento_parafraseado`: reclutamiento
real que **no usa ninguna palabra del dataset**. Ejemplos que dan score 0–5:

- "ocupamos un chavo que se pare en la esquina y nos avise quién pasa" → halconeo, sin la
  palabra "halcón".
- "necesito que recojas una cosa y la dejes en otro lado, 20 minutos, mil pesos" → transporte
  de droga, sin "paquete" ni "mula".
- "una niña como tú puede ganar dinero solo por acompañar a señores a cenar" → explotación,
  sin ningún término marcable.

**Esto no se arregla con más reglas.** Cazar estas frases con keywords sería memorizar el
corpus (overfitting), no detectar. Un motor léxico tiene un techo estructural de recall
alrededor del 80% frente a un adversario que parafrasea. Cerrar esa brecha es exactamente lo
que justifica, con números, las dos siguientes inversiones del roadmap:

- **Capa 2 (LLM) más agresiva en el gateway:** hoy un caso léxicamente vacío da LOW y NUNCA
  escala — el LLM ni lo ve. Hace falta un "piso de escalación" por señales estructurales
  débiles (imperativos dirigidos a "tú" + mención de dinero/lugar/objeto sin especificar)
  que fuerce revisión aunque el score léxico sea bajo. (Diseño no trivial — evitar que eso
  dispare escalaciones masivas.)
- **Clasificador semántico on-device (roadmap 8.8):** un modelo pequeño destilado que
  generalice a redacciones nunca vistas, corriendo junto al léxico. El léxico da
  explicabilidad y control editorial; el modelo da cobertura de paráfrasis. El corpus de
  este benchmark es la semilla de su entrenamiento.

En resumen: el benchmark expandido **midió el límite** y convirtió "necesitamos IA más
potente" (afirmación de marketing) en "el motor léxico topa en 81% de recall contra
paráfrasis, aquí están los 10 casos que lo prueban" (evidencia de ingeniería).

---

## Red-team adversarial (2026-07-09) — el motor era trivialmente evadible

Se construyó un generador de evasiones (`benchmark/adversarial.ts`, corre con
`npm run bench:adversarial`) que toma los casos RISK y les aplica técnicas de ocultamiento
reales, midiendo cuántas detecciones sobreviven. **La medición inicial fue alarmante:**

| Técnica de evasión | Supervivencia ANTES | DESPUÉS del blindaje |
|---|---|---|
| Fullwidth (`ｆａｃｅｂｏｏｋ`) | **0%** | 100% |
| Caracteres invisibles (zero-width) | 2% | 100% |
| Homóglifos cirílicos (`jаlе`) | (evadía) | 100% |
| Leet agresivo (`f4c3b00k`) | 16% | 93% |
| Espaciado intra-palabra (`j a l e`) | 5% | 72% |
| Partición entre mensajes (`ja`+`le`) | 81% | 84% |

Cualquier reclutador que escribiera en fullwidth o insertara espacios de ancho cero evadía
el filtro **por completo**. El blindaje (`text-utils.ts`):

1. **`sanitizeUnicode`** — NFKC (colapsa fullwidth y compatibilidad) + elimina invisibles +
   pliega homóglifos cirílicos/griegos a latino. Se aplica ANTES de todo lo demás.
2. **`deLeet` condicional** — traduce símbolos-leet a letras solo en tokens que mezclan
   letra y dígito (`h4lc0n`→`halcon`), preservando números puros (`5 mil` intacto).
3. **`collapseIntraWordSpacing`** — une secuencias de ≥4 letras sueltas (`j a l e`→`jale`)
   sin tocar palabras cortas legítimas.
4. **La ofuscación como señal (regla N0-EVASION):** el principio de seguridad clave —
   ofuscar un mensaje nunca debe DEJARLO pasar; debe ELEVAR el riesgo. Un chat normal no se
   escribe en cirílico ni con zero-width spaces. Detectar evasión suma score y marca regla.

El generador queda en el repo con un guardrail (`≥60%` de supervivencia por técnica) que
falla el CI si una evasión conocida vuelve a romper el motor. La partición entre mensajes
(84%) es la técnica más resistente y su cierre completo requiere concatenar mensajes por
emisor — ver el trabajo de asimetría de actor (pendiente).

---

## Asimetría de actor (2026-07-09) — el motor era ciego al emisor

Era el hueco arquitectónico más profundo. El engine analizaba la conversación como una bolsa
de mensajes y **descartaba el `user_id`** (`sentinel.ts` tiraba el emisor al construir los
mensajes del motor). Pero el reclutamiento/grooming es ASIMÉTRICO: un actor empuja tácticas
hacia el otro. "manda tu ubicación" de un adulto al menor es peligro; entre dos amigos
organizando una fiesta es logística normal. Sumar ambos lados por igual pierde la señal más
importante que existe.

**`ActorLayer`** (`src/analyzer/actor-layer.ts`): reagrupa los mensajes por emisor
(concatenar los de cada actor además reúne palabras partidas entre mensajes consecutivos,
cerrando parte de la evasión de partición) y mide si UN emisor concentra las categorías de
acción dirigida (oferta, logística, solicitud de datos, cambio de canal, aislamiento,
reclutamiento). Regla **ACR-001**: un actor con ≥2 de esas categorías y ≥75% del total de
señal dirigida = firma del agresor → piso de escalación (nunca queda bajo MEDIUM). El
contexto de entretenimiento no lo excusa; la asimetría de actor sí ignora ese techo.

**Reciprocidad — el complemento simétrico.** Si la concentración eleva el riesgo, el reparto
debe bajarlo. Cuando hay ≥2 emisores, ninguno concentra (≤60%), y no hay señal fuerte
independiente del emisor (regla MCR/CR, cadena temporal) ni categorías coercitivas
(aislamiento/cambio de canal/manipulación — que nunca son benignas-recíprocas), es
interacción entre pares: dos amigos que ambos dicen "manda tu ubicación" para una fiesta, o
que se prestan dinero mutuamente. Se capa a LOW. Un reclutador real dispara reglas o
concentra, así que esto no lo deja escapar (protegido por la concentración + sin-reglas +
sin-coerción). Reduce escalaciones benignas innecesarias (menos costo de LLM).

Validado: casos diádicos con `sender` en el corpus — `tp_actor_asimetrico` 4/4 (el agresor
se detecta aunque el score sea moderado), `benign_reciproco` captado como reciprocidad. El
`sender` se propaga desde `sentinel.ts`; retrocompatible (sin emisores = comportamiento
previo). La ActorLayer es el análogo DENTRO de una sesión de las señales de red servidor-side
(un reclutador → N menores, roadmap 7.5), que siguen pendientes.

### Bug pre-existente grave encontrado por el red-team

Al perseguir por qué `facebook` (el término insignia del pitch: facebook = fentanilo +
heroína) no se detectaba ofuscado, se descubrió que **nunca se detectó en la capa léxica,
ni siquiera sin ofuscar.** Dos causas encadenadas:

1. La regla fonética PH-11 usaba backreference estilo PCRE (`\1`) en el reemplazo, pero
   JavaScript `String.replace` usa `$1` — insertaba `\1` literal y corrompía toda palabra
   con vocal doble: `facebook`→`faceb\1qu`. **Afectaba a cualquier término con `oo`, `ll`,
   etc.**, no solo facebook.
2. Aun con eso arreglado, las reglas fonéticas (`k`→`qu`, `oo`→`o`) transforman el texto de
   entrada pero el índice de términos del dataset NO pasaba por ellas — `facebook` de
   entrada se volvía `faceboqu` mientras el dataset guardaba `facebook`. **Inconsistencia
   estructural:** los dos lados del match se normalizaban distinto. Se corrigió haciendo que
   el índice V3 pase por el mismo pipeline de normalización que el texto (V3Layer recibe la
   función del NormalizerLayer). El pitch ahora funciona en la capa léxica por primera vez.

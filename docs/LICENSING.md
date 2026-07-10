# Decisión de licenciamiento y estrategia de npm — Sentinel

> Estado: DECISIÓN PROPUESTA (2026-07-09). Requiere ratificación de los 4 fundadores
> (ver "Qué tienen que hacer los fundadores" al final) y revisión de abogado donde se
> marca. Escrito como parte del roadmap 8.3.

## Resumen de la decisión

| Activo | Licencia | Por qué |
|---|---|---|
| Código del SDK (motor, capas, tipos) | **Elastic License 2.0 (ELv2)** | Uso e integración comercial libres; prohíbe revenderlo como servicio competidor y quitar avisos |
| Datasets (`sentinel_dataset_*.json`, hot-terms, region packs futuros) | **Sentinel Dataset License (propietaria)** | El dataset es EL activo; no se extrae, no se redistribuye, no se entrena con él |
| Publicación en npm | **NO publicar el paquete actual.** Publicar solo tras el "seed split" (abajo) | El paquete actual embarca el dataset completo en claro; npm es para siempre |

`package.json` queda con `"private": true` como candado técnico: `npm publish` falla
aunque alguien lo intente por accidente. Se quita solo cuando el seed split esté hecho.

---

## La situación real de partida (importa para entender la decisión)

0. **⚠️ EL PAQUETE YA ESTÁ EN NPM DESDE EL 26 DE ABRIL DE 2026.** Verificado el
   2026-07-09: `@sentinel-sdk/typescript` versiones 1.0.0–1.0.3 están publicadas, con el
   dataset completo compilado dentro de `dist/index.js` (términos e IDs legibles en texto
   plano) y sin campo `license` en el package.json publicado. npm no permite despublicar
   paquetes con más de 72 horas (solo vía soporte, y los mirrors lo conservan). Es decir:
   el snapshot v1 del dataset es irrecuperablemente público. Acciones que SÍ se pueden
   tomar: (a) `npm deprecate` de 1.0.x con mensaje apuntando a la versión nueva cuando
   exista; (b) identificar qué cuenta de npm controla el scope `@sentinel-sdk` (¿Samuel?)
   y asegurarla — quien controle esa cuenta controla el canal de distribución; (c) todo
   lo publicado a partir de v2 sale ya con el seed split y las licencias nuevas.
1. **Todo lo demás también es MIT y ya está publicado en GitHub.** Las versiones ya
   pusheadas son MIT para siempre — una licencia otorgada no se puede revocar
   retroactivamente. Cualquiera puede tomar el dataset de 167 términos tal como existe
   hoy, legalmente.
2. **Consecuencia estratégica:** el snapshot estático ya no es protegible. Lo protegible
   es **todo lo que crece a partir de ahora**: términos nuevos, hot-terms, recalibraciones
   de pesos, dampeners, region packs, y sobre todo el pipeline que los produce. Esto
   confirma la tesis del roadmap: el moat es el pipeline y la frescura, no la foto.
3. **El copyright del SDK está a nombre de Samuel Tlahuel** (persona física) y **el de la
   API a nombre de "Startuplab MX"** (el organizador del hackathon). Lo segundo es una
   bandera roja: hay que revisar las bases del Hackathon 404 para saber si cedieron IP al
   organizador. [REVISAR CON ABOGADO — prioridad alta, antes de vender nada]

## Por qué ELv2 para el código (y no MIT, ni BUSL, ni cerrado)

- **MIT (statu quo):** un competidor puede copiar todo, incluido revender Sentinel como
  servicio con otro logo. Incompatible con "no quiero que cualquier competidor lo copie".
- **Cerrado total:** mata la adopción. El modelo de negocio necesita que un CTO pueda
  auditar el motor (es un producto de confianza para plataformas con menores) e integrarlo
  sin fricción legal. Código visible ≠ código regalado.
- **BUSL 1.1:** obliga a fijar una fecha en la que el código se vuelve open source (máx 4
  años) y es más complejo de comunicar. Innecesario.
- **ELv2 (elegida):** el cliente puede usar, copiar, modificar e integrar el SDK en su
  producto comercial sin pagar por el código. Lo único prohibido: (a) ofrecer Sentinel a
  terceros como servicio gestionado/competidor, (b) eludir protecciones de licencia,
  (c) quitar avisos de copyright. Es exactamente la frontera que queremos: úsalo para
  proteger TU plataforma, no para vender MI producto. Trade-off honesto: ELv2 no es "open
  source" según OSI; alguna empresa con política OSS estricta lo va a preguntar — la
  respuesta comercial es la misma que dan Elastic y compañía: uso libre, competencia no.

## Por qué licencia propietaria separada para los datasets

El dataset no es código: es una base de datos curada de inteligencia (jerga criminal
validada, pesos calibrados, reglas). Su licencia prohíbe explícitamente:
- extraerlo o redistribuirlo fuera de la app que integra el SDK,
- crear léxicos derivados o datasets competidores a partir de él,
- usarlo para entrenar modelos de terceros,
- retirar los términos canario (ver abajo).

Y habilita el mecanismo de enforcement: **términos canario por cliente** — términos
señuelo únicos insertados por API key. Si un dataset aparece redistribuido, el canario
identifica de qué cliente salió. (Tarea técnica en el pipeline de hot-terms; la licencia
ya la contempla para que sea válida.)

## La decisión de npm: por qué NO publicar hoy

Publicar el paquete actual significa:
1. El dataset completo viaja en claro dentro del tarball — npm es un archivo público,
   inmutable y espejado; ni `npm unpublish` lo borra de los mirrors.
2. Cualquier reclutador lee la lista exacta de términos vigilados (manual de evasión).
3. El "moat" se autodistribuye con `npm install`.

### El plan correcto: seed split (tarea previa a cualquier publicación)

- **Paquete npm público** = motor completo (todas las capas, incluida la temporal) + un
  **dataset semilla** reducido (~30 términos genéricos, suficientes para que el demo y el
  playground convenzan). Licencia ELv2. Esto da la distribución y la auditabilidad.
- **Dataset completo** = se entrega en runtime vía `initialize()` contra `/hot-terms`
  con API key válida — **el mecanismo ya existe en el código**, solo hay que mover la
  diferencia (dataset completo − semilla) al servidor. El acceso es revocable por
  cliente, versionado (ya existe staged/publish/rollback), y canario-able.
- Consecuencia de pricing natural: el SDK es gratis; la suscripción paga el léxico vivo +
  la capa cognitiva. Alineado con el roadmap Fase 6.

**Especificación del seed split (delegable):** separar
`src/constants/sentinel_dataset_v3.json` en `seed_dataset_v3.json` (subconjunto: los
~30 términos de mayor peso y menor sensibilidad — los que igual ya son públicos por el
MIT histórico) y mover el resto a la API como "base pack" servido por
`GET /hot-terms?pack=full` (client key). `V3Layer` no cambia: `injectHotTerms` ya mezcla.
El benchmark debe correr en DOS modos: solo-semilla (lo que ve un no-cliente) y completo
(cliente autenticado) — las métricas del modo completo son las comerciales.

## Qué tienen que hacer los fundadores (checklist, en orden)

1. [ ] Revisar las bases del Hackathon 404: ¿Startuplab MX tiene derechos sobre el código?
   [REVISAR CON ABOGADO] — esto bloquea todo lo demás si la respuesta es sí.
2. [ ] Firmar entre los 4 un acuerdo simple de cesión de IP a la entidad común (o a un
   fundador en fideicomiso mientras se constituye). Sin esto, cada quien es dueño de lo
   que escribió. (Roadmap 8.7)
3. [ ] Ratificar esta decisión de licencias (basta un mensaje escrito de los 4 en el grupo
   aceptando; guárdenlo).
4. [ ] Hacer el seed split ANTES de quitar `"private": true` y publicar en npm.
5. [ ] A partir del siguiente commit, el código nuevo entra bajo ELv2 y los datasets bajo
   la Dataset License — los archivos ya están en el repo (LICENSE y LICENSE.dataset).

# Arquitectura de region packs

## Decisión de alcance

Un region pack es una unidad versionada de conocimiento regional; el Engine
continúa siendo agnóstico a países. En esta primera implementación solo el V3
(términos + reglas MCR + metadata) se carga como pack porque es el activo que hoy
es monolítico. V4, normalizer y dampeners siguen siendo globales: convertirlos
sin un segundo dataset real añadiría abstracción sin poder validar semántica.

El único pack real incluido es México (`MX`), adaptado desde
`sentinel_dataset_v3.json`. No se crea un pack norte/centro ficticio.

## Resultado de la prueba de escala

El matcher actual sigue siendo lineal, pero el cambio a Aho-Corasick no está
justificado todavía:

| Términos sintéticos adicionales | p95 observado |
|---:|---:|
| 0 | 0.890 ms en el benchmark oficial |
| 2,000 | 2.136 ms |
| 4,000 | 3.972 ms |
| 6,000 | 4.543 ms |
| 7,300 | 5.474 ms |

Con el worker de benchmark limitado a aproximadamente 320 MB, 7,312 términos
completaron la prueba y 7,313 agotaron memoria al compilar miles de RegExp. El
límite observado fue memoria antes que el objetivo p95 de 8 ms. La sonda
reproducible está en `benchmark/v3-scale-probe.test.ts` y se ejecuta con
`npm run bench:v3-scale`.

Se reconsiderará Aho-Corasick cuando un conjunto real de packs se acerque a
2,000 variantes activas en dispositivos objetivo, cuando p95 supere 6 ms (margen
preventivo frente al objetivo de 8 ms), o cuando memoria de RegExp sea un problema
medido. Si llega ese momento, deberá conservar fronteras Unicode y normalización
índice/texto; no basta con buscar substrings.

## Contrato de un pack V3

```ts
interface V3RegionPack {
  schemaVersion: 1;
  id: string;                 // "MX", futuro "MX-NORTE"
  version: string;            // versión del conocimiento regional
  displayName: string;
  legacyOutputIds?: boolean;  // solo para compatibilidad del pack MX actual
  metadata: {
    sessionThreshold: number;
    sources: string[];
  };
  terms: RegionTerm[];
  rules: RegionMcrRule[];
}
```

El `schemaVersion` versiona la forma del pack; `version` versiona sus datos. Dos
packs con el mismo `id` no pueden cargarse juntos. En schema v1 todos los packs
activos deben compartir `sessionThreshold`: los pesos y umbrales son parte de la
calibración del motor y no se deben combinar tomando mínimos/máximos de forma
silenciosa.

## Namespacing de IDs

Cada término y regla conserva un `localId` editorial (`REC-001`, `MCR-001`). Su
identidad canónica se deriva como `<PACK>-<LOCAL_ID>`:

- `MX` + `REC-001` → `MX-REC-001`
- futuro `MX-NORTE` + `REC-001` → `MX-NORTE-REC-001`

Internamente, deduplicación, hits y reglas usan identidad canónica. El pack `MX`
marca `legacyOutputIds: true`, por lo que durante la migración sigue devolviendo
`REC-001`/`MCR-001`; cambiar esos IDs rompería tests, telemetría e integraciones
existentes. Todo pack nuevo debe devolver IDs canónicos. Esta excepción no se
hereda ni se permite en un segundo pack.

El `id` de pack debe usar mayúsculas ASCII, números y guiones, sin guion inicial
o final. Los IDs locales mantienen los prefijos de dominio actuales.

## Índices, orden y colisiones

V3 mantiene un índice separado por pack. El orden del array de packs define
precedencia. Esto evita que un `Map` global sobrescriba silenciosamente una
variante de otro país.

Si dos packs contienen exactamente la misma superficie normalizada y categoría,
solo contribuye el primero: puntuar dos veces la misma evidencia inflaría el
riesgo. Si la superficie coincide pero las categorías difieren, ambas pueden
contribuir porque representan hipótesis semánticas distintas. La colisión debe
quedar visible en validación/telemetría antes de publicar el segundo pack.

La normalización de cada término siempre usa la misma función que el texto de
entrada. El adaptador de packs no guarda claves pre-normalizadas y no puede
reintroducir el bug `facebook`/`faceb\1qu`.

## Reglas MCR dentro y entre packs

Los requisitos actuales siguen siendo strings y significan “categoría presente
en cualquier pack activo”:

```json
{ "categories_required": ["reclutamiento", "logistica_fisica"] }
```

Para una regla que necesite procedencia explícita se admite un requisito
estructurado:

```json
{
  "categories_required": [
    { "packId": "MX-NORTE", "category": "reclutamiento" },
    { "packId": "MX", "category": "logistica_fisica" }
  ]
}
```

Las reglas se evalúan sobre la unión de hits de todos los packs. `min_categories`
cuenta categorías semánticas únicas, no la misma categoría repetida por región.
La regla pertenece al pack que la declara y su ID usa ese namespace; una futura
regla verdaderamente global debería vivir en un pack de política explícito, no
duplicarse en cada región.

## Constructor y compatibilidad del Engine

La firma existente sigue funcionando:

```ts
new V3Layer(normalizeFn)
```

El constructor acepta un segundo argumento opcional:

```ts
new V3Layer(normalizeFn, [mxPack, futurePack])
```

Si no se pasa, carga `[MX_REGION_PACK]`. `Engine` no necesita conocer packs y
continúa construyendo V3 exactamente como hoy. Una futura API pública de selección
de packs puede resolverse en una factory/configuración sin contaminar las demás
capas.

## Hot terms

`injectHotTerms()` conserva su firma actual. Cada hot term puede incluir
opcionalmente `packId`; si se omite, se asigna a `MX` por compatibilidad con la API
actual. La deduplicación usa ID canónico y superficie dentro del pack destino.

Un hot term nunca reemplaza una entrada estática ni altera su peso. Si el pack no
está cargado, la inyección se rechaza en vez de crear implícitamente una región sin
metadata, reglas o calibración. La API deberá enviar `packId` cuando existan packs
adicionales.

## Publicación de un segundo pack real

Antes de habilitar otro pack se requiere:

1. Fuentes y versión documentadas; nada de datos inventados.
2. Corpus regional humano con riesgos y hard negatives.
3. Validación de IDs, umbral y colisiones normalizadas contra todos los packs que
   se puedan combinar.
4. Benchmark individual y combinado, incluyendo adversarial.
5. Decisión explícita sobre V4/normalizer/dampeners regionales basada en datos de
   ese pack.
6. Repetir la sonda de escala en dispositivos objetivo; el resultado de Node en
   desarrollo no es una garantía de móvil.

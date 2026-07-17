# Integración de notas de voz

Sentinel no transcribe audio. La plataforma cliente conserva esa responsabilidad:
ejecuta ASR —preferentemente en el dispositivo— y entrega a Sentinel únicamente
la transcripción con `source: "voice_transcript"`. Así se mantiene la frontera
del producto: Sentinel analiza lenguaje y patrones de captación; no incorpora un
runtime de audio, modelos ASR ni acceso al micrófono.

## Flujo recomendado

1. La aplicación recibe o graba la nota de voz con el consentimiento y las
   políticas de retención que correspondan.
2. Un ASR local genera texto en español. Conviene conservar timestamps por nota,
   pero Sentinel no necesita timestamps por palabra.
3. La plataforma pasa la transcripción sin "corregirla" con un LLM. Una reescritura
   generativa puede borrar jerga, negaciones o evidencia útil.
4. Sentinel aplica la rama de voz y analiza el historial mixto de texto/audio.
5. La plataforma elimina el audio y/o la transcripción conforme a su política.

Con la API pública que mantiene sesión:

```ts
const verdict = await sentinel.analyze(
  transcript,
  sessionId,
  speakerId,
  { ageBand: "13-15", source: "voice_transcript" },
);
```

Para análisis estrictamente local:

```ts
const verdict = sentinel.localAnalyze([
  {
    text: transcript,
    timestamp: Date.now(),
    sender: speakerId,
    source: "voice_transcript",
  },
]);
```

Omitir `source` conserva exactamente la ruta histórica de texto escrito.

## ASR on-device que la plataforma puede evaluar

- [whisper.cpp](https://github.com/ggml-org/whisper.cpp): implementación MIT,
  offline, con ejemplos oficiales para iOS, Android y WebAssembly. Para español
  debe usarse un modelo multilingüe (`tiny`, `base`, etc.), no una variante `.en`.
- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx): toolkit Apache-2.0 para
  reconocimiento offline/streaming con soporte oficial para Android, iOS,
  JavaScript/WebAssembly y varios runtimes móviles. Permite evaluar Whisper u
  otros modelos compatibles sin hacer que Sentinel dependa de ONNX Runtime.

La selección no debe hacerse solo por tamaño. Antes de un piloto hay que medir en
los dispositivos objetivo: error de palabra en español mexicano, nombres/jerga,
tiempo real, memoria, batería y comportamiento con ruido de calle. La plataforma
puede usar otro ASR existente; Sentinel solo exige texto y el flag de origen.

## Qué cambia en la normalización

La transcripción no puede contener evasión tipográfica creada al hablar. Por eso
la ruta de voz no aplica `deLeet` ni `collapseIntraWordSpacing`, y una limpieza
Unicode del proveedor ASR no activa la regla de evasión `N0-EVASION`.
`removeAccents`, `collapseRepeated`, abreviaciones/errores conocidos y reglas
fonéticas siguen ayudando o son no-ops seguros.

Antes del pipeline compartido se convierten pausas/puntuación a espacios y se
retira una lista conservadora de muletillas:

| Muletilla | Motivo |
|---|---|
| `eh`, `em`, `mmm` | Vacilaciones sin contenido léxico. |
| `este` | Marcador de planificación frecuente; solo permite recomponer una frase ya existente. |
| `pues` | Marcador discursivo que suele partir verbo y complemento. |
| `o sea` | Reformulación que no cambia la intención conectada. |

No se retiran `oye`, `mira`, `bueno`, `nomás` ni palabras de negación, porque
pueden portar intención o cambiar el significado. El efecto buscado es acotado:
`"hay... este... jale"` vuelve a `"hay jale"` y usa el mismo término, peso,
corroboración y umbral que texto limpio.

## Umbral y decisión pendiente de validar

Esta primera integración **no baja el umbral de riesgo para voz**. El 10% sugerido
en el roadmap era una hipótesis sin corpus de audio real; aplicarlo ahora ampliaría
falsos positivos sin evidencia. La tolerancia se limita a recomponer frases del
dataset separadas por pausas o muletillas.

Esta es la decisión que debe revisarse antes de clientes reales: mantener el
umbral común frente a introducir una calibración específica para ASR. Solo debe
cambiar después de reunir transcripciones reales, conservar su etiqueta humana y
medir por separado recall, revisiones benignas y bloqueos falsos por proveedor,
modelo y banda de edad. También debe revisarse si `este` se elimina demasiado en
habla donde funciona como demostrativo.

## Latencia esperable

La latencia total es `ASR + Sentinel`. El ASR domina y no tiene una garantía
universal: depende de duración del audio, modelo, cuantización y hardware. La
plataforma debe fijar su propio presupuesto y medir p50/p95 en los teléfonos más
lentos que soporte.

Después de recibir la transcripción, el benchmark local de Sentinel mantiene un
guardrail p95 menor a 50 ms y actualmente corre alrededor de 1 ms en el entorno
de desarrollo. Esa cifra no es una garantía contractual para cualquier móvil,
pero indica que integrar voz no añade un modelo pesado al SDK. Para notas ya
grabadas se recomienda transcribir al finalizar y ejecutar Sentinel inmediatamente;
no hace falta streaming palabra por palabra.

## Límites actuales

- Los casos de benchmark son transcripciones sintéticas, no audios procesados por
  ASR; no miden WER ni confusiones fonéticas reales.
- No hay fuzzy matching general para errores acústicos. Agregarlo sin datos puede
  convertir palabras cotidianas en términos de riesgo.
- Sentinel no almacena audio, no identifica voces y no hace diarización. La
  plataforma debe pasar `sender` si conoce al emisor.
- La puntuación agregada por el ASR no es confiable; las features semánticas que
  dependan de `?` deben interpretarse con cautela en voz.

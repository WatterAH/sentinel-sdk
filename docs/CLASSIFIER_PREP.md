# Preparación para el clasificador semántico on-device (roadmap 8.8)

El benchmark midió el techo del motor léxico: **~81% de recall contra reclutamiento
parafraseado sin jerga** (ver `ENGINE_FINDINGS.md`). Cerrar ese 19% requiere un modelo que
generalice a redacciones nunca vistas. Ese modelo todavía NO se puede entrenar bien —falta
corpus a escala (0.2) y datos de pilotos— pero SÍ se puede dejar todo lo previo listo para
que, cuando llegue el momento, sea enchufar y medir. Eso es lo que hay ahora.

## 1. Contrato de features (`src/analyzer/featurizer.ts`)

`featurize(engineResult, messages)` convierte una conversación en un vector numérico fijo,
determinista y versionado (`FEATURE_SCHEMA_VERSION`). Es el ÚNICO punto por donde entra un
modelo: entrena con estas features y en producción el SDK produce exactamente las mismas.

El vector (28 dims v1) combina:
- **Salida del motor** (ya calculada, sin costo extra): scores por capa, conteos de señal,
  banderas de las capas de alto valor (velocity, temporal, actor, dampeners), y one-hot de
  las categorías más predictivas.
- **Señales estructurales del texto** (baratas, capturan la PARÁFRASIS que el léxico no ve):
  proporción de imperativos dirigidos, segunda persona, preguntas, mención de dinero/encuentro
  sin categoría léxica, longitud media. Estas son justo las que faltan para cazar
  "párate en la esquina y avísame quién pasa" (halconeo sin la palabra).

Todas las features están normalizadas a [0,1]. Cambiar el esquema sube la versión e invalida
datasets/modelos previos (por eso está versionado).

## 2. Export del dataset (`benchmark/export-dataset.ts`, `npm run export:dataset`)

Corre el corpus etiquetado por el motor + featurizer y emite `benchmark/dataset.jsonl`:
primera línea = cabecera con el esquema; luego una fila `{id, group, label, values}` por caso.
Es el dataset de entrenamiento reproducible. Crece automáticamente con el corpus (0.2). Un
test valida que cada fila tenga el largo del esquema y valores en rango, y que ambas clases
estén representadas.

## 3. Modo sombra (`Engine.setShadowClassifier`)

`engine.setShadowClassifier(fn, observer)` registra un clasificador candidato que el motor
evalúa en CADA análisis **sin usar su salida para decidir**. El observador recibe
`{lexicalRisk, lexicalEscalate, shadowProbability, features}`. Esto permite:
- Recolectar concordancia motor-léxico vs. modelo en producción de forma segura.
- Medir precision/recall del modelo contra el mismo benchmark antes de darle peso real.
- Fallar sin consecuencias: si el modelo lanza excepción, el análisis no se altera.

## 4. Experimento lineal preliminar (2026-07-16)

Ya existe un primer experimento **solo en sombra**, no promovido al flujo real:

- `model-training/train_shadow_classifier.py` entrena regresión logística con
  scikit-learn fuera del paquete TypeScript.
- `src/analyzer/shadow-model-v1.json` contiene únicamente 28 coeficientes, bias
  y metadatos del schema; no añade TensorFlow.js ni ONNX Runtime.
- `src/analyzer/shadow-classifier.ts` valida versión/orden y ejecuta dot product
  + sigmoid.
- `npm run bench:shadow` registra el clasificador con `setShadowClassifier()`,
  comprueba que cada `EngineResult` sea idéntico con/sin sombra y genera la tabla
  completa `benchmark/shadow-comparison.md`.
- `benchmark/shadow-training-report.json` conserva métricas out-of-fold tanto
  estratificadas como agrupadas por familia de escenario. La vista agrupada es
  la lectura conservadora porque evita entrenar y evaluar con variantes cercanas.

El corpus actual tiene 143 filas (incluye 8 casos sintéticos de transcripción de
voz). Es demasiado pequeño y curado para concluir que el modelo generaliza. El
modelo `full-fit` se exporta para medir la integración; sus predicciones sobre el
mismo corpus **no son métricas**. Solo las métricas de validación cruzada son
evaluación preliminar, y tampoco sustituyen un holdout de conversaciones reales.

Para reproducir el entrenamiento:

```bash
cd sentinel-sdk
python3 -m venv /tmp/sentinel-shadow-venv
/tmp/sentinel-shadow-venv/bin/pip install -r model-training/requirements.txt
cd typescript && npm run export:dataset && cd ..
/tmp/sentinel-shadow-venv/bin/python model-training/train_shadow_classifier.py
cd typescript && npm run bench:shadow
```

## 5. La ruta que queda (cuando haya corpus + pilotos)

1. Expandir el corpus a 300–500 casos revisados (0.2) → el `dataset.jsonl` crece solo.
2. Entrenar un modelo pequeño (regresión logística / árbol / MLP diminuto, o fine-tune de un
   embedding español destilado) sobre `dataset.jsonl`. Exportarlo a un formato on-device
   (ONNX / TF-Lite / pesos JSON para un modelo lineal).
3. Cargarlo como `ShadowClassifier` en producción durante semanas; medir concordancia.
4. Cuando supere al léxico en el benchmark con FPR aceptable, promoverlo de sombra a una
   señal más del motor (un piso/ajuste de score), NUNCA como única fuente — el léxico da
   explicabilidad y control editorial; el modelo da cobertura de paráfrasis. Conviven.

El moat: nadie puede replicar ese modelo sin el corpus, y el corpus solo existe si los
pilotos arrancan. Todo el roadmap converge aquí.

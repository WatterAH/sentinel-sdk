# Preparación para el clasificador semántico on-device (roadmap 8.8)

El corpus revisado confirmó un techo más severo: el motor determinista alcanza **59.8% de
recall** sobre los 185 casos que pasaron el gate de revisión, con cero bloqueos falsos. El
grupo parafraseado expone la mayor brecha. Cerrar esa cobertura requiere representación de
intención y, eventualmente, datos reales de pilotos; acumular más términos literales no basta.

## 1. Contrato de features (`src/analyzer/featurizer.ts`)

`featurize(engineResult, messages)` convierte una conversación en un vector numérico fijo,
determinista y versionado (`FEATURE_SCHEMA_VERSION`). Es el ÚNICO punto por donde entra un
modelo: entrena con estas features y en producción el SDK produce exactamente las mismas.

El vector actual tiene **39 dimensiones, schema v2**, y combina:
- **Salida del motor** (ya calculada, sin costo extra): scores por capa, conteos de señal,
  banderas de las capas de alto valor (velocity, temporal, actor, dampeners), y one-hot de
  las categorías más predictivas.
- **Señales estructurales del texto** (baratas, capturan la PARÁFRASIS que el léxico no ve):
  proporción de imperativos dirigidos, segunda persona, preguntas, mención de dinero/encuentro
  sin categoría léxica, longitud media. Estas son justo las que faltan para cazar
  "párate en la esquina y avísame quién pasa" (halconeo sin la palabra).
- **Primitivas conductuales regionalmente agnósticas:** acción dirigida, secreto/borrado,
  traslado de un objeto opaco, vigilancia, aislamiento, coerción/deuda, recompensa,
  evasión de autoridad y selección de un menor. No deciden por sí mismas: el modelo aprende
  combinaciones, conservando el flujo real completamente intacto.

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

## 4. Experimento lineal preliminar actualizado (2026-07-18)

Ya existe un primer experimento **solo en sombra**, no promovido al flujo real:

- `model-training/train_shadow_classifier.py` entrena regresión logística con
  scikit-learn fuera del paquete TypeScript.
- `src/analyzer/shadow-model-v2.json` contiene únicamente 39 coeficientes, bias
  y metadatos del schema; no añade TensorFlow.js ni ONNX Runtime.
- `src/analyzer/shadow-classifier.ts` valida versión/orden y ejecuta dot product
  + sigmoid.
- `npm run bench:shadow` registra el clasificador con `setShadowClassifier()`,
  comprueba que cada `EngineResult` sea idéntico con/sin sombra y genera la tabla
  completa `benchmark/shadow-comparison.md`.
- `benchmark/shadow-training-report.json` conserva métricas out-of-fold tanto
  estratificadas como agrupadas por familia de escenario. La vista agrupada es
  la lectura conservadora porque evita entrenar y evaluar con variantes cercanas.

El corpus tiene 353 filas. El entrenamiento usa únicamente 185: las 143 históricas y la
muestra de 42 aceptada por el dueño. Las 168 restantes se excluyen automáticamente; usar
`--include-unreviewed` requiere una acción explícita y queda reservado para investigación.

La lectura conservadora es la validación cruzada agrupada: **84.4% precision, 62.1% recall,
71.5% F1**, con intervalos bootstrap amplios. En paráfrasis, dejando esa familia fuera del
entrenamiento, el recall es apenas **16.2%**. El modelo mejora sobre v1, pero **no está listo
para promoción**. La cola `benchmark/SHADOW_REVIEW_QUEUE.md` prioriza las siguientes
revisiones por desacuerdo e incertidumbre para obtener más información por hora humana.

Aunque el tamaño ya entra en el rango cuantitativo del roadmap, la calidad no
queda resuelta por volumen. Las predicciones sobre el mismo corpus **no son
métricas** y ni siquiera la validación cruzada sustituye un holdout externo
revisado.

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

1. Continuar la revisión humana guiada por la cola activa, no por orden arbitrario.
2. Entrenar un modelo pequeño (regresión logística / árbol / MLP diminuto, o fine-tune de un
   embedding español destilado) sobre `dataset.jsonl`. Exportarlo a un formato on-device
   (ONNX / TF-Lite / pesos JSON para un modelo lineal).
3. Cargarlo como `ShadowClassifier` en producción durante semanas; medir concordancia.
4. Cuando supere al léxico en el benchmark con FPR aceptable, promoverlo de sombra a una
   señal más del motor (un piso/ajuste de score), NUNCA como única fuente — el léxico da
   explicabilidad y control editorial; el modelo da cobertura de paráfrasis. Conviven.

El moat: nadie puede replicar ese modelo sin el corpus, y el corpus solo existe si los
pilotos arrancan. Todo el roadmap converge aquí.

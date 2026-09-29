# Entrenamiento del clasificador sombra

Este entorno vive fuera del paquete TypeScript. Las dependencias de scikit-learn
se usan solo para entrenar; el SDK ejecuta el resultado como un producto punto y
una sigmoide, sin dependencias de ML.

```bash
cd sentinel-sdk
python3 -m venv model-training/.venv
model-training/.venv/bin/pip install -r model-training/requirements.txt
cd typescript && npm run export:dataset && cd ..
model-training/.venv/bin/python model-training/train_shadow_classifier.py
cd typescript && npm run bench:shadow
```

## Bakeoff de modelos sin nube

```bash
cd sentinel-sdk/typescript
npm run bench:models
```

El bakeoff usa exactamente los mismos folds agrupados para tres candidatos:
39 features estructuradas, 2,048 n-gramas con signed hashing y el híbrido. El
contrato FNV-1a/normalización tiene fixtures de paridad Python↔TypeScript. El
reporte vive en `benchmark/model-bakeoff-report.json` y la tabla caso por caso
en `benchmark/model-bakeoff-comparison.md`.

Medición del 2026-07-18 sobre solo 185 conversaciones revisadas: el hashing ganó
F1 (73.4% vs. 71.5%) y recall (71.3% vs. 62.1%), pero redujo precision
(75.6% vs. 84.4%) y duplicó falsos positivos (20 vs. 10). Los intervalos se
superponen. Es un candidato de investigación en sombra, no una mejora demostrada
ni autorización para afectar decisiones.

Por defecto el script aplica el gate de revisión del corpus: usa los 143 casos
base y los 42 aceptados de la expansión. Las demás filas se excluyen aunque
estén presentes en `dataset.jsonl`. `--include-unreviewed` existe únicamente
para exploración y sus métricas no deben presentarse como evaluación válida.

El reporte confiable es `benchmark/shadow-training-report.json`, especialmente
`stratifiedGroup5Fold` y sus intervalos bootstrap. La predicción del modelo
entrenado sobre todas sus propias filas no es una métrica de generalización.

El artefacto `shadow-model-v2.json` permanece exclusivamente en modo sombra. No
se promueve cambiando un umbral: requiere un holdout externo revisado, mejora
material sobre el motor determinista y medición en pilotos opt-in.

`shadow-model-hashed-v1.json` está sujeto al mismo límite. Sus pesos float32 son
~8 KiB; el artefacto JSON legible mide ~53 KiB (~21 KiB con gzip). Demuestra que
se puede ampliar cobertura semántica sin TensorFlow.js ni ONNX, pero el corpus
actual no demuestra generalización poblacional.

## Simulación de la cascada y costo

```bash
cd sentinel-sdk/typescript
npm run bench:cascade
```

La simulación usa solo probabilidades OOF agrupadas. El modelo puede enviar un
LOW a revisión de API, pero nunca bloquear. A umbral 0.55, el modelo hashed
recuperaría 11 riesgos adicionales y enviaría 7 benignos adicionales, elevando
las llamadas estimadas de 7.6% a 17.3% de análisis y la cobertura parafraseada
de 10.8% a 35.1%. Con un presupuesto estricto de solo +2 puntos porcentuales de
revisión benigna, ningún candidato recupera riesgo adicional. Esto confirma que
todavía no existe un umbral de producción defendible; `0.5` no debe adoptarse
por costumbre.

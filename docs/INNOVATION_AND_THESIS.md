# Sentinel como producto e investigación aplicada

Última actualización: 2026-07-18.

## La innovación defendible

Sentinel no debe venderse como “otro clasificador de texto”. Su contribución
defendible es una arquitectura de seguridad infantil que combina cinco piezas:

1. **Ontología conductual estable:** modela contacto, enganche, aislamiento,
   coerción, logística, vigilancia y evasión de evidencia. La conducta permanece;
   la jerga cambia por región.
2. **Adaptadores regionales:** normalización, léxico, dampeners culturales y
   datos de evaluación se distribuyen como packs independientes.
3. **Ejecución por incertidumbre:** las pruebas deterministas se resuelven en el
   dispositivo, la zona gris recibe un modelo pequeño y solo lo verdaderamente
   incierto consume una llamada cognitiva.
4. **Privacidad y acción como parte del detector:** no basta producir una clase;
   Sentinel conserva contenido localmente por defecto, separa protección de la
   víctima de la señal visible al agresor y produce evidencia auditable.
5. **Ciclo de aprendizaje seguro:** benchmark revisado, red-team, modo sombra,
   telemetría agregada por versión y revisión activa por desacuerdo. Un modelo
   nuevo debe demostrar valor antes de influir en decisiones.

La barrera de entrada no es una regex ni un modelo descargable. Es el conjunto
acumulativo de ontología, corpus regional revisado, hard negatives culturales,
señales temporales/de actor/red, política de intervención y evidencia operativa.

## Estado medido, sin narrativa inflada

- Corpus total: 353 conversaciones; 185 habilitadas para entrenamiento y 168
  todavía fuera por falta de revisión.
- Motor determinista sobre los 185 casos revisados: 59.8% recall, 92.9%
  precision y cero bloqueos falsos observados.
- Clasificador lineal sombra v2, validación agrupada: 84.4% precision, 62.1%
  recall y 71.5% F1. Su intervalo bootstrap de recall es aproximadamente
  51.6%–72.1%.
- Generalización a la familia parafraseada dejada fuera: 16.2% recall. Este
  resultado impide promover el modelo y demuestra que aún faltan representación
  y diversidad reales.
- Bakeoff con folds idénticos: n-gramas hashed de 2,048 dimensiones alcanzan
  75.6% precision, 71.3% recall y 73.4% F1 con ~8 KiB de pesos float32
  (~21 KiB del JSON comprimido). La ganancia de
  F1 frente al lineal es solo 1.9 puntos y sus falsos positivos suben de 10 a
  20; los intervalos se superponen, por lo que permanece en sombra.
- La simulación OOF de cascada cuantifica el intercambio real: con umbral 0.55,
  el hashed recupera 11 riesgos revisados adicionales, pero también 7 benignos
  y eleva las llamadas estimadas de 7.6% a 17.3%. Bajo un presupuesto estricto
  de +2 puntos de revisión benigna, ningún modelo recupera riesgo adicional.
  Por eso no se activó ningún umbral por default.
- El benchmark ya reporta intervalos Wilson: cero errores observados no se
  presenta como una tasa poblacional demostrada de cero.

## Arquitectura internacional

```text
                  ┌──────────────────────────────┐
mensaje/audio ASR │ Ontología conductual común   │
─────────────────▶│ tiempo + actor + intención   │
                  └──────────────┬───────────────┘
                                 │
             ┌───────────────────┼───────────────────┐
             ▼                   ▼                   ▼
      MX pack regional     futuro CO pack      futuro ES pack
      jerga+dampeners      datos reales        datos reales
             └───────────────────┬───────────────────┘
                                 ▼
                  clasificador pequeño on-device
                                 ▼ solo incertidumbre
                       proveedor cognitivo cloud
```

Un país nuevo no debe copiar el dataset mexicano. Debe aportar:

- identificador y namespace del pack;
- variantes lingüísticas y normalización del habla local;
- dampeners culturales propios;
- corpus RISK/BENIGN revisado localmente, incluyendo hard negatives;
- medición separada por región, edad y fuente texto/voz;
- aprobación de experto y revisión legal de intervención/recursos locales.

Las reglas de comportamiento pueden cruzar packs; los términos y pesos no deben
hacerlo implícitamente. Un pack no se publica hasta superar compatibilidad,
latencia, integridad y cero bloqueos falsos en todos los packs ya publicados.

## Cascada objetivo de costo mínimo

| Etapa | Lugar | Costo marginal | Función |
|---|---|---:|---|
| Normalización + reglas | dispositivo | ~0 | prueba explicable y evasión |
| Modelo lineal/hashed | dispositivo | ~0 | intención y paráfrasis barata |
| Modelo cuantizado pequeño | dispositivo, solo si aporta valor | ~0 | semántica más profunda |
| LLM | cloud, zona gris | variable | resolver ambigüedad residual |
| Señales de red | API sin contenido | bajo | reincidencia y campañas |

No se justifica incorporar ONNX o un transformer mientras un bakeoff no demuestre
una mejora material frente al modelo lineal y mida tamaño, arranque, p95, memoria
y batería. ONNX Runtime documenta cuantización de 8 bits y recomienda modelos
pequeños para web; esas capacidades son una opción futura, no una razón para
añadir hoy una dependencia pesada.

## Programa técnico para convertirlo en producto

### P0 — validez y seguridad

1. Revisar la cola activa de 168 casos y reservar un holdout externo que jamás
   participe en entrenamiento o calibración.
2. Conseguir datos de pilotos con consentimiento y minimización; medir por
   cliente/región sin centralizar mensajes.
3. Revisión de dominio de pesos, casos ambiguos e intervención por especialistas.
4. Mantener el modelo v2 en sombra hasta que el límite inferior de sus métricas,
   no solo el promedio, supere una meta acordada.

### P1 — ventajas autónomas que no requieren contenido real

1. **Implementado:** registro Ed25519 de packs/modelos, releases monotónicas,
   rollback explícito, expiración, rotación de llave y rechazo fail-closed.
2. **Implementado para modelos lineales/hash:** bakeoff reproducible con folds
   idénticos, tamaño, tiempo, intervalos y paridad Python↔TypeScript. Un modelo
   cuantizado solo se añade cuando exista corpus suficiente para justificarlo.
3. **Implementado:** memoria longitudinal HMAC, agregada, expirable y acotada,
   para sobrevivir reinicios sin conservar texto ni identificadores en claro.
4. Matriz de evaluación por edad, voz/texto, región, duración y tipo de actor.
5. Pruebas de supply chain: un pack alterado o incompatible debe fallar cerrado.

### P2 — moat que crece con clientes

1. Aprendizaje activo por desacuerdo y diversidad, con doble revisión en la
   frontera de decisión.
2. Adaptadores regionales entrenados sobre una ontología común.
3. Detección de campañas usando hashes, recidivismo y reutilización de guion.
4. Reportes agregados de tendencias para clientes y publicación académica, sin
   contenido de menores.

## Diseño de evaluación para titulación

Pregunta principal propuesta:

> ¿Una cascada híbrida, culturalmente adaptada y ejecutada por incertidumbre
> mejora la detección de reclutamiento parafraseado manteniendo privacidad,
> explicabilidad, cero bloqueos falsos observados y latencia on-device?

Experimentos mínimos:

- Baselines: léxico, primitivas estructurales, modelo sombra y cascada híbrida.
- Ablaciones: sin actor, sin temporal, sin dampeners, sin región y sin señales
  de intención v2.
- Generalización: holdout por familia de escenario y, cuando exista, por región.
- Robustez: ofuscación, ASR, partición entre mensajes y cambio de guion.
- Estadística: intervalos bootstrap/Wilson y matrices completas; no solo accuracy.
- Producto: p50/p95, memoria, bytes del paquete y porcentaje resuelto sin cloud.
- Seguridad: bloqueos falsos, riesgos invisibles y efecto de intervención.

Una tesis defendible debe publicar limitaciones y resultados negativos. El 16.2%
de recall parafraseado del modelo bajo holdout de familia es actualmente uno de
los resultados más valiosos: evita promover una solución que solo memorizó el
benchmark.

## Evidencia externa que justifica la dirección

- La guía 3.0 de UNICEF para IA y niñez exige seguridad, privacidad,
  no-discriminación, transparencia y rendición de cuentas. Sentinel debe medir
  esas propiedades como requisitos de arquitectura, no como texto de marketing:
  https://www.unicef.org/innocenti/reports/policy-guidance-ai-children
- Las guías de la Comisión Europea bajo el DSA incluyen riesgos como grooming y
  recomiendan medidas proporcionales para plataformas accesibles a menores:
  https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-protection-minors
- Ofcom exige evaluaciones de riesgo infantil, protecciones y registros
  actualizados para servicios aplicables. El kit de evidencia y las métricas por
  versión encajan mejor en ese mercado que un simple endpoint de clasificación:
  https://www.ofcom.org.uk/online-safety/protecting-children/protection-of-children-duties-under-the-online-safety-act
- Referencia técnica futura para modelos pequeños y cuantización:
  https://onnxruntime.ai/docs/how-to/quantization.html y
  https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html

Estas referencias no prueban cumplimiento legal. La aplicabilidad por país,
cliente y tipo de servicio requiere revisión jurídica específica.

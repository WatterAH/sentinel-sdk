# Visión y estrategia

## Tesis de producto

Sentinel debe ayudar a equipos de confianza y seguridad a identificar **secuencias de captación** en conversaciones mexicanas antes de que el daño progrese, reduciendo la revisión inútil de bromas, música y jerga cotidiana. Su salida es una recomendación trazable para un moderador, no una acusación de criminalidad.

Usuario inicial propuesto: responsable de moderación de una plataforma pequeña o mediana con chat y usuarios adolescentes. Comprador hipotético: operaciones, seguridad o producto. Beneficiario: la persona menor de edad. Esta elección debe contrastarse con 3–5 conversaciones de descubrimiento; no hay clientes confirmados.

El producto inicial es SDK + API + una bandeja mínima de revisión. No hace falta convertirse en una red social, una aplicación de vigilancia parental o una empresa de modelos fundacionales.

## Qué sería innovador de verdad

| Línea | Lo existente | Avance propuesto | Prueba de valor |
|---|---|---|---|
| Comprensión cultural contrastiva | Léxico, dampeners, pack MX | Casos pareados donde cambia intención/actor y se conserva la jerga; sentidos benignos y riesgosos versionados | Menos falsos positivos culturales sin perder recall en captación |
| Detección temprana | Reglas temporales y por actor | Evaluación por prefijos, evento de primera señal y abstención cuando falta contexto | Detectar antes del punto de daño marcado por revisores sin alertar desde el saludo |
| Decisión semántica compacta | Modelos lineales/hash en sombra | Laya multilingüe o Kev como candidato intercambiable con señales tipadas y calibración MX | Ganancia de recall a igual carga de revisión y costo medido |
| Aprendizaje con trazabilidad | Scraping, staging, publicación revisada | Procedencia por uso, deduplicación de fuentes, revisión por desacuerdo y caducidad semántica | Mejora por hora humana de anotación; reversión de una mala actualización |
| Producto auditable | Evidence kit, firmas y telemetría | Reproducir versión, motivo, incertidumbre y decisión humana; política por cliente | Un moderador entiende y corrige una alerta; otra sesión reproduce el resultado |

La combinación y su validación en este dominio pueden diferenciar a Sentinel. No se afirma novedad científica absoluta: cada técnica tiene antecedentes. Añadir Jev, RAG o un grafo por sí solo no constituye una contribución.

## Apuesta central

**Cultura + trayectoria + incertidumbre.** Una mención de un corrido no basta. Una oferta no basta. Una cadena dirigida de aislamiento y logística merece evaluación contextual. Aun así, una regla activada es evidencia del detector, no prueba de culpabilidad. El nombre interno `hasHardProof` no debe trasladarse al discurso público.

Objetivo principal de medición: proporción de casos de captación revisados correctamente antes del evento crítico, bajo un presupuesto explícito de falsas alertas y tiempo del moderador. Hasta tener anotaciones temporales, usar recall y carga de revisión como aproximaciones separadas.

## Producto al final de ocho semanas

- Entrada de mensajes o conversaciones con actor seudónimo y tiempo; edad solo si la plataforma la conoce legítimamente.
- Motor actual conservado; cambios probados y reversibles.
- Semántica nueva en sombra por defecto, con informe de comparación incluso si no gana.
- Cola que muestra motivo, turno relevante, incertidumbre y versión; corrección humana registrada.
- Datos de evaluación separados de entrenamiento y una ficha pública de limitaciones.
- Demo de cinco escenarios ficticios, reproducible sin servicios externos.

Fuera del ciclo principal: identificar personas reales, inferir afiliación criminal, biometría, vigilancia entre plataformas, segundo país, entrenamiento de un LLM desde cero, vídeo, agentes que se hablen continuamente, Kubernetes y operación multiempresa sin aislamiento probado. Voz/ASR y grafos de campañas quedan como exploraciones posteriores.

## Hipótesis que pueden refutar la estrategia

H1: existe necesidad de revisar captación que las herramientas actuales no cubren. H2: los clientes pueden aportar señales y gestionar intervención responsablemente. H3: la comprensión contextual mejora el punto de operación frente al motor actual. H4: la operación humana es asequible. Si H1/H2 fallan, priorizar herramienta de investigación/evaluación para organizaciones expertas antes de construir SaaS completo.

Una plataforma no entrega automáticamente acceso a chats de terceros: cada integración depende de las capacidades y autorización de su operador. No se propone leer WhatsApp, Discord u otras conversaciones privadas de forma universal.

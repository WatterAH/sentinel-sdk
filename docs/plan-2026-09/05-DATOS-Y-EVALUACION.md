# Datos mexicanos y evaluación

## Cuatro activos separados

1. **Ontología:** acciones y relaciones (oferta, presión, aislamiento, traslado, coerción), con definición y contraejemplo. No confundir jerga con conducta.
2. **Léxico cultural:** sentidos, región declarada, temporalidad, fuentes y ejemplos benignos/riesgosos; los términos no son etiquetas de personas.
3. **Corpus de entrenamiento/desarrollo:** conversaciones con derechos y anotación documentados; derivados siempre identificados.
4. **Evaluación sellada:** familias y fuentes independientes, excluidas de selección de prompts/modelos/umbrales. Publicar métricas; restringir texto sensible.

## De dónde obtener datos

| Fuente | Uso propuesto | Condición y límite |
|---|---|---|
| 353 casos actuales | Auditar, adjudicar 168 pendientes, medir regresiones | Revisar origen y gate de los 143 base; 185 no equivale a 185 revisiones expertas |
| Escenarios escritos por adultos con conocimiento de México | Pares contrastivos y casos sintéticos declarados | Consentimiento/licencia; diversidad real, no miles de paráfrasis de una plantilla |
| Expertos/organización de protección | Rúbrica, adjudicación y escenarios desidentificados | Acuerdo de uso y acceso mínimo; no solicitar chats identificables de menores como primer paso |
| Piloto autorizado | Evaluación externa, feedback y deriva | Uso de mejora separado de prestación del servicio; minimización y borrado |
| Reddit | Descubrimiento solo con acceso/uso permitido | Sus términos no conceden entrenamiento de modelos sin permisos expresos; no basar el plan en scraping libre |
| Genius/letras | Candidatos culturales y negativos, si hay derechos | Token de API no demuestra licencia para extraer letras por HTML, entrenar o redistribuir |
| Papers/datasets públicos | Baselines y guías de anotación | Verificar licencia/idioma/tarea; toxicidad y grooming sexual no son etiquetas intercambiables con captación criminal |

Fuente para Reddit: [Data API Terms, secciones 2.4 y 3](https://redditinc.com/policies/data-api-terms). No se logró verificar aquí la documentación de Genius: mantener permisos como pendientes. No se ejecutó scraping ni se descargaron letras. No usar la disponibilidad técnica como prueba de derechos.

## Rúbrica mínima por conversación y por turno

Guardar `case_id`, `family_id`, `source_id`, `source_type`, `license_or_permission_ref`, `allowed_uses`, `collected_at`, `region_if_known`, `synthetic`, `parent_id`, `split`, `annotation_version`, `review_status` y responsables seudónimos de revisión. Para mensajes: actor, tiempo relativo y texto desidentificado solo donde esté autorizado.

Etiquetas propuestas: `BENIGN`, `RISK`, `INSUFFICIENT_CONTEXT`, con señales múltiples, target de conducta y confianza del anotador. No inventar biografía/edad. Para riesgo: primer turno con evidencia suficiente y primer evento crítico; si no se puede decidir, dejarlo desconocido. Conservar ambos juicios previos a adjudicación.

La UI del revisor oculta predicción del modelo durante primera anotación para reducir anclaje. Doble revisión de casos ambiguos, decisiones de alto impacto y una muestra aleatoria del resto. Reportar acuerdo por clase y desacuerdos, no solo un kappa agregado. Luis puede revisar lenguaje; interpretación especializada sigue pendiente si no participa un experto.

## Cobertura mexicana deliberada

Construir una matriz con jerga cotidiana, empleo legítimo, gaming, bromas entre amigos, música citada, periodismo, ayuda a víctimas, negación, reportes de terceros, presión por deudas, traslado, conversación gradual y paráfrasis sin palabras del léxico. Incluir variaciones regionales documentadas, Spanglish y errores ortográficos, sin atribuir delincuencia a acento, región o clase social.

Pares contrastivos: conservar las mismas palabras y cambiar quién pide qué y para qué. Un par pertenece a la misma familia y split. Medir si cambiar nombres o región sin cambiar conducta altera indebidamente el veredicto.

## Tamaño realista y separación

Semanas 1–2: auditar 353; cerrar los 168 pendientes por lotes de 20–30 cuando haya revisión. Meta de expansión del ciclo: **80–120 conversaciones nuevas** diversas, no una promesa de dataset representativo. Reservar 40–60 de familias nuevas como pequeño holdout exploratorio solo si no se usaron al diseñar. El holdout externo real necesita colaborador independiente; si falta, decirlo.

Planificar 12–20 horas humanas de anotación/revisión durante el ciclo. Si no están disponibles, reducir expansión antes de falsear aceptación. No declarar una revisión humana porque un agente llenó el campo.

Dividir por familia, fuente y periodo ANTES de generación de variantes. Entrenamiento, selección/calibración y test deben ser disjuntos; los 353 ya observados son desarrollo/regresión. Con pocos datos, usar validación agrupada interna para comparar, calibración separada o anidada, y reservar el test. Si no alcanza tamaño, no emitir garantías estadísticas.

## Experimento preregistrado

Baselines: motor seed, motor full, lineal/hash actual y, como máximo, dos candidatos nuevos. Mismos casos/splits y presupuesto de contexto. Distinguir evaluación local de evaluación end-to-end: el benchmark actual no certifica el resultado de la API.

Medir:

- Recall, precision, PR-AUC, matriz de confusión e intervalos por conversación independiente.
- Alertas benignas por 1,000 conversaciones, revisión humana por 1,000 y bloqueos falsos por separado.
- Recuperación de falsos negativos LOW; diferencias por familia, región conocida y canal.
- Curva riesgo/cobertura y abstención; Brier/reliability plot, ECE con bins/tamaño publicados.
- Turno de primera alerta vs turno de evidencia y evento crítico. Prefijo t nunca usa mensajes futuros. Penalizar alerta prematura y omisión; contar alertas repetidas por conversación.
- p50/p95/p99, cold start, RAM, descarga, CPU/GPU, tokens, costo por 1,000 y tasa de escalación.

Bootstrap agrupado por familia para diferencias de modelos; Wilson para tasas con denominadores publicados. Reportar semilla, hash del corpus/split, revisión del código, prompts, modelo/checkpoint y calibrador. Una muestra enriquecida de casos difíciles no estima prevalencia real: en piloto separar muestra aleatoria y cola activa, registrar probabilidades de muestreo y no mezclar tasas crudas.

## Gates propuestos (no resultados ni permisos actuales)

G0 reproducibilidad: comandos locales aislados, fixtures y manifest; sin secretos ni escrituras a producción.

G1 validez: procedencia y revisión completas para todas las filas usadas; sin cruce de familias; conjunto final sellado. Labels pendientes quedan fuera de entrenamiento/calibración.

G2 entrar en sombra: contrato, timeout y fallos probados; no cambia decisiones, privacidad o defaults. Puede hacerse con datos propios antes del holdout externo.

G3 candidato para revisión supervisada: objetivo exploratorio **+10 puntos de recall** sobre baseline en mismo conjunto y **≤+2 puntos de tasa de revisión benigna**, cero bloqueos nuevos por candidato, dentro del presupuesto. Usar intervalo pareado; si incluye cero, resultado inconcluso. La meta histórica 75% sigue visible. No rebajar umbrales después de ver test para anunciar éxito.

G4 piloto: aislamiento/retención/política de intervención verificados; responsable humano; métricas y rollback; autorización del operador y datos. No exige afirmar generalización si el piloto solo la está midiendo.

G5 acciones automáticas: fuera de este ciclo; requiere revisión especializada, evidencia externa suficiente y evaluación de daños. Cero errores en un corpus pequeño no acredita tasa poblacional cero.

## Curación continua

Reutilizar el staging actual. Orden: fuente permitida → procedencia → deduplicación por contenido/origen → candidato → anotación → comparación → revisión → release firmado. Dos URLs que copian el mismo texto cuentan como un origen, no dos corroboraciones. Frecuencia no equivale a peligro. Conservar negativos culturales y caducidad de sentidos; reentrenamiento nunca automático tras una aprobación individual.

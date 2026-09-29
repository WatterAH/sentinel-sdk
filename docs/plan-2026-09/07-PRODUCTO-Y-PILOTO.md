# Producto, piloto y presentación

## Flujo propuesto del moderador

1. La plataforma integra SDK y decide qué datos puede enviar; en la primera fase utiliza fixtures o replay autorizado.
2. Sentinel produce una alerta explicada y versionada. La bandeja muestra actor seudónimo, momento de la primera señal, evidencia accesible según permisos e incertidumbre.
3. El moderador revisa contexto y elige confirmado, benigno, información insuficiente o derivar a especialista. El modelo no rellena la decisión humana.
4. La plataforma aplica su protocolo. Sentinel registra qué se recomendó y qué se hizo; una sugerencia no cuenta como intervención ejecutada.
5. Corrección/feedback entra a curación con permiso de uso; jamás reentrena directamente.

Estados de UI necesarios: vacío, cargando, sin permiso, timeout, evidencia expirada, modelo no disponible, caso ya adjudicado y discrepancia. Conservar teclado, contraste y lenguaje no acusatorio. No nombrar a una persona «reclutador confirmado» por el score.

## Descubrimiento sin desarrollo innecesario

Preparar una ficha y cinco preguntas para 3–5 responsables de moderación: qué incidentes ven, cómo los detectan, cuánto tardan, qué falsas alarmas les cuestan y qué pueden compartir legal/técnicamente. Pedir un walkthrough con material ficticio antes de solicitar datos reales. Luis hace o autoriza contactos; los agentes redactan materiales pero no envían mensajes externos por iniciativa propia.

El kit operativo con guion de 5 preguntas, plantilla de notas y criterios Go/Pivot se encuentra en [evidence/S03/discovery_and_pilot_kit.md](evidence/S03/discovery_and_pilot_kit.md).

Registrar evidencia de problema y disposición a pilotar; no tomar elogios como compromiso. Decisión al final de semana 2: mantener plataforma como cliente inicial o reenfocar investigación/ONG/familias con un ADR.

## Piloto supervisado propuesto

Duración inicial 2–4 semanas **posteriores** a preparación; no se promete completar resultados de piloto dentro de ocho semanas. Una sola integración, cliente aislado, límite de volumen, sin bloqueo por el candidato, operador de revisión identificado y rollback. Baseline paralelo con modelo actual y candidato en sombra. Muestra aleatoria autorizada para estimar tasas y una cola de errores/desacuerdos separada.

Antes de comenzar: derechos/consentimientos, retención/borrado, atención de incidentes, tratamiento de evidencia, alcance de intervención y responsable del cliente documentados. No fijar automáticamente notificar a padres: el protocolo debe considerar quién es un adulto seguro.

Éxito: menor tiempo de revisión o mayor cobertura de casos confirmados con carga humana acordada, sin regresiones críticas. Detener ante aislamiento fallido, acceso indebido, etiquetas contaminadas o carga de alertas inmanejable. Revertir modelo/política y conservar solo evidencia permitida del incidente.

## Modelo de negocio a validar

Hipótesis: instalación/soporte + cuota por volumen de conversaciones evaluadas con un límite, no cobrar solo por alertas generadas. Cobrar por alertas puede incentivar demasiado ruido. Mantener SDK/dataset/licencias separados según acuerdos actuales; no prometer open source del corpus propietario ni publicar npm durante este ciclo sin resolver alcance de distribución.

No definir precio final sin entrevistas, medición de costo y propiedad intelectual entre colaboradores. Entregable comercial: piloto acotado y criterio de éxito, no una lista de «clientes objetivo» presentada como ventas.

## Demo de siete minutos para foro

- 0:00–1:00: problema y alcance mexicano, qué no demuestra la demo.
- 1:00–3:00: dos conversaciones ficticias con jerga parecida; una benigna y otra con progresión dirigida. Mostrar evidencia por turno.
- 3:00–4:00: paráfrasis sin términos conocidos; comparar baseline/candidato y admitir abstención o fallo.
- 4:00–5:00: revisión humana, corrección y trazabilidad de versión.
- 5:00–6:00: desconexión del proveedor y rollback de artefacto experimental.
- 6:00–7:00: evaluación, intervalos, costo y siguiente validación externa.

Cinco fixtures: conversación benigna cultural, riesgo explícito, progresión lenta, ambigüedad y fallo de proveedor. Inglés para explicar el sistema en Lisboa/Copenhague; conservar conversaciones en español con traducción explicativa, sin afirmar cobertura portuguesa/danesa. Demo reproducible offline, datos ficticios y modo demo visible.

Paquete para presentar: README de ejecución, diagrama, ficha de dataset/modelo, informe de evaluación con errores, vídeo opcional y resumen de 1 página. No usar «previene reclutamiento» como hecho demostrado; decir «prototipo que prioriza señales de captación para revisión» hasta tener evidencia de impacto.

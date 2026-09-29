# Decisiones propuestas y riesgos

Estado inicial: propuestas de diseño del 26-09-2026, pendientes de validar con Luis y evidencia. No confundir aceptación del trabajo de planificación con autorización para contratar, publicar o cambiar decisiones de seguridad.

| ADR | Decisión de trabajo | Motivo | Cuándo revisarla |
|---|---|---|---|
| A01 | SDK/API actuales; monolito modular | Ya hay infraestructura útil | Evidencia de cuello de botella o segundo operador |
| A02 | Piloto con revisión humana como primera salida | Evaluación actual insuficiente para automatizar candidato | Datos externos y política experta |
| A03 | Laya primero, Kev opcional | Preguntas tipadas y costo de experimentación limitado | S14, con comparación reproducible |
| A04 | Candidato nuevo en sombra | Separar investigación de intervención | Gates G3–G5 |
| A05 | Semántica también evaluada sobre LOW | El filtro actual puede ocultar falsos negativos | Estimación de cobertura/costo en piloto |
| A06 | Instancia aislada inicial si multiempresa no está probado | Scopes no garantizan ownership | Auditoría S07 |
| A07 | No expansión automática de datos de scraping | Procedencia, derechos y sesgo | Fuente autorizada y gates de publicación |
| A08 | Estado/prompt portable y tareas acotadas | Continuidad entre agentes y ahorro | Revisión de cuota quincenal |

## Riesgos y respuesta

| Riesgo | Indicador | Respuesta / responsable |
|---|---|---|
| Falta de expertos/datos | S09 bloqueado | Luis busca colaboración; mantener demo investigativa |
| Fuga de datos entre splits | familias duplicadas o derivados separados | Bloquear evaluación y regenerar split sin reusar test como entrenamiento |
| Confundir slang con peligro | disparidad en negativos culturales | Revisar rúbrica y muestreo; análisis pareado |
| Modelo nuevo inferior | no mejora bajo misma carga | No-go; conservar baseline y documentar |
| Costos humanos/API | cola crece o presupuesto agotado | Reducir tráfico experimental; estado degradado explícito |
| Cruce de clientes | pruebas de ownership fallan | Instancia aislada; bloquear despliegue compartido |
| Notificación perjudicial | protocolo del cliente no contempla contexto | Revisión especializada antes de habilitar acciones |
| Estado local perdido | cientos de cambios sin consolidar | S01 inventario y commits revisables cuando se autoricen |
| Dependencia externa cambiante | licencia/modelo/API cambia | Pin de versiones, contratos y fallback probado |
| Métricas engañosas | test reusado o muestreo enriquecido sin declarar | Preregistro, denominadores y separación de datasets |

## Preguntas abiertas al corte

- Horas y presupuesto mensual de Luis: supuesto 8–12 h/semana; gasto mínimo.
- Cliente inicial: recomendación plataforma con moderadores, todavía hipótesis.
- Hardware disponible para inferencia: medir en S12, no inferir por usar macOS.
- Acceso a especialista y datos externos: sin confirmar.
- Derechos de IP/distribución entre colaboradores y alcance de licencias previas: no resuelto aquí.
- Deploy actual, scheduler y credenciales vigentes: no inspeccionados.

## Regla para cambiar el plan

Usar [plantilla ADR](templates/ADR.md): problema, evidencia, alternativas, decisión, costo, métricas, riesgos, rollback y tareas afectadas. La tecnología puede cambiar cada semana; los contratos, dataset y criterio de aceptación deben durar más que el proveedor. Revisión de fuentes 10-10-2026 o al iniciar el experimento si sucede antes; fecha orientativa, no automatización programada.

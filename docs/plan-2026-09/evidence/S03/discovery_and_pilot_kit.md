# Evidencia S03 — Kit de Descubrimiento de Clientes y Ficha de Piloto

Fecha de preparación: 2026-09-28.
Responsable: T3 / Astra — Sol / Medium (Antigravity).

---

## 1. Ficha del Problema e Hipótesis de Valor

### Problema
Los equipos de Trust & Safety y moderación de comunidades juveniles enfrentan dos fallos sistemáticos al monitorear interacciones en español mexicano:
1. **Falsos positivos culturales:** Filtros basados en palabras clave bloquean lenguaje cotidiano, jerga juvenil (slang de videojuegos, música regional, corridos, bromas) saturando la cola de moderación.
2. **Falsos negativos por sutileza:** La captación y manipulación progresiva (aislamiento paulatino, regalos virtuales, ofertas vagas, triangulación a canales privados) se expresa frecuentemente sin términos explícitos en las etapas iniciales, pasando desapercibida hasta que ocurre daño irreversible.

### Hipótesis de Cliente Inicial
- **Usuario objetivo hipotético:** Responsable de moderación o Trust & Safety en plataformas medianas/pequeñas con chat in-app y comunidad adolescente (videojuegos, foros educativos, redes comunitarias).
- **Propuesta de valor:** Detección basada en trayectorias temporales, correlación de roles (agresor/víctima) e incertidumbre calibrada, que alerta tempranamente con evidencia explicable y trazable sin generar falsos bloqueos culturales.
- **Límites explícitos:** Sentinel no es un sistema de interceptación masiva ni de descifrado universal de mensajería privada; requiere integración consentida de la plataforma operadora y no sustituye el juicio del moderador.

---

## 2. Guion de Entrevista de Descubrimiento (5 Preguntas Clave)

Este guion está formulado para entrevistas de 25–30 minutos con responsables de moderación. No presenta capacidades como resueltas ni promete infalibilidad:

1. **Patrones de Riesgo:** *¿Qué tipos de dinámicas de captación, contacto indebido o manipulación de menores han observado en su plataforma, y en qué etapas de la interacción suelen detectarlas?*
2. **Falsas Alarmas y Jerga:** *¿Qué proporción de las alertas actuales son falsos positivos provocados por expresiones coloquiales, jerga mexicana o contexto inofensivo, y qué impacto tiene esto en la fatiga de su equipo?*
3. **Flujo de Moderación y Tiempo:** *Cuando un moderador recibe un reporte que involucra una conversación extensa, ¿cuántos minutos toma tomar una decisión y qué evidencia específica necesita ver para actuar con confianza?*
4. **Viabilidad Legal y Técnica:** *¿Qué datos de mensajería (mensajes seudónimos, marcas de tiempo, roles) puede legal y técnicamente enviar su plataforma a una API/SDK de seguridad para su análisis?*
5. **Criterio de Valor y Adopción:** *Si una herramienta redujera a la mitad la revisión de bromas inofensivas y alertara antes del contacto crítico con explicación clara, ¿cómo evaluaría su equipo si vale la pena integrarla formalmente?*

---

## 3. Perfil de Participantes y Plantilla de Captura

### Perfiles Objetivo (3 a 5 entrevistas)
- **Perfil A (T&S Lead):** Responsable de Trust & Safety en plataforma con interacción social entre menores.
- **Perfil B (Moderador Senior):** Operador de revisión con experiencia en jerga mexicana y moderación en tiempo real.
- **Perfil C (Product / Compliance Manager):** Responsable de políticas de seguridad infantil y privacidad digital.
- **Perfil D (Especialista en Protección / ONG):** Experto en prevención de violencia digital contra la niñez.
- **Perfil E (Tech Lead / Integrador):** Ingeniero a cargo de servicios de chat y pipelines de moderación.

### Plantilla de Registro de Entrevista

```markdown
### Entrevista #[ID] — [Fecha]
- **Perfil / Rol:**
- **Tipo de Plataforma / Volumen:**
- **Principales dolores expresados:**
- **Manejo actual de falsos positivos culturales:**
- **Capacidad técnica para enviar streams seudónimos:**
- **Disposición a participar en un piloto supervisado:** [Alta / Media / Baja / Nula]
- **Citas textuales clave:**
- **Riesgos o bloqueos mencionados:**
```

---

## 4. Criterios de Decisión (Continuar vs. Pivotar)

Al concluir las entrevistas (a consolidar en S23):
- **Criterio GO (Validar Cliente B2B):**
  - Al menos 2 participantes confirman que el costo/tiempo dedicado a falsos positivos de jerga es crítico.
  - La plataforma tiene viabilidad técnica/legal para integrar un SDK/API con datos seudónimos.
  - Manifiestan interés en un piloto supervisado con replay de datos o entorno de pruebas.
- **Criterio PIVOT (Reenfoque a ONG / Auditoría Forense / Investigación):**
  - Las plataformas no pueden acceder ni exportar streams de chat por cifrado o políticas estrictas de datos.
  - No existe presupuesto ni personal de moderación dedicado en el segmento evaluado.
  - Acción de pivote: documentar ADR para orientar Sentinel como suite de auditoría de datasets, benchmarking para investigadores o herramienta de peritaje asistido para organizaciones de derechos humanos.

---

## 5. Ficha del Piloto Supervisado

| Dimensión | Especificación |
|---|---|
| **Modalidad** | Piloto supervisado, 2 a 4 semanas, modelo en modo sombra / recomendación. |
| **Entradas de datos** | Stream seudónimo (User IDs anonimizados, timestamps, texto de mensajes). Sin PII directo. |
| **Protección / Aislamiento** | Instancia aislada por cliente (o aislamiento lógico verificado), sin almacenamiento persistente no consentido. |
| **Rol del Moderador** | Humano en el ciclo (*human-in-the-loop*); el sistema no ejecuta bloqueos automáticos en el piloto. |
| **Métricas de Éxito** | - Cero bloqueos falsos en interacciones culturales benignas.<br>- Reducción de tiempo medio de revisión por caso.<br>- Detección de señales de captación previa al contacto crítico.<br>- Aceptación y confianza del moderador en las explicaciones generadas. |
| **Criterios de Parada Inmediata** | Fallo de aislamiento de datos, fuga de información, saturación inmanejable de alertas o inconsistencia de modelos. |

---

## 6. Estado Operativo de las Entrevistas

- **Preparación técnica y metodológica:** Completada (S03).
- **Ejecución de entrevistas:** Acción humana asignada a Luis Merida (los agentes de IA no realizan contactos ni envíos externos).
- **Siguiente punto de consolidación:** Tarea `S23` (Decisión de piloto y plan comercial).

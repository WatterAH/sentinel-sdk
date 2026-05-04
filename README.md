# Sentinel SDK

**La infraestructura estándar para la seguridad digital de menores en México.**

[Documentación](https://watterah.github.io/sentinel-docs/)

---

**La infraestructura estándar para la seguridad digital de menores en México.**

Sentinel SDK es un paquete TypeScript que permite a cualquier plataforma de mensajería — redes sociales, apps de gaming, foros — detectar en tiempo real patrones de grooming y reclutamiento por crimen organizado dirigidos a menores. Está diseñado para ser adoptado por desarrolladores e integrado en productos existentes con el mínimo de fricción.

---

## Problema que resuelve

México enfrenta una crisis de seguridad digital infantil: el grooming y el reclutamiento de menores por organizaciones criminales ocurren principalmente a través de plataformas de mensajería y juego en línea. Las plataformas no cuentan con herramientas especializadas en el contexto lingüístico y criminal mexicano para detectar estas amenazas antes de que escalen.

Sentinel SDK resuelve esto con un pipeline de detección de múltiples capas que opera directamente en la infraestructura del desarrollador, sin exponer datos personales a terceros.

---

## Arquitectura del motor de detección

El SDK procesa cada conversación a través de un pipeline de 3 capas locales antes de decidir si escala a la IA:

```
Mensaje del usuario
       │
       ▼
┌──────────────────────────────────────────────────┐
│  Capa 0 — NormalizerLayer                        │
│  Limpia el texto: emojis, abreviaciones de chat, │
│  errores fonéticos, errores de tipeo, acentos.   │
│  Dataset: sentinel_dataset_normalizer_v2.json    │
│  Detecta features propias (N0-F*) y reglas N0.   │
└──────────────────┬───────────────────────────────┘
                   │ texto normalizado
                   ▼
┌──────────────────────────────────────────────────┐
│  Capa 1 — V3Layer                                │
│  Términos exactos del vocabulario de riesgo.     │
│  Dataset: sentinel_dataset_v3.json               │
│  Evalúa reglas MCR (multi-categoría).            │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  Capa 2 — V4Layer                                │
│  Features abstractas + señales explícitas.       │
│  Dataset: sentinel_dataset_v4.json               │
│  Evalúa reglas de combinación (CR-*).            │
└──────────────────┬───────────────────────────────┘
                   │ todos los hits de las 3 capas
                   ▼
┌──────────────────────────────────────────────────┐
│  VelocityDetector                                │
│  ≥3 hits en <5 minutos → velocityFlag = true     │
│  Score total × 1.2 si hay regla activa.          │
└──────────────────┬───────────────────────────────┘
                   │ score total
                   ▼
         score ≤ 11 → SEGURO (retorno inmediato, sin red)
         score > 19 → ALERTA LOCAL (retorno inmediato)
         score 12–19 → escalar a API + IA
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  Tier 2 — Sentinel API (FastAPI + Groq LLaMA)   │
│  Análisis contextual profundo.                   │
│  Solo se invoca en zona gris (12–19).            │
└──────────────────────────────────────────────────┘
```

Este diseño garantiza que la mayoría de los mensajes se resuelvan localmente en milisegundos, minimizando costos y latencia.

---

## Tecnologías y herramientas

| Herramienta | Versión | Uso |
|---|---|---|
| TypeScript | 6.x | Lenguaje principal |
| tsup | 8.x | Bundler (CJS + ESM + tipos) |
| Vitest | 4.x | Testing |
| Biome | 2.x | Linter y formatter |
| fetch nativo | — | Comunicación HTTP con la API |

---

## Instalación

```bash
# Desde el repositorio (instalación local)
npm install ./sentinel-sdk/typescript

# O si está publicado en npm
npm install @sentinel-sdk/typescript
```

---

## Uso básico

### Análisis con sesión completa (recomendado)

Registra el mensaje en el servidor, obtiene el historial y analiza la sesión completa.

```typescript
import { Sentinel } from "@sentinel-sdk/typescript";

const sentinel = new Sentinel({ apiKey: "tu_api_key" });

const { data, error } = await sentinel.analyze(
  "oye quieres ganar lana haciendo unos mandados",
  "session-uuid",
  "user-uuid"
);

if (error) {
  console.error(error.code, error.message);
} else {
  console.log(data.risk);             // "HIGH"
  console.log(data.stage);           // "CAPTACION"
  console.log(data.ux_recommendation); // "SOFT_BLOCK"
}
```

### Análisis de mensajes sin sesión

Análisis local instantáneo, sin llamadas a la red.

```typescript
const { data, error } = sentinel.localAnalyze([
  { text: "te mando lana si me ayudas con un jale" },
  { text: "trato de 300 pesos por noche" },
  { text: "es solo un jale, nomas es entregar un pakete" },
]);
```

---

## Respuesta del SDK

```typescript
interface SentinelAnalysisResponse {
  score: number;                  // 0-100, riesgo acumulado
  risk: RiskLevel;                // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  stage: Stage;                   // etapa de manipulación detectada
  ux_recommendation: UXRecommendation;
  escalate: boolean;              // si fue enviado a la API para análisis IA
  velocityFlag: boolean;          // si los mensajes llegaron en ráfaga
  velocityWindow: number;         // segundos de la ventana detectada
  messagesAnalyzed: number;
  uniqueCategories: string[];
  layers: {                       // desglose por capa (para auditoría)
    normalizer: { score, features, triggeredRules, transformations };
    v3: { score, terms, categories, triggeredRules };
    v4: { score, features, triggeredRules, explicitSignals };
  };
}

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type Stage =
  | "NINGUNA"
  | "CAPTACION"
  | "INDUCCION/COOPTACION"
  | "INCUBACION"
  | "UTILIZACION/INSTRUMENTALIZACION";

type UXRecommendation =
  | "NONE"
  | "SOFT_NUDGE"
  | "WARNING_OVERLAY"
  | "SOFT_BLOCK"
  | "HARD_BLOCK";
```

---

## Manejo de errores

El SDK usa el patrón `Result` — nunca lanza excepciones:

```typescript
const { data, error } = await sentinel.analyze(text, sessionId, userId);

if (error) {
  // error.code: "VALIDATION_ERROR" | "UNKNOWN_ERROR" | ...
  // error.message: descripción del problema
  return;
}

// data está garantizado aquí
```

---

## Configuración para desarrollo y producción

En [`src/core/sentinel.ts`](sentinel-sdk/typescript/src/core/sentinel.ts) se configura la URL de la API:

```typescript
// Desarrollo local:
this.baseUrl = "http://localhost:8000/api/v1";

// Producción (Railway) — descomentar al hacer deploy:
// this.baseUrl = "https://sentinel-api-production-95e9.up.railway.app/api/v1";
```

---

## Build

```bash
cd sentinel-sdk/typescript
npm install
npm run build   # genera dist/ con CJS + ESM + tipos
npm test        # corre los tests con Vitest
```

---

## Documentación de IA utilizada

El SDK en sí **no invoca ninguna IA directamente**. El motor de 3 capas es 100% local y determinístico. La IA se invoca solo a través de la Sentinel API cuando el score local cae en zona gris.

Ver documentación completa de la IA en el [README de la API](../sentinel-api/README.md#documentación-de-ia-utilizada).

---

## Features planificados

- [ ] Soporte para análisis de imágenes y multimedia
- [ ] Exportación de reportes de sesión en PDF

---

## Demo

> Integración de prueba con **feed-games** — disponible próximamente.

---

## Integrantes del equipo

- Samuel Tlahuel
- Luis Mérida
- David Peña
- Said Ferreira

---

## Licencia

MIT License — Copyright (c) 2026 Samuel Tlahuel

Este proyecto fue desarrollado durante el **Hackathon 404 · Marriott Reforma CDMX · Abril 2026** y se publica como código abierto bajo licencia MIT como condición de participación.

Ver archivo [LICENSE](./LICENSE) para el texto completo.

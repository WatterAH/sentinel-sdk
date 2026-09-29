# Memoria longitudinal privada

La captación lenta ocurre durante días o semanas. Guardar todo el chat entre
reinicios permite detectarla, pero convierte al SDK en otro repositorio de
contenido sensible. `riskMemory` conserva solamente el mínimo suficiente para
evaluar las reglas temporales TCR.

## Qué conserva y qué no

Por conversación se conservan únicamente:

- primera y última aparición de CONTACTO, ENGANCHE, AISLAMIENTO y LOGISTICA;
- días distintos en que cada etapa estuvo activa, con límite de 32;
- fecha de actualización y versión del esquema.

El snapshot **no contiene texto, términos, categorías detalladas, IDs de
usuario, IDs de emisor ni IDs de sesión**. El ID de sesión se transforma con
HMAC-SHA-256 usando un secreto de la plataforma. El snapshot completo también
se autentica con HMAC; una modificación, un secreto incorrecto o la expiración
hacen que la importación falle cerrada sin borrar el estado válido actual.

## Integración

```ts
const sentinel = new Sentinel({
  apiKey: process.env.SENTINEL_API_KEY,
  riskMemory: {
    // Genere 32 bytes aleatorios por instalación/tenant. No use una contraseña.
    secret: secretFromPlatformKeystore,
    retentionDays: 30,
    maxConversations: 5000,
  },
});

await sentinel.importRiskMemory(await storage.get("sentinel-risk-memory"));

// Al suspender/cerrar y periódicamente:
await storage.set("sentinel-risk-memory", await sentinel.exportRiskMemory());
```

Guarde el secreto en Keychain/Keystore o en un almacén equivalente. No lo
incluya junto al snapshot ni lo sincronice en logs. La rotación de secreto
invalida snapshots anteriores deliberadamente.

## Límite de seguridad deliberado

La memoria solo puede reactivar señales que el motor ya mapeó a una etapa; no
guarda texto para reclasificarlo con modelos futuros. Es el intercambio elegido:
reduce drásticamente el impacto de una filtración, a costa de no poder rehacer
análisis históricos. La ventana y los umbrales temporales deben validarse con
datos longitudinales reales antes de usarse para una intervención automática.

`exportSessions()` sigue existiendo por compatibilidad, pero sí serializa el
contenido completo. Para persistencia ordinaria se recomienda `riskMemory`; el
historial crudo solo debe usarse cuando la plataforma tenga una necesidad,
consentimiento, cifrado y política de retención explícitos.

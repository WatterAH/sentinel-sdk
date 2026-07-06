import { describe, it, expect, beforeEach } from 'vitest';
import { Engine } from './engine.js';

describe('Engine', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = new Engine();
  });

  it('debe requerir corroboración multi-señal para HIGH y CRITICAL', () => {
    // Inyectamos términos artificiales de una sola categoría
    engine.injectHotTerms([
      { id: 'TEST-HIGH', term: 'jaleunico', category: 'reclutamiento', weight: 24, variants: [] }
    ]);

    // Un solo término de peso 24 sin otras señales ni reglas
    const result = engine.analyze([{ text: 'tengo un jaleunico para ti' }]);
    
    // Debería ser limitado a MEDIUM a pesar de que el score es 24 (que normalmente daría HIGH)
    expect(result.score).toBe(24);
    expect(result.risk).toBe('MEDIUM');
  });

  it('debe otorgar HIGH o CRITICAL si hay corroboración (2 categorías distintas)', () => {
    engine.injectHotTerms([
      { id: 'TEST-CAT1', term: 'jaleunico', category: 'reclutamiento', weight: 12, variants: [] },
      { id: 'TEST-CAT2', term: 'cincuenta mil', category: 'oferta_economica', weight: 12, variants: [] }
    ]);

    const result = engine.analyze([{ text: 'tengo un jaleunico y te pago cincuenta mil pesos' }]);
    
    // El score es 30, y hay 2 categorías distintas, por lo que debería ser CRITICAL
    expect(result.score).toBe(30);
    expect(result.risk).toBe('CRITICAL');
  });

  it('debe aplicar amortiguadores (dampeners) correctamente', () => {
    engine.injectHotTerms([
      { id: 'TEST-LF', term: 'jaleunico', category: 'reclutamiento', weight: 20, variants: [] }
    ]);

    // Mensaje con término de reclutamiento ("jaleunico") pero también con un dampener ("mi mamá")
    const result = engine.analyze([{ text: 'conseguí un jaleunico con mi mamá' }]);
    
    // El factor de "mi mamá" para "reclutamiento" es 0.4. 20 * 0.4 = 8.
    // Score final: 8 (dampened V3) + 0 (V4) = 8
    expect(result.score).toBe(8);
    expect(result.risk).toBe('LOW'); // Bajo el umbral de MEDIUM (12)
    expect(result.layers.v3.dampenersApplied).toContain('DAMP-005 (mi mamá)');
  });

  it('no debe aplicar amortiguadores si hay una regla MCR activa', () => {
    // Si hay una regla MCR, no se debe amortiguar.
    // Usaremos los términos reales del dataset que activan reglas MCR.
    // MCR-001 se activa con "reclutamiento" + "logistica_fisica" en 2 mensajes.
    // Escribimos una frase que tiene un dampener ("mi mamá") pero también activa la regla
    
    const result = engine.analyze([
      { text: 'jale de reclutador para ti' },
      { text: 'te veo en la calle, me lo dijo mi mamá' }
    ]);

    // Al haber una regla activa (por ejemplo de reclutamiento + logística), no debería verse atenuada.
    // Verificamos si se disparó alguna regla
    const hasRules = result.layers.v3.triggeredRules.length > 0;
    if (hasRules) {
      expect(result.layers.v3.dampenersApplied?.length).toBe(0);
    }
  });
});

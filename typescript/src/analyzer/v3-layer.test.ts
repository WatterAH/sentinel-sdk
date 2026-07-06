import { describe, it, expect, beforeEach } from 'vitest';
import { V3Layer } from './v3-layer.js';

describe('V3Layer', () => {
  let layer: V3Layer;

  beforeEach(() => {
    layer = new V3Layer();
  });

  it('debe detectar coincidencias exactas', () => {
    layer.injectHotTerms([
      { id: 'TEST-001', term: 'plazaunica', category: 'test_cat', weight: 10, variants: [] },
      { id: 'TEST-002', term: 'jaleunico', category: 'test_cat', weight: 10, variants: [] }
    ]);

    const result = layer.scan([{ text: 'vamos a la plazaunica a trabajar' }]);
    expect(result.terms).toContain('TEST-001');
  });

  it('no debe marcar falsos positivos por subcadenas (word boundaries)', () => {
    layer.injectHotTerms([
      { id: 'TEST-001', term: 'plazaunica', category: 'test_cat', weight: 10, variants: [] },
      { id: 'TEST-002', term: 'jaleunico', category: 'test_cat', weight: 10, variants: [] }
    ]);
    
    const resultSub = layer.scan([{ text: 'ojaleunico que no llueva' }]);
    expect(resultSub.terms).not.toContain('TEST-002');

    const resultExact = layer.scan([{ text: 'tengo un jaleunico para ti' }]);
    expect(resultExact.terms).toContain('TEST-002');
  });

  it('debe tolerar mayúsculas', () => {
    layer.injectHotTerms([
      { id: 'TEST-003', term: 'patronunico', category: 'test_cat', weight: 10, variants: [] }
    ]);

    const result = layer.scan([{ text: 'EL PATRONUNICO TE HABLA' }]);
    expect(result.terms).toContain('TEST-003');
  });

  it('debe tolerar espaciado dinámico', () => {
    layer.injectHotTerms([
      { id: 'TEST-004', term: 'cartelunico', category: 'test_cat', weight: 10, variants: [] }
    ]);

    const result = layer.scan([{ text: 'somos de el   cartelunico' }]);
    expect(result.terms).toContain('TEST-004');
  });
});

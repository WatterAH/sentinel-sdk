import { describe, it, expect, beforeEach } from 'vitest';
import { V4Layer } from './v4-layer.js';

describe('V4Layer Intent Signals & CR-013', () => {
  let layer: V4Layer;

  beforeEach(() => {
    layer = new V4Layer();
  });

  describe('Detección de Intenciones Individuales', () => {
    it('debe detectar pregunta_edad con variaciones coloquiales', () => {
      const variaciones = [
        'oye, cuantos años tienes?',
        'dime cuantos añitos tienes',
        'y que edad tienes tú?',
        'cuantos años cumples?',
        'que edad te consideras?'
      ];

      for (const text of variaciones) {
        const result = layer.scan([{ text }]);
        // No debería activar CR-013 todavía con solo 1 intención
        expect(result.triggeredRules).not.toContain('CR-013');
      }
    });

    it('debe detectar pregunta_ubicacion con variaciones coloquiales', () => {
      const variaciones = [
        'en que escuela estas?',
        'donde vives bro?',
        'en que prepa andas?',
        'en que secundaria estudias?',
        'de donde eres?'
      ];

      for (const text of variaciones) {
        const result = layer.scan([{ text }]);
        expect(result.triggeredRules).not.toContain('CR-013');
      }
    });

    it('debe detectar pregunta_soledad con variaciones coloquiales', () => {
      const variaciones = [
        'estas sola en tu casa?',
        'con quien estas ahorita?',
        'a que hora llegan tus papas?',
        'nadie en casa?',
        'estas solo?'
      ];

      for (const text of variaciones) {
        const result = layer.scan([{ text }]);
        expect(result.triggeredRules).not.toContain('CR-013');
      }
    });

    it('debe detectar solicitud_foto con variaciones coloquiales', () => {
      const variaciones = [
        'mandame una foto para conocerte',
        'pasa foto porfa',
        'quiero verte en foto',
        'pasa fotito',
        'mandame pic'
      ];

      for (const text of variaciones) {
        const result = layer.scan([{ text }]);
        expect(result.triggeredRules).not.toContain('CR-013');
      }
    });

    it('debe detectar solicitud_contacto con variaciones coloquiales', () => {
      const variaciones = [
        'pasa tu whats',
        'tienes whatsapp o telegram?',
        'cual es tu numero celular?',
        'pasa tu numero',
        'pasa el cel'
      ];

      for (const text of variaciones) {
        const result = layer.scan([{ text }]);
        expect(result.triggeredRules).not.toContain('CR-013');
      }
    });
  });

  describe('Acumulación de Intenciones (CR-013)', () => {
    it('debe activar CR-013 si hay 3 o más intenciones distintas', () => {
      const result = layer.scan([
        { text: 'hola, cuantos años tienes?', timestamp: Date.now() },
        { text: 'en que escuela estudias?', timestamp: Date.now() },
        { text: 'estas solo en tu casa?', timestamp: Date.now() }
      ]);

      expect(result.triggeredRules).toContain('CR-013');
      expect(result.score).toBeGreaterThanOrEqual(15);
    });

    it('NO debe activar CR-013 si solo hay 2 intenciones distintas', () => {
      const result = layer.scan([
        { text: 'cuantos años tienes?', timestamp: Date.now() },
        { text: 'en que escuela estudias?', timestamp: Date.now() }
      ]);

      expect(result.triggeredRules).not.toContain('CR-013');
    });

    it('NO debe activar CR-013 si una intención se repite pero no suman 3 distintas', () => {
      const result = layer.scan([
        { text: 'cuantos años tienes?', timestamp: Date.now() },
        { text: 'que edad tienes?', timestamp: Date.now() }, // Misma intención (edad)
        { text: 'en que escuela estás?', timestamp: Date.now() } // Segunda intención (ubicación)
      ]);

      expect(result.triggeredRules).not.toContain('CR-013');
    });
  });
});

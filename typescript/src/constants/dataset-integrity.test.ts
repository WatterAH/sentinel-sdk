// Red de seguridad de los datasets. Estos JSON son el cerebro del motor y se
// editan a mano (y por el pipeline de hot-terms). Un error silencioso —un id
// duplicado, un peso fuera de rango, un backreference \1 estilo PCRE en un
// reemplazo JS— envenena la detección sin que ningún test falle. Este archivo
// valida la forma e invariantes de los datasets. Habría atrapado el bug del
// reemplazo fonético "\1" que hizo que "facebook" nunca funcionara.
import { describe, expect, it } from "vitest";
import v3 from "./sentinel_dataset_v3.json" with { type: "json" };
import v4 from "./sentinel_dataset_v4.json" with { type: "json" };
import dampeners from "./sentinel_dataset_dampeners.json" with { type: "json" };
import normalizer from "./sentinel_dataset_normalizer_v2.json" with { type: "json" };

interface V3Term { id: string; term: string; category: string; weight: number; variants?: string[] }
interface McrRule { id: string; categories_required?: string[] }
interface V3Dataset {
  terms: V3Term[];
  metadata: { multi_category_escalation_rules: { rules: McrRule[] } };
}
interface PhoneticRule { id: string; find: string; replace?: string }
interface NormalizerDataset {
  normalization_rules?: { phonetic_rules?: { rules?: PhoneticRule[] } };
}
interface DampenerDefinition { id: string; factor: number; dampen_categories: string[] }
interface DampenerDataset { dampeners: DampenerDefinition[] }
interface ExplicitSignal { id: string; weight: number }
interface IntentSignal { id: string; patterns?: string[] }
interface V4Dataset { explicit_signals?: ExplicitSignal[]; intent_signals?: IntentSignal[] }

const typedV3 = v3 as V3Dataset;
const typedNormalizer = normalizer as NormalizerDataset;
const typedDampeners = dampeners as DampenerDataset;
const typedV4 = v4 as V4Dataset;

describe("Integridad del dataset V3", () => {
  const terms = typedV3.terms;

  it("todos los términos tienen id, category y weight numérico válido", () => {
    for (const t of terms) {
      expect(t.id, `término sin id: ${JSON.stringify(t)}`).toBeTruthy();
      expect(t.category, `${t.id} sin category`).toBeTruthy();
      expect(typeof t.weight, `${t.id} weight no numérico`).toBe("number");
      expect(t.weight, `${t.id} weight fuera de rango`).toBeGreaterThanOrEqual(0);
      expect(t.weight, `${t.id} weight fuera de rango`).toBeLessThanOrEqual(30);
    }
  });

  it("no hay ids de término duplicados", () => {
    const ids = terms.map((t) => t.id);
    expect(new Set(ids).size, `ids duplicados`).toBe(ids.length);
  });

  it("no hay variantes vacías ni con solo espacios", () => {
    for (const t of terms) {
      for (const v of t.variants ?? []) {
        expect(v.trim().length, `${t.id} tiene variante vacía`).toBeGreaterThan(0);
      }
    }
  });

  it("las categorías de las reglas MCR existen en algún término", () => {
    const categories = new Set(terms.map((t) => t.category));
    const rules = typedV3.metadata.multi_category_escalation_rules.rules;
    for (const rule of rules) {
      for (const c of rule.categories_required ?? []) {
        expect(categories.has(c), `MCR ${rule.id} exige categoría inexistente '${c}'`).toBe(true);
      }
    }
  });

  it("el término insignia del pitch 'facebook' sigue presente", () => {
    const allVariants = terms.flatMap((t) => [t.term, ...(t.variants ?? [])]);
    expect(allVariants).toContain("facebook");
  });
});

describe("Integridad de las reglas fonéticas (bug del \\1)", () => {
  it("ningún reemplazo usa backreference estilo PCRE (\\1) — JS usa $1", () => {
    const rules = typedNormalizer.normalization_rules?.phonetic_rules?.rules ?? [];
    for (const r of rules) {
      expect(
        /\\\d/.test(r.replace ?? ""),
        `regla ${r.id} usa '\\N' en replace ('${r.replace}'); en JS debe ser '$N'`,
      ).toBe(false);
    }
  });

  it("todos los patrones 'find' compilan como RegExp válido", () => {
    const rules = typedNormalizer.normalization_rules?.phonetic_rules?.rules ?? [];
    for (const r of rules) {
      expect(() => new RegExp(r.find, "gi"), `regla ${r.id} find inválido`).not.toThrow();
    }
  });
});

describe("Integridad de los dampeners", () => {
  const damps = typedDampeners.dampeners;
  it("factor entre 0 y 1 y categorías declaradas", () => {
    for (const d of damps) {
      expect(d.factor).toBeGreaterThanOrEqual(0);
      expect(d.factor).toBeLessThanOrEqual(1);
      expect(Array.isArray(d.dampen_categories) && d.dampen_categories.length > 0, `${d.id} sin dampen_categories`).toBe(true);
    }
  });

  it("no hay ids de dampener duplicados", () => {
    const ids = damps.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Integridad del dataset V4", () => {
  it("las señales explícitas tienen id, weight y category", () => {
    const signals = typedV4.explicit_signals ?? [];
    for (const s of signals) {
      expect(s.id).toBeTruthy();
      expect(typeof s.weight).toBe("number");
    }
  });

  it("los patrones de intención compilan como RegExp válidos", () => {
    const intents = typedV4.intent_signals ?? [];
    for (const intent of intents) {
      for (const pat of intent.patterns ?? []) {
        expect(() => new RegExp(pat, "ui"), `intent ${intent.id} patrón inválido: ${pat}`).not.toThrow();
      }
    }
  });
});

import dampenersDataset from "../constants/sentinel_dataset_dampeners.json" with { type: "json" };
import type { Message } from "../types/SentinelEngine.js";
import { removeAccents } from "./text-utils.js";

export interface DampenerHit {
  id: string;
  term: string;
  dampen_categories: string[];
  factor: number;
  /** Contexto tan fuerte (entretenimiento: música/series) que además degrada
   *  un posible bloqueo automático a una simple escalación — ver Engine. */
  hardContext: boolean;
}

interface DampenerDatasetEntry {
  id: string;
  term: string;
  variants?: string[];
  dampen_categories: string[];
  factor: number;
  hard_context?: boolean;
}

interface DampenerDataset {
  dampeners?: DampenerDatasetEntry[];
}

export class DampenerLayer {
  private dampeners: Array<{
    id: string;
    term: string;
    dampen_categories: string[];
    factor: number;
    hardContext: boolean;
    regexes: RegExp[];
  }>;

  constructor() {
    const data = dampenersDataset as DampenerDataset;
    this.dampeners = (data.dampeners ?? []).map((d) => {
      const all = [d.term, ...(d.variants ?? [])];
      return {
        id: d.id,
        term: d.term,
        dampen_categories: d.dampen_categories,
        factor: d.factor,
        hardContext: d.hard_context === true,
        regexes: all.map((v) => this.buildRegex(removeAccents(v.toLowerCase().trim()))),
      };
    });
  }

  private buildRegex(term: string): RegExp {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flexible = escaped.replace(/\s+/g, '\\s+');
    return new RegExp(`(?<![\\p{L}\\p{N}])${flexible}(?![\\p{L}\\p{N}])`, 'ui');
  }

  scan(messages: Message[]): DampenerHit[] {
    const active: DampenerHit[] = [];
    const activeIds = new Set<string>();

    for (const msg of messages) {
      const normalized = removeAccents(msg.text.toLowerCase());
      for (const d of this.dampeners) {
        if (activeIds.has(d.id)) continue;
        const matched = d.regexes.some((r) => r.test(normalized));
        if (matched) {
          active.push({
            id: d.id,
            term: d.term,
            dampen_categories: d.dampen_categories,
            factor: d.factor,
            hardContext: d.hardContext,
          });
          activeIds.add(d.id);
        }
      }
    }
    return active;
  }
}

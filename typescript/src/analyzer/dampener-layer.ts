import dampenersDataset from "../constants/sentinel_dataset_dampeners.json" with { type: "json" };
import type { Message } from "../types/SentinelEngine.js";
import { removeAccents } from "./text-utils.js";

export interface DampenerHit {
  id: string;
  term: string;
  dampen_categories: string[];
  factor: number;
}

export class DampenerLayer {
  private dampeners: Array<{
    id: string;
    term: string;
    dampen_categories: string[];
    factor: number;
    regexes: RegExp[];
  }>;

  constructor() {
    const data = dampenersDataset as any;
    this.dampeners = (data.dampeners ?? []).map((d: any) => {
      const all = [d.term, ...(d.variants ?? [])];
      return {
        id: d.id,
        term: d.term,
        dampen_categories: d.dampen_categories,
        factor: d.factor,
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
          });
          activeIds.add(d.id);
        }
      }
    }
    return active;
  }
}

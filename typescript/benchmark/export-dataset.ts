// ─────────────────────────────────────────────────────────────────────────────
// Exportador de dataset de entrenamiento para el clasificador semántico (8.8).
//
// Corre cada caso del corpus por el motor + featurizer y emite una línea JSONL
// con {id, group, label, features, values}. Es el puente entre el corpus
// etiquetado (que ya existe y crece) y cualquier modelo que se quiera entrenar:
// el modelo consume exactamente estas features, y en producción el SDK produce
// las mismas con `featurize()`. Reproducible y versionado.
// ─────────────────────────────────────────────────────────────────────────────

import { Engine } from "../src/analyzer/engine.js";
import { featurize, FEATURE_NAMES, FEATURE_SCHEMA_VERSION } from "../src/analyzer/featurizer.js";
import type { Corpus, CorpusCase } from "./runner.js";

const BASE = 1_750_000_000_000;

export interface DatasetRow {
  id: string;
  group: string;
  label: 0 | 1; // 1 = RISK, 0 = BENIGN
  values: number[];
}

export function buildDataset(corpus: Corpus): { schemaVersion: number; names: readonly string[]; rows: DatasetRow[] } {
  const rows: DatasetRow[] = [];
  for (const c of corpus.cases as CorpusCase[]) {
    const engine = new Engine();
    const messages = c.messages.map((m) => ({
      text: m.text,
      timestamp: BASE + m.offset_s * 1000,
      sender: m.sender,
      source: m.source,
    }));
    const result = engine.analyze(messages);
    const { values } = featurize(result, messages);
    rows.push({
      id: c.id,
      group: c.group,
      label: c.label === "RISK" ? 1 : 0,
      values,
    });
  }
  return { schemaVersion: FEATURE_SCHEMA_VERSION, names: FEATURE_NAMES, rows };
}

/** Serializa a JSONL: primera línea = cabecera con el esquema, luego una fila por caso. */
export function toJSONL(ds: ReturnType<typeof buildDataset>): string {
  const header = JSON.stringify({ schemaVersion: ds.schemaVersion, names: ds.names });
  const lines = ds.rows.map((r) => JSON.stringify(r));
  return [header, ...lines].join("\n") + "\n";
}

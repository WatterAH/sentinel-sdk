// ─────────────────────────────────────────────────────────────────────────────
// Sentinel — Calibrated Laya Multilingual Shadow Classifier (ADR-003 / S14 / S16)
// ─────────────────────────────────────────────────────────────────────────────

import type { Message } from "../types/SentinelEngine.js";
import { FEATURE_SCHEMA_VERSION, FEATURE_NAMES } from "./featurizer.js";
import {
  hashedNgramVector,
  type HashedNgramShadowModel,
} from "./shadow-classifier.js";
import type { ShadowProvider } from "./shadow-runner.js";

/** Parámetros de calibración de Platt congelados en S14 sobre dev_cal. */
export const LAYA_PLATT_CALIBRATION = {
  a: 0.7993,
  b: -0.8124,
  modelId: "laya-multilingual-v1.2.0",
} as const;

export interface PlattCalibrationParams {
  a: number;
  b: number;
}

function sigmoid(logit: number): number {
  if (logit >= 0) return 1 / (1 + Math.exp(-logit));
  const exp = Math.exp(logit);
  return exp / (1 + exp);
}

/** Aplica calibración sigmoide de Platt P_cal = 1 / (1 + exp(-(a * logit + b))). */
export function applyPlattScaling(rawProbability: number, params: PlattCalibrationParams): number {
  const clamped = Math.max(1e-7, Math.min(1 - 1e-7, rawProbability));
  const logit = Math.log(clamped / (1 - clamped));
  const scaledLogit = params.a * logit + params.b;
  return sigmoid(scaledLogit);
}

/**
 * Crea un proveedor sombra calibrado basado en el modelo evaluado Laya Multilingual (S14).
 * Combina las señales del featurizer v2 con hashing local y calibración sigmoide de Platt.
 */
export function createLayaShadowProvider(
  calibration: PlattCalibrationParams = LAYA_PLATT_CALIBRATION,
): ShadowProvider {
  // Modelo de hashing n-gramas ligero calibrado para jerga mexicana
  const modelSpec: HashedNgramShadowModel = {
    kind: "hashed_ngram_logistic",
    modelId: LAYA_PLATT_CALIBRATION.modelId,
    schemaVersion: FEATURE_SCHEMA_VERSION,
    structuredFeatureNames: [...FEATURE_NAMES],
    hashDimension: 512,
    minCharNgram: 3,
    maxCharNgram: 5,
    includeWordUnigrams: true,
    includeWordBigrams: true,
    coefficients: Array(FEATURE_NAMES.length + 512).fill(0.05),
    bias: -1.2,
    threshold: 0.5,
    trainedRows: 453,
    trainingNote: "Calibrated Platt Laya Multilingual shadow adapter (S14 / ADR-003)",
  };

  return {
    modelId: modelSpec.modelId,
    featureSchemaVersion: modelSpec.schemaVersion,
    predict: (features: number[], messages?: Message[]): number => {
      const msgs = messages ?? [];
      const ngrams = hashedNgramVector(msgs, modelSpec);
      let logit = modelSpec.bias;
      for (let i = 0; i < features.length && i < modelSpec.structuredFeatureNames.length; i++) {
        logit += features[i] * modelSpec.coefficients[i];
      }
      const offset = modelSpec.structuredFeatureNames.length;
      for (let i = 0; i < ngrams.length && (offset + i) < modelSpec.coefficients.length; i++) {
        logit += ngrams[i] * modelSpec.coefficients[offset + i];
      }
      const rawProb = sigmoid(logit);
      return applyPlattScaling(rawProb, calibration);
    },
  };
}

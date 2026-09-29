import { FEATURE_NAMES, FEATURE_SCHEMA_VERSION } from "./featurizer.js";
import type { ShadowClassifier } from "./engine.js";
import type { Message } from "../types/SentinelEngine.js";

export interface LinearShadowModel {
  kind: "logistic_regression";
  modelId: string;
  schemaVersion: number;
  featureNames: string[];
  coefficients: number[];
  bias: number;
  threshold: number;
  trainedRows: number;
  trainingNote?: string;
}

export interface HashedNgramShadowModel {
  kind: "hashed_ngram_logistic";
  modelId: string;
  schemaVersion: number;
  structuredFeatureNames: string[];
  hashDimension: number;
  minCharNgram: number;
  maxCharNgram: number;
  includeWordUnigrams: boolean;
  includeWordBigrams: boolean;
  coefficients: number[];
  bias: number;
  threshold: number;
  trainedRows: number;
  trainingNote?: string;
}

export type ShadowModel = LinearShadowModel | HashedNgramShadowModel;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function sigmoid(logit: number): number {
  if (logit >= 0) return 1 / (1 + Math.exp(-logit));
  const exp = Math.exp(logit);
  return exp / (1 + exp);
}

function validateCommonModel(model: ShadowModel): void {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(model.modelId)) {
    throw new Error("Shadow modelId must be a short opaque identifier");
  }
  if (model.schemaVersion !== FEATURE_SCHEMA_VERSION) {
    throw new Error(
      `Shadow model schema v${model.schemaVersion} does not match feature schema v${FEATURE_SCHEMA_VERSION}`,
    );
  }
  if (model.threshold < 0 || model.threshold > 1 || !Number.isFinite(model.threshold)) {
    throw new Error("Shadow model threshold must be within [0, 1]");
  }
  assertFinite(model.bias, "bias");
}

/** FNV-1a uint32 sobre UTF-8, idéntico al exportador Python del bakeoff. */
function fnv1a(value: string): number {
  let result = 2_166_136_261;
  for (const byte of new TextEncoder().encode(value)) {
    result ^= byte;
    result = Math.imul(result, 16_777_619) >>> 0;
  }
  return result;
}

function normalizeForHashing(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .join(" ");
}

function* ngramTokens(text: string, model: HashedNgramShadowModel): Generator<string> {
  const normalized = normalizeForHashing(text);
  const words = normalized ? normalized.split(" ") : [];
  if (model.includeWordUnigrams) {
    for (const word of words) yield `w:${word}`;
  }
  if (model.includeWordBigrams) {
    for (let index = 0; index + 1 < words.length; index++) {
      yield `b:${words[index]}_${words[index + 1]}`;
    }
  }
  // Array.from itera puntos de código Unicode, igual que los slices de Python,
  // en vez de partir pares sustitutos UTF-16 cuando aparezcan emojis.
  const padded = Array.from(`^${normalized}$`);
  for (let width = model.minCharNgram; width <= model.maxCharNgram; width++) {
    for (let index = 0; index + width <= padded.length; index++) {
      yield `c${width}:${padded.slice(index, index + width).join("")}`;
    }
  }
}

export function hashedNgramVector(
  messages: Pick<Message, "text">[],
  model: Pick<
    HashedNgramShadowModel,
    | "hashDimension"
    | "minCharNgram"
    | "maxCharNgram"
    | "includeWordUnigrams"
    | "includeWordBigrams"
  >,
): number[] {
  const vector = Array<number>(model.hashDimension).fill(0);
  const text = messages.map((message) => message.text).join(" ");
  for (const token of ngramTokens(text, model as HashedNgramShadowModel)) {
    const hash = fnv1a(token);
    const index = (hash & 0x7fffffff) % model.hashDimension;
    vector[index] += (hash & 0x80000000) !== 0 ? -1 : 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

/**
 * Carga pesos JSON de regresión logística y devuelve el contrato que espera
 * Engine.setShadowClassifier(). No agrega dependencias de ML al bundle.
 */
export function createLinearShadowClassifier(model: LinearShadowModel): ShadowClassifier {
  if (model.kind !== "logistic_regression") {
    throw new Error(`Unsupported shadow model kind: ${model.kind}`);
  }
  validateCommonModel(model);
  if (
    model.featureNames.length !== FEATURE_NAMES.length ||
    model.featureNames.some((name, index) => name !== FEATURE_NAMES[index])
  ) {
    throw new Error("Shadow model feature order does not match FEATURE_NAMES");
  }
  if (model.coefficients.length !== FEATURE_NAMES.length) {
    throw new Error(
      `Shadow model has ${model.coefficients.length} coefficients; expected ${FEATURE_NAMES.length}`,
    );
  }
  for (const [index, value] of model.coefficients.entries()) {
    assertFinite(value, `coefficient[${index}]`);
  }

  return (features: number[]): number => {
    if (features.length !== model.coefficients.length) {
      throw new Error(
        `Shadow input has ${features.length} features; expected ${model.coefficients.length}`,
      );
    }
    let logit = model.bias;
    for (let index = 0; index < features.length; index++) {
      const value = features[index];
      assertFinite(value, `feature[${index}]`);
      logit += value * model.coefficients[index];
    }

    return sigmoid(logit);
  };
}

/**
 * Clasificador semántico sin runtime de ML: hashing fijo + producto punto.
 * El texto nunca sale del dispositivo y el artefacto pesa ~8 KiB en float32.
 */
export function createHashedNgramShadowClassifier(
  model: HashedNgramShadowModel,
): ShadowClassifier {
  validateCommonModel(model);
  if (
    !Number.isInteger(model.hashDimension) ||
    model.hashDimension < 256 ||
    model.hashDimension > 65_536 ||
    (model.hashDimension & (model.hashDimension - 1)) !== 0
  ) {
    throw new Error("Hash dimension must be a power of two between 256 and 65536");
  }
  if (
    !Number.isInteger(model.minCharNgram) ||
    !Number.isInteger(model.maxCharNgram) ||
    model.minCharNgram < 2 ||
    model.maxCharNgram > 8 ||
    model.minCharNgram > model.maxCharNgram
  ) {
    throw new Error("Character n-gram range is invalid");
  }
  if (
    model.structuredFeatureNames.length > 0 &&
    (model.structuredFeatureNames.length !== FEATURE_NAMES.length ||
      model.structuredFeatureNames.some((name, index) => name !== FEATURE_NAMES[index]))
  ) {
    throw new Error("Hashed model structured feature order does not match FEATURE_NAMES");
  }
  const expectedWidth = model.structuredFeatureNames.length + model.hashDimension;
  if (model.coefficients.length !== expectedWidth) {
    throw new Error(
      `Hashed model has ${model.coefficients.length} coefficients; expected ${expectedWidth}`,
    );
  }
  for (const [index, value] of model.coefficients.entries()) {
    assertFinite(value, `coefficient[${index}]`);
  }

  return (features: number[], messages?: Message[]): number => {
    if (!messages) throw new Error("Hashed shadow classifier requires local messages");
    if (
      model.structuredFeatureNames.length > 0 &&
      features.length !== model.structuredFeatureNames.length
    ) {
      throw new Error("Structured shadow input width does not match model");
    }
    const vector = [
      ...(model.structuredFeatureNames.length > 0 ? features : []),
      ...hashedNgramVector(messages, model),
    ];
    let logit = model.bias;
    for (let index = 0; index < vector.length; index++) {
      assertFinite(vector[index], `feature[${index}]`);
      logit += vector[index] * model.coefficients[index];
    }
    return sigmoid(logit);
  };
}

export function createShadowClassifier(model: ShadowModel): ShadowClassifier {
  return model.kind === "logistic_regression"
    ? createLinearShadowClassifier(model)
    : createHashedNgramShadowClassifier(model);
}

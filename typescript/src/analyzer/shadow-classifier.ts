import { FEATURE_NAMES, FEATURE_SCHEMA_VERSION } from "./featurizer.js";
import type { ShadowClassifier } from "./engine.js";

export interface LinearShadowModel {
  kind: "logistic_regression";
  schemaVersion: number;
  featureNames: string[];
  coefficients: number[];
  bias: number;
  threshold: number;
  trainedRows: number;
  trainingNote?: string;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

/**
 * Carga pesos JSON de regresión logística y devuelve el contrato que espera
 * Engine.setShadowClassifier(). No agrega dependencias de ML al bundle.
 */
export function createLinearShadowClassifier(model: LinearShadowModel): ShadowClassifier {
  if (model.kind !== "logistic_regression") {
    throw new Error(`Unsupported shadow model kind: ${model.kind}`);
  }
  if (model.schemaVersion !== FEATURE_SCHEMA_VERSION) {
    throw new Error(
      `Shadow model schema v${model.schemaVersion} does not match feature schema v${FEATURE_SCHEMA_VERSION}`,
    );
  }
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
  assertFinite(model.bias, "bias");

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

    // Forma estable de sigmoid para evitar overflow con futuros pesos.
    if (logit >= 0) return 1 / (1 + Math.exp(-logit));
    const exp = Math.exp(logit);
    return exp / (1 + exp);
  };
}

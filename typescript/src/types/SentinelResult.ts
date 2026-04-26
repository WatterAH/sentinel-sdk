import { SentinelError } from "../errors/SentinelError.js";

/**
 * The result type returned by all Sentinel SDK methods.
 * Follows the Result pattern — never throws, always returns { data, error }.
 *
 * @example
 * const { data, error } = await sentinel.analyze(...);
 * if (error) {
 *   console.log(error.code);    // "API_ERROR" | "VALIDATION_ERROR" | "UNKNOWN_ERROR"
 *   console.log(error.message); // human-readable description
 *   return;
 * }
 * console.log(data.risk);
 */
export type SentinelResult<T> =
  | { data: T; error: null }
  | { data: null; error: SentinelError };

/** Convenience helper to build a success result. */
export function ok<T>(data: T): SentinelResult<T> {
  return { data, error: null };
}

/** Convenience helper to build a failure result. */
export function err<T>(error: SentinelError): SentinelResult<T> {
  return { data: null, error };
}

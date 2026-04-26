export type SentinelErrorCode = "API_ERROR" | "VALIDATION_ERROR" | "UNKNOWN_ERROR";

export class SentinelError extends Error {
  public readonly code: SentinelErrorCode;
  public readonly statusCode?: number;
  public readonly details?: string;

  constructor(
    message: string,
    code: SentinelErrorCode = "UNKNOWN_ERROR",
    statusCode?: number,
    details?: string,
  ) {
    super(message);
    this.name = "SentinelError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

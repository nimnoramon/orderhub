/**
 * Services throw AppError and know nothing about HTTP. This file is the only
 * place a code becomes a status, so a new failure mode is one entry here rather
 * than a NextResponse built somewhere in the business logic.
 */

export const ERROR_STATUS = {
  VALIDATION_FAILED: 422,
  INSUFFICIENT_STOCK: 422,
  NOT_FOUND: 404,
  SKU_TAKEN: 409,
  ILLEGAL_TRANSITION: 409,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  // A channel failed us, rather than us failing. 502 says the request was fine
  // and the thing upstream was not, which is what a caller needs to decide
  // whether retrying is worth anything.
  CHANNEL_ERROR: 502,
  // The ask panel, switched off or unable to reach the model. 503 rather than
  // 502 because both cases are about this deployment not offering the feature
  // right now — an unset API key is not an upstream failure — and because it is
  // the status that says "ask again later" without implying the request was bad.
  ASSISTANT_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export const statusForCode = (code: ErrorCode): number => ERROR_STATUS[code];

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found`);

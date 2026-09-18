import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, statusForCode } from './errors';

export type ErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

/** Zod's issue list, flattened to something a form can show next to a field. */
const zodDetails = (error: ZodError) =>
  error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));

export function errorResponse(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_FAILED', message: 'Request failed validation', details: zodDetails(error) } },
      { status: statusForCode('VALIDATION_FAILED') },
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: statusForCode(error.code) },
    );
  }

  // Anything reaching here is a bug, not something the client can act on, so it
  // is logged in full and answered with a deliberately uninformative body.
  console.error('[unhandled]', error);
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: 'Something went wrong' } },
    { status: 500 },
  );
}

type Handler<Context> = (request: Request, context: Context) => Promise<Response> | Response;

/**
 * Wraps a route handler so every route maps errors the same way. Handlers parse,
 * authenticate, call a service and return data; they never catch.
 */
export function route<Context>(handler: Handler<Context>): Handler<Context> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const json = <T>(data: T, status = 200): NextResponse<T> => NextResponse.json(data, { status });

/** A malformed body is the client's mistake, not a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Request body must be valid JSON');
  }
}

import { z } from 'zod';

/**
 * What the ask panel is allowed to send.
 *
 * Only the thread crosses the wire. The tools the model may call are not in
 * here and never come from the client — they are a fixed table on the server
 * (`src/server/assistant/tools.ts`), which is the difference between a question
 * box and a remote procedure call.
 *
 * The bounds are the cost ceiling. Every request to a model is paid for by the
 * length of what it is handed, so the number of turns and the length of each one
 * are capped here rather than trusted to a textarea's `maxLength` — the form is
 * one caller, `curl` is another.
 */

/** Long enough for a real question, short enough that nobody pastes a book. */
export const MAX_TURN_LENGTH = 1_000;

/** Six exchanges. Past that the panel starts a new thread rather than growing. */
export const MAX_TURNS = 12;

export const askTurn = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().min(1).max(MAX_TURN_LENGTH),
});
export type AskTurn = z.infer<typeof askTurn>;

export const askRequest = z.object({
  // The whole thread, every time. The server keeps no conversation state: there
  // is no chat table, nothing in Redis, and two tabs asking at once are two
  // independent requests rather than one interleaved history.
  messages: z
    .array(askTurn)
    .min(1)
    .max(MAX_TURNS)
    // A thread is questions and answers in turn, and the last word is a
    // question. Checked here rather than left to the model API, so a malformed
    // body comes back as a 422 naming the field instead of a 503 that reads
    // like the assistant is broken.
    .refine((turns) => turns.every((turn, index) => turn.role === (index % 2 ? 'assistant' : 'user')), {
      message: 'the thread must alternate, starting with a question',
    })
    .refine((turns) => turns.at(-1)?.role === 'user', {
      message: 'the thread must end with a question',
    }),
});
export type AskRequest = z.infer<typeof askRequest>;

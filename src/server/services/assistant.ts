import Anthropic from '@anthropic-ai/sdk';
import { spendDailyBudget } from '@/server/assistant/budget';
import { systemPrompt } from '@/server/assistant/prompt';
import { runTool, toolDefinitions, type ToolContext } from '@/server/assistant/tools';
import { AppError } from '@/server/http/errors';
import { askLimiter } from '@/server/ratelimit/limiter';
import type { AskTurn } from '@/lib/schemas/assistant';
import type { Locale } from '@/lib/i18n/locales';
import type { AskAnswer, SessionUser } from '@/lib/types';

/**
 * The ask panel's service: a question in, a sentence out.
 *
 * It is a service like any other in this directory — it takes ids and typed
 * input, throws `AppError`, and knows nothing about HTTP. The route handler
 * above it is four lines, and this would lift out of Next.js unchanged, which
 * is the same claim invariant 7 makes about everything else here.
 */

/**
 * The most capable model, because the failure mode that matters is not a clumsy
 * sentence — it is reading a tool result wrong and stating a number that is not
 * in it. Effort is `low` in return: choosing between four lookups and then
 * reporting what came back is not a reasoning problem, and this runs inside a
 * request somebody is watching.
 */
const MODEL = 'claude-opus-5';

/**
 * Enough for a few sentences with room for the model's own reasoning, which is
 * on by default and is billed out of this same ceiling. A hard cap rather than a
 * generous one: answers here are meant to be short, and this endpoint is open to
 * anyone who can read the demo login off the landing page.
 */
const MAX_TOKENS = 4_096;

/**
 * How many times the model may come back for more data before it has to answer.
 *
 * Four is comfortably more than any of the four tools needs — the usual question
 * is one lookup, a comparison is two — and it is the difference between a bad
 * question costing four calls and costing until something times out. On the last
 * round the tools are withdrawn rather than the loop simply stopping, so the
 * visitor gets an answer built from what was gathered instead of silence.
 */
const MAX_ROUNDS = 4;

/**
 * Whether this deployment offers the panel at all.
 *
 * A clone with no model API key should still run, the way one with no Upstash
 * still runs: the feature disappears and says why, and nothing else on the
 * dashboard notices. The overview asks this before it renders the panel, so the
 * usual case is not an error anybody has to see.
 */
export const assistantEnabled = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

let client: Anthropic | null = null;

/** Built on first use, not at import — same reason as `src/server/redis/client.ts`. */
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const textOf = (message: Anthropic.Message): string =>
  message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

/**
 * One call to the model, with its failures translated.
 *
 * The SDK's typed errors are matched rather than their messages, and they are
 * flattened into two outcomes a visitor can act on: wait, or come back later.
 * The detail goes to the log — an upstream stack trace is not an answer.
 */
async function send(
  messages: Anthropic.MessageParam[],
  locale: Locale,
  withTools: boolean,
): Promise<Anthropic.Message> {
  try {
    return await anthropic().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: 'low' },
      system: systemPrompt(locale),
      tools: toolDefinitions(),
      // Withdrawing the tools on the final round is what turns the cap into "answer
      // with what you have" rather than "stop mid-thought".
      ...(withTools ? {} : { tool_choice: { type: 'none' as const } }),
      messages,
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new AppError(
        'RATE_LIMITED',
        'The model API is rate limiting this demo right now. Try again in a moment.',
      );
    }

    if (error instanceof Anthropic.APIError) {
      console.error('[assistant]', error.status, error.message);
      throw new AppError(
        'ASSISTANT_UNAVAILABLE',
        'The assistant could not reach the model. Try again in a moment.',
      );
    }

    throw error;
  }
}

/**
 * Run the tool calls in one assistant turn and answer every one of them.
 *
 * In parallel because the model may ask for two lookups at once, and because
 * returning the results split across two user messages teaches it not to. A tool
 * that throws comes back as `is_error` rather than taking the request down: the
 * model can say it could not look something up, which is a better answer than a
 * 500, and the exception is on the server log either way.
 */
async function runCalls(
  context: ToolContext,
  calls: Anthropic.ToolUseBlock[],
): Promise<Anthropic.ToolResultBlockParam[]> {
  return Promise.all(
    calls.map(async (call) => {
      try {
        const result = await runTool(context, call.name, call.input);
        return {
          type: 'tool_result' as const,
          tool_use_id: call.id,
          content: JSON.stringify(result),
        };
      } catch (error) {
        console.error(`[assistant:${call.name}]`, error);
        return {
          type: 'tool_result' as const,
          tool_use_id: call.id,
          is_error: true,
          content:
            error instanceof AppError ? error.message : 'That lookup failed on the server.',
        };
      }
    }),
  );
}

export async function ask(
  user: SessionUser,
  locale: Locale,
  turns: AskTurn[],
): Promise<AskAnswer> {
  if (!assistantEnabled()) {
    throw new AppError(
      'ASSISTANT_UNAVAILABLE',
      'This deployment has no model API key configured, so the assistant is switched off.',
    );
  }

  // Both budgets before the first token is spent, cheapest first: one caller
  // asking too fast, then everybody together asking too much in a day.
  await askLimiter(user.id).acquire();
  await spendDailyBudget();

  // The only place the merchant is decided. It comes from the session row, it is
  // never a tool argument, and nothing downstream can widen it — invariant 10.
  const context: ToolContext = { merchantId: user.merchantId };

  const messages: Anthropic.MessageParam[] = turns.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));
  const usedTools: string[] = [];

  for (let round = 1; ; round += 1) {
    const response = await send(messages, locale, round < MAX_ROUNDS);

    // A safety decline arrives as a 200 with no answer in it, so `stop_reason`
    // is checked before the content is read rather than after it comes back empty.
    if (response.stop_reason === 'refusal') {
      throw new AppError(
        'ASSISTANT_UNAVAILABLE',
        'The assistant declined to answer that one. Try asking about orders, stock or channels.',
      );
    }

    const calls = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (calls.length === 0) {
      const answer = textOf(response);
      if (!answer) {
        throw new AppError('ASSISTANT_UNAVAILABLE', 'The assistant did not produce an answer.');
      }
      return { answer, usedTools };
    }

    for (const call of calls) if (!usedTools.includes(call.name)) usedTools.push(call.name);

    // The whole content block, not the text: it carries the tool calls being
    // answered below, and the model's own reasoning blocks, which have to go back
    // unchanged for the turn to continue on the same model.
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: await runCalls(context, calls) });
  }
}

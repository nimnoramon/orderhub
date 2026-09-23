'use client';

import { useRef, useState } from 'react';
import { useT } from '@/components/ui/I18nProvider';
import { MAX_TURNS, MAX_TURN_LENGTH, type AskTurn } from '@/lib/schemas/assistant';
import type { AskAnswer } from '@/lib/types';

/**
 * The ask panel.
 *
 * It keeps the thread in component state and sends the whole of it with every
 * question, because the server keeps none: there is no chat table and nothing in
 * Redis, so a reload starts a new conversation and two tabs are two
 * conversations. That is the cheap answer, and for a dashboard panel it is also
 * the right one — nobody wants to resume yesterday's question about stock.
 *
 * What is on screen and what is sent are deliberately different. The screen
 * keeps every exchange; the request carries only the last few, because the
 * thread is priced by its length and a panel left open all afternoon would
 * otherwise get steadily more expensive to talk to.
 */

type Exchange = { question: string; answer: string; usedTools: string[] };

/** Whole exchanges, so the model never sees a question without its answer. */
const HISTORY = Math.floor((MAX_TURNS - 1) / 2);

const toTurns = (thread: Exchange[], question: string): AskTurn[] => [
  ...thread.slice(-HISTORY).flatMap((exchange): AskTurn[] => [
    { role: 'user', text: exchange.question },
    { role: 'assistant', text: exchange.answer },
  ]),
  { role: 'user', text: question },
];

export function AskPanel({ enabled }: { enabled: boolean }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [thread, setThread] = useState<Exchange[]>([]);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    const asked = text.trim();
    if (!asked || pending) return;

    setQuestion('');
    setPending(asked);
    setError(null);

    try {
      const response = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: toTurns(thread, asked) }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        // The refusals worth reading are the server's own: "you are asking faster
        // than this demo answers", "the day's budget is spent". They are the API's
        // words, like every other AppError message, so they are shown as they came.
        setError(body?.error?.message ?? t.ask.failed);
      } else {
        const answer = body as AskAnswer;
        setThread((current) => [...current, { question: asked, ...answer }]);
      }
    } catch {
      // A dropped connection never reaches the branch above, and a panel left
      // saying "Looking…" forever is the one failure with no way out of it.
      setError(t.ask.failed);
    } finally {
      setPending(null);
      inputRef.current?.focus();
    }
  }

  if (!enabled) {
    return (
      <section className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">{t.ask.title}</h2>
        <p className="mt-1 text-xs text-neutral-500">{t.ask.disabled}</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">{t.ask.title}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">{t.ask.subtitle}</p>
        </div>
        {thread.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setThread([]);
              setError(null);
            }}
            className="shrink-0 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-800"
          >
            {t.ask.clear}
          </button>
        )}
      </div>

      {(thread.length > 0 || pending) && (
        <div className="mt-3 flex flex-col gap-3" aria-live="polite">
          {thread.map((exchange, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-neutral-900">{exchange.question}</p>
              <p className="text-sm whitespace-pre-wrap text-neutral-700">{exchange.answer}</p>
              {exchange.usedTools.length > 0 && (
                // The lookups behind the sentence, in the tools' own names. An
                // answer a visitor cannot trace is one they have no reason to
                // believe, and this is the cheapest possible way to show the
                // model did not invent the number.
                <p className="font-mono text-[11px] text-neutral-400">
                  {t.ask.readFrom(exchange.usedTools.join(', '))}
                </p>
              )}
            </div>
          ))}

          {pending && (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-neutral-900">{pending}</p>
              <p className="text-sm text-neutral-400">{t.ask.sending}</p>
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(question);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          ref={inputRef}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={MAX_TURN_LENGTH}
          placeholder={t.ask.placeholder}
          aria-label={t.ask.title}
          className="min-w-0 flex-1 rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!question.trim() || pending !== null}
          className="shrink-0 rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
        >
          {pending ? t.ask.sending : t.ask.send}
        </button>
      </form>

      {thread.length === 0 && !pending && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {t.ask.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void send(suggestion)}
              className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </p>
      )}

      <p className="mt-3 text-xs text-neutral-400">{t.ask.footnote}</p>
    </section>
  );
}

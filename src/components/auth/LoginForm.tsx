'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { signIn } from '@/lib/schemas/auth';

const FIELD =
  'w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600';

/**
 * The sign-in form.
 *
 * It is prefilled with the demo account, which would be indefensible in a real
 * product and is the right call here: this is a portfolio demo whose password
 * is printed on its own landing page and in its README, and making a reviewer
 * type it is a small toll charged for nothing. The fields stay editable so the
 * wrong-password path is one keystroke away.
 *
 * The same zod schema the route handler parses runs here first, so an empty
 * field is answered without a round trip — and, more to the point, there is one
 * definition of what the form accepts rather than two that drift.
 */
export function LoginForm({ demo }: { demo: { email: string; password: string } }) {
  const router = useRouter();
  const [email, setEmail] = useState(demo.email);
  const [password, setPassword] = useState(demo.password);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = signIn.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }

    setBusy(true);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setError(body?.error?.message ?? 'Could not sign in');
      setBusy(false);
      return;
    }

    // `refresh` before `push`: the layout that renders the dashboard reads the
    // session on the server, and without it the first screen after signing in
    // would be rendered from a cache that still believes nobody is.
    router.refresh();
    router.push('/overview');
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-500">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-500">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={FIELD}
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="mt-1 rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      {error && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </p>
      )}
    </form>
  );
}

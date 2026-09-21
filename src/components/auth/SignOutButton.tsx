'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * A button and not a link, because signing out is a POST — see the route for
 * why. That makes this the one piece of the sidebar that has to ship to the
 * browser, which is the whole reason it is its own file rather than part of the
 * chip beside it.
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    // The dashboard's pages are rendered on the server and cached per route;
    // refreshing drops that copy, so nothing signed-in is left on screen behind
    // the login form.
    router.refresh();
    router.push('/login');
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="text-xs text-neutral-400 underline underline-offset-4 hover:text-neutral-700 disabled:no-underline"
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}

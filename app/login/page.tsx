import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/server/auth/session';
import { demoLogin } from '@/server/demo';
import { LoginForm } from '@/components/auth/LoginForm';

// Reads a cookie, so it can never be prerendered.
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Somebody already signed in has no business looking at this form; sending
  // them on is also what makes the "Sign in" link on the landing page safe to
  // show to everyone.
  if (await currentUser()) redirect('/overview');

  const demo = demoLogin();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <Link href="/" className="text-sm font-semibold tracking-tight text-neutral-900">
        OrderHub
      </Link>
      <h1 className="mt-6 text-lg font-semibold tracking-tight text-neutral-900">Sign in</h1>
      <p className="mt-1 mb-5 text-sm text-neutral-500">
        The dashboard, the channels and the sync log are behind this form.
      </p>

      <LoginForm demo={demo} />

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white px-4 py-3">
        <p className="text-sm font-medium text-neutral-900">The fields are already filled in</p>
        <p className="mt-1 text-xs text-neutral-500">
          {/* The account is seeded and its password is bcrypt-hashed; the whole
              point of printing it is that a reviewer should not have to ask for
              a way in. Nothing here is real but the code. */}
          This is a portfolio demo with fictional data, and{' '}
          <span className="font-mono text-neutral-700">{demo.email}</span> is the only account.
          Its password is hashed with bcrypt like anybody else&apos;s, the session is a signed
          cookie, and five wrong attempts a minute is all the form will take.
        </p>
      </div>
    </main>
  );
}

import { z } from 'zod';

/**
 * The sign-in form, parsed by the route handler and by the form that posts to
 * it — the same rule in both places, as everywhere else in `src/lib/schemas/`.
 *
 * Trimmed and lower-cased before it is checked, because an address pasted from
 * a password manager arrives with a space on the end often enough to matter,
 * and "Demo@OrderHub.dev" is the same account as the seeded one.
 */
export const signIn = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('that does not look like an email address')),
  password: z.string().min(1, 'enter the password').max(200),
});

export type SignInInput = z.infer<typeof signIn>;

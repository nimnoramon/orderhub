import { requireUser } from '@/server/auth/session';
import { json, readJson, route } from '@/server/http/handler';
import { currentLocale } from '@/server/i18n/locale';
import { ask } from '@/server/services/assistant';
import { askRequest } from '@/lib/schemas/assistant';

export const dynamic = 'force-dynamic';

/**
 * POST /api/assistant/ask
 *
 * Parse, authenticate, call a service, return data — the same four steps as
 * every other handler here, which is the point. The model, the tools, the two
 * rate limits and the loop are all on the other side of the service call, and
 * none of them leaks into the route.
 *
 * `requireUser` rather than `requireSignedIn`: this is called by `fetch`, so a
 * signed-out caller needs a 401 it can read, not the HTML of a login page.
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const input = askRequest.parse(await readJson(request));

  // The language is the request's, not the body's. It is read from the same
  // cookie the server components read, so the panel answers in whatever the
  // switcher in the sidebar currently says.
  return json(await ask(user, await currentLocale(), input.messages));
});

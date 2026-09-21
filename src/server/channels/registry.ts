import { ChannelKind } from '@/generated/prisma/enums';
import { channelLimiter, type Limiter } from '@/server/ratelimit/limiter';
import type { Rate } from '@/server/ratelimit/token-bucket';
import type { ChannelAdapter, ChannelCredentials } from './adapter';
import { MOCK_A_RATE, MockShopAAdapter } from './mock-a';
import { MOCK_B_RATE, MockShopBAdapter } from './mock-b';

/**
 * Which kinds of channel have a connector, and how to build one.
 *
 * A fresh adapter per call rather than a cached singleton: an adapter holds the
 * credentials of one channel row, and a merchant with two MockShop A accounts
 * must not end up sharing an API key between them.
 *
 * `storefront` is absent on purpose and not by omission — orders originate in
 * this app, so there is nothing to push a catalog to and nothing to pull orders
 * from. The screens read that absence rather than special-casing the name.
 */
const FACTORIES: Partial<
  Record<ChannelKind, (credentials: ChannelCredentials, limiter: Limiter) => ChannelAdapter>
> = {
  [ChannelKind.mock_a]: (credentials, limiter) => new MockShopAAdapter(credentials, limiter),
  [ChannelKind.mock_b]: (credentials, limiter) => new MockShopBAdapter(credentials, limiter),
};

/**
 * The pace each kind of channel is called at, readable without building an
 * adapter. The Channels screen wants the numbers to show a request budget, and
 * constructing a connector — which reads credentials and throws if one is
 * missing — is far too much to do for a line of text on a page.
 */
const RATES: Partial<Record<ChannelKind, Rate>> = {
  [ChannelKind.mock_a]: MOCK_A_RATE,
  [ChannelKind.mock_b]: MOCK_B_RATE,
};

export const rateFor = (kind: ChannelKind): Rate | null => RATES[kind] ?? null;

/**
 * Kinds this app is itself the source of truth for. Their absence from
 * `FACTORIES` is permanent and means something different from a marketplace
 * whose adapter simply has not been written yet — a screen that could not tell
 * the two apart would have to claim that a marketplace's orders originate here.
 * Every marketplace in the enum has a connector today; the distinction is kept
 * because the next one to be added will not, for a while.
 */
const FIRST_PARTY: readonly ChannelKind[] = [ChannelKind.storefront];

export type ConnectorState = 'ready' | 'planned' | 'none';

export function connectorState(kind: ChannelKind): ConnectorState {
  if (kind in FACTORIES) return 'ready';
  return FIRST_PARTY.includes(kind) ? 'none' : 'planned';
}

/**
 * The limiter is built here, from the channel's own id, because this is the
 * only place that knows both which row we are speaking for and which rate its
 * marketplace publishes. Two channel rows of the same kind get two buckets —
 * the marketplace counts them as two clients, and so do we.
 */
export function adapterFor(channel: {
  id: string;
  kind: ChannelKind;
  credentials: unknown;
}): ChannelAdapter | null {
  const factory = FACTORIES[channel.kind];
  const rate = RATES[channel.kind];
  if (!factory || !rate) return null;

  return factory(
    (channel.credentials ?? {}) as ChannelCredentials,
    channelLimiter(channel.id, rate),
  );
}

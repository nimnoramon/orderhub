import { ChannelKind } from '@/generated/prisma/enums';
import type { ChannelAdapter, ChannelCredentials } from './adapter';
import { MockShopAAdapter } from './mock-a';
import { MockShopBAdapter } from './mock-b';

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
const FACTORIES: Partial<Record<ChannelKind, (credentials: ChannelCredentials) => ChannelAdapter>> = {
  [ChannelKind.mock_a]: (credentials) => new MockShopAAdapter(credentials),
  [ChannelKind.mock_b]: (credentials) => new MockShopBAdapter(credentials),
};

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

export function adapterFor(channel: {
  kind: ChannelKind;
  credentials: unknown;
}): ChannelAdapter | null {
  const factory = FACTORIES[channel.kind];
  if (!factory) return null;
  return factory((channel.credentials ?? {}) as ChannelCredentials);
}

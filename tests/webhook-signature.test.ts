import { describe, expect, it } from 'vitest';
import { SIGNATURE_TOLERANCE_SECONDS, signBody, verifySignature, withinTolerance } from '@/lib/hmac';
import { MockShopAAdapter } from '@/server/channels/mock-a';
import { webhookPayload, webhookSecret } from '@/mock/a';

/**
 * Webhook verification, tested across the two sides that must not trust each
 * other: MockShop A signs, the connector verifies, and the connector accepts it
 * only because the secret and the bytes both match.
 */

const SECRET = 'mock-a-secret';
const BODY = JSON.stringify({ event: 'order.created', order: { id: 'A-100042' } });
const now = () => Math.floor(Date.now() / 1000);

describe('the signature itself', () => {
  it('verifies a body it signed', () => {
    const at = now();
    expect(verifySignature(SECRET, BODY, at, signBody(SECRET, BODY, at))).toBe(true);
  });

  it('refuses a different secret', () => {
    const at = now();
    expect(verifySignature('not-the-secret', BODY, at, signBody(SECRET, BODY, at))).toBe(false);
  });

  it('refuses a body that changed by one character', () => {
    const at = now();
    const signature = signBody(SECRET, BODY, at);
    expect(verifySignature(SECRET, BODY.replace('A-100042', 'A-100043'), at, signature)).toBe(false);
  });

  it('refuses a signature moved to a different timestamp', () => {
    // The timestamp is inside the signed string, so a captured delivery cannot be
    // replayed under a fresh one — this is the half that makes the tolerance
    // window worth checking at all.
    const at = now();
    expect(verifySignature(SECRET, BODY, at + 1, signBody(SECRET, BODY, at))).toBe(false);
  });

  it('refuses a missing, empty or malformed header', () => {
    const at = now();
    for (const header of [null, '', 'deadbeef', 'sha256=', 'md5=abc']) {
      expect(verifySignature(SECRET, BODY, at, header)).toBe(false);
    }
  });

  it('accepts a clock skew inside the window and rejects one outside it', () => {
    const at = now();
    expect(withinTolerance(at - SIGNATURE_TOLERANCE_SECONDS + 5, at)).toBe(true);
    expect(withinTolerance(at - SIGNATURE_TOLERANCE_SECONDS - 5, at)).toBe(false);
  });
});

describe('the adapter as the receiving end', () => {
  const adapter = new MockShopAAdapter({ apiKey: 'mock-a-key', webhookSecret: SECRET });

  /** Exactly the headers app/api/mock/a/webhooks/send attaches. */
  const delivery = (raw: string, at = now()) =>
    new Headers({
      'x-mockshop-timestamp': String(at),
      'x-mockshop-signature': signBody(webhookSecret(), raw, at),
    });

  it('verifies a delivery the mock actually signed', () => {
    const raw = JSON.stringify(webhookPayload('order.created', 200));
    expect(adapter.verifyWebhook(delivery(raw), raw)).toBe(true);
  });

  it('refuses a replay of an old delivery', () => {
    const raw = JSON.stringify(webhookPayload('order.created', 200));
    const stale = now() - SIGNATURE_TOLERANCE_SECONDS - 60;
    expect(adapter.verifyWebhook(delivery(raw, stale), raw)).toBe(false);
  });

  it('refuses a delivery with no timestamp at all', () => {
    const raw = JSON.stringify(webhookPayload('order.created', 200));
    const headers = new Headers({ 'x-mockshop-signature': signBody(webhookSecret(), raw, now()) });
    expect(adapter.verifyWebhook(headers, raw)).toBe(false);
  });

  it('maps a verified payload into the shape the rest of the app speaks', () => {
    const payload = webhookPayload('order.updated', 200);
    const event = adapter.parseWebhook(payload);

    expect(event.type).toBe('order.updated');
    expect(event.externalId).toBe(payload.order.id);
    expect(event.occurredAt).toBeInstanceOf(Date);
    // Money stays in integer minor units, and the channel's spelling of it is gone.
    expect(event.order?.totalCents).toBe(payload.order.total_cents);
    expect(event.order?.customerName).toBe(payload.order.customer.name);
    expect(event.order?.lines[0]).toMatchObject({ unitPriceCents: payload.order.lines[0].unit_price_cents });
  });

  it('refuses a payload it cannot read rather than guessing', () => {
    expect(() => adapter.parseWebhook({ event: 'order.exploded', order: {} })).toThrow();
  });
});

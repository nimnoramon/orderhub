import { describe, expect, it } from 'vitest';
import { AppError } from '@/server/http/errors';
import type { CatalogItem } from '@/server/channels/adapter';
import {
  centsToDecimal,
  decimalToCents,
  parseTimestamp,
  toBatchResult,
  toExternalOrder,
  toListingPayload,
  toOrderPage,
  toWebhookEvent,
} from '@/server/channels/mock-b-mapping';

/**
 * MockShop B's field names, date format and money, turned into OrderHub's.
 *
 * Every payload below is written out by hand rather than produced by
 * `src/mock/b.ts`. Generating them from the fake would make this file agree with
 * itself no matter what either side did — the mapping would still "pass" the day
 * the marketplace changed a field name, which is the only day it matters. What
 * is asserted here is the contract as B's docs state it.
 */

const bOrder = {
  order_reference: 'ORD-B-770123',
  created_on: '17/09/2026 22:00:00',
  // B sends its own status vocabulary. The connector reads none of it, and this
  // payload keeps the field to prove that an unmapped field is simply dropped.
  state: 'DISPATCHED',
  currency_code: 'THB',
  amount_total: '349.70',
  buyer: { display_name: 'Cai Duarte' },
  line_items: [
    { item_code: 'BAG-1002-24L', units: 2, unit_amount: '129.90' },
    { item_code: 'LGT-1004-2700K', units: 1, unit_amount: '89.90' },
  ],
};

describe('B writes dates as dd/MM/yyyy in Singapore time', () => {
  it('shifts a timestamp back to UTC', () => {
    expect(parseTimestamp('17/09/2026 22:00:00').toISOString()).toBe('2026-09-17T14:00:00.000Z');
  });

  it('crosses the date boundary rather than only moving the clock', () => {
    // The mistake this catches is the one that looks right all afternoon: an
    // order placed at 6am in Singapore belongs to the previous day in UTC, and
    // a date filter that disagrees quietly drops it.
    expect(parseTimestamp('17/09/2026 06:00:00').toISOString()).toBe('2026-09-16T22:00:00.000Z');
  });

  it('reads the first number as the day, not the month', () => {
    expect(parseTimestamp('25/12/2026 09:30:00').toISOString()).toBe('2026-12-25T01:30:00.000Z');
    // Ambiguous to a human, and the whole reason this format needs a test.
    expect(parseTimestamp('03/07/2026 00:00:00').toISOString()).toBe('2026-07-02T16:00:00.000Z');
  });

  it('refuses anything that is not that format, and anything that is not a moment', () => {
    for (const value of [
      '2026-09-17T22:00:00Z',
      '17/9/2026 22:00:00',
      '31/02/2026 00:00:00',
      '17/09/2026 25:00:00',
      '',
    ]) {
      expect(() => parseTimestamp(value)).toThrowError(AppError);
    }
  });
});

describe('B quotes money as decimal strings', () => {
  it('reads an amount as digits, not as a float', () => {
    expect(decimalToCents('349.70')).toBe(34970);
    expect(decimalToCents('0.05')).toBe(5);
    // 8.29 * 100 is 828.9999999999999. Anything that multiplies has to remember
    // to round, and something eventually does not.
    expect(decimalToCents('8.29')).toBe(829);
    expect(decimalToCents('10.1')).toBe(1010);
    expect(decimalToCents('1234')).toBe(123400);
    expect(decimalToCents('-12.50')).toBe(-1250);
  });

  it('refuses an amount it would have to round or guess at', () => {
    for (const value of ['3.999', '1,234.00', ' 12.50', '12.5.0', 'free', '']) {
      expect(() => decimalToCents(value)).toThrowError(AppError);
    }
  });

  it('writes cents back out the way B expects to read them', () => {
    expect(centsToDecimal(34970)).toBe('349.70');
    expect(centsToDecimal(5)).toBe('0.05');
    expect(centsToDecimal(123400)).toBe('1234.00');
    expect(centsToDecimal(0)).toBe('0.00');
    expect(decimalToCents(centsToDecimal(2499))).toBe(2499);
  });
});

describe('an order, in B-speak and in ours', () => {
  it('renames every field and converts every value', () => {
    expect(toExternalOrder(bOrder)).toEqual({
      externalId: 'ORD-B-770123',
      placedAt: new Date('2026-09-17T14:00:00.000Z'),
      customerName: 'Cai Duarte',
      currency: 'THB',
      totalCents: 34970,
      lines: [
        { sku: 'BAG-1002-24L', qty: 2, unitPriceCents: 12990 },
        { sku: 'LGT-1004-2700K', qty: 1, unitPriceCents: 8990 },
      ],
    });
  });

  it('carries the page token through, and says nothing when the feed is caught up', () => {
    const page = toOrderPage({
      status: 'OK',
      result: {
        orders: [bOrder],
        paging: { next_page_token: '2026-09-17T14:00:00.000Z', more: true },
      },
    });
    expect(page.orders).toHaveLength(1);
    expect(page.next).toBe('2026-09-17T14:00:00.000Z');

    const caughtUp = toOrderPage({
      status: 'OK',
      result: { orders: [], paging: { next_page_token: null, more: false } },
    });
    expect(caughtUp.orders).toEqual([]);
    expect(caughtUp.next).toBeUndefined();
  });

  it('refuses a response it cannot read rather than mapping half of one', () => {
    expect(() => toOrderPage({ status: 'OK', result: { orders: [bOrder] } })).toThrowError(AppError);
    expect(() => toOrderPage({ orders: [bOrder] })).toThrowError(AppError);
  });
});

describe('a catalog batch, out and back', () => {
  const item: CatalogItem = {
    variantId: 'var_1',
    sku: 'AUD-1001-BLACK',
    title: 'Sturdy Audio speaker',
    priceCents: 2499,
    currency: 'THB',
    attributes: { colour: 'Black' },
  };

  it('sends prices as decimals and attributes as a list of pairs', () => {
    expect(toListingPayload([item])).toEqual({
      listings: [
        {
          sku_code: 'AUD-1001-BLACK',
          name: 'Sturdy Audio speaker',
          price: '24.99',
          currency_code: 'THB',
          attributes: [{ name: 'colour', value: 'Black' }],
        },
      ],
    });
  });

  it('reads B’s two groups as one result per item', () => {
    const result = toBatchResult(
      {
        status: 'OK',
        result: {
          batch_reference: 'bref-2f',
          accepted: ['AUD-1001-BLACK'],
          rejected: [
            {
              ref: 'KIT-1004-M',
              reason_code: 'CATEGORY_NOT_LISTED',
              reason: 'this marketplace does not carry that category',
            },
          ],
        },
      },
      ['AUD-1001-BLACK', 'KIT-1004-M'],
    );

    expect(result.ok).toEqual(['AUD-1001-BLACK']);
    expect(result.failed).toEqual([
      {
        ref: 'KIT-1004-M',
        code: 'CATEGORY_NOT_LISTED',
        message: 'this marketplace does not carry that category',
      },
    ]);
  });

  it('refuses to count a listing B never answered for as accepted', () => {
    // The failure that otherwise looks like a clean sync until somebody searches
    // the marketplace for a listing that was never created.
    expect(() =>
      toBatchResult(
        { status: 'OK', result: { batch_reference: 'bref-2f', accepted: ['AUD-1001-BLACK'], rejected: [] } },
        ['AUD-1001-BLACK', 'BAG-1002-24L'],
      ),
    ).toThrowError(AppError);
  });
});

describe('a notification', () => {
  it('maps B’s event names onto ours, and the order with them', () => {
    const event = toWebhookEvent({
      notification: { kind: 'ORDER_VOIDED', dispatched_at: '18/09/2026 20:00:00', order: bOrder },
    });

    expect(event.type).toBe('order.cancelled');
    expect(event.externalId).toBe('ORD-B-770123');
    expect(event.occurredAt.toISOString()).toBe('2026-09-18T12:00:00.000Z');
    expect(event.order?.totalCents).toBe(34970);
  });

  it('maps the other two, and refuses a kind it has no meaning for', () => {
    const kindOf = (kind: string) =>
      toWebhookEvent({
        notification: { kind, dispatched_at: '18/09/2026 20:00:00', order: bOrder },
      }).type;

    expect(kindOf('ORDER_PLACED')).toBe('order.created');
    expect(kindOf('ORDER_AMENDED')).toBe('order.updated');
    expect(() => kindOf('ORDER_MERGED')).toThrowError(AppError);
  });
});

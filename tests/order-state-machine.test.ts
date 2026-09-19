import { describe, expect, it } from 'vitest';
import { OrderStatus } from '@/generated/prisma/enums';
import { AppError } from '@/server/http/errors';
import {
  ACTIONABLE_STATUSES,
  TRANSITIONS,
  assertTransition,
  canTransition,
  isTerminal,
  nextStatuses,
  transitionRefusal,
} from '@/server/orders/state-machine';

const ALL = Object.values(OrderStatus);

/**
 * The rules, written out a second time and by hand. The point of this list is
 * that it is not derived from TRANSITIONS: if someone edits the table, this
 * spells out what they would be changing, and the matrix below fails.
 */
const LEGAL: [OrderStatus, OrderStatus][] = [
  ['created', 'paid'],
  ['created', 'cancelled'],
  ['paid', 'packed'],
  ['paid', 'cancelled'],
  ['packed', 'shipped'],
];

const isLegal = (from: OrderStatus, to: OrderStatus) =>
  LEGAL.some(([f, t]) => f === from && t === to);

describe('the transition table', () => {
  it('has an entry for every status in the enum', () => {
    // A new status added to the schema but not to the table would otherwise be
    // a runtime undefined, and `canTransition` would throw rather than refuse.
    for (const status of ALL) expect(TRANSITIONS[status], status).toBeDefined();
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...ALL].sort());
  });

  it('only ever points at statuses that exist', () => {
    for (const status of ALL) {
      for (const to of TRANSITIONS[status]) expect(ALL).toContain(to);
    }
  });

  it('never allows a status to transition to itself', () => {
    for (const status of ALL) expect(TRANSITIONS[status]).not.toContain(status);
  });
});

describe('canTransition', () => {
  it.each(LEGAL)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(nextStatuses(from)).toContain(to);
  });

  // 5 statuses × 5 statuses: every pair is asserted, so an illegal move can
  // never be introduced by widening the table without this failing.
  const matrix = ALL.flatMap((from) => ALL.map((to) => [from, to] as const));

  it.each(matrix)('answers %s → %s from the table alone', (from, to) => {
    expect(canTransition(from, to)).toBe(isLegal(from, to));
  });

  it('rejects every illegal move, including the ones that skip a step', () => {
    expect(canTransition('created', 'packed')).toBe(false);
    expect(canTransition('created', 'shipped')).toBe(false);
    expect(canTransition('paid', 'shipped')).toBe(false);
    expect(canTransition('packed', 'cancelled')).toBe(false);
    expect(canTransition('packed', 'paid')).toBe(false);
  });

  it('rejects every move backwards', () => {
    expect(canTransition('paid', 'created')).toBe(false);
    expect(canTransition('packed', 'created')).toBe(false);
    expect(canTransition('shipped', 'packed')).toBe(false);
    expect(canTransition('cancelled', 'created')).toBe(false);
  });
});

describe('terminal statuses', () => {
  it('are shipped and cancelled, and only those', () => {
    expect(ALL.filter(isTerminal)).toEqual(['shipped', 'cancelled']);
  });

  it.each([OrderStatus.shipped, OrderStatus.cancelled])('lets nothing out of %s', (from) => {
    expect(nextStatuses(from)).toHaveLength(0);
    for (const to of ALL) expect(canTransition(from, to)).toBe(false);
  });
});

describe('assertTransition', () => {
  it.each(LEGAL)('returns quietly for %s → %s', (from, to) => {
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it('throws ILLEGAL_TRANSITION, which the http layer maps to 409', () => {
    expect(() => assertTransition('created', 'shipped')).toThrow(AppError);
    try {
      assertTransition('created', 'shipped');
      expect.unreachable('an illegal transition must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('ILLEGAL_TRANSITION');
      expect((error as AppError).details).toEqual({
        from: 'created',
        to: 'shipped',
        allowed: ['paid', 'cancelled'],
      });
    }
  });

  it('throws for every illegal pair', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        if (isLegal(from, to)) continue;
        expect(() => assertTransition(from, to), `${from} → ${to}`).toThrow(AppError);
      }
    }
  });
});

describe('the refusal message', () => {
  it('is null when the move is allowed — the UI enables the button on that', () => {
    expect(transitionRefusal('created', 'paid')).toBeNull();
  });

  it('names the statuses the order could move to instead', () => {
    expect(transitionRefusal('created', 'shipped')).toBe(
      'An order that is created cannot move to shipped; it can only move to paid or cancelled.',
    );
  });

  it('says a terminal status is final rather than listing nothing', () => {
    expect(transitionRefusal('shipped', 'cancelled')).toBe(
      'This order is shipped, which is final — it cannot move to cancelled.',
    );
  });

  it('says so when the order is already where it is being sent', () => {
    expect(transitionRefusal('paid', 'paid')).toBe('This order is already paid.');
  });
});

describe('the action bar', () => {
  it('offers every status an order can be moved to, and nothing else', () => {
    // `created` is not actionable: an order is born there and never returns.
    const reachable = new Set(ALL.flatMap((from) => [...TRANSITIONS[from]]));
    expect([...ACTIONABLE_STATUSES].sort()).toEqual([...reachable].sort());
  });
});

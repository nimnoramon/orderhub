import { OrderStatus } from '@/generated/prisma/enums';
import { AppError } from '@/server/http/errors';

/**
 * The order lifecycle, in one place.
 *
 * Every question about whether an order may move — the API, the service, and the
 * buttons in the dashboard — is answered by this table. The module is pure on
 * purpose: no Prisma, no Next, no `NextResponse`. That is what lets the client
 * bundle import it, so the UI greys a button out by asking the same function the
 * server would have used to reject the request, rather than keeping a second
 * copy of the rules that drifts.
 *
 * The rules themselves:
 *
 *   created ──> paid ──> packed ──> shipped
 *      │         │
 *      └─────────┴────> cancelled
 *
 * `shipped` and `cancelled` are terminal. Nothing un-ships an order and nothing
 * revives a cancelled one; a mistake after that point is a new order or a
 * return, both of which leave their own trail.
 */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  created: ['paid', 'cancelled'],
  paid: ['packed', 'cancelled'],
  packed: ['shipped'],
  shipped: [],
  cancelled: [],
};

/**
 * Every status a transition button can be rendered for, in lifecycle order.
 * The action bar shows all of them and disables the ones `canTransition`
 * refuses, so the screen shows the shape of the whole workflow rather than only
 * the step you happen to be on.
 */
export const ACTIONABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.paid,
  OrderStatus.packed,
  OrderStatus.shipped,
  OrderStatus.cancelled,
];

export const nextStatuses = (from: OrderStatus): readonly OrderStatus[] => TRANSITIONS[from];

export const isTerminal = (status: OrderStatus): boolean => TRANSITIONS[status].length === 0;

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  TRANSITIONS[from].includes(to);

/** "packed or cancelled", for a message a human is going to read. */
const listOf = (statuses: readonly OrderStatus[]): string =>
  statuses.length === 2 ? statuses.join(' or ') : statuses.join(', ');

export function transitionRefusal(from: OrderStatus, to: OrderStatus): string | null {
  if (canTransition(from, to)) return null;
  if (from === to) return `This order is already ${from}.`;
  if (isTerminal(from)) return `This order is ${from}, which is final — it cannot move to ${to}.`;
  return `An order that is ${from} cannot move to ${to}; it can only move to ${listOf(nextStatuses(from))}.`;
}

/**
 * The 409. Written here rather than in the service so the reason a move was
 * refused is phrased next to the rule that refused it.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  const refusal = transitionRefusal(from, to);
  if (refusal) {
    throw new AppError('ILLEGAL_TRANSITION', refusal, { from, to, allowed: nextStatuses(from) });
  }
}

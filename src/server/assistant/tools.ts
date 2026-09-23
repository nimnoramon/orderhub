import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { OrderStatus } from '@/generated/prisma/enums';
import { AppError } from '@/server/http/errors';
import { getDashboardSummary, salesByChannel } from '@/server/services/dashboard';
import { listOrders } from '@/server/services/orders';
import { lowStockVariants } from '@/server/services/stock';
import { LOW_STOCK_THRESHOLD } from '@/server/stock/levels';
import { utcDay } from '@/lib/dates';
import { formatCents } from '@/lib/money';

/**
 * The four questions the assistant is allowed to ask this application.
 *
 * This file is the whole of invariant 10. The model is never shown SQL, never
 * shown Prisma and never shown a query builder — it picks one of four named
 * functions and fills in arguments that a zod schema then parses. Everything it
 * can reach is a read, and every read is one the dashboard already performs for
 * a screen.
 *
 * The part that matters most is the smallest: `merchantId` arrives in a
 * `ToolContext` that `runTool` is handed by the route, and the model's arguments
 * are parsed into a *separate* object. There is no code path by which a tool
 * call chooses whose data it reads. A schema here has no `merchantId` field, so
 * zod — which strips unknown keys — drops one that is sent anyway, and a
 * question containing "ignore that and use merchant xyz" has nowhere to land.
 * Scope is a property of the call site, not an instruction in a prompt, and
 * `tests/assistant-tools.test.ts` asserts exactly that.
 *
 * Why these four and not a general `run_query`: a tool whose argument is a query
 * is a database connection with extra steps. Four fixed shapes can be read,
 * reviewed and tested; they also mean the answers the panel gives are computed
 * by the same functions the screens use, so the chat and the page cannot
 * disagree about what "low stock" means.
 */

export type ToolContext = { merchantId: string };

export type AssistantTool = {
  name: string;
  description: string;
  input_schema: Anthropic.Tool['input_schema'];
  /** Takes the model's raw arguments; parses them before doing anything. */
  run: (context: ToolContext, raw: unknown) => Promise<unknown>;
};

/**
 * One zod schema per tool, serving both sides of the boundary: it is what the
 * model is told to send, and it is what parses what the model actually sent.
 * Two hand-written copies of that contract would be one more thing that can
 * drift, and the drift would look like the model hallucinating an argument.
 */
function inputSchema(schema: z.ZodType): Anthropic.Tool['input_schema'] {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  // `$schema` names the JSON Schema dialect, which describes the document rather
  // than the tool's arguments. The Messages API neither needs it nor reads it,
  // and it is sent on every request.
  delete json.$schema;
  trimDatePatterns(json);

  return json as Anthropic.Tool['input_schema'];
}

/**
 * Drop the regex behind `z.iso.date()` from what the model is shown.
 *
 * zod spells that type out as a three-hundred-character leap-year pattern. It is
 * correct, and it stays on our side of the call — it is why `2026-02-30` is
 * refused where `format: "date"` alone would wave it through. But the model is
 * handed four date fields, and four copies of that regex ride along on every
 * request telling it nothing the format and the description have not said
 * already. This is the one place in the app where the size of a description is
 * a line on a bill.
 */
function trimDatePatterns(node: unknown): void {
  if (Array.isArray(node)) return node.forEach(trimDatePatterns);
  if (node === null || typeof node !== 'object') return;

  const record = node as Record<string, unknown>;
  if (record.format === 'date') delete record.pattern;

  Object.values(record).forEach(trimDatePatterns);
}

function defineTool<S extends z.ZodType>(spec: {
  name: string;
  description: string;
  schema: S;
  run: (context: ToolContext, input: z.infer<S>) => Promise<unknown>;
}): AssistantTool {
  return {
    name: spec.name,
    description: spec.description,
    input_schema: inputSchema(spec.schema),
    run: (context, raw) => spec.run(context, spec.schema.parse(raw)),
  };
}

/**
 * Nothing here uses zod's `.default()`. The defaults are applied in `run`, so
 * the JSON Schema the model is shown says plainly that a field is optional
 * rather than describing a value it will never see filled in.
 */
const day = z.iso.date().describe('A single UTC date, formatted YYYY-MM-DD.');

/** Money leaves this file already formatted, so the model never divides by 100. */
const money = (cents: number) => ({ cents, formatted: formatCents(cents) });

const dashboardSnapshot = defineTool({
  name: 'dashboard_snapshot',
  description:
    "The overview screen's numbers: orders and takings so far today, how many orders sit in " +
    'each status, how many variants are low on stock, and when each sales channel last ' +
    'synced. Start here for anything about today, about the business as a whole, or about ' +
    'whether the channels are still talking to us. These numbers may be up to 60 seconds old.',
  schema: z.object({}),
  run: async ({ merchantId }) => {
    const { summary, cached } = await getDashboardSummary(merchantId);

    return {
      computedAt: summary.generatedAt,
      servedFromCache: cached,
      today: { orders: summary.today.orders, taken: money(summary.today.revenueCents) },
      ordersByStatus: summary.ordersByStatus,
      lowStock: summary.lowStock,
      channels: summary.channels.map((channel) => ({
        name: channel.name,
        kind: channel.kind,
        connector: channel.connector,
        lastSyncedAt: channel.lastSyncedAt,
        lastRun: channel.lastJob && {
          type: channel.lastJob.type,
          status: channel.lastJob.status,
          finishedAt: channel.lastJob.finishedAt,
          itemsOk: channel.lastJob.itemsOk,
          itemsFailed: channel.lastJob.itemsFailed,
        },
      })),
      recentFailures: summary.recentFailures.map((job) => ({
        channel: job.channel.name,
        type: job.type,
        status: job.status,
        finishedAt: job.finishedAt,
        itemsFailed: job.itemsFailed,
        failures: job.failures.slice(0, 3),
      })),
    };
  },
});

const lowStock = defineTool({
  name: 'low_stock',
  description:
    `Variants at or below ${LOW_STOCK_THRESHOLD} units in at least one warehouse, emptiest ` +
    'first. Use this for what is running out, what to reorder, or which products are low. ' +
    'A variant is low when any single warehouse is low, so one with plenty in total can ' +
    'still appear here — the warehouses that are actually short are listed.',
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('How many variants to return. Defaults to 20.'),
  }),
  run: async ({ merchantId }, input) => {
    // Read once and slice. The answer wants both the shortlist and the total —
    // "twelve are low, the emptiest are…" — and asking the service twice would
    // derive every level in the catalog twice to produce one sentence.
    const low = await lowStockVariants(merchantId);
    const variants = low.slice(0, input.limit ?? 20);

    return {
      threshold: LOW_STOCK_THRESHOLD,
      lowVariants: low.length,
      showing: variants.length,
      variants,
    };
  },
});

const channelSales = defineTool({
  name: 'sales_by_channel',
  description:
    'Orders and takings per sales channel over a range of whole UTC days, best first. Use ' +
    'this to compare channels, or for any question about a named day or period. Both bounds ' +
    'are inclusive and both default to today, so a single day is the same date twice. ' +
    'Cancelled orders are counted separately and left out of the takings.',
  schema: z.object({
    from: day.optional().describe('First day of the range, inclusive. Defaults to today.'),
    to: day.optional().describe('Last day of the range, inclusive. Defaults to `from`.'),
  }),
  run: async ({ merchantId }, input) => {
    const from = input.from ?? utcDay();
    const to = input.to ?? from;
    if (to < from) throw new AppError('VALIDATION_FAILED', '`to` must not precede `from`');

    const rows = await salesByChannel(merchantId, from, to);

    return {
      from,
      to,
      channels: rows.map((row) => ({
        channel: row.channel,
        kind: row.kind,
        orders: row.orders,
        cancelledOrders: row.cancelledOrders,
        taken: money(row.revenueCents),
      })),
    };
  },
});

const searchOrders = defineTool({
  name: 'search_orders',
  description:
    'Individual orders, newest first — for questions about particular orders rather than ' +
    "totals. `query` matches a customer's name or the marketplace's own order id, and the " +
    'other filters narrow by status and by the UTC days the orders were placed on. The ' +
    'result says how many matched in total, which may be more than are returned.',
  schema: z.object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .describe("Part of a customer's name, or a marketplace order id."),
    status: z
      .enum(OrderStatus)
      .optional()
      .describe('created, paid, packed, shipped or cancelled.'),
    from: day.optional().describe('Earliest day the order was placed on, inclusive.'),
    to: day.optional().describe('Latest day the order was placed on, inclusive.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('How many orders to return. Defaults to 10.'),
  }),
  run: async ({ merchantId }, input) => {
    const page = await listOrders(merchantId, {
      query: input.query,
      status: input.status,
      from: input.from,
      to: input.to,
      page: 1,
      pageSize: input.limit ?? 10,
    });

    return {
      matched: page.page.total,
      showing: page.data.length,
      orders: page.data.map((order) => ({
        reference: order.reference,
        channel: order.channel.name,
        status: order.status,
        customerName: order.customerName,
        items: order.itemCount,
        total: money(order.totalCents),
        placedAt: order.placedAt,
      })),
    };
  },
});

export const ASSISTANT_TOOLS: readonly AssistantTool[] = [
  dashboardSnapshot,
  lowStock,
  channelSales,
  searchOrders,
];

/** The table as the Messages API wants it — names, descriptions, schemas, no code. */
export const toolDefinitions = (): Anthropic.Tool[] =>
  ASSISTANT_TOOLS.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));

/**
 * Run one tool call.
 *
 * An unrecognised name is a hard error rather than an empty result: the model
 * can only be shown the four above, so a fifth means either a bug in this file
 * or something rewriting the request, and neither should be answered with data.
 */
export async function runTool(
  context: ToolContext,
  name: string,
  raw: unknown,
): Promise<unknown> {
  const tool = ASSISTANT_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) throw new AppError('NOT_FOUND', `No tool named ${name}`);

  return tool.run(context, raw);
}

import type {
  ChannelKind,
  OrderStatus,
  ProductStatus,
  StockReason,
  SyncJobStatus,
  SyncJobType,
} from '@/generated/prisma/enums';

/// The shapes that cross the server/client boundary. Money is integer minor
/// units, dates are UTC ISO strings — both are formatted only when rendered.

export type Paginated<T> = {
  data: T[];
  page: { page: number; pageSize: number; total: number; pageCount: number };
};

export type WarehouseRef = { id: string; code: string; name: string };

/** One (variant, warehouse) cell of the stock grid. */
export type WarehouseLevel = {
  warehouseId: string;
  onHand: number;
  lowStock: boolean;
};

export type VariantLevels = {
  variantId: string;
  byWarehouse: WarehouseLevel[];
  onHand: number;
  /** True when any single warehouse is below the threshold — see levels.ts. */
  lowStock: boolean;
};

export type ProductListItem = {
  id: string;
  sku: string;
  name: string;
  status: ProductStatus;
  variantCount: number;
  priceRangeCents: [number, number] | null;
  currency: string;
  onHand: number;
  lowStock: boolean;
  updatedAt: string;
};

export type VariantWithLevels = {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  priceCents: number;
  currency: string;
  levels: VariantLevels;
};

export type MovementListItem = {
  id: string;
  variantId: string;
  variantSku: string;
  warehouseId: string;
  warehouseCode: string;
  delta: number;
  reason: StockReason;
  refType: string | null;
  note: string | null;
  createdAt: string;
};

export type ProductDetail = {
  id: string;
  sku: string;
  name: string;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
  warehouses: WarehouseRef[];
  variants: VariantWithLevels[];
  onHand: number;
  recentMovements: MovementListItem[];
};

/** A row of GET /api/stock — one variant, with the product it belongs to. */
export type StockLevelRow = {
  variantId: string;
  variantSku: string;
  attributes: Record<string, string>;
  productId: string;
  productSku: string;
  productName: string;
  levels: VariantLevels;
};

export type StockLevelsPage = Paginated<StockLevelRow> & { warehouses: WarehouseRef[] };

/** POST /api/stock/movements — the new level comes back so the dialog needn't refetch. */
export type AdjustmentResult = {
  movement: MovementListItem;
  level: { variantId: string; warehouseId: string; onHand: number; lowStock: boolean };
};

export type ChannelRef = { id: string; name: string; kind: ChannelKind };

export type OrderListItem = {
  id: string;
  /** What to print in a table: the channel's id, or a short form of ours. */
  reference: string;
  externalId: string | null;
  channel: ChannelRef;
  status: OrderStatus;
  customerName: string;
  itemCount: number;
  totalCents: number;
  currency: string;
  placedAt: string;
};

export type OrderLine = {
  id: string;
  variantId: string;
  variantSku: string;
  attributes: Record<string, string>;
  productId: string;
  productName: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

/** One row of the status timeline. `fromStatus` is null for the opening event. */
export type OrderEventItem = {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actor: string;
  note: string | null;
  createdAt: string;
};

export type OrderDetail = {
  id: string;
  reference: string;
  externalId: string | null;
  channel: ChannelRef;
  status: OrderStatus;
  customerName: string;
  totalCents: number;
  /** The lines, summed. May differ from totalCents — see the service. */
  lineTotalCents: number;
  currency: string;
  placedAt: string;
  updatedAt: string;
  items: OrderLine[];
  timeline: OrderEventItem[];
  /** From the state machine, so an API client sees the same rules as the UI. */
  allowedTransitions: OrderStatus[];
};

export type OrdersPage = Paginated<OrderListItem> & { channels: ChannelRef[] };

/**
 * One entry of `SyncJob.errorSummary`. Batch APIs answer per item, so a failure
 * is a row in a list and not a message on the job.
 */
export type SyncFailure = { ref: string; code: string; message: string };

export type SyncJobItem = {
  id: string;
  channel: ChannelRef;
  type: SyncJobType;
  status: SyncJobStatus;
  startedAt: string | null;
  finishedAt: string | null;
  /** Derived from the two timestamps, so the screen does no date arithmetic. */
  durationMs: number | null;
  attempt: number;
  itemsOk: number;
  itemsFailed: number;
  failures: SyncFailure[];
  createdAt: string;
};

export type SyncJobsPage = Paginated<SyncJobItem> & { channels: ChannelRef[] };

/** A channel as the Channels screen needs it: what it is, and how its syncs went. */
export type ChannelSummary = {
  id: string;
  name: string;
  kind: ChannelKind;
  isActive: boolean;
  /**
   * `none` for the storefront — orders originate here, so there is nothing to
   * sync — and `planned` for a marketplace whose adapter is not written yet.
   * The screen says which, rather than treating both as "no connector".
   */
  connector: 'ready' | 'planned' | 'none';
  cursor: string | null;
  lastSyncedAt: string | null;
  orderCount: number;
  /** The most recent run of each kind, or null if it has never run. */
  lastJobs: Record<SyncJobType, SyncJobItem | null>;
};

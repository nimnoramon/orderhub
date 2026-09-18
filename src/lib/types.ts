import type { ProductStatus, StockReason } from '@/generated/prisma/enums';

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

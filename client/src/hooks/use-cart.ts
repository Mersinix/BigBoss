import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Set on a cart line that was put back into the cart because its supplier
// cancelled/refused the sub-order it was part of (see hooks/use-realtime.ts's
// suborder_rejected handler). Cleared the moment the Coffee Owner replaces the
// line with another supplier's offering (replaceItem/replacePackItem) or removes
// it outright — never a permanent flag, just a marker for the cart UI to explain
// why the line reappeared and to offer the "choose another supplier" action.
export interface SupplierCancellationInfo {
  orderId: number;
  subOrderId: number;
  supplierName: string;
}

// ── SHOP cart item ────────────────────────────────────────────────────────────

export interface CartItem {
  listingId: number;
  flavorId: number | null;
  sizeId: number | null;
  productId: number;
  productName: string;
  productImageUrl: string | null;
  productCategory: string;
  brandName: string | null;
  categoryName: string | null;
  subCategoryName: string | null;
  supplierId: number;
  supplierName: string;
  flavorName: string | null;
  sizeName: string | null;
  unitPrice: number;
  quantity: number;
  cancelledBySupplier?: SupplierCancellationInfo | null;
}

function cartKey(item: Pick<CartItem, 'listingId' | 'flavorId' | 'sizeId'>): string {
  return `${item.listingId}-${item.flavorId ?? 0}-${item.sizeId ?? 0}`;
}

// ── PRINT cart item ───────────────────────────────────────────────────────────
// Backed by the real PrintCatalogItem schema (server/shared/schema.ts), which
// only models a flat materials[] list, a single unit/priceInCents, and no
// per-item color/size variants — unlike the old mock data, so this line item
// carries a plain quantity + an optional material choice from the catalog
// item's own materials[] rather than an invented size matrix.

export interface PrintCartItem {
  id: string;
  catalogItemId: number;
  name: string;
  imageUrl: string | null;
  printerId: number;
  printerName: string;
  productionTimeDays: number;
  unitPriceInCents: number;
  unit: string;
  minQuantity: number;
  quantity: number;
  material: string;
  uploadedFileDataUrl: string | null;
  uploadedFileName: string | null;
  notes: string;
}

// ── PACK cart item ────────────────────────────────────────────────────────────
// A Pack is purchased as a single line item; the products it contains are kept
// only for display (receipt/cart breakdown), not as separate cart lines.

export interface PackCartItemProduct {
  productId: number;
  productName: string;
  productImageUrl: string | null;
  brandName: string | null;
  categoryName: string | null;
  subCategoryName: string | null;
  flavorName: string | null;
  sizeName: string | null;
  /**
   * Quantity in the current cart line's distribution. The sum of the selected
   * distributions is kept synchronized with PackCartItem.quantity.
   */
  quantity: number;
}

export interface PackCartItem {
  packId: number;
  packName: string;
  packImageUrl: string | null;
  supplierId: number;
  supplierName: string;
  unitPrice: number;
  quantity: number;
  includedProducts: PackCartItemProduct[];
  cancelledBySupplier?: SupplierCancellationInfo | null;
}

function distributionKey(item: Pick<PackCartItemProduct, 'productId' | 'flavorName' | 'sizeName'>): string {
  return `${item.productId}-${item.flavorName ?? ""}-${item.sizeName ?? ""}`;
}

function resizePackDistribution(
  products: PackCartItemProduct[],
  oldPackQuantity: number,
  newPackQuantity: number,
): PackCartItemProduct[] {
  if (products.length === 0 || oldPackQuantity === newPackQuantity) return products;
  const oldTotal = products.reduce((sum, product) => sum + product.quantity, 0);
  const unitsPerPack = Math.max(1, Math.round(oldTotal / Math.max(1, oldPackQuantity)));
  const target = unitsPerPack * newPackQuantity;
  let delta = target - oldTotal;
  const resized = products.map(product => ({ ...product }));

  if (delta > 0) {
    resized[0].quantity += delta;
  } else if (delta < 0) {
    for (const product of resized) {
      if (delta === 0) break;
      const remove = Math.min(product.quantity, -delta);
      product.quantity -= remove;
      delta += remove;
    }
  }
  return resized.filter(product => product.quantity > 0);
}

// ── Combined cart state ───────────────────────────────────────────────────────

interface CartState {
  items: CartItem[];
  printItems: PrintCartItem[];
  packItems: PackCartItem[];

  // SHOP actions
  addItem: (item: Omit<CartItem, 'quantity'>, quantity: number) => void;
  removeItem: (listingId: number, flavorId: number | null, sizeId: number | null) => void;
  updateQuantity: (listingId: number, flavorId: number | null, sizeId: number | null, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemQuantity: (listingId: number, flavorId: number | null, sizeId: number | null) => number;
  getItemsBySupplier: () => Map<number, { supplierName: string; items: CartItem[] }>;
  // Puts a line back into the cart because its supplier cancelled the order it was
  // part of, tagging it with cancelledBySupplier so the cart can explain why it
  // reappeared and offer a replacement action. Merges into an existing identical
  // line (same product/variant) if one already exists, same as addItem.
  restoreItem: (item: Omit<CartItem, 'quantity' | 'cancelledBySupplier'>, quantity: number, cancelledBySupplier: SupplierCancellationInfo) => void;
  // Atomically removes the cancelled line (identified by its old identity) and adds
  // the newly chosen supplier's line in its place — never leaves both lines present.
  replaceItem: (
    oldKey: { listingId: number; flavorId: number | null; sizeId: number | null },
    item: Omit<CartItem, 'quantity' | 'cancelledBySupplier'>,
    quantity: number,
  ) => void;

  // PRINT actions
  addPrintItem: (item: Omit<PrintCartItem, 'id'>) => void;
  removePrintItem: (id: string) => void;
  updatePrintQuantity: (id: string, quantity: number) => void;
  clearPrintItems: () => void;
  getPrintTotal: () => number;
  getTotalItemCount: () => number;

  // PACK actions
  addPackItem: (item: Omit<PackCartItem, 'quantity'>, quantity: number) => void;
  setPackItem: (item: Omit<PackCartItem, 'quantity'>, quantity: number) => void;
  removePackItem: (packId: number) => void;
  updatePackQuantity: (packId: number, quantity: number) => void;
  clearPackItems: () => void;
  getPackTotal: () => number;
  getPackQuantity: (packId: number) => number;
  // Same restore/replace pair as the SHOP actions above, but for Pack lines.
  restorePackItem: (item: Omit<PackCartItem, 'quantity' | 'cancelledBySupplier'>, quantity: number, cancelledBySupplier: SupplierCancellationInfo) => void;
  replacePackItem: (oldPackId: number, item: Omit<PackCartItem, 'quantity' | 'cancelledBySupplier'>, quantity: number) => void;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      printItems: [],
      packItems: [],

      // ── SHOP ──
      addItem: (itemData, quantity) => {
        set((state) => {
          const key = cartKey(itemData);
          const existing = state.items.find(i => cartKey(i) === key);
          if (existing) {
            return { items: state.items.map(i => cartKey(i) === key ? { ...i, quantity: i.quantity + quantity } : i) };
          }
          return { items: [...state.items, { ...itemData, quantity }] };
        });
      },

      removeItem: (listingId, flavorId, sizeId) => {
        const key = cartKey({ listingId, flavorId, sizeId });
        set((state) => ({ items: state.items.filter(i => cartKey(i) !== key) }));
      },

      updateQuantity: (listingId, flavorId, sizeId, quantity) => {
        const key = cartKey({ listingId, flavorId, sizeId });
        set((state) => ({
          items: quantity <= 0
            ? state.items.filter(i => cartKey(i) !== key)
            : state.items.map(i => cartKey(i) === key ? { ...i, quantity } : i),
        }));
      },

      clearCart: () => set({ items: [] }),

      getTotal: () => get().items.reduce((t, i) => t + i.unitPrice * i.quantity, 0),

      getItemQuantity: (listingId, flavorId, sizeId) => {
        const key = cartKey({ listingId, flavorId, sizeId });
        return get().items.find(i => cartKey(i) === key)?.quantity ?? 0;
      },

      getItemsBySupplier: () => {
        const map = new Map<number, { supplierName: string; items: CartItem[] }>();
        for (const item of get().items) {
          if (!map.has(item.supplierId)) {
            map.set(item.supplierId, { supplierName: item.supplierName, items: [] });
          }
          map.get(item.supplierId)!.items.push(item);
        }
        return map;
      },

      restoreItem: (itemData, quantity, cancelledBySupplier) => {
        set((state) => {
          const key = cartKey(itemData);
          const existing = state.items.find(i => cartKey(i) === key);
          if (existing) {
            return { items: state.items.map(i => cartKey(i) === key ? { ...i, quantity: i.quantity + quantity, cancelledBySupplier } : i) };
          }
          return { items: [...state.items, { ...itemData, quantity, cancelledBySupplier }] };
        });
      },

      replaceItem: (oldKey, itemData, quantity) => {
        set((state) => {
          const oldCartKey = cartKey(oldKey);
          const withoutOld = state.items.filter(i => cartKey(i) !== oldCartKey);
          const newCartKey = cartKey(itemData);
          const existingNew = withoutOld.find(i => cartKey(i) === newCartKey);
          if (existingNew) {
            return { items: withoutOld.map(i => cartKey(i) === newCartKey ? { ...i, quantity: i.quantity + quantity, cancelledBySupplier: null } : i) };
          }
          return { items: [...withoutOld, { ...itemData, quantity, cancelledBySupplier: null }] };
        });
      },

      // ── PRINT ──
      addPrintItem: (item) => {
        const id = `print-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((state) => ({ printItems: [...state.printItems, { ...item, id }] }));
      },

      removePrintItem: (id) => {
        set((state) => ({ printItems: state.printItems.filter(i => i.id !== id) }));
      },

      updatePrintQuantity: (id, quantity) => {
        set((state) => ({
          printItems: quantity <= 0
            ? state.printItems.filter(i => i.id !== id)
            : state.printItems.map(i => i.id === id ? { ...i, quantity } : i),
        }));
      },

      clearPrintItems: () => set({ printItems: [] }),

      getPrintTotal: () =>
        get().printItems.reduce((t, i) => t + i.unitPriceInCents * i.quantity, 0),

      getTotalItemCount: () => {
        const shop = get().items.reduce((s, i) => s + i.quantity, 0);
        const print = get().printItems.reduce((s, i) => s + i.quantity, 0);
        const pack = get().packItems.reduce((s, i) => s + i.quantity, 0);
        return shop + print + pack;
      },

      // ── PACK ──
      addPackItem: (itemData, quantity) => {
        set((state) => {
          const existing = state.packItems.find(i => i.packId === itemData.packId);
          if (existing) {
            const merged = [...existing.includedProducts];
            for (const product of itemData.includedProducts) {
              const existingProduct = merged.find(item => distributionKey(item) === distributionKey(product));
              if (existingProduct) {
                existingProduct.quantity += product.quantity;
              } else {
                merged.push({ ...product });
              }
            }
            return {
              packItems: state.packItems.map(i => i.packId === itemData.packId
                ? { ...i, quantity: i.quantity + quantity, includedProducts: merged }
                : i),
            };
          }
          return { packItems: [...state.packItems, { ...itemData, quantity }] };
        });
      },

      // Replaces an existing pack cart line in place with a fully new
      // configuration (quantity + distribution) — used by the Cart's Edit
      // flow. Unlike addPackItem, this never merges/adds onto the existing
      // quantity or distribution; it is a straight replace of that one line,
      // keyed by packId (the cart's existing unique key for pack lines).
      setPackItem: (itemData, quantity) => {
        set((state) => ({
          packItems: state.packItems.map(i => i.packId === itemData.packId
            ? { ...itemData, quantity }
            : i),
        }));
      },

      removePackItem: (packId) => {
        set((state) => ({ packItems: state.packItems.filter(i => i.packId !== packId) }));
      },

      updatePackQuantity: (packId, quantity) => {
        set((state) => ({
          packItems: quantity <= 0
            ? state.packItems.filter(i => i.packId !== packId)
            : state.packItems.map(i => i.packId === packId
              ? {
                  ...i,
                  quantity,
                  includedProducts: resizePackDistribution(i.includedProducts, i.quantity, quantity),
                }
              : i),
        }));
      },

      clearPackItems: () => set({ packItems: [] }),

      getPackTotal: () => get().packItems.reduce((t, i) => t + i.unitPrice * i.quantity, 0),

      getPackQuantity: (packId) => get().packItems.find(i => i.packId === packId)?.quantity ?? 0,

      restorePackItem: (itemData, quantity, cancelledBySupplier) => {
        set((state) => {
          const existing = state.packItems.find(i => i.packId === itemData.packId);
          if (existing) {
            return {
              packItems: state.packItems.map(i => i.packId === itemData.packId
                ? { ...i, quantity: i.quantity + quantity, cancelledBySupplier }
                : i),
            };
          }
          return { packItems: [...state.packItems, { ...itemData, quantity, cancelledBySupplier }] };
        });
      },

      // A replacement Pack is necessarily a different Pack entity (different packId —
      // Packs belong to exactly one supplier, so "another supplier" means a different
      // Pack, not a different listing of the same one). Removes the cancelled line by
      // its old packId and adds the newly chosen Pack in its place, atomically.
      replacePackItem: (oldPackId, itemData, quantity) => {
        set((state) => {
          const withoutOld = state.packItems.filter(i => i.packId !== oldPackId);
          const existingNew = withoutOld.find(i => i.packId === itemData.packId);
          if (existingNew) {
            return {
              packItems: withoutOld.map(i => i.packId === itemData.packId
                ? { ...i, quantity: i.quantity + quantity, cancelledBySupplier: null }
                : i),
            };
          }
          return { packItems: [...withoutOld, { ...itemData, quantity, cancelledBySupplier: null }] };
        });
      },
    }),
    { name: 'b2b-cart-v3' }
  )
);

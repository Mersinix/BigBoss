import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── SHOP cart item ────────────────────────────────────────────────────────────

export interface CartItem {
  listingId: number;
  flavorId: number | null;
  sizeId: number | null;
  productId: number;
  productName: string;
  productImageUrl: string | null;
  productCategory: string;
  supplierId: number;
  supplierName: string;
  flavorName: string | null;
  sizeName: string | null;
  unitPrice: number;
  quantity: number;
}

function cartKey(item: Pick<CartItem, 'listingId' | 'flavorId' | 'sizeId'>): string {
  return `${item.listingId}-${item.flavorId ?? 0}-${item.sizeId ?? 0}`;
}

// ── PRINT cart item ───────────────────────────────────────────────────────────

export interface PrintCartItem {
  id: string;
  printProductId: string;
  printProductName: string;
  printProductImage: string | null;
  brandId: string;
  brandName: string;
  deliveryTime: string;
  uploadedFileDataUrl: string | null;
  uploadedFileName: string | null;
  primaryColor: string;
  secondaryColor: string;
  material: string;
  sizeMatrix: Record<string, number>;
  hasSizes: boolean;
  generalQuantity: number;
  notes: string;
  unitPrice: number;
  totalQuantity: number;
  priceUnit: string;
}

// ── Combined cart state ───────────────────────────────────────────────────────

interface CartState {
  items: CartItem[];
  printItems: PrintCartItem[];

  // SHOP actions
  addItem: (item: Omit<CartItem, 'quantity'>, quantity: number) => void;
  removeItem: (listingId: number, flavorId: number | null, sizeId: number | null) => void;
  updateQuantity: (listingId: number, flavorId: number | null, sizeId: number | null, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemQuantity: (listingId: number, flavorId: number | null, sizeId: number | null) => number;
  getItemsBySupplier: () => Map<number, { supplierName: string; items: CartItem[] }>;

  // PRINT actions
  addPrintItem: (item: Omit<PrintCartItem, 'id'>) => void;
  removePrintItem: (id: string) => void;
  updatePrintQuantity: (id: string, sizeMatrix: Record<string, number>, generalQuantity: number) => void;
  clearPrintItems: () => void;
  getPrintTotal: () => number;
  getTotalItemCount: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      printItems: [],

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

      // ── PRINT ──
      addPrintItem: (item) => {
        const id = `print-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((state) => ({ printItems: [...state.printItems, { ...item, id }] }));
      },

      removePrintItem: (id) => {
        set((state) => ({ printItems: state.printItems.filter(i => i.id !== id) }));
      },

      updatePrintQuantity: (id, sizeMatrix, generalQuantity) => {
        const totalQuantity = Object.values(sizeMatrix).reduce((s, v) => s + v, 0) || generalQuantity;
        set((state) => ({
          printItems: state.printItems.map(i =>
            i.id === id ? { ...i, sizeMatrix, generalQuantity, totalQuantity } : i
          ),
        }));
      },

      clearPrintItems: () => set({ printItems: [] }),

      getPrintTotal: () =>
        get().printItems.reduce((t, i) => t + i.unitPrice * i.totalQuantity, 0),

      getTotalItemCount: () => {
        const shop = get().items.reduce((s, i) => s + i.quantity, 0);
        const print = get().printItems.reduce((s, i) => s + i.totalQuantity, 0);
        return shop + print;
      },
    }),
    { name: 'b2b-cart-v3' }
  )
);

import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { invalidateMarketplace } from "@/lib/invalidate-marketplace";
import { useCart } from "@/hooks/use-cart";

const CATALOG_EVENTS = [
  "catalog_suggestion_created",
  "catalog_suggestion_updated",
  "catalog_suggestion_approved",
  "catalog_suggestion_deleted",
  "supplier_mapping_changed",
];

const TAXONOMY_EVENTS = ["taxonomy_updated"];
const SYSTEM_SERVICES_EVENTS = ["system_services_updated"];
const LANDING_CONFIG_EVENTS = ["landing_config_updated"];
const CURRENCY_EVENTS = ["currency_updated"];
const STORE_EVENTS = ["store_updated", "store_approval_changed"];
const PACK_EVENTS = ["pack_updated"];
const PRODUCT_EVENTS = ["product_updated"];
const INVENTORY_EVENTS = ["inventory_updated"];
const PROMOTION_EVENTS = ["promotion_updated"];
const ORDER_EVENTS = ["order_created", "order_status_changed", "suborder_status_changed", "order_deleted"];
const MESSAGING_EVENTS = ["new_message", "conversation_updated"];
const MAINTENANCE_EVENTS = ["maintenance_updated", "maintenance_reservation_updated", "maintenance_favorite_updated", "maintenance_review_updated"];

function invalidateInventoryQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["/api/supplier/inventory"] });
  qc.invalidateQueries({ queryKey: ["/api/supplier/listings"] });
  invalidateMarketplace(qc);
  invalidateStoreQueries(qc);
}

function invalidateProductQueries(qc: QueryClient) {
  invalidateMarketplace(qc);
  invalidatePackQueries(qc);
  invalidateStoreQueries(qc);
  qc.invalidateQueries({ queryKey: ["/api/marketplace/promotions"] });
  qc.invalidateQueries({ queryKey: ["/api/favorites"] });
  qc.invalidateQueries({ queryKey: ["/api/pack-favorites"] });
  qc.invalidateQueries({ queryKey: ["/api/categories"] });
  qc.invalidateQueries({ queryKey: ["/api/subcategories"] });
  qc.invalidateQueries({ queryKey: ["/api/flavors"] });
  qc.invalidateQueries({ queryKey: ["/api/sizes"] });
  qc.invalidateQueries({ queryKey: ["/api/brands"] });
}

function invalidateStoreQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["/api/supplier/store"] });
  qc.invalidateQueries({ queryKey: ["/api/admin/stores"] });
  qc.invalidateQueries({ queryKey: ["/api/stores"] });
}

function invalidatePackQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["/api/marketplace/packs"] });
  qc.invalidateQueries({ queryKey: ["/api/supplier/packs"] });
  qc.invalidateQueries({ queryKey: ["/api/admin/packs"] });
  qc.invalidateQueries({ predicate: (q) => {
    const key = q.queryKey as string[];
    return Array.isArray(key) && key[0] === "/api/stores" && key[2] === "packs";
  }});
}

function invalidateSupplierMappingQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["/api/supplier/categories"] });
  qc.invalidateQueries({ queryKey: ["/api/admin/supplier-mappings"] });
  qc.invalidateQueries({ queryKey: ["/api/supplier/admin-products"] });
  qc.invalidateQueries({ queryKey: ["/api/supplier/listings"] });
  invalidateMarketplace(qc);
}

function invalidateMessagingQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
  qc.invalidateQueries({ queryKey: ["/api/messages/admin/all"] });
  qc.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
}

export function useRealtime(userId?: number) {
  const qc = useQueryClient();

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let alive = true;

    function connect() {
      if (!alive) return;
      ws = new WebSocket(url);

      ws.onopen = () => {
        // Register this connection with the server so we receive targeted messages
        if (userId) ws.send(JSON.stringify({ event: "user_register", userId }));
      };

      ws.onmessage = (e) => {
        try {
          const { event, data } = JSON.parse(e.data);
          if (CATALOG_EVENTS.includes(event)) {
            qc.invalidateQueries({ queryKey: ["/api/supplier/catalog-suggestions"] });
            qc.invalidateQueries({ queryKey: ["/api/admin/catalog-suggestions"] });
            qc.invalidateQueries({ queryKey: ["/api/categories"] });
            qc.invalidateQueries({ queryKey: ["/api/subcategories"] });
            qc.invalidateQueries({ queryKey: ["/api/flavors"] });
            qc.invalidateQueries({ queryKey: ["/api/sizes"] });
            qc.invalidateQueries({ queryKey: ["/api/brands"] });
            if (event === "supplier_mapping_changed") {
              invalidateSupplierMappingQueries(qc);
            } else {
              qc.invalidateQueries({ queryKey: ["/api/supplier/categories"] });
              qc.invalidateQueries({ queryKey: ["/api/supplier/admin-products"] });
              invalidateMarketplace(qc);
            }
          }
          if (SYSTEM_SERVICES_EVENTS.includes(event)) {
            qc.invalidateQueries({ queryKey: ["/api/system-services"] });
            qc.invalidateQueries({ queryKey: ["/api/system-service-order"] });
            qc.invalidateQueries({ queryKey: ["/api/landing-config"] });
          }
          if (LANDING_CONFIG_EVENTS.includes(event)) {
            qc.invalidateQueries({ queryKey: ["/api/landing-config"] });
          }
          if (CURRENCY_EVENTS.includes(event)) {
            qc.invalidateQueries({ queryKey: ["/api/system-currency"] });
          }
          if (STORE_EVENTS.includes(event)) {
            invalidateStoreQueries(qc);
          }
          if (PRODUCT_EVENTS.includes(event)) {
            invalidateProductQueries(qc);
          }
          if (PACK_EVENTS.includes(event)) {
            invalidatePackQueries(qc);
          }
          if (INVENTORY_EVENTS.includes(event)) {
            invalidateInventoryQueries(qc);
            invalidatePackQueries(qc);
          }
          if (PROMOTION_EVENTS.includes(event)) {
            invalidateMarketplace(qc);
            qc.invalidateQueries({ queryKey: ["/api/marketplace/promotions"] });
            qc.invalidateQueries({ queryKey: ["/api/stores"] });
          }
          if (event === 'suborder_rejected') {
            // Restore rejected items directly into the cafe owner's cart
            const cart = useCart.getState();
            for (const item of (data?.regularItems ?? [])) {
              cart.addItem({
                listingId: item.listingId,
                productId: item.productId,
                supplierId: item.supplierId,
                supplierName: item.supplierName ?? '',
                flavorId: item.flavorId ?? null,
                sizeId: item.sizeId ?? null,
                flavorName: item.flavorName ?? null,
                sizeName: item.sizeName ?? null,
                unitPrice: item.unitPrice,
                productName: item.productName ?? '',
                productImageUrl: item.productImageUrl ?? null,
                productCategory: item.productCategory ?? '',
              }, item.quantity);
            }
            for (const pack of (data?.packItems ?? [])) {
              cart.addPackItem({
                packId: pack.packId,
                packName: pack.packName ?? '',
                packImageUrl: pack.packImageUrl ?? null,
                supplierId: pack.supplierId,
                supplierName: pack.supplierName ?? '',
                unitPrice: pack.unitPrice ?? 0,
                includedProducts: pack.includedProducts ?? [],
              }, pack.quantity);
            }
            // Invalidate orders so the UI reflects the rejection
            qc.invalidateQueries({ queryKey: ['/api/orders'] });
          }
          if (TAXONOMY_EVENTS.includes(event)) {
            qc.invalidateQueries({ queryKey: ["/api/categories"] });
            qc.invalidateQueries({ queryKey: ["/api/subcategories"] });
            qc.invalidateQueries({ queryKey: ["/api/flavors"] });
            qc.invalidateQueries({ queryKey: ["/api/sizes"] });
            qc.invalidateQueries({ queryKey: ["/api/brands"] });
            qc.invalidateQueries({ queryKey: ["/api/admin/products"] });
            qc.invalidateQueries({ queryKey: ["/api/supplier/admin-products"] });
            invalidateMarketplace(qc);
          }
          if (ORDER_EVENTS.includes(event)) {
            qc.invalidateQueries({ queryKey: ["/api/orders"] });
            qc.invalidateQueries({ queryKey: ["/api/returns"] });
          }
          if (MESSAGING_EVENTS.includes(event)) {
            invalidateMessagingQueries(qc);
            // Invalidate the specific conversation's messages too
            if (data?.conversationId) {
              qc.invalidateQueries({ queryKey: ["/api/messages/conversations", data.conversationId, "messages"] });
            }
          }
          if (MAINTENANCE_EVENTS.includes(event)) {
            qc.invalidateQueries({ queryKey: ["/api/maintenance/profiles"] });
            qc.invalidateQueries({ queryKey: ["/api/maintenance/categories"] });
            qc.invalidateQueries({ queryKey: ["/api/maintenance/taxonomy"] });
            qc.invalidateQueries({ queryKey: ["/api/maintenance/reservations"] });
            qc.invalidateQueries({ queryKey: ["/api/maintenance-favorites"] });
            qc.invalidateQueries({ queryKey: ["/api/maintenance/profile"] });
            qc.invalidateQueries({ queryKey: ["/api/maintenance/reviews"] });
            qc.invalidateQueries({ queryKey: ["/api/admin/maintenance"] });
            qc.invalidateQueries({ queryKey: ["/api/admin/reviews", "MAINTENANCE"] });
          }
        } catch {}
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        if (alive) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      alive = false;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [qc, userId]);
}

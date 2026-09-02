import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { invalidateMarketplace } from "@/lib/invalidate-marketplace";
import { useCart } from "@/hooks/use-cart";
import { PACK_AVAILABILITY_KEY } from "@/hooks/use-pack-availability";

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
const ORDER_EVENTS = ["order_created", "order_status_changed", "suborder_status_changed", "suborder_items_cancelled", "order_deleted"];
const DELIVERY_EVENTS = ["delivery_created", "delivery_accepted", "delivery_assigned", "delivery_status_changed"];
const DELIVERY_ECOSYSTEM_EVENTS = ["vehicle_updated", "delivery_pricing_updated", "driver_review_created", "delivery_opportunity_updated"];
const MESSAGING_EVENTS = ["new_message", "conversation_updated", "conversation_deleted", "messages_settings_updated"];
const MAINTENANCE_EVENTS = ["maintenance_updated", "maintenance_reservation_updated", "maintenance_favorite_updated", "maintenance_review_updated", "admin_maintenance_report_created"];
const PRINT_EVENTS = ["print_catalog_updated", "print_order_updated", "print_categories_updated", "print_review_updated"];
const USER_PROFILE_EVENTS = ["user_profile_updated"];
const ADMIN_USER_DIRECTORY_EVENTS = ["admin_user_directory_changed"];
const BARISTA_EVENTS = [
  "barista_profile_updated",
  "barista_request_created",
  "barista_request_status_changed",
  "barista_mission_created",
  "barista_mission_status_changed",
  "barista_review_created",
  "barista_taxonomy_updated",
  "barista_favorite_updated",
  "admin_barista_report_created",
];
const ACADEMY_EVENTS = [
  "academy_profile_updated",
  "academy_course_updated",
  "academy_session_updated",
  "academy_registration_created",
  "academy_registration_status_changed",
  "academy_review_created",
];
const NOTIFICATION_EVENTS = ["notification_created"];

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
  // Re-check every Pack currently sitting in the SHOP cart against its live backend
  // state (see hooks/use-pack-availability.ts) — this is what lets a Coffee Owner
  // already on /cart see a Pack freeze/unfreeze in real time, with no page refresh,
  // whenever a Supplier creates/updates/deletes a Pack (pack_updated) or its stock
  // changes (inventory_updated). The query itself only ever fetches whatever pack ids
  // are currently in that browser tab's cart, so this is a no-op for any tab whose
  // cart doesn't contain the affected Pack — never a broad app-wide refetch.
  qc.invalidateQueries({ queryKey: [PACK_AVAILABILITY_KEY] });
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

// Notification list/unread-count queries are keyed ["/api/notifications", {service}]
// / ["/api/notifications/unread-count", {service}] — invalidate every variant
// (Tous + each service tab) in one predicate rather than one call per service.
function invalidateNotificationQueries(qc: QueryClient) {
  qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/notifications" });
  qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/notifications/unread-count" });
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
        // A pack_updated/inventory_updated event fired while this tab was disconnected
        // (initial load, dropped connection, reconnect) would otherwise never be seen —
        // revalidate the cart's Pack availability on every (re)connect so it can never
        // stay stale indefinitely; a no-op if the cart has no Packs.
        qc.invalidateQueries({ queryKey: [PACK_AVAILABILITY_KEY] });
        // Same reasoning for notifications — a notification created while this tab was
        // offline is still persisted server-side (see server/notify.ts), but the badge/list
        // only reflects it once we refetch; do that on every (re)connect, not just live events.
        if (userId) invalidateNotificationQueries(qc);
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
            // Restore rejected items directly into the cafe owner's cart, tagged with
            // cancelledBySupplier so the Cart page can explain why each line reappeared
            // and offer the "choose another supplier" replacement action (see
            // pages/cafe/cart-page.tsx) — never a silent, unexplained re-add.
            const cart = useCart.getState();
            const cancelledBySupplier = {
              orderId: data?.orderId,
              subOrderId: data?.subOrderId,
              supplierName: data?.supplierName ?? '',
            };
            for (const item of (data?.regularItems ?? [])) {
              cart.restoreItem({
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
                brandName: item.brandName ?? null,
                categoryName: item.categoryName ?? item.productCategory ?? null,
                subCategoryName: item.subCategoryName ?? null,
              }, item.quantity, cancelledBySupplier);
            }
            for (const pack of (data?.packItems ?? [])) {
              cart.restorePackItem({
                packId: pack.packId,
                packName: pack.packName ?? '',
                packImageUrl: pack.packImageUrl ?? null,
                supplierId: pack.supplierId,
                supplierName: pack.supplierName ?? '',
                unitPrice: pack.unitPrice ?? 0,
                includedProducts: pack.includedProducts ?? [],
              }, pack.quantity, cancelledBySupplier);
            }
            // Invalidate orders so the UI reflects the rejection
            qc.invalidateQueries({ queryKey: ['/api/orders'] });
          }
          if (USER_PROFILE_EVENTS.includes(event)) {
            // Targeted at this session's own user (see broadcastToUsers in server/routes.ts)
            // so the profile picture/phone/WhatsApp/location edited in one tab (or by an
            // Admin) shows up immediately in every other open tab for that same user.
            qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
          }
          if (ADMIN_USER_DIRECTORY_EVENTS.includes(event)) {
            qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
            qc.invalidateQueries({ queryKey: ["/api/admin/print"] });
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
            invalidateMessagingQueries(qc);
          }
          if (DELIVERY_EVENTS.includes(event)) {
            qc.invalidateQueries({ queryKey: ["/api/deliveries"] });
            // Delivery status changes propagate into sub-order/order aggregates.
            qc.invalidateQueries({ queryKey: ["/api/orders"] });
          }
          if (DELIVERY_ECOSYSTEM_EVENTS.includes(event)) {
            qc.invalidateQueries({ queryKey: ["/api/deliveries"] });
            qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/vehicles") });
            qc.invalidateQueries({ queryKey: ["/api/driver/vehicle"] });
            qc.invalidateQueries({ queryKey: ["/api/admin/delivery-pricing"] });
            qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/driver/reviews") });
            qc.invalidateQueries({ queryKey: ["/api/delivery-company/opportunities"] });
            qc.invalidateQueries({ queryKey: ["/api/driver/opportunities"] });
          }
          if (MESSAGING_EVENTS.includes(event)) {
            invalidateMessagingQueries(qc);
            if (event === "messages_settings_updated") {
              qc.invalidateQueries({ queryKey: ["/api/messages/settings"] });
            }
            // Invalidate the specific conversation's messages too
            if (data?.conversationId) {
              qc.invalidateQueries({ queryKey: ["/api/messages/conversations", data.conversationId, "messages"] });
            }
          }
          if (PRINT_EVENTS.includes(event)) {
            qc.invalidateQueries({ queryKey: ["/api/print/catalog"] });
            qc.invalidateQueries({ queryKey: ["/api/print/marketplace"] });
            qc.invalidateQueries({ queryKey: ["/api/print/categories"] });
            qc.invalidateQueries({ queryKey: ["/api/print/taxonomy"] });
            qc.invalidateQueries({ queryKey: ["/api/print/me/categories"] });
            qc.invalidateQueries({ queryKey: ["/api/print/orders"] });
            qc.invalidateQueries({ queryKey: ["/api/print/revenue"] });
            qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/print/reviews") });
            qc.invalidateQueries({ queryKey: ["/api/admin/print"] });
            invalidateMessagingQueries(qc);
          }
          if (MAINTENANCE_EVENTS.includes(event)) {
            qc.invalidateQueries({ queryKey: ["/api/maintenance-favorites"] });
            qc.invalidateQueries({ queryKey: ["/api/maintenance/profiles"] });
            qc.invalidateQueries({ queryKey: ["/api/maintenance/categories"] });
            qc.invalidateQueries({ queryKey: ["/api/maintenance/taxonomy"] });
            qc.invalidateQueries({ queryKey: ["/api/maintenance/reservations"] });
            qc.invalidateQueries({ queryKey: ["/api/maintenance-favorites"] });
            qc.invalidateQueries({ queryKey: ["/api/maintenance/profile"] });
            qc.invalidateQueries({ queryKey: ["/api/maintenance/reviews"] });
            qc.invalidateQueries({ queryKey: ["/api/admin/maintenance"] });
            qc.invalidateQueries({ queryKey: ["/api/admin/maintenance/reports"] });
            qc.invalidateQueries({ queryKey: ["/api/maintenance/reports/mine"] });
            qc.invalidateQueries({ queryKey: ["/api/admin/reviews", "MAINTENANCE"] });
            invalidateMessagingQueries(qc);
          }
          if (BARISTA_EVENTS.includes(event)) {
            qc.invalidateQueries({ queryKey: ["/api/barista/profiles"] });
            qc.invalidateQueries({ queryKey: ["/api/barista/skills"] });
            qc.invalidateQueries({ queryKey: ["/api/barista/requests"] });
            qc.invalidateQueries({ queryKey: ["/api/barista/missions"] });
            qc.invalidateQueries({ queryKey: ["/api/barista/revenue"] });
            qc.invalidateQueries({ queryKey: ["/api/barista/reviews"] });
            qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/barista/profile") });
            qc.invalidateQueries({ queryKey: ["/api/admin/barista/skills"] });
            qc.invalidateQueries({ queryKey: ["/api/admin/barista"] });
            qc.invalidateQueries({ queryKey: ["/api/admin/barista/reports"] });
            qc.invalidateQueries({ queryKey: ["/api/barista/reports/mine"] });
            qc.invalidateQueries({ queryKey: ["/api/barista-favorites"] });
            if (event === "barista_request_created" || event === "barista_request_status_changed") {
              invalidateMessagingQueries(qc);
            }
          }
          if (ACADEMY_EVENTS.includes(event)) {
            qc.invalidateQueries({ queryKey: ["/api/academy/courses"] });
            qc.invalidateQueries({ queryKey: ["/api/academy/my/courses"] });
            qc.invalidateQueries({ queryKey: ["/api/academy/sessions"] });
            qc.invalidateQueries({ queryKey: ["/api/academy/registrations"] });
            qc.invalidateQueries({ queryKey: ["/api/academy/revenue"] });
            qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/academy/reviews") });
            qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/academy/profile") });
            qc.invalidateQueries({ queryKey: ["/api/admin/academy"] });
            if (event === "academy_registration_created" || event === "academy_registration_status_changed") {
              invalidateMessagingQueries(qc);
            }
          }
          if (NOTIFICATION_EVENTS.includes(event)) {
            invalidateNotificationQueries(qc);
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

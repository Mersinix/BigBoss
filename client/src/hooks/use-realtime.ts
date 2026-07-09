import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { invalidateMarketplace } from "@/lib/invalidate-marketplace";

const CATALOG_EVENTS = [
  "catalog_suggestion_created",
  "catalog_suggestion_updated",
  "catalog_suggestion_approved",
  "catalog_suggestion_deleted",
  "supplier_mapping_changed",
];

const TAXONOMY_EVENTS = ["taxonomy_updated"];

const SYSTEM_SERVICES_EVENTS = ["system_services_updated"];

const STORE_EVENTS = ["store_updated", "store_approval_changed"];

const PACK_EVENTS = ["pack_updated"];

function invalidateStoreQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["/api/supplier/store"] });
  qc.invalidateQueries({ queryKey: ["/api/admin/stores"] });
  qc.invalidateQueries({ queryKey: ["/api/stores"] });
}

function invalidatePackQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["/api/marketplace/packs"] });
  qc.invalidateQueries({ queryKey: ["/api/supplier/packs"] });
  qc.invalidateQueries({ queryKey: ["/api/admin/packs"] });
  // Also invalidate store-specific pack queries (any /api/stores/.../packs key)
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

export function useRealtime() {
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

      ws.onmessage = (e) => {
        try {
          const { event } = JSON.parse(e.data);
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
          }
          if (STORE_EVENTS.includes(event)) {
            invalidateStoreQueries(qc);
          }
          if (PACK_EVENTS.includes(event)) {
            invalidatePackQueries(qc);
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
  }, [qc]);
}

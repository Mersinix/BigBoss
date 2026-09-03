// Single source of truth for notification-preference categories — the coarse
// toggle a user controls (e.g. "shop_orders") is a many-to-one grouping over the
// many fine-grained notify() `type` strings (e.g. order_created, order_cancelled,
// suborder_status_changed, ...). A category is only defined here if a real
// notify()/notifyMany() call site in server/routes.ts is actually gated by it —
// no toggle exists for an event the project doesn't generate (e.g. payouts/invoices,
// which have no real backend workflow yet).
//
// Storage: users.notificationPreferences, a plain { [key]: boolean } opt-out map.
// A key absent from the map (or the whole column being null) means enabled.
// "system" notifications (account approved/rejected) never consult this map at
// all — they're not part of NotificationPrefKey and cannot be disabled.

export type NotificationPrefKey =
  | "messages"
  | "reviews"
  | "shop_orders"
  | "shop_delivery"
  | "shop_stock"
  | "catalog"
  | "stores"
  | "maintenance_requests"
  | "maintenance_status"
  | "print_requests"
  | "print_status"
  | "barista_requests"
  | "barista_missions"
  | "academy"
  | "marketing_requests"
  | "marketing_status"
  | "delivery_opportunities"
  | "accounts"
  | "reports";

export type NotificationPrefGroup =
  | "Général"
  | "Messages & Avis"
  | "Commandes"
  | "Livraison"
  | "Catalogue"
  | "Services"
  | "Administration";

export const NOTIFICATION_PREF_DEFS: Record<NotificationPrefKey, { label: string; group: NotificationPrefGroup; description?: string }> = {
  messages: { label: "Messages", group: "Messages & Avis", description: "Nouveau message reçu dans une conversation." },
  reviews: { label: "Avis", group: "Messages & Avis", description: "Nouvel avis client reçu." },
  shop_orders: { label: "Commandes", group: "Commandes", description: "Nouvelle commande, confirmation, préparation, annulation." },
  shop_delivery: { label: "Livraison", group: "Livraison", description: "Affectation, ramassage, transit, livraison terminée." },
  shop_stock: { label: "Stock", group: "Commandes", description: "Alertes de stock bas ou de rupture." },
  catalog: { label: "Catalogue", group: "Catalogue", description: "Demandes de catégories et taxonomie." },
  stores: { label: "Boutique", group: "Catalogue", description: "Statut d'approbation de votre boutique." },
  maintenance_requests: { label: "Nouvelles demandes", group: "Services" },
  maintenance_status: { label: "Suivi Maintenance", group: "Services", description: "Confirmation, reprogrammation, fin d'intervention." },
  print_requests: { label: "Nouvelles commandes", group: "Services" },
  print_status: { label: "Suivi Print", group: "Services", description: "Statut de vos commandes d'impression." },
  barista_requests: { label: "Nouvelles demandes", group: "Services" },
  barista_missions: { label: "Missions", group: "Services" },
  academy: { label: "Academy", group: "Services" },
  marketing_requests: { label: "Nouvelles demandes", group: "Services" },
  marketing_status: { label: "Suivi Marketing", group: "Services", description: "Devis, changement de statut de projet, fin de projet." },
  delivery_opportunities: { label: "Opportunités", group: "Livraison" },
  accounts: { label: "Inscriptions & approbations", group: "Administration" },
  reports: { label: "Signalements", group: "Administration" },
};

// Which categories each role's Settings page shows — curated per role so an
// irrelevant toggle (e.g. Admin's catalog toggle) never appears for a role it
// doesn't concern (spec: "A Delivery Driver should not have a Supplier Product
// Approval toggle").
export const ROLE_NOTIFICATION_PREF_KEYS: Partial<Record<string, NotificationPrefKey[]>> = {
  ADMIN: ["messages", "catalog", "shop_orders", "shop_stock", "shop_delivery", "accounts", "reports"],
  SUPER_ADMIN: ["messages", "catalog", "shop_orders", "shop_stock", "shop_delivery", "accounts", "reports"],
  SUPPLIER: ["messages", "reviews", "shop_orders", "shop_stock", "shop_delivery", "catalog", "stores"],
  CAFE_OWNER: ["messages", "shop_orders", "shop_delivery", "maintenance_status", "print_status", "barista_missions", "academy", "marketing_status"],
  DELIVERY_COMPANY: ["messages", "shop_delivery", "delivery_opportunities"],
  DRIVER: ["messages", "reviews", "shop_delivery", "delivery_opportunities"],
  PRINTER: ["messages", "reviews", "print_requests"],
  MAINTENANCE: ["messages", "reviews", "maintenance_requests"],
  BARISTA_MARKETPLACE: ["barista_requests", "barista_missions", "messages", "academy", "reviews"],
  BARISTA_ACADEMY: ["messages", "reviews", "academy"],
  MARKETING: ["messages", "reviews", "marketing_requests"],
};

export function isNotificationCategoryEnabled(prefs: Record<string, boolean> | null | undefined, key: NotificationPrefKey): boolean {
  return prefs?.[key] !== false;
}

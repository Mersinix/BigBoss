import type { Notification } from "@shared/schema";

// Maps a notification's real (service, entityType) + the viewer's real role to an
// EXISTING page/tab that already shows that kind of record — every path below was
// verified against client/src/App.tsx's actual routes before being added here, never
// guessed (docs/notification_date_filter_pagination_navigation_audit.md). Where the
// destination page's own tab-level deep-linking isn't confirmed to support jumping to
// one specific record, this lands on the correct page/tab instead (same "best-effort"
// philosophy already used by the Coffee Owner notification modal's openRelatedEntity).
// Entity types with no confirmed real destination return null — callers keep their
// existing behavior (mark as read only, no navigation) rather than inventing a route.
export function resolveNotificationPath(n: Notification, role: string): string | null {
  const et = n.entityType ?? "";

  if (n.service === "ADMIN") {
    switch (et) {
      case "user": return "/admin/users";
      case "store": return role === "SUPPLIER" ? "/supplier/store" : "/admin/stores";
      case "catalog_suggestion": return role === "ADMIN" || role === "SUPER_ADMIN" ? "/admin/category-requests" : null;
      case "marketing_report": return "/admin/marketing";
      case "print_report": return "/admin/print";
      case "maintenance_report": return "/admin/maintenance";
      case "barista_report": return "/admin/barista";
      case "academy_report": return "/admin/academy";
      case "delivery_company_report": return "/admin/delivery";
      case "conversation": return role === "ADMIN" || role === "SUPER_ADMIN" ? "/admin/messages" : null;
      default: return null;
    }
  }

  if (n.service === "SHOP") {
    if (role === "SUPPLIER") {
      switch (et) {
        case "order": case "suborder": return "/supplier/orders";
        case "listing": return "/supplier/inventory";
        case "review": return "/supplier/reviews";
        case "delivery": return "/supplier/delivery-status";
        case "conversation": return "/supplier/messages";
        default: return null;
      }
    }
    if (role === "DRIVER") {
      switch (et) {
        case "delivery": return "/driver/deliveries";
        case "delivery_opportunity": return "/driver";
        case "review": return "/driver/reviews";
        case "conversation": return "/driver/messages";
        default: return null;
      }
    }
    if (role === "DELIVERY_COMPANY") {
      switch (et) {
        case "delivery": return "/delivery/deliveries";
        case "delivery_opportunity": return "/delivery/business?tab=available";
        case "conversation": return n.entityId != null ? `/delivery/messages?conversationId=${n.entityId}` : "/delivery/messages";
        default: return null;
      }
    }
    return null;
  }

  if (n.service === "PRINT" && role === "PRINTER") {
    switch (et) {
      case "print_order": return "/printer/business?tab=orders";
      case "conversation": return "/printer/messages";
      default: return null;
    }
  }

  if (n.service === "MAINTENANCE" && role === "MAINTENANCE") {
    switch (et) {
      case "maintenance_reservation": return "/maintenance-panel/business?tab=planning";
      case "conversation": return "/maintenance-panel/communication";
      default: return null;
    }
  }

  if (n.service === "BARISTA" && role === "BARISTA_MARKETPLACE") {
    switch (et) {
      case "barista_request": return "/barista-marketplace/business?tab=requests";
      case "barista_mission": return "/barista-marketplace/business?tab=missions";
      case "conversation": return n.entityId != null ? `/barista-marketplace/messages?conversationId=${n.entityId}` : "/barista-marketplace/messages";
      default: return null;
    }
  }

  if (n.service === "ACADEMY" && role === "BARISTA_ACADEMY") {
    switch (et) {
      case "academy_registration": return "/barista-academy/business?tab=registrations";
      case "conversation": return "/barista-academy/messages";
      default: return null;
    }
  }

  if (n.service === "MARKETING" && role === "MARKETING") {
    switch (et) {
      case "marketing_project": return "/marketing-panel/business?tab=projects";
      case "conversation": return "/marketing-panel/messages";
      default: return null;
    }
  }

  return null;
}

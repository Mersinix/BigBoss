// Shared business-logic helpers used by more than one domain route module
// (Stage 1 routes.ts refactor). Hoisted verbatim from closures/module-scope
// functions that used to live directly inside server/routes.ts.
import { storage } from "../../storage";
import type { MarketplaceProduct } from "@shared/schema";
import { z } from "zod";

export async function hasCommercialAccess(req: any): Promise<boolean> {
  if (!req.session?.userId) return false;
  const u = await storage.getUser(req.session.userId);
  if (!u) return false;
  if (['SUPER_ADMIN', 'ADMIN', 'SUPPLIER'].includes(u.role)) return true;
  return u.role === 'CAFE_OWNER' && u.status === 'approved';
}

export function stripCommercialData(p: MarketplaceProduct): any {
  const { listings, bestPrice, ...pub } = p as any;
  return { ...pub, listings: [], bestPrice: null, supplierCount: 0 };
}

// NOTE: DRIVER/DELIVERY_COMPANY intentionally have no branch here. Delivery-stage status
// changes (READY→IN_DELIVERY→DELIVERED) are no longer made through this endpoint — they go
// through PATCH /api/deliveries/:id/status, which is ownership-checked against the
// deliveries table (see storage.updateDeliveryStatus) and propagates back into sub_orders/
// orders via the shared aggregation logic. Routing delivery roles through here previously
// let any driver/delivery company mutate any order in READY/IN_DELIVERY state — see
// SHOP_DELIVERY_SYNCHRONIZATION_ANALYSIS.md §9.4.
export function canUpdateOrderStatus(user: { id: number; role: string }, order: any, newStatus: string): boolean {
  // Admin has read-only access to orders; status management is Supplier-only
  if (user.role === 'CAFE_OWNER') {
    return order.cafeId === user.id && newStatus === 'CANCELLED' && order.status === 'PENDING';
  }
  if (user.role === 'SUPPLIER') {
    const involved = order.supplierId === user.id || order.subOrders?.some((so: any) => so.supplierId === user.id);
    if (!involved) return false;
    return ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'CANCELLED'].includes(newStatus);
  }
  return false;
}

// Registration/reset password rule — admin-configurable minimum length (default
// 8, preserving the previous hardcoded behavior — task: "Expand Global
// Authentication & Security Settings"), at least one uppercase letter, one
// number, and one symbol (complexity rules stay fixed, not configurable).
// Enforced here (not just client-side in landing-page.tsx) so a request sent
// directly to these endpoints can't bypass it. Used by both Auth routes
// (registration, password reset, profile password change) and Users routes
// (admin-created users) — must stay shared, not duplicated per domain.
export function registrationPasswordMessage(minLength: number): string {
  return `Le mot de passe doit contenir au moins ${minLength} caractères, une majuscule, un chiffre et un symbole.`;
}
export function buildRegistrationPasswordSchema(minLength: number) {
  const message = registrationPasswordMessage(minLength);
  return z.string()
    .min(minLength, message)
    .regex(/[A-Z]/, message)
    .regex(/[0-9]/, message)
    .regex(/[!@#$%^&*(),.?":{}|<>[\]\\/~`_+=;'-]/, message);
}
export function isValidRegistrationPassword(pw: string, minLength: number): boolean {
  return pw.length >= minLength && /[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[!@#$%^&*(),.?":{}|<>[\]\\/~`_+=;'-]/.test(pw);
}

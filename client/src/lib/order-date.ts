import type { OrderWithDetails } from "@shared/schema";

// Uses the real scheduledAt/createdAt columns (never a formatted display
// string) and plain local-time Date comparisons. Shared by every surface that
// buckets Coffee Owner orders into Today/Planifiées/Anciennes so the three
// categories never diverge between screens.

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isFutureDay(date: Date, now: Date): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const n = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d.getTime() > n.getTime();
}

export function getEffectiveDate(order: OrderWithDetails): Date {
  const scheduledAt = (order as any).scheduledAt;
  return scheduledAt ? new Date(scheduledAt) : new Date(order.createdAt as any);
}

export type PrimaryOrderCategory = "PLANIFIEE" | "TODAY" | "ANCIENNE";

// Every order belongs to exactly one primary category. Daily/favorite is a
// separate, orthogonal star-based filter layered on top (see use-cafe-orders.ts).
export function getPrimaryOrderCategory(order: OrderWithDetails, now: Date): PrimaryOrderCategory {
  const scheduledAt = (order as any).scheduledAt;
  if (scheduledAt && isFutureDay(new Date(scheduledAt), now)) return "PLANIFIEE";
  const effective = getEffectiveDate(order);
  if (isSameCalendarDay(effective, now)) return "TODAY";
  return "ANCIENNE";
}

import type { Notification, NotificationService } from "@shared/schema";

// Shared time/label formatting used by every notification surface (Coffee Owner
// modal, Admin/Supplier pages, provider account tabs) — one place, not one
// implementation per surface. Matches spec Part 40's professional time display.
export function formatNotificationTime(iso: string | Date | null): string {
  if (!iso) return "";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH} h`;
  const isYesterday = (() => {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return date.getFullYear() === y.getFullYear() && date.getMonth() === y.getMonth() && date.getDate() === y.getDate();
  })();
  if (isYesterday) return "Hier";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} à ${hh}:${min}`;
}

export const NOTIFICATION_SERVICE_LABELS: Record<NotificationService, string> = {
  ADMIN: "Admin",
  SHOP: "SHOP",
  PRINT: "PRINT",
  MAINTENANCE: "Maintenance",
  BARISTA: "Barista",
  ACADEMY: "Academy",
  MARKETING: "Marketing",
};

export const NOTIFICATION_PRIORITY_DOT: Record<Notification["priority"], string> = {
  INFO: "bg-blue-500",
  SUCCESS: "bg-emerald-500",
  WARNING: "bg-amber-500",
  URGENT: "bg-red-500",
};

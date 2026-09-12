import { useAuth } from "@/hooks/use-auth";
import { Bell, CheckCheck } from "lucide-react";
import type { NotificationService } from "@shared/schema";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/use-notifications";
import { formatNotificationTime, NOTIFICATION_PRIORITY_DOT } from "@/lib/notification-format";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

// One shared Notifications tab/page reused by every *AccountShell (Driver,
// Delivery, Printer, Academy, Barista Marketplace, Maintenance, Marketing)
// instead of seven near-identical copies. The list itself keeps the same
// Tailwind `dark:` variant convention those shells already use; the header
// uses the shared DashboardHero (safe here too — ProfessionalAccountShell
// really does toggle a `.dark` class for these accounts, unlike the Coffee
// Owner marketplace, so DashboardHero's CSS-variable tokens respond
// correctly), with each role's own established accent so "Notifications"
// keeps looking like part of that service rather than one generic page.
const ROLE_TO_SERVICE: Partial<Record<string, NotificationService>> = {
  DRIVER: "SHOP",
  DELIVERY_COMPANY: "SHOP",
  PRINTER: "PRINT",
  BARISTA_ACADEMY: "ACADEMY",
  BARISTA_MARKETPLACE: "BARISTA",
  MAINTENANCE: "MAINTENANCE",
  MARKETING: "MARKETING",
};

const ROLE_ACCENT: Partial<Record<string, { gradientClass: string; iconBgClass: string; iconTextClass: string }>> = {
  DRIVER: { gradientClass: "bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/20", iconBgClass: "bg-blue-500/15", iconTextClass: "text-blue-600 dark:text-blue-400" },
  DELIVERY_COMPANY: { gradientClass: "bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent border-teal-500/20", iconBgClass: "bg-teal-500/15", iconTextClass: "text-teal-600 dark:text-teal-400" },
  PRINTER: { gradientClass: "bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/20", iconBgClass: "bg-blue-500/15", iconTextClass: "text-blue-600 dark:text-blue-400" },
  BARISTA_ACADEMY: { gradientClass: "bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent border-indigo-500/20", iconBgClass: "bg-indigo-500/15", iconTextClass: "text-indigo-600 dark:text-indigo-400" },
  BARISTA_MARKETPLACE: { gradientClass: "bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent border-green-500/20", iconBgClass: "bg-green-500/15", iconTextClass: "text-green-600 dark:text-green-400" },
  MAINTENANCE: { gradientClass: "bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent border-orange-500/20", iconBgClass: "bg-orange-500/15", iconTextClass: "text-orange-600 dark:text-orange-400" },
  MARKETING: { gradientClass: "bg-gradient-to-br from-fuchsia-500/10 via-fuchsia-500/5 to-transparent border-fuchsia-500/20", iconBgClass: "bg-fuchsia-500/15", iconTextClass: "text-fuchsia-600 dark:text-fuchsia-400" },
};

export default function ProviderNotificationsPage() {
  const { user } = useAuth();
  const service = user ? ROLE_TO_SERVICE[user.role] : undefined;
  const accent = (user && ROLE_ACCENT[user.role]) || {};
  const { data: notifications = [], isLoading } = useNotifications(service, { limit: 100 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex flex-col gap-4">
      <DashboardHero
        title="Notifications"
        subtitle="Restez informé de votre activité en temps réel."
        icon={Bell}
        {...accent}
        action={unread > 0 ? (
          <button
            onClick={() => markAllRead.mutate(service)}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="w-4 h-4" /> Tout marquer comme lu
          </button>
        ) : undefined}
      />

      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 rounded-2xl overflow-hidden">
        {!isLoading && notifications.length === 0 ? (
          <div className="text-center text-gray-400 dark:text-gray-500 text-sm py-14">Aucune nouvelle notification</div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.isRead && markRead.mutate(n.id)}
              className={`w-full flex items-start gap-3 px-4 py-3.5 text-left border-b border-gray-100 dark:border-gray-700/50 last:border-0 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40 ${
                n.isRead ? "" : "bg-amber-50 dark:bg-amber-500/5"
              }`}
              data-testid={`notification-${n.id}`}
            >
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${NOTIFICATION_PRIORITY_DOT[n.priority]}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{n.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.message}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-1">{formatNotificationTime(n.createdAt)}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

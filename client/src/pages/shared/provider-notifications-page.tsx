import { useAuth } from "@/hooks/use-auth";
import { Bell, CheckCheck } from "lucide-react";
import type { NotificationService } from "@shared/schema";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/use-notifications";
import { formatNotificationTime, NOTIFICATION_PRIORITY_DOT } from "@/lib/notification-format";

// One shared Notifications tab/page reused by every *AccountShell (Driver,
// Printer, Academy, Barista Marketplace) instead of four near-identical
// copies — styled with the same Tailwind `dark:` variant convention those
// shells already use (not the Coffee Owner isDark-ternary convention, and
// not the Admin/Supplier shadcn-token convention).
const ROLE_TO_SERVICE: Partial<Record<string, NotificationService>> = {
  DRIVER: "SHOP",
  DELIVERY_COMPANY: "SHOP",
  PRINTER: "PRINT",
  BARISTA_ACADEMY: "ACADEMY",
  BARISTA_MARKETPLACE: "BARISTA",
  MAINTENANCE: "MAINTENANCE",
  MARKETING: "MARKETING",
};

export default function ProviderNotificationsPage() {
  const { user } = useAuth();
  const service = user ? ROLE_TO_SERVICE[user.role] : undefined;
  const { data: notifications = [], isLoading } = useNotifications(service, { limit: 100 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-500" /> Notifications
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Restez informé de votre activité en temps réel.</p>
        </div>
        {unread > 0 && (
          <button
            onClick={() => markAllRead.mutate(service)}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="w-4 h-4" /> Tout marquer comme lu
          </button>
        )}
      </div>

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

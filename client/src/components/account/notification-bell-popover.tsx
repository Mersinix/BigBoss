import { useState } from "react";
import { useLocation } from "wouter";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications, useUnreadNotificationCount, useMarkNotificationRead } from "@/hooks/use-notifications";
import { formatNotificationTime, NOTIFICATION_PRIORITY_DOT } from "@/lib/notification-format";
import type { NotificationService } from "@shared/schema";

// Header notification bell — reused by every professional account shell.
// Reuses the exact same data layer as the Coffee Owner NotificationModal and
// ProviderNotificationsPage (client/src/hooks/use-notifications.ts): real
// notifications, real unread count, no separate/fake preview data. Clicking a
// notification marks it read and opens the account's Communication →
// Notifications tab (via `viewAllPath`, which already carries ?tab=notifications).
export function NotificationBellPopover({
  service, viewAllPath, linkTextClass,
}: {
  service: NotificationService;
  viewAllPath: string;
  // Full Tailwind class string for the "Voir toutes les notifications" link,
  // e.g. "text-fuchsia-600 dark:text-fuchsia-400" (passed whole, never interpolated).
  linkTextClass: string;
}) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { data: notifications = [] } = useNotifications(service, { limit: 5 });
  const { data: unreadData } = useUnreadNotificationCount(service);
  const unreadCount = unreadData?.count ?? 0;
  const markRead = useMarkNotificationRead();

  const goToAll = () => {
    setOpen(false);
    navigate(viewAllPath);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="relative w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/15 transition-colors"
          data-testid="button-header-notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-80 p-0 rounded-2xl border-0 shadow-2xl bg-white dark:bg-gray-800 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
          <p className="font-bold text-sm text-gray-900 dark:text-white">Notifications</p>
          {unreadCount > 0 && (
            <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">
              {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">Aucune notification</div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.isRead) markRead.mutate(n.id);
                  goToAll();
                }}
                className={`w-full text-left flex items-start gap-2.5 px-4 py-3 border-b last:border-0 border-gray-50 dark:border-gray-700/40 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40 ${
                  n.isRead ? "" : "bg-amber-50/60 dark:bg-amber-500/5"
                }`}
                data-testid={`header-notification-${n.id}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${NOTIFICATION_PRIORITY_DOT[n.priority]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{n.title}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{n.message}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1">{formatNotificationTime(n.createdAt)}</p>
                </div>
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={goToAll}
          className={`w-full text-center text-xs font-semibold py-3 border-t border-gray-100 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors ${linkTextClass}`}
          data-testid="button-view-all-notifications"
        >
          Voir toutes les notifications
        </button>
      </PopoverContent>
    </Popover>
  );
}

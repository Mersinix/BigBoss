import { Bell } from "lucide-react";
import { Link } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useUnreadNotificationCount } from "@/hooks/use-notifications";
import { formatNotificationTime, NOTIFICATION_PRIORITY_DOT } from "@/lib/notification-format";

/**
 * Bell + quick-glance dropdown for every account rendered inside DashboardLayout
 * (Admin, Supplier, Marketing, Delivery Company) — one shared component instead
 * of one per role, styled with the same shadcn CSS-variable tokens those pages
 * already use (this dropdown lives under the Coffee Owner's isDark convention
 * boundary, so it intentionally does NOT use isDark ternaries).
 */
export function NotificationBellDropdown({ notificationsHref }: { notificationsHref?: string }) {
  const { data: countData } = useUnreadNotificationCount();
  const { data: notifications = [] } = useNotifications(undefined, { limit: 8 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const unread = countData?.count ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          data-testid="button-notification-bell"
        >
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute top-0 right-0 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-primary rounded-full ring-2 ring-background">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-auto py-1 px-2 text-xs" onClick={() => markAllRead.mutate(undefined)}>
              Tout marquer comme lu
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">Aucune nouvelle notification</div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => !n.isRead && markRead.mutate(n.id)}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border/30 last:border-0 transition-colors hover:bg-secondary/50 ${n.isRead ? "" : "bg-primary/5"}`}
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${NOTIFICATION_PRIORITY_DOT[n.priority]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{formatNotificationTime(n.createdAt)}</p>
                </div>
              </button>
            ))
          )}
        </div>
        {notificationsHref && (
          <div className="border-t border-border/50 p-2">
            <Link href={notificationsHref} className="block text-center text-xs text-primary py-1.5 hover:underline">
              Voir toutes les notifications
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

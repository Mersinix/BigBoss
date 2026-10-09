import { useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useUnreadNotificationCount } from "@/hooks/use-notifications";
import { formatNotificationTime, NOTIFICATION_PRIORITY_DOT } from "@/lib/notification-format";
import { resolveNotificationPath } from "@/lib/notification-navigation";
import { NotificationDateFilter, filterNotificationsByDate } from "@/components/notifications/notification-date-filter";
import type { DateRangePreset } from "@/lib/marketplace-analytics";
import type { Notification } from "@shared/schema";

/**
 * Bell + quick-glance dropdown for every account rendered inside DashboardLayout
 * (Admin, Supplier, Marketing, Delivery Company) — one shared component instead
 * of one per role, styled with the same shadcn CSS-variable tokens those pages
 * already use (this dropdown lives under the Coffee Owner's isDark convention
 * boundary, so it intentionally does NOT use isDark ternaries).
 */
export function NotificationBellDropdown({ notificationsHref }: { notificationsHref?: string }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  // "Aujourd'hui" is the default preset for a fresh filtering session (task
  // requirement); "" = no preset active (custom date typed instead).
  const [datePreset, setDatePreset] = useState<DateRangePreset | "">("today");
  const [customDate, setCustomDate] = useState("");
  const { data: countData } = useUnreadNotificationCount();
  // Server caps `limit` at 200 — fetch that full batch so every preset
  // (including "Cette année") has a real dataset to filter, same convention
  // as ProviderNotificationsPage's own date filter.
  const { data: notifications = [] } = useNotifications(undefined, { limit: 200 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const unread = countData?.count ?? 0;

  const filtered = useMemo(
    () => filterNotificationsByDate(notifications, datePreset, customDate),
    [notifications, datePreset, customDate],
  );

  const handleClick = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    const path = user ? resolveNotificationPath(n, user.role) : null;
    if (path) navigate(path);
  };

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
        <div className="px-4 py-2 border-b border-border/50">
          <NotificationDateFilter
            preset={datePreset}
            onPresetChange={(p) => { setDatePreset(p); setCustomDate(""); }}
            customDate={customDate}
            onCustomDateChange={(d) => { setCustomDate(d); setDatePreset(""); }}
            testIdPrefix="bell"
          />
        </div>
        <div className="max-h-96 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
          {filtered.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">
              {datePreset || customDate ? "Aucune notification sur cette période" : "Aucune nouvelle notification"}
            </div>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
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

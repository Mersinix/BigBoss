import { useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, CheckCheck, Bell } from "lucide-react";
import type { Notification, NotificationService } from "@shared/schema";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/use-notifications";
import { formatNotificationTime, NOTIFICATION_PRIORITY_DOT } from "@/lib/notification-format";
import { useAccountOpenStore } from "@/store/account-open-store";

type TabId = "ALL" | NotificationService;

const SERVICE_TABS: { id: TabId; label: string }[] = [
  { id: "ALL", label: "Tous" },
  { id: "ADMIN", label: "Admin" },
  { id: "SHOP", label: "SHOP" },
  { id: "PRINT", label: "PRINT" },
  { id: "MAINTENANCE", label: "Maintenance" },
  { id: "BARISTA", label: "Barista" },
  { id: "ACADEMY", label: "Academy" },
  { id: "MARKETING", label: "Marketing" },
];

// Best-effort navigation reusing the existing account-open-store (the same
// mechanism the Cart page / external routes already use to open the Profile
// panel to a specific tab/order) — never a new routing system, and never a
// broken link: entity types we can't deep-link to still land on a sensible tab.
function openRelatedEntity(n: Notification, close: () => void) {
  const { openWithOrder, openWithTab } = useAccountOpenStore.getState();
  close();
  if (n.entityType === "order" && n.entityId != null) {
    openWithOrder(n.entityId);
    return;
  }
  if (["suborder", "delivery", "listing"].includes(n.entityType ?? "")) {
    openWithTab("orders");
    return;
  }
  if (["maintenance_reservation", "barista_request", "barista_mission", "academy_registration", "print_order"].includes(n.entityType ?? "")) {
    openWithTab("reservations");
    return;
  }
}

export function NotificationModal({ open, onOpenChange, isDark }: { open: boolean; onOpenChange: (v: boolean) => void; isDark: boolean }) {
  const [tab, setTab] = useState<TabId>("ALL");
  const { data: notifications = [], isLoading } = useNotifications(undefined, { limit: 100 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const filtered = useMemo(
    () => (tab === "ALL" ? notifications : notifications.filter((n) => n.service === tab)),
    [notifications, tab],
  );
  const unreadByService = useMemo(() => {
    const map: Partial<Record<TabId, number>> = { ALL: 0 };
    for (const n of notifications) {
      if (n.isRead) continue;
      map.ALL = (map.ALL ?? 0) + 1;
      map[n.service] = (map[n.service] ?? 0) + 1;
    }
    return map;
  }, [notifications]);

  const handleNotificationClick = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    openRelatedEntity(n, () => onOpenChange(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`sm:max-w-lg max-h-[85vh] overflow-hidden p-0 gap-0 rounded-2xl border-0 shadow-2xl [&>button]:hidden ${isDark ? "bg-gray-900" : "bg-white"}`}
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-gray-800" : "border-gray-100"}`}>
          <h2 className={`font-bold text-lg flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}>
            <Bell className="w-4 h-4 text-amber-500" /> Notifications
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className={`p-1.5 rounded-full transition-colors ${isDark ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}
            data-testid="button-close-notifications"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`flex items-center gap-1.5 px-4 py-2.5 overflow-x-auto border-b [&::-webkit-scrollbar]:h-0 ${isDark ? "border-gray-800" : "border-gray-100"}`}>
          {SERVICE_TABS.map((s) => {
            const count = unreadByService[s.id] ?? 0;
            const active = tab === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setTab(s.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? isDark ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-700"
                    : isDark ? "text-gray-400 hover:bg-gray-800" : "text-gray-500 hover:bg-gray-100"
                }`}
                data-testid={`tab-notifications-${s.id.toLowerCase()}`}
              >
                {s.label}
                {count > 0 && (
                  <span className={`min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${active ? "bg-amber-500 text-white" : isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"}`}>
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {(unreadByService[tab] ?? 0) > 0 && (
          <div className="flex justify-end px-4 pt-2">
            <button
              onClick={() => markAllRead.mutate(tab === "ALL" ? undefined : tab)}
              className={`flex items-center gap-1 text-xs font-medium ${isDark ? "text-amber-400 hover:text-amber-300" : "text-amber-600 hover:text-amber-700"}`}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Tout marquer comme lu
            </button>
          </div>
        )}

        <div className="overflow-y-auto max-h-[60vh] px-2 py-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
          {!isLoading && filtered.length === 0 ? (
            <div className={`text-center py-14 text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>Aucune nouvelle notification</div>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors ${
                  n.isRead
                    ? isDark ? "hover:bg-gray-800" : "hover:bg-gray-50"
                    : isDark ? "bg-amber-500/5 hover:bg-amber-500/10" : "bg-amber-50 hover:bg-amber-100/70"
                }`}
                data-testid={`notification-${n.id}`}
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${NOTIFICATION_PRIORITY_DOT[n.priority]}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>{n.title}</p>
                  <p className={`text-xs mt-0.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{n.message}</p>
                  <p className={`text-[11px] mt-1 ${isDark ? "text-gray-600" : "text-gray-400"}`}>{formatNotificationTime(n.createdAt)}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

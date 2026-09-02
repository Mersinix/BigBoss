import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, ShoppingBag } from "lucide-react";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/use-notifications";
import { formatNotificationTime, NOTIFICATION_PRIORITY_DOT } from "@/lib/notification-format";

export default function SupplierNotificationsPage() {
  // Real, persisted SHOP-service notifications — orders, low stock, deliveries.
  // No mock data (this page previously seeded a static fakeNotifications array).
  const { data: notifications = [], isLoading } = useNotifications("SHOP", { limit: 50 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unread = notifications.filter((n) => !n.isRead).length;
  const stockAlerts = notifications.filter((n) => n.type === "low_stock" || n.type === "out_of_stock").length;
  const orderNotifications = notifications.filter((n) => n.type.startsWith("order") || n.type.startsWith("suborder")).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Stay updated on orders, payments and alerts.</p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate("SHOP")} data-testid="button-mark-all-read">Mark all as read</Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><Bell className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Unread</p><p className="text-2xl font-bold">{unread}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
            <div><p className="text-xs text-muted-foreground">Low Stock Alerts</p><p className="text-2xl font-bold">{stockAlerts}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-blue-500/10 rounded-xl p-3"><ShoppingBag className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xs text-muted-foreground">Order Notifications</p><p className="text-2xl font-bold">{orderNotifications}</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">All Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!isLoading && notifications.length === 0 ? (
            <div className="text-center text-muted-foreground py-10">Aucune nouvelle notification</div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                data-testid={`button-notif-${n.id}`}
                onClick={() => !n.isRead && markRead.mutate(n.id)}
                className={`w-full flex items-start gap-4 p-4 rounded-lg text-left transition-colors border ${
                  n.isRead ? "border-border/30 bg-transparent" : "border-primary/20 bg-primary/5"
                }`}
              >
                <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${NOTIFICATION_PRIORITY_DOT[n.priority]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{n.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="outline" className="text-xs">{n.type.replace(/_/g, " ")}</Badge>
                  <span className="text-xs text-muted-foreground">{formatNotificationTime(n.createdAt)}</span>
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

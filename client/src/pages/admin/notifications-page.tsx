import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, ShoppingBag, Users, AlertCircle, CheckCheck } from "lucide-react";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/use-notifications";
import { formatNotificationTime, NOTIFICATION_PRIORITY_DOT } from "@/lib/notification-format";

export default function NotificationsPage() {
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["/api/orders"] });
  const fmt = useFormatCurrency();

  // KEPT as-is (Part 3): the existing order-based KPI tiles — real order data,
  // not notification records, so left untouched.
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  // Real, persisted platform-level notifications (Part 3: "Upgrade it where
  // necessary so Admin notifications become part of the same synchronized
  // notification architecture as the rest of the application").
  const { data: notifications = [], isLoading } = useNotifications("ADMIN", { limit: 50 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-muted-foreground text-sm mt-1">Recent activity and system alerts.</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate("ADMIN")} data-testid="button-mark-all-read">
            <CheckCheck className="w-4 h-4 mr-2" /> Tout marquer comme lu
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Non lues</p>
              <p className="text-2xl font-bold">{unreadCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Pending Orders</p>
              <p className="text-2xl font-bold">{orders.filter((o) => o.status === "PENDING").length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-blue-500/10 rounded-xl p-3">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Recent Orders</p>
              <p className="text-2xl font-bold">{recentOrders.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Activity Feed</CardTitle>
        </CardHeader>
        <CardContent>
          {!isLoading && notifications.length === 0 ? (
            <div className="text-center text-muted-foreground py-10">Aucune nouvelle notification</div>
          ) : (
            <div className="space-y-3">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.isRead && markRead.mutate(n.id)}
                  className={`w-full flex items-start gap-4 p-3 rounded-lg border text-left transition-colors ${n.isRead ? "border-border/50" : "border-primary/30 bg-primary/5"}`}
                  data-testid={`notification-${n.id}`}
                >
                  <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${NOTIFICATION_PRIORITY_DOT[n.priority]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className="text-xs">{n.type.replace(/_/g, " ")}</Badge>
                    <span className="text-xs text-muted-foreground">{formatNotificationTime(n.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

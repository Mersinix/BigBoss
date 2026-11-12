import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, ShoppingBag } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/use-notifications";
import { formatNotificationTime, NOTIFICATION_PRIORITY_DOT } from "@/lib/notification-format";
import { resolveNotificationPath } from "@/lib/notification-navigation";
import type { Notification } from "@shared/schema";
import { DashboardHero, KpiOverviewButton, KpiOverviewModal } from "@/components/dashboard/dashboard-kit";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEffect, useState } from "react";
import { SupplierCommunicationSwitcher } from "@/components/supplier/supplier-communication-switcher";

// French label for the small per-notification type badge — keyed by the same internal
// `notify()` type identifiers used server-side (never translated/modified themselves, only
// their display label here). Falls back to the raw type string (underscores → spaces) for
// any type not yet listed, so an unmapped type still renders something rather than nothing.
const TYPE_LABELS: Record<string, string> = {
  order_created: "Nouvelle commande",
  order_cancelled: "Commande annulée",
  suborder_status_changed: "Statut mis à jour",
  suborder_items_cancelled_by_owner: "Articles annulés (Coffee Owner)",
  suborder_items_cancelled_by_supplier: "Articles annulés (fournisseur)",
  suborder_rejected: "Commande refusée",
  low_stock: "Stock faible",
  out_of_stock: "Rupture de stock",
  delivery_assigned: "Livraison affectée",
  delivery_opportunity_created: "Nouvelle opportunité de livraison",
  delivery_opportunity_filled: "Opportunité de livraison pourvue",
  delivery_reassigned_away: "Livraison réaffectée",
  self_pickup_confirmed: "Retrait confirmé",
  supplier_review_created: "Nouvel avis",
  pack_review_created: "Nouvel avis (pack)",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

export default function SupplierNotificationsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const [kpiModalOpen, setKpiModalOpen] = useState(false);
  // Real, persisted SHOP-service notifications — orders, low stock, deliveries.
  // No mock data (this page previously seeded a static fakeNotifications array).
  // Server caps `limit` at 200 — fetched once, paginated client-side.
  const { data: notifications = [], isLoading } = useNotifications("SHOP", { limit: 200 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const pagination = usePagination(notifications.length);
  useEffect(() => { pagination.resetPage(); }, [notifications.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageNotifications = notifications.slice(pagination.start, pagination.end);

  const handleNotificationClick = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    const path = user ? resolveNotificationPath(n, user.role) : null;
    if (path) navigate(path);
  };

  const unread = notifications.filter((n) => !n.isRead).length;
  const stockAlerts = notifications.filter((n) => n.type === "low_stock" || n.type === "out_of_stock").length;
  const orderNotifications = notifications.filter((n) => n.type.startsWith("order") || n.type.startsWith("suborder")).length;

  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Notifications"
        subtitle="Restez informé des commandes, paiements et alertes."
        action={
          <>
            {unread > 0 && (
              <Button variant="outline" size="sm" onClick={() => markAllRead.mutate("SHOP")} data-testid="button-mark-all-read">Tout marquer comme lu</Button>
            )}
            {isMobile && <KpiOverviewButton onClick={() => setKpiModalOpen(true)} />}
          </>
        }
      />

      <SupplierCommunicationSwitcher />

      {!isMobile && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-primary/10 rounded-xl p-3"><Bell className="w-5 h-5 text-primary" /></div>
              <div><p className="text-xs text-muted-foreground">Non lus</p><p className="text-2xl font-bold">{unread}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-amber-500/10 rounded-xl p-3"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
              <div><p className="text-xs text-muted-foreground">Alertes de stock faible</p><p className="text-2xl font-bold">{stockAlerts}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-blue-500/10 rounded-xl p-3"><ShoppingBag className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-xs text-muted-foreground">Notifications de commandes</p><p className="text-2xl font-bold">{orderNotifications}</p></div>
            </CardContent>
          </Card>
        </div>
      )}

      <KpiOverviewModal open={isMobile && kpiModalOpen} onClose={() => setKpiModalOpen(false)}>
        <div className="grid grid-cols-1 gap-3">
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-primary/10 rounded-xl p-3"><Bell className="w-5 h-5 text-primary" /></div>
              <div><p className="text-xs text-muted-foreground">Non lus</p><p className="text-2xl font-bold">{unread}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-amber-500/10 rounded-xl p-3"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
              <div><p className="text-xs text-muted-foreground">Alertes de stock faible</p><p className="text-2xl font-bold">{stockAlerts}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-blue-500/10 rounded-xl p-3"><ShoppingBag className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-xs text-muted-foreground">Notifications de commandes</p><p className="text-2xl font-bold">{orderNotifications}</p></div>
            </CardContent>
          </Card>
        </div>
      </KpiOverviewModal>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Toutes les notifications</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!isLoading && notifications.length === 0 ? (
            <div className="text-center text-muted-foreground py-10">Aucune notification trouvée</div>
          ) : (
            pageNotifications.map((n) => (
              <button
                key={n.id}
                data-testid={`button-notif-${n.id}`}
                onClick={() => handleNotificationClick(n)}
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
                  <Badge variant="outline" className="text-xs">{typeLabel(n.type)}</Badge>
                  <span className="text-xs text-muted-foreground">{formatNotificationTime(n.createdAt)}</span>
                </div>
              </button>
            ))
          )}
          {notifications.length > 0 && (
            <div className="pt-3">
              <DataPagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                totalItems={notifications.length}
                totalPages={pagination.totalPages}
                start={pagination.start}
                end={pagination.end}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
                itemLabel="notifications" // FR: "notifications" (identical in both languages)
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

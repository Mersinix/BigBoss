import { useState } from "react";
import { formatDate } from "@/lib/format";
import { useFormatCurrency } from "@/hooks/use-currency";
import { deriveOrderStatus } from "@/lib/order-status";
import { getEffectiveDate } from "@/lib/order-date";
import { useCafeOrders, CAFE_ORDER_STATUS_META as statusMeta, CAFE_ORDER_STATUS_FILTER_OPTS as STATUS_FILTER_OPTS, type CafeOrderTabId as TabId } from "@/hooks/use-cafe-orders";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Box, Star, Calendar, Archive, Sun, RotateCcw, Store } from "lucide-react";
import OrderDetailsModal from "@/components/cafe/order-details-modal";
import type { OrderWithDetails } from "@shared/schema";

export default function CafeOrdersPage() {
  const { isLoading, sorted, byCategory, daily, listForTab, toggleFavorite, reorder, isReordering } = useCafeOrders();
  const [tab, setTab] = useState<TabId>("today");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const fmt = useFormatCurrency();

  const tabs: { id: TabId; label: string; icon: any; count: number }[] = [
    { id: "today", label: "Today", icon: Sun, count: byCategory.TODAY.length },
    { id: "planned", label: "Planifiées", icon: Calendar, count: byCategory.PLANIFIEE.length },
    { id: "daily", label: "Daily", icon: Star, count: daily.length },
    { id: "old", label: "Anciennes", icon: Archive, count: byCategory.ANCIENNE.length },
  ];

  const baseList = listForTab(tab);

  const filtered = statusFilter === "ALL"
    ? baseList
    : baseList.filter((o) => deriveOrderStatus(o) === statusFilter);

  // Always resolve the modal's order from the live query data, so cancellations/
  // favorites made while it's open are reflected immediately without a manual
  // close+reopen — mirrors shared/orders-page.tsx's identical pattern.
  const selectedOrder = selectedOrderId != null ? (sorted.find((o) => o.id === selectedOrderId) ?? null) : null;

  const handleToggleFavorite = (order: OrderWithDetails, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(order);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Orders</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track your order history and current deliveries.</p>
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 flex-wrap">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${tab === id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            data-testid={`tab-orders-${id}`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {count > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${tab === id ? "bg-amber-500 text-white" : "bg-secondary text-muted-foreground"}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Status filter ── */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48" data-testid="select-status-filter"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} commande{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {tab === "daily" && (
        <p className="text-xs text-muted-foreground -mt-2">
          Commandes marquées ⭐ — réutilisez-les comme modèles pour recommander rapidement.
        </p>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-border/50">
          <Box className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="font-bold text-xl text-foreground">
            {tab === "today" ? "Aucune commande aujourd'hui" : tab === "planned" ? "Aucune commande planifiée" : tab === "daily" ? "Aucune commande favorite" : "Aucune commande"}
          </h3>
          <p className="text-muted-foreground mt-2">
            {tab === "daily" ? "Cliquez sur ⭐ sur une commande pour l'ajouter ici." : "Les commandes correspondantes apparaîtront ici."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((order: any) => {
            const displayStatus = deriveOrderStatus(order);
            const meta = statusMeta[displayStatus] || { label: displayStatus, color: "bg-gray-100 text-gray-800", icon: Box };
            const Icon = meta.icon;
            const supplierNames = (order.subOrders ?? []).map((s: any) => s.supplierName).filter(Boolean);
            const itemCount = (order.subOrders ?? []).reduce((n: number, s: any) => n + (s.items?.length ?? 0), 0) || (order.items?.length ?? 0);
            const effectiveDate = getEffectiveDate(order);
            const isFavorite = !!order.isFavorite;
            return (
              <Card
                key={order.id}
                className="rounded-2xl border-border/50 shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedOrderId(order.id)}
                data-testid={`order-card-${order.id}`}
              >
                <div className="bg-secondary/30 px-5 py-3.5 border-b border-border/50 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <button
                      onClick={(e) => handleToggleFavorite(order, e)}
                      aria-label={isFavorite ? "Retirer de Daily" : "Ajouter à Daily"}
                      className="shrink-0 p-1 -m-1"
                      data-testid={`button-favorite-order-${order.id}`}
                    >
                      <Star className={`w-4 h-4 transition-colors ${isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground hover:text-amber-400"}`} />
                    </button>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order ID</p>
                      <p className="font-mono text-sm mt-0.5">#{String(order.id).padStart(6, "0")}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</p>
                      <p className="text-sm mt-0.5 text-muted-foreground">{formatDate(effectiveDate)}</p>
                    </div>
                    {supplierNames.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fournisseurs</p>
                        <p className="text-sm mt-0.5 font-medium flex items-center gap-1"><Store className="w-3.5 h-3.5 text-muted-foreground" />{supplierNames.join(" · ")}</p>
                      </div>
                    ) : order.supplier?.name ? (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier</p>
                        <p className="text-sm mt-0.5 font-medium">{order.supplier.name}</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Articles</p>
                      <p className="text-sm mt-0.5 text-muted-foreground">{itemCount} article{itemCount !== 1 ? "s" : ""}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</p>
                      <p className="text-sm mt-0.5 font-bold">{fmt(order.totalAmount)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`${meta.color} border px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5`}>
                      <Icon className="w-3.5 h-3.5" /> {meta.label}
                    </Badge>
                    {tab === "daily" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1.5"
                        disabled={isReordering}
                        onClick={(e) => { e.stopPropagation(); reorder(order.id); }}
                        data-testid={`button-reorder-daily-${order.id}`}
                      >
                        <RotateCcw className="w-3 h-3" /> Recommander
                      </Button>
                    )}
                  </div>
                </div>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Cliquez pour voir les détails →</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <OrderDetailsModal
        open={!!selectedOrder}
        onClose={() => setSelectedOrderId(null)}
        order={selectedOrder}
        showReorder={true}
        showCancel={true}
      />
    </div>
  );
}

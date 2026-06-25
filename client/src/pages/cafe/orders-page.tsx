import { useState } from "react";
import { useOrders, useUpdateOrderStatus } from "@/hooks/use-orders";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Box, Truck, CheckCircle2, AlertCircle, Clock, CalendarIcon, X } from "lucide-react";
import { format, isSameDay, parseISO } from "date-fns";


const statusMeta: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: "Pending", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  CONFIRMED: { label: "Confirmed", color: "bg-blue-100 text-blue-800 border-blue-200", icon: CheckCircle2 },
  PREPARING: { label: "Preparing", color: "bg-orange-100 text-orange-800 border-orange-200", icon: Box },
  READY: { label: "Ready for Pickup", color: "bg-teal-100 text-teal-800 border-teal-200", icon: Box },
  IN_DELIVERY: { label: "In Delivery", color: "bg-purple-100 text-purple-800 border-purple-200", icon: Truck },
  DELIVERED: { label: "Delivered", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  CANCELLED: { label: "Cancelled", color: "bg-red-100 text-red-800 border-red-200", icon: AlertCircle },
};

export default function CafeOrdersPage() {
  const { data: apiOrders = [], isLoading } = useOrders();
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [calOpen, setCalOpen] = useState(false);

  const merged = [...apiOrders].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const filtered = date
    ? merged.filter((o: any) => {
        try { return isSameDay(parseISO(o.createdAt), date); } catch { return false; }
      })
    : merged;

  const stats = [
    { label: "Total", value: merged.length, color: "text-foreground" },
    { label: "Pending", value: merged.filter((o: any) => o.status === "PENDING").length, color: "text-amber-600" },
    { label: "In Delivery", value: merged.filter((o: any) => o.status === "IN_DELIVERY" || o.status === "PREPARING").length, color: "text-blue-600" },
    { label: "Delivered", value: merged.filter((o: any) => o.status === "DELIVERED").length, color: "text-green-600" },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track your order history and current deliveries.</p>
        </div>

        <div className="flex items-center gap-2">
          {date && (
            <Button variant="ghost" size="sm" onClick={() => setDate(undefined)} className="h-9 gap-1.5 text-muted-foreground">
              <X className="w-3.5 h-3.5" /> Clear
            </Button>
          )}
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2" data-testid="button-date-filter">
                <CalendarIcon className="w-4 h-4" />
                {date ? format(date, "MMM d, yyyy") : "Filter by Date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => { setDate(d); setCalOpen(false); }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-border/50">
          <Box className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="font-bold text-xl text-foreground">
            {date ? `No orders on ${format(date, "MMM d, yyyy")}` : "No orders yet"}
          </h3>
          <p className="text-muted-foreground mt-2">When orders arrive, they'll show up here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((order: any) => {
            const meta = statusMeta[order.status] || { label: order.status, color: "bg-gray-100 text-gray-800", icon: Box };
            const Icon = meta.icon;
            return (
              <Card key={order.id} className="rounded-2xl border-border/50 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="bg-secondary/30 px-5 py-3.5 border-b border-border/50 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-6 flex-wrap">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order ID</p>
                      <p className="font-mono text-sm mt-0.5">#{String(order.id).padStart(6, "0")}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</p>
                      <p className="text-sm mt-0.5 text-muted-foreground">{formatDate(order.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier</p>
                      <p className="text-sm mt-0.5 font-medium">{order.supplier?.name}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</p>
                      <p className="text-sm mt-0.5 font-bold">{formatCurrency(order.totalAmount)}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`${meta.color} border px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5`}>
                    <Icon className="w-3.5 h-3.5" /> {meta.label}
                  </Badge>
                </div>
                <CardContent className="p-5">
                  {order.subOrders && order.subOrders.length > 0 ? (
                    <div className="space-y-4">
                      {order.subOrders.map((sub: any) => (
                        <div key={sub.id} className="space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{sub.supplierName}</p>
                          {(sub.items || []).map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-muted-foreground text-xs w-6">{item.quantity}×</span>
                                <span className="font-medium">{item.product?.name}</span>
                                {(item.flavorName || item.sizeName) && (
                                  <span className="text-xs text-muted-foreground">{[item.flavorName, item.sizeName].filter(Boolean).join(" · ")}</span>
                                )}
                              </div>
                              <span className="text-muted-foreground">{formatCurrency((item.unitPrice ?? item.totalPrice) * (item.unitPrice ? item.quantity : 1))}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(order.items || []).map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-muted-foreground text-xs w-6">{item.quantity}×</span>
                            <span className="font-medium">{item.product?.name}</span>
                            {item.product?.category && (
                              <Badge variant="secondary" className="text-[10px] py-0">{item.product.category}</Badge>
                            )}
                          </div>
                          <span className="text-muted-foreground">{formatCurrency(item.unitPrice * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

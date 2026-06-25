import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, ShoppingBag, CreditCard, Package, AlertTriangle } from "lucide-react";

const fakeNotifications = [
  { id: 1, type: "order", icon: ShoppingBag, color: "bg-primary/10 text-primary", title: "New order received", desc: "ORD-88 placed by Ariana Lounge for TND 487", time: "2 min ago", read: false },
  { id: 2, type: "payment", icon: CreditCard, color: "bg-green-500/10 text-green-600", title: "Payment received", desc: "TND 217 for ORD-61 from Cafe des Nattes", time: "1h ago", read: false },
  { id: 3, type: "stock", icon: AlertTriangle, color: "bg-amber-500/10 text-amber-600", title: "Low stock alert", desc: "Decaf House Blend 500g — only 8 units left", time: "3h ago", read: false },
  { id: 4, type: "order", icon: ShoppingBag, color: "bg-primary/10 text-primary", title: "Order delivered", desc: "ORD-55 was delivered to Saffron Lounge", time: "Yesterday", read: true },
  { id: 5, type: "product", icon: Package, color: "bg-blue-500/10 text-blue-600", title: "Product approved", desc: "Arabic Coffee Blend — now live on the marketplace", time: "Yesterday", read: true },
  { id: 6, type: "payment", icon: CreditCard, color: "bg-green-500/10 text-green-600", title: "Payout processed", desc: "TND 2,546 transferred to your bank account", time: "Apr 5, 2026", read: true },
];

export default function SupplierNotificationsPage() {
  const [notifs, setNotifs] = useState(fakeNotifications);
  const unread = notifs.filter((n) => !n.read).length;

  const markAll = () => setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  const markOne = (id: number) => setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Stay updated on orders, payments and alerts.</p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAll} data-testid="button-mark-all-read">Mark all as read</Button>
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
            <div><p className="text-xs text-muted-foreground">Low Stock Alerts</p><p className="text-2xl font-bold">1</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><CreditCard className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">Payment Alerts</p><p className="text-2xl font-bold">2</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">All Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {notifs.map((n) => (
            <button
              key={n.id}
              data-testid={`button-notif-${n.id}`}
              onClick={() => markOne(n.id)}
              className={`w-full flex items-start gap-4 p-4 rounded-lg text-left transition-colors border ${
                n.read ? "border-border/30 bg-transparent" : "border-primary/20 bg-primary/5"
              }`}
            >
              <div className={`rounded-lg p-2 mt-0.5 shrink-0 ${n.color.split(" ")[0]}`}>
                <n.icon className={`w-4 h-4 ${n.color.split(" ")[1]}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{n.title}</p>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{n.desc}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{n.time}</span>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

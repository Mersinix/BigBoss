import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
import { useOrders } from "@/hooks/use-orders";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";
import { useSearchLocationStore, formatLocationLabel, pickedToGeoLocation } from "@/store/search-location-store";
import {
  Coffee, MapPin, ChevronDown, ChevronLeft, ShoppingBag, Heart, MessageCircle,
  Search, LogOut, Settings, LayoutDashboard, Store, Send,
  Star, Package, Trash2, CheckCircle, Clock, Box, Truck,
  AlertCircle, DollarSign, ClipboardList, Phone, Globe, MapPinIcon, AlertTriangle,
  Printer, Megaphone, User, GraduationCap, Sun, Moon, X,
} from "lucide-react";
import { useFavorites, selectTotalFavCount } from "@/hooks/use-favorites";
import { useStoreFavorites } from "@/hooks/use-store-favorites";
import { useServiceStates } from "@/hooks/use-service-states";
import { useQuickView } from "@/hooks/use-quick-view";
import { usePackQuickView } from "@/hooks/use-pack-quick-view";
import { ProductQuickViewModal } from "@/components/product-quick-view-modal";
import { PackQuickViewModal } from "@/components/pack-quick-view-modal";
import type { CategoryWithCount, ShopFavoriteItem, PackDetail, StoreCard } from "@shared/schema";

const CITIES = ["Tunis", "Sfax", "Sousse", "Béja"];

// ── Theme tokens helper ───────────────────────────────────────────────────────

function useTheme(isDark: boolean) {
  const dk = isDark;
  return {
    dk,
    pageBg:           dk ? "bg-gray-900"                          : "bg-gray-50",
    cardBg:           dk ? "bg-gray-800 border-gray-700/60"       : "bg-white border-gray-100",
    textPrimary:      dk ? "text-white"                           : "text-gray-900",
    textMuted:        dk ? "text-gray-400"                        : "text-gray-500",
    textPrice:        dk ? "text-blue-400"                        : "text-blue-600",
    switcherBg:       dk ? "bg-gray-800"                          : "bg-gray-100",
    switcherActive:   dk ? "bg-gray-700 text-white shadow-sm"     : "bg-white text-blue-600 shadow-sm",
    switcherInactive: dk ? "text-gray-400 hover:text-gray-200"    : "text-gray-500 hover:text-gray-700",
    stripBg:          dk ? "bg-gray-900/95 border-gray-800"       : "bg-white border-gray-100",
    filterBg:         dk ? "bg-gray-900/95 border-gray-800"       : "bg-white border-gray-100",
    selectTrigger:    dk ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700" : "border-gray-200 bg-gray-50",
    divider:          dk ? "border-gray-800"                      : "border-gray-100",
    skeletonBg:       dk ? "bg-gray-800"                          : "bg-gray-100",
    imgBg:            dk ? "bg-gray-700"                          : "bg-gray-50",
    toggleBtn:        dk ? "bg-gray-800 hover:bg-gray-700 text-amber-400" : "bg-white/90 hover:bg-white text-gray-600 shadow-sm",
  };
}

// ── Access helper ─────────────────────────────────────────────────────────────

function computeAccess(user: any) {
  if (!user) return { isVisitor: true, isPending: false, isApproved: false, hasCommercial: false };
  if (['SUPER_ADMIN', 'ADMIN', 'SUPPLIER'].includes(user.role)) {
    return { isVisitor: false, isPending: false, isApproved: true, hasCommercial: true };
  }
  const approved = user.role === 'CAFE_OWNER' && user.status === 'approved';
  const pending = user.role === 'CAFE_OWNER' && !approved;
  return { isVisitor: false, isPending: pending, isApproved: approved, hasCommercial: approved };
}

// ── Status meta ───────────────────────────────────────────────────────────────

const statusMeta: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: "Pending", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  CONFIRMED: { label: "Confirmed", color: "bg-blue-100 text-blue-800 border-blue-200", icon: CheckCircle },
  PREPARING: { label: "Preparing", color: "bg-orange-100 text-orange-800 border-orange-200", icon: Box },
  READY: { label: "Ready", color: "bg-teal-100 text-teal-800 border-teal-200", icon: Box },
  IN_DELIVERY: { label: "In Delivery", color: "bg-purple-100 text-purple-800 border-purple-200", icon: Truck },
  DELIVERED: { label: "Delivered", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle },
  CANCELLED: { label: "Cancelled", color: "bg-red-100 text-red-800 border-red-200", icon: AlertCircle },
};

// ── Fake data ─────────────────────────────────────────────────────────────────

type ServiceId = "SHOP" | "PRINT" | "BARISTA" | "MARKETING";
type ThreadMessage = { from: "me" | "them"; text: string; time: string };
type Thread = { id: number; name: string; service: ServiceId; lastMessage: string; time: string; unread: number; messages: ThreadMessage[] };

const SERVICE_BADGE: Record<ServiceId, string> = {
  SHOP:      "bg-blue-100 text-blue-700",
  PRINT:     "bg-orange-100 text-orange-700",
  BARISTA:   "bg-green-100 text-green-700",
  MARKETING: "bg-purple-100 text-purple-700",
};

const fakeThreads: Thread[] = [
  { id: 1, name: "Premium Beans Co",     service: "SHOP",      lastMessage: "Your order has been confirmed.", time: "2m ago",   unread: 2, messages: [{ from: "them", text: "Hello! Thank you for your order.", time: "10:03 AM" }, { from: "me", text: "Great! When dispatched?", time: "10:05 AM" }, { from: "them", text: "Your order has been confirmed and is being prepared.", time: "10:08 AM" }] },
  { id: 2, name: "Oat & Grain Supply",   service: "SHOP",      lastMessage: "New batch of barista oat milk available.", time: "1h ago",   unread: 1, messages: [{ from: "them", text: "Hi! New batch of barista oat milk.", time: "09:15 AM" }, { from: "me", text: "How much for 12 units?", time: "09:20 AM" }] },
  { id: 3, name: "TunRoast",             service: "SHOP",      lastMessage: "Our new seasonal blend just dropped!", time: "Yesterday", unread: 0, messages: [{ from: "them", text: "Our new seasonal blend just dropped!", time: "Yesterday" }] },
  { id: 4, name: "ImprimTunis",          service: "PRINT",     lastMessage: "Your flyer proof is ready for review.", time: "30m ago",  unread: 1, messages: [{ from: "them", text: "Hello! Your flyer proof is ready.", time: "09:40 AM" }, { from: "me", text: "Can you adjust the font size?", time: "09:45 AM" }, { from: "them", text: "Of course! Updated version sent.", time: "09:50 AM" }] },
  { id: 5, name: "PrintExpress Sfax",    service: "PRINT",     lastMessage: "Menu cards delivered, thank you!", time: "Mon",      unread: 0, messages: [{ from: "them", text: "Your menu cards have been delivered!", time: "Mon" }, { from: "me", text: "Perfect, thank you!", time: "Mon" }] },
  { id: 6, name: "Tunis Barista Academy",service: "BARISTA",   lastMessage: "Enrollment confirmed for next week.", time: "2h ago",  unread: 0, messages: [{ from: "them", text: "Enrollment confirmed for the Espresso Fundamentals course next week.", time: "10:00 AM" }, { from: "me", text: "Great! What should I bring?", time: "10:02 AM" }, { from: "them", text: "Just yourself — all equipment provided.", time: "10:04 AM" }] },
  { id: 7, name: "Youssef Ben Ali",      service: "BARISTA",   lastMessage: "Available this weekend, confirmed.", time: "Yesterday", unread: 1, messages: [{ from: "me", text: "Are you available Saturday?", time: "Yesterday" }, { from: "them", text: "Available this weekend, confirmed.", time: "Yesterday" }] },
  { id: 8, name: "TunMedia Agency",      service: "MARKETING", lastMessage: "Q1 campaign report attached.", time: "Yesterday", unread: 2, messages: [{ from: "them", text: "Q1 campaign report is attached. Reach up 34%.", time: "Yesterday" }, { from: "me", text: "Impressive! Let's schedule a call.", time: "Yesterday" }] },
  { id: 9, name: "Pixel & Grain Studio", service: "MARKETING", lastMessage: "Photo shoot scheduled for Tuesday.", time: "Mon",      unread: 0, messages: [{ from: "them", text: "Photo shoot scheduled for Tuesday 10am.", time: "Mon" }, { from: "me", text: "Perfect, see you then.", time: "Mon" }] },
];

const favItems = [
  { id: 1, type: "product", name: "Espresso Roast 1kg", supplier: "Premium Beans Co", price: 2500, image: "https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=300&q=80" },
  { id: 2, type: "product", name: "Oat Milk 1L x 6", supplier: "Oat & Grain", price: 1800, image: "https://images.unsplash.com/photo-1600788886242-5c96aabe3757?w=300&q=80" },
];

const fakeSuppliers = [
  { id: 1, name: "Premium Beans Co", location: "Tunis Centre", rating: 4.9, orders: 14, tags: ["Single Origin", "Specialty"], phone: "+216 71 234 001", website: "www.premiumbeans.tn" },
  { id: 2, name: "Oat & Grain Supply", location: "Sfax", rating: 4.7, orders: 9, tags: ["Vegan", "Barista Grade"], phone: "+216 74 345 002", website: "www.oatgrain.tn" },
  { id: 3, name: "Arabica Direct", location: "Sousse", rating: 4.5, orders: 6, tags: ["Direct Trade", "Arabica"], phone: "+216 73 456 003", website: "www.arabicadirect.tn" },
];

// ── Account Panel (premium dark/light — mirrors FavoritesPanel design) ────────

function AccountPanel({ user, onClose, onLogout }: { user: any; onClose: () => void; onLogout: () => void }) {
  const [isDark, setIsDark] = useState(true);
  const [activeTab, setActiveTab] = useState<"orders" | "dashboard" | "settings">("orders");
  const { data: orders = [], isLoading: ordersLoading } = useOrders();
  const { data: allOrders = [], isLoading: dashLoading } = useQuery<any[]>({ queryKey: ["/api/orders"] });
  const [notifs, setNotifs] = useState({ orderUpdates: true, promotions: false, newSuppliers: true });

  const dk = isDark;
  const bg = dk ? "bg-gray-900" : "bg-white";
  const textPrimary = dk ? "text-white" : "text-gray-900";
  const textMuted = dk ? "text-gray-400" : "text-gray-500";
  const cardBg = dk ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100";
  const switcherBg = dk ? "bg-gray-800" : "bg-gray-100";
  const switcherActive = dk ? "bg-gray-700 text-white shadow-sm" : "bg-white text-blue-600 shadow-sm";
  const switcherInactive = dk ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700";
  const dividerColor = dk ? "bg-gray-800" : "bg-gray-100";
  const inputCls = dk ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 rounded-xl" : "border-gray-200 rounded-xl";
  const borderClr = dk ? "border-gray-700/60" : "border-gray-100";

  // Orders
  const sorted = [...(orders as any[])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Dashboard
  const total = allOrders.length;
  const delivered = allOrders.filter((o) => o.status === "DELIVERED").length;
  const inProgress = allOrders.filter((o) => ["PENDING", "CONFIRMED", "PREPARING"].includes(o.status)).length;
  const spent = allOrders.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + (o.totalAmount || 0), 0);
  const kpis = [
    { label: "Total Orders", value: total, icon: ShoppingBag, color: dk ? "text-white" : "text-gray-900" },
    { label: "In Progress", value: inProgress, icon: Clock, color: "text-amber-400" },
    { label: "Delivered", value: delivered, icon: CheckCircle, color: "text-green-400" },
    { label: "Spent", value: `TND ${(spent / 100).toFixed(0)}`, icon: DollarSign, color: "text-blue-400" },
  ];
  const statusCounts: Record<string, number> = {};
  allOrders.forEach((o) => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
  const maxCount = Math.max(...Object.values(statusCounts), 1);

  const tabs = [
    { key: "orders" as const, label: "Orders", icon: ClipboardList },
    { key: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
    { key: "settings" as const, label: "Settings", icon: Settings },
  ];

  return (
    <div className={`flex flex-col h-full overflow-hidden ${bg}`}>
      {/* ── Fixed header ── */}
      <div className={`shrink-0 ${bg} px-5 pt-5 pb-4`}>
        {/* Title row */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={onClose}
            aria-label="Close"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500"}`}
          >
            <X className="w-4 h-4" />
          </button>
          <h2 className={`text-[15px] font-semibold tracking-tight ${textPrimary}`}>My Account</h2>
          <button
            onClick={() => setIsDark((d) => !d)}
            aria-label="Toggle theme"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-100 hover:bg-gray-200"}`}
          >
            {dk ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
          </button>
        </div>

        {/* User identity strip */}
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border mb-4 ${cardBg}`}>
          <Avatar className="w-10 h-10 shrink-0">
            <AvatarFallback className={`font-bold text-sm ${dk ? "bg-gray-700 text-amber-400" : "bg-blue-100 text-blue-700"}`}>
              {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className={`font-semibold text-sm truncate ${textPrimary}`}>{user?.name}</p>
            <p className={`text-xs truncate ${textMuted}`}>{user?.email}</p>
          </div>
          {user?.status && (
            <span className={`text-[10px] font-semibold px-2 py-1 rounded-xl shrink-0 ${
              user.status === 'approved' ? (dk ? "bg-green-900/50 text-green-400" : "bg-green-50 text-green-600")
              : user.status === 'pending' ? (dk ? "bg-yellow-900/50 text-yellow-400" : "bg-yellow-50 text-yellow-700")
              : (dk ? "bg-red-900/50 text-red-400" : "bg-red-50 text-red-600")
            }`}>
              {user.status === 'approved' ? '✓ Approved' : user.status === 'pending' ? '⏳ Pending' : '✗ Rejected'}
            </span>
          )}
        </div>

        {/* Tab switcher */}
        <div className={`flex gap-1 rounded-2xl p-1 ${switcherBg}`}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-semibold rounded-xl transition-all ${activeTab === tab.key ? switcherActive : switcherInactive}`}
            >
              <tab.icon className="w-3 h-3" />{tab.label}
            </button>
          ))}
        </div>

        <div className={`mt-4 h-px ${dividerColor}`} />
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-8 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full">

        {/* ORDERS */}
        {activeTab === "orders" && (
          ordersLoading
            ? <div className="space-y-3 pt-2">{[...Array(3)].map((_, i) => <div key={i} className={`h-20 rounded-2xl animate-pulse ${dk ? "bg-gray-800" : "bg-gray-100"}`} />)}</div>
            : !sorted.length
              ? <div className={`text-center py-16 ${textMuted}`}><ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-20" /><p className={`font-medium text-sm ${textPrimary}`}>No orders yet</p></div>
              : <div className="space-y-3 pt-2">
                  {sorted.map((order: any) => {
                    const meta = statusMeta[order.status] ?? statusMeta.PENDING;
                    const Icon = meta.icon;
                    return (
                      <div key={order.id} className={`border rounded-2xl p-4 space-y-2 ${cardBg}`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-mono text-sm font-bold ${textPrimary}`}>#{String(order.id).padStart(6, "0")}</span>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-xl border ${meta.color}`}><Icon className="w-3 h-3" />{meta.label}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs ${textMuted}`}>{order.createdAt ? formatDate(order.createdAt) : "—"}</span>
                          <span className={`text-sm font-bold ${dk ? "text-amber-400" : "text-amber-600"}`}>{formatCurrency(order.totalAmount)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
        )}

        {/* DASHBOARD */}
        {activeTab === "dashboard" && (
          dashLoading
            ? <div className="space-y-3 pt-2">{[...Array(4)].map((_, i) => <div key={i} className={`h-20 rounded-2xl animate-pulse ${dk ? "bg-gray-800" : "bg-gray-100"}`} />)}</div>
            : <div className="space-y-5 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  {kpis.map((k) => (
                    <div key={k.label} className={`border rounded-2xl p-4 ${cardBg}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className={`text-xs ${textMuted}`}>{k.label}</p>
                        <k.icon className={`w-4 h-4 ${k.color}`} />
                      </div>
                      <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                    </div>
                  ))}
                </div>
                {Object.keys(statusCounts).length > 0 && (
                  <div className={`border rounded-2xl p-4 ${cardBg}`}>
                    <p className={`font-semibold text-sm mb-3 ${textPrimary}`}>Order Status Breakdown</p>
                    <div className="space-y-2.5">
                      {Object.entries(statusCounts).map(([status, count]) => (
                        <div key={status} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className={textMuted}>{status.replace("_", " ")}</span>
                            <span className={textPrimary}>{count}</span>
                          </div>
                          <Progress value={(count / maxCount) * 100} className="h-1.5" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
        )}

        {/* SETTINGS */}
        {activeTab === "settings" && (
          <div className="space-y-4 pt-2">
            <div className={`border rounded-2xl p-4 ${cardBg}`}>
              <p className={`font-semibold text-sm mb-3 flex items-center gap-2 ${textPrimary}`}><User className="w-4 h-4" /> Profile</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={`text-xs ${textMuted}`}>Full Name</Label>
                  <Input defaultValue={user?.name} className={`h-9 ${inputCls}`} />
                </div>
                <div className="space-y-1.5">
                  <Label className={`text-xs ${textMuted}`}>Email</Label>
                  <Input defaultValue={user?.email} className={`h-9 ${inputCls}`} />
                </div>
              </div>
            </div>
            <div className={`border rounded-2xl p-4 ${cardBg}`}>
              <p className={`font-semibold text-sm mb-3 ${textPrimary}`}>Notifications</p>
              <div className="space-y-3">
                {[{ key: "orderUpdates", label: "Order Updates" }, { key: "promotions", label: "Promotions" }, { key: "newSuppliers", label: "New Suppliers" }].map((n) => (
                  <div key={n.key} className={`flex items-center justify-between py-1 border-b last:border-0 ${borderClr}`}>
                    <span className={`text-sm ${textPrimary}`}>{n.label}</span>
                    <Switch checked={notifs[n.key as keyof typeof notifs]} onCheckedChange={(v) => setNotifs((p) => ({ ...p, [n.key]: v }))} />
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={onLogout}
              className={`w-full flex items-center justify-center gap-2 text-sm font-medium py-3 rounded-2xl border transition-colors ${dk ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : "border-red-200 text-red-500 hover:bg-red-50"}`}
            >
              <LogOut className="w-4 h-4" /> Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Suppliers Panel ───────────────────────────────────────────────────────────

function SuppliersPanel() {
  const [search, setSearch] = useState("");
  const filtered = fakeSuppliers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input className="pl-8 h-9" placeholder="Search suppliers…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="space-y-3">
        {filtered.map((s) => (
          <div key={s.id} className="border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div><p className="font-semibold">{s.name}</p><p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPinIcon className="w-3 h-3" />{s.location}</p></div>
              <div className="flex items-center gap-1 text-xs font-semibold text-amber-500"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{s.rating}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">{s.tags.map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}</div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span><Phone className="w-3 h-3 inline mr-1" />{s.phone}</span>
              <span><Globe className="w-3 h-3 inline mr-1" />{s.website}</span>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs">Contact</Button>
              <Link href="/products"><Button size="sm" className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white">Browse</Button></Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Favorites Panel ───────────────────────────────────────────────────────────

type FavService = "SHOP" | "PRINT" | "BARISTA" | "MARKETING";
type BaristaSubTab = "academy" | "marketplace";
type ShopSubTab = "products" | "packs" | "stores";

const FAV_SERVICES: FavService[] = ["SHOP", "PRINT", "BARISTA", "MARKETING"];
const FAV_SERVICE_TO_KEY: Record<FavService, "PRINTING" | "BARISTA" | "MARKETING" | null> = {
  SHOP: null,
  PRINT: "PRINTING",
  BARISTA: "BARISTA",
  MARKETING: "MARKETING",
};

function FavoritesPanel({ onClose }: { onClose: () => void }) {
  const [, navigate] = useLocation();
  const { states: serviceStates } = useServiceStates();
  const [isDark, setIsDark] = useState(true);
  const [activeService, setActiveService] = useState<FavService>("SHOP");
  const [shopTab, setShopTab] = useState<ShopSubTab>("products");
  const [baristaTab, setBaristaTab] = useState<BaristaSubTab>("academy");

  const {
    shop, print, academy, baristaMarket, marketing, pack,
    removeShop, removePrint, removeAcademy, removeBaristaMarket, removeMarketing, removePack,
  } = useFavorites();
  const { stores, toggleStore: toggleStoreFav } = useStoreFavorites();

  const openQuickView = useQuickView((s) => s.open);
  const openPackQuickView = usePackQuickView((s) => s.open);

  // Fetch pack details for favorited packs
  const packFavIds = Object.keys(pack).map(Number);
  const { data: allPacks = [] } = useQuery<PackDetail[]>({
    queryKey: ["/api/marketplace/packs"],
    enabled: packFavIds.length > 0,
  });
  const favPacks = allPacks.filter((p) => !!pack[p.id]);

  // Fetch store details for favorited stores
  const storeFavIds = Object.keys(stores).map(Number);
  const { data: allStores = [] } = useQuery<StoreCard[]>({
    queryKey: ["/api/stores"],
    enabled: storeFavIds.length > 0,
  });
  const favStores = allStores.filter((s) => !!stores[s.id]);

  const visibleFavServices = FAV_SERVICES.filter((s) => {
    const key = FAV_SERVICE_TO_KEY[s];
    return !key || serviceStates[key] !== "HIDDEN";
  });

  const dk = isDark;
  const bg = dk ? "bg-gray-900" : "bg-white";
  const textPrimary = dk ? "text-white" : "text-gray-900";
  const textMuted = dk ? "text-gray-400" : "text-gray-500";
  const cardBg = dk ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100";
  const switcherBg = dk ? "bg-gray-800" : "bg-gray-100";
  const switcherActive = dk ? "bg-gray-700 text-white shadow-sm" : "bg-white text-blue-600 shadow-sm";
  const switcherInactive = dk ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700";
  const subSwitcherBg = dk ? "bg-gray-800/60 border-gray-700/60" : "bg-gray-50 border-gray-100";
  const dividerColor = dk ? "bg-gray-800" : "bg-gray-100";
  const skeletonBg = dk ? "bg-gray-800" : "bg-gray-100";

  const shopItems = Object.values(shop);
  const printItems = Object.values(print);
  const academyItems = Object.values(academy);
  const baristaItems = Object.values(baristaMarket);
  const marketingItems = Object.values(marketing);

  const renderEmpty = () => (
    <div className={`text-center py-16 ${textMuted}`}>
      <Heart className="w-10 h-10 mx-auto mb-3 opacity-20" />
      <p className={`font-medium text-sm ${textPrimary}`}>No favorites yet</p>
      <p className="text-xs mt-1.5 opacity-50">Heart items to save them here</p>
    </div>
  );

  return (
     <div className={`flex flex-col h-full overflow-hidden ${bg}`}>

      {/* ── Fixed header ── */}
      <div className={`shrink-0 ${bg} px-5 pt-5 pb-4`}>

        {/* Title row */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={onClose}
            aria-label="Close"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500"}`}
          >
            <X className="w-4 h-4" />
          </button>
          <h2 className={`text-[15px] font-semibold tracking-tight ${textPrimary}`}>My Favorites</h2>
          <button
            onClick={() => setIsDark((d) => !d)}
            aria-label="Toggle theme"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-100 hover:bg-gray-200"}`}
          >
            {dk
              ? <Sun className="w-4 h-4 text-amber-400" />
              : <Moon className="w-4 h-4 text-gray-500" />
            }
          </button>
        </div>

        {/* Service switcher */}
        <div className={`flex gap-1 rounded-2xl p-1 ${switcherBg}`}>
          {visibleFavServices.map((s) => (
            <button
              key={s}
              data-testid={`tab-fav-${s.toLowerCase()}`}
              onClick={() => setActiveService(s)}
              className={`flex-1 py-2 text-[11px] font-semibold rounded-xl transition-all ${activeService === s ? switcherActive : switcherInactive}`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* SHOP sub-switcher */}
        {activeService === "SHOP" && (
          <div className={`flex gap-1 rounded-2xl p-1 mt-2.5 border ${subSwitcherBg}`}>
            {(["products", "packs", "stores"] as ShopSubTab[]).map((tab) => (
              <button
                key={tab}
                data-testid={`tab-fav-shop-${tab}`}
                onClick={() => setShopTab(tab)}
                className={`flex-1 py-1.5 text-[11px] font-semibold rounded-xl transition-all ${
                  shopTab === tab
                    ? dk ? "bg-gray-700 text-amber-400 shadow-sm" : "bg-white text-amber-600 shadow-sm"
                    : switcherInactive
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* BARISTA sub-switcher */}
        {activeService === "BARISTA" && (
          <div className={`flex gap-1 rounded-2xl p-1 mt-2.5 border ${subSwitcherBg}`}>
            {(["academy", "marketplace"] as BaristaSubTab[]).map((sub) => (
              <button
                key={sub}
                data-testid={`tab-fav-barista-${sub}`}
                onClick={() => setBaristaTab(sub)}
                className={`flex-1 py-1.5 text-[11px] font-semibold rounded-xl transition-all ${
                  baristaTab === sub
                    ? dk ? "bg-gray-700 text-green-400 shadow-sm" : "bg-white text-green-600 shadow-sm"
                    : switcherInactive
                }`}
              >
                {sub === "academy" ? "Barista Academy" : "Marketplace Baristas"}
              </button>
            ))}
          </div>
        )}

        {/* Divider */}
        <div className={`mt-4 h-px ${dividerColor}`} />
      </div>

      {/* ── Scrollable content ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-8 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600" style={{ WebkitOverflowScrolling: "touch" }}>
        {/* SHOP — Products */}
        {activeService === "SHOP" && shopTab === "products" && (
          shopItems.length === 0 ? renderEmpty() : (
            <div className="grid grid-cols-2 gap-3">
              {shopItems.map((item) => (
                <div
                  key={item.id}
                  className={`group border rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-shadow ${cardBg}`}
                  onClick={() => openQuickView(item.id)}
                  data-testid={`card-fav-shop-${item.id}`}
                >
                  <div className="relative h-28">
                    {item.image
                      ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      : <div className={`w-full h-full ${dk ? "bg-gray-700" : "bg-gray-50"} flex items-center justify-center`}><Package className="w-8 h-8 text-gray-400 opacity-30" /></div>
                    }
                    <button
                      className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); removeShop(item.id); }}
                      data-testid={`button-fav-remove-shop-${item.id}`}
                    >
                      <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                    </button>
                  </div>
                  <div className="p-3">
                    <p className={`font-semibold text-sm leading-tight line-clamp-1 ${textPrimary}`}>{item.name}</p>
                    <p className={`text-xs mt-0.5 ${textMuted}`}>{item.supplier}</p>
                    <p className={`text-sm font-bold mt-1 ${dk ? "text-blue-400" : "text-blue-600"}`}>{formatCurrency(item.price)}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* SHOP — Packs */}
        {activeService === "SHOP" && shopTab === "packs" && (
          packFavIds.length === 0 ? renderEmpty() : favPacks.length === 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {packFavIds.map((id) => <div key={id} className={`h-36 rounded-2xl animate-pulse ${skeletonBg}`} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {favPacks.map((p) => (
                <div
                  key={p.id}
                  className={`group border rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-shadow ${cardBg}`}
                  onClick={() => openPackQuickView(p.id)}
                  data-testid={`card-fav-pack-${p.id}`}
                >
                  <div className="relative h-28">
                    {p.imageUrl
                      ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                      : <div className={`w-full h-full ${dk ? "bg-gray-700" : "bg-gray-50"} flex items-center justify-center`}><Box className="w-8 h-8 text-gray-400 opacity-30" /></div>
                    }
                    <button
                      className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); removePack(p.id); }}
                      data-testid={`button-fav-remove-pack-${p.id}`}
                    >
                      <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                    </button>
                  </div>
                  <div className="p-3">
                    <p className={`font-semibold text-sm leading-tight line-clamp-1 ${textPrimary}`}>{p.name}</p>
                    <p className={`text-xs mt-0.5 ${textMuted}`}>{p.supplierName}</p>
                    <p className={`text-sm font-bold mt-1 ${dk ? "text-amber-400" : "text-amber-600"}`}>{formatCurrency(p.price)}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* SHOP — Stores */}
        {activeService === "SHOP" && shopTab === "stores" && (
          storeFavIds.length === 0 ? renderEmpty() : favStores.length === 0 ? (
            <div className="space-y-2.5">
              {storeFavIds.map((id) => <div key={id} className={`h-16 rounded-2xl animate-pulse ${skeletonBg}`} />)}
            </div>
          ) : (
            <div className="space-y-2.5">
              {favStores.map((st) => (
                <div
                  key={st.id}
                  className={`group flex items-center gap-3 border rounded-2xl p-3 cursor-pointer hover:shadow-lg transition-shadow ${cardBg}`}
                  onClick={() => { navigate(`/stores/${st.id}`); onClose(); }}
                  data-testid={`card-fav-store-${st.id}`}
                >
                  <div className={`w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center shrink-0 ${dk ? "bg-gray-700" : "bg-gray-100"}`}>
                    {st.logoUrl
                      ? <img src={st.logoUrl} alt={st.name} className="w-full h-full object-cover" />
                      : <Store className="w-5 h-5 text-gray-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm truncate ${textPrimary}`}>{st.name}</p>
                    {(st as any).productCount != null && (
                      <p className={`text-xs mt-0.5 ${textMuted}`}>{(st as any).productCount} products</p>
                    )}
                  </div>
                  <button
                    className="p-1.5 rounded-xl hover:bg-rose-500/10 transition-colors shrink-0"
                    onClick={(e) => { e.stopPropagation(); toggleStoreFav(st.id); }}
                    data-testid={`button-fav-remove-store-${st.id}`}
                  >
                    <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {/* PRINT */}
        {activeService === "PRINT" && (
          printItems.length === 0 ? renderEmpty() : (
            <div className="grid grid-cols-2 gap-3">
              {printItems.map((item) => (
                <div key={item.id} className={`group border rounded-2xl overflow-hidden ${cardBg}`}>
                  <div className="relative h-28">
                    {item.image
                      ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      : <div className={`w-full h-full ${dk ? "bg-gray-700" : "bg-gray-50"} flex items-center justify-center`}><Printer className="w-8 h-8 text-gray-400 opacity-30" /></div>
                    }
                    <button
                      className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removePrint(item.id)}
                      data-testid={`button-fav-remove-print-${item.id}`}
                    >
                      <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                    </button>
                  </div>
                  <div className="p-3">
                    <p className={`font-semibold text-sm leading-tight line-clamp-1 ${textPrimary}`}>{item.name}</p>
                    <p className={`text-xs mt-0.5 ${textMuted}`}>{item.brand}</p>
                    <p className={`text-sm font-bold mt-1 ${dk ? "text-blue-400" : "text-blue-600"}`}>
                      {formatCurrency(item.price)}<span className={`text-[10px] font-normal ${textMuted}`}>/{item.priceUnit}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* BARISTA — Academy */}
        {activeService === "BARISTA" && baristaTab === "academy" && (
          academyItems.length === 0 ? renderEmpty() : (
            <div className="grid grid-cols-2 gap-3">
              {academyItems.map((item) => (
                <div key={item.id} className={`group border rounded-2xl overflow-hidden ${cardBg}`}>
                  <div className="h-16 bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center relative">
                    <GraduationCap className="w-6 h-6 text-white opacity-80" />
                    <button
                      className="absolute top-2 right-2 bg-white/80 backdrop-blur-sm rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeAcademy(item.id)}
                      data-testid={`button-fav-remove-academy-${item.id}`}
                    >
                      <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                    </button>
                  </div>
                  <div className="p-3">
                    <p className={`font-semibold text-sm leading-tight line-clamp-1 ${textPrimary}`}>{item.title}</p>
                    <p className={`text-xs mt-0.5 ${textMuted}`}>{item.provider}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-amber-400 flex items-center gap-0.5"><Star className="w-2.5 h-2.5 fill-amber-400" />{item.rating.toFixed(1)}</span>
                      <span className={`text-[10px] ${textMuted}`}>{item.duration}</span>
                    </div>
                    <p className="text-sm font-bold text-green-400 mt-1">{(item.price / 100).toFixed(0)} TND</p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* BARISTA — Marketplace */}
        {activeService === "BARISTA" && baristaTab === "marketplace" && (
          baristaItems.length === 0 ? renderEmpty() : (
            <div className="space-y-2">
              {baristaItems.map((item) => (
                <div key={item.id} className={`group flex items-center gap-3 border rounded-2xl p-3 ${cardBg}`}>
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarFallback className={`${dk ? "bg-green-900 text-green-300" : "bg-green-100 text-green-700"} font-bold text-xs`}>{item.initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`font-semibold text-sm truncate ${textPrimary}`}>{item.name}</p>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.available ? "bg-green-400" : "bg-gray-500"}`} />
                    </div>
                    <p className={`text-xs flex items-center gap-1 mt-0.5 ${textMuted}`}>
                      <MapPinIcon className="w-2.5 h-2.5" />{item.location}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.skills.slice(0, 2).map((sk) => (
                        <span key={sk} className={`text-[10px] px-1.5 py-0.5 rounded-full ${dk ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"}`}>{sk}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-amber-400 flex items-center gap-0.5"><Star className="w-2.5 h-2.5 fill-amber-400" />{item.rating.toFixed(1)}</span>
                    <button
                      className="p-1 rounded-lg hover:bg-rose-500/10 transition-colors"
                      onClick={() => removeBaristaMarket(item.id)}
                      data-testid={`button-fav-remove-barista-${item.id}`}
                    >
                      <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* MARKETING */}
        {activeService === "MARKETING" && (
          marketingItems.length === 0 ? renderEmpty() : (
            <div className="grid grid-cols-2 gap-3">
              {marketingItems.map((item) => (
                <div key={item.id} className={`group border rounded-2xl overflow-hidden ${cardBg}`}>
                  <div className="h-16 grid grid-cols-3 gap-0.5 overflow-hidden">
                    {item.portfolioImages.slice(0, 3).map((img, i) => (
                      <div key={i} className={`relative overflow-hidden ${dk ? "bg-gray-700" : "bg-gray-100"}`}>
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-1">
                      <p className={`font-semibold text-sm leading-tight line-clamp-1 flex-1 ${textPrimary}`}>{item.name}</p>
                      <button
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                        onClick={() => removeMarketing(item.id)}
                        data-testid={`button-fav-remove-marketing-${item.id}`}
                      >
                        <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                      </button>
                    </div>
                    <p className={`text-xs mt-0.5 ${textMuted}`}>{item.type}</p>
                    <span className="text-[11px] text-amber-400 mt-1 flex items-center gap-0.5"><Star className="w-2.5 h-2.5 fill-amber-400" />{item.rating.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

      </div>
    </div>
  );
}

// ── Chat Panel ────────────────────────────────────────────────────────────────

const SERVICES_LIST: ServiceId[] = ["SHOP", "PRINT", "BARISTA", "MARKETING"];
const SERVICE_ID_TO_KEY: Record<ServiceId, "PRINTING" | "BARISTA" | "MARKETING" | null> = {
  SHOP: null,
  PRINT: "PRINTING",
  BARISTA: "BARISTA",
  MARKETING: "MARKETING",
};

// ── Messages Panel (premium dark/light — mirrors FavoritesPanel design) ───────

function MessagesPanel({ onClose }: { onClose: () => void }) {
  const { states: serviceStates } = useServiceStates();
  const visibleServicesList = SERVICES_LIST.filter((s) => {
    const key = SERVICE_ID_TO_KEY[s];
    return !key || serviceStates[key] !== "HIDDEN";
  });

  const [isDark, setIsDark] = useState(true);
  const [service, setService] = useState<ServiceId>("SHOP");
  const [threads, setThreads] = useState<Thread[]>(fakeThreads);
  const [active, setActive] = useState<Thread | null>(null);
  const [view, setView] = useState<"list" | "chat">("list");
  const [input, setInput] = useState("");

  const dk = isDark;
  const bg = dk ? "bg-gray-900" : "bg-white";
  const textPrimary = dk ? "text-white" : "text-gray-900";
  const textMuted = dk ? "text-gray-400" : "text-gray-500";
  const cardBg = dk ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100";
  const switcherBg = dk ? "bg-gray-800" : "bg-gray-100";
  const switcherActive = dk ? "bg-gray-700 text-white shadow-sm" : "bg-white text-blue-600 shadow-sm";
  const switcherInactive = dk ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700";
  const dividerColor = dk ? "bg-gray-800" : "bg-gray-100";
  const hoverRow = dk ? "hover:bg-gray-800/70" : "hover:bg-gray-50";
  const borderRow = dk ? "border-gray-700/40" : "border-gray-100";
  const chatBubbleBg = dk ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-900";
  const inputCls = dk ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 rounded-2xl" : "border-gray-200 rounded-2xl";

  const filtered = threads.filter((t) => t.service === service);

  const openConversation = (t: Thread) => {
    setActive(t);
    setView("chat");
    setThreads((prev) => prev.map((th) => th.id === t.id ? { ...th, unread: 0 } : th));
  };

  const goBack = () => { setView("list"); };

  const send = () => {
    if (!input.trim() || !active) return;
    const msg: ThreadMessage = { from: "me", text: input.trim(), time: "Now" };
    setThreads((prev) => prev.map((t) => t.id === active.id ? { ...t, messages: [...t.messages, msg], lastMessage: input.trim() } : t));
    setActive((a) => a ? { ...a, messages: [...a.messages, msg] } : a);
    setInput("");
  };

  return (
    <div className={`flex flex-col h-full overflow-hidden ${bg}`}>
      {/* ── Fixed header ── */}
      <div className={`shrink-0 ${bg} px-5 pt-5 pb-4`}>
        {/* Title row */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={onClose}
            aria-label="Close"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500"}`}
          >
            <X className="w-4 h-4" />
          </button>
          <h2 className={`text-[15px] font-semibold tracking-tight ${textPrimary}`}>Messages</h2>
          <button
            onClick={() => setIsDark((d) => !d)}
            aria-label="Toggle theme"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-100 hover:bg-gray-200"}`}
          >
            {dk ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
          </button>
        </div>

        {/* Service switcher */}
        <div className={`flex gap-1 rounded-2xl p-1 ${switcherBg}`}>
          {visibleServicesList.map((s) => (
            <button
              key={s}
              data-testid={`tab-messages-${s.toLowerCase()}`}
              onClick={() => { setService(s); setView("list"); setActive(null); }}
              className={`flex-1 py-2 text-[11px] font-semibold rounded-xl transition-all ${service === s ? switcherActive : switcherInactive}`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className={`mt-4 h-px ${dividerColor}`} />
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-5 pb-5">

        {/* List view */}
        {view === "list" && (
          <div className={`flex-1 overflow-y-auto rounded-2xl border [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full ${cardBg}`}>
            {filtered.length === 0 ? (
              <div className={`flex flex-col items-center justify-center h-full py-16 ${textMuted}`}>
                <MessageCircle className="w-10 h-10 mb-3 opacity-20" />
                <p className={`text-sm font-medium ${textPrimary}`}>No conversations yet</p>
                <p className={`text-xs mt-1 opacity-50`}>for {service}</p>
              </div>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.id}
                  data-testid={`button-thread-${t.id}`}
                  onClick={() => openConversation(t)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-b last:border-0 ${hoverRow} ${borderRow}`}
                >
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 font-bold text-sm ${dk ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
                    {t.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={`text-sm font-semibold truncate ${textPrimary}`}>{t.name}</span>
                      <span className={`text-[10px] shrink-0 ${textMuted}`}>{t.time}</span>
                    </div>
                    <p className={`text-xs truncate ${textMuted}`}>{t.lastMessage}</p>
                  </div>
                  {t.unread > 0 && (
                    <span className="shrink-0 bg-blue-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {t.unread}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {/* Chat view */}
        {view === "chat" && active && (
          <div className={`flex-1 flex flex-col border rounded-2xl overflow-hidden ${cardBg}`}>
            {/* Header */}
            <div className={`flex items-center gap-2.5 px-4 py-3 border-b shrink-0 ${dk ? "border-gray-700/60" : "border-gray-100"}`}>
              <button
                onClick={goBack}
                data-testid="button-chat-back"
                className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors shrink-0 ${dk ? "bg-gray-700 hover:bg-gray-600 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${dk ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
                {active.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className={`font-semibold text-sm truncate ${textPrimary}`}>{active.name}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-lg shrink-0 ${SERVICE_BADGE[active.service]}`}>
                  {active.service}
                </span>
              </div>
            </div>
            {/* Messages */}
            <div className={`flex-1 overflow-y-auto p-4 space-y-2.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full`}>
              {active.messages.map((m, i) => (
                <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    m.from === "me"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : `${chatBubbleBg} rounded-bl-sm`
                  }`}>
                    {m.text}
                    <span className={`block text-[10px] mt-1 opacity-60 ${m.from === "me" ? "text-right" : ""}`}>{m.time}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Input */}
            <div className={`p-3 border-t flex gap-2 shrink-0 ${dk ? "border-gray-700/60" : "border-gray-100"}`}>
              <Input
                className={`flex-1 h-9 text-sm ${inputCls}`}
                placeholder="Message…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                data-testid="input-message"
              />
              <button
                onClick={send}
                data-testid="button-send-message"
                className="w-9 h-9 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-colors shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Draggable Chat Button ─────────────────────────────────────────────────────

function DraggableChatButton({ onClick, isDark }: { onClick: () => void; isDark: boolean }) {
  const MARGIN = 16;
  const BTN = 56;

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const startPtr = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Initialise to bottom-right
  useEffect(() => {
    const x = window.innerWidth - BTN - MARGIN;
    const y = window.innerHeight - BTN - MARGIN;
    setPos({ x, y });
  }, []);

  const clamp = (x: number, y: number) => ({
    x: Math.max(MARGIN, Math.min(x, window.innerWidth - BTN - MARGIN)),
    y: Math.max(MARGIN, Math.min(y, window.innerHeight - BTN - MARGIN)),
  });

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    moved.current = false;
    startPtr.current = { x: e.clientX, y: e.clientY };
    startPos.current = pos ?? { x: window.innerWidth - BTN - MARGIN, y: window.innerHeight - BTN - MARGIN };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - startPtr.current.x;
    const dy = e.clientY - startPtr.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
    setPos(clamp(startPos.current.x + dx, startPos.current.y + dy));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    if (!moved.current) onClick();
  };

  if (!pos) return null;

  return (
    <button
      ref={btnRef}
      style={{ left: pos.x, top: pos.y, touchAction: "none" }}
      className={`fixed z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-shadow select-none cursor-grab active:cursor-grabbing ${
        isDark
          ? "bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-blue-500/30 hover:shadow-blue-500/50"
          : "bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-blue-400/30 hover:shadow-blue-500/50"
      }`}
      data-testid="button-chat-float"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      aria-label="Open messages"
    >
      <MessageCircle className="w-6 h-6" />
    </button>
  );
}

// ── Main Marketplace Layout ───────────────────────────────────────────────────

export function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { getTotalItemCount } = useCart();
  const [location, navigate] = useLocation();
  const { toast } = useToast();

  const { isVisitor, isPending, isApproved, hasCommercial } = computeAccess(user);
  const favTotalCount = useFavorites(selectTotalFavCount);
  const hydrateShop = useFavorites((s) => s.hydrateShop);
  const hydratePack = useFavorites((s) => s.hydratePack);
  const hydrateStores = useStoreFavorites((s) => s.hydrateStores);
  const { states: headerServiceStates } = useServiceStates();

  const { data: favoritesData } = useQuery<ShopFavoriteItem[]>({
    queryKey: ["/api/favorites"],
    enabled: !!user && hasCommercial,
  });

  const { data: storeFavoritesData } = useQuery<number[]>({
    queryKey: ["/api/store-favorites"],
    enabled: !!user && hasCommercial,
  });

  const { data: packFavoritesData } = useQuery<number[]>({
    queryKey: ["/api/pack-favorites"],
    enabled: !!user && hasCommercial,
  });

  useEffect(() => {
    if (favoritesData) hydrateShop(favoritesData);
  }, [favoritesData, hydrateShop]);

  useEffect(() => {
    if (storeFavoritesData) hydrateStores(storeFavoritesData);
  }, [storeFavoritesData, hydrateStores]);

  useEffect(() => {
    if (packFavoritesData) hydratePack(packFavoritesData);
  }, [packFavoritesData, hydratePack]);

  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const searchLocation = useSearchLocationStore((s) => s.searchLocation);
  const setSearchLocation = useSearchLocationStore((s) => s.setSearchLocation);

  const isOnSettings = location.startsWith("/cafe/settings");
  const showSearchLocation = !isOnSettings;

  const locationLabel = searchLocation?.address
    ? formatLocationLabel(searchLocation.address)
    : "Tunis";

  const handleLocationButtonClick = () => {
    setLocationPickerOpen(true);
  };

  const handleLocationConfirm = (loc: PickedLocation) => {
    setSearchLocation(pickedToGeoLocation(loc));
    setLocationPickerOpen(false);
    toast({ title: "📍 Zone de recherche mise à jour", description: formatLocationLabel(loc.address) });
  };

  const [isDark, setIsDark] = useState(true);
  const t = useTheme(isDark);

  const [profileOpen, setProfileOpen] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const cartCount = getTotalItemCount();

  const isOnPrint = location.startsWith("/print");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (isOnPrint) {
      navigate(q ? `/print?q=${encodeURIComponent(q)}` : "/print");
    } else {
      navigate(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
    }
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${t.pageBg}`}>
      {/* ── Top Navbar ── */}
      <header className={`sticky top-0 z-50 border-b shadow-sm transition-colors duration-200 ${isDark ? "bg-gray-900/95 border-gray-800 backdrop-blur-md" : "bg-white/95 border-gray-100 backdrop-blur-md"}`}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0 mr-1">
            <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center shadow-md shadow-amber-500/30">
              <Coffee className="w-4 h-4 text-white" />
            </div>
            <span className={`font-bold text-base hidden md:block ${isDark ? "text-white" : "text-gray-900"}`}>
              BigBoss<span className="text-amber-400">Coffee</span>
            </span>
          </Link>

          {/* Location — search zone only (never updates profile) */}
          {showSearchLocation && (
            <button
              onClick={handleLocationButtonClick}
              className={`flex items-center gap-1.5 text-xs font-medium transition-all border rounded-2xl px-3 py-1.5 shrink-0 max-w-[160px] ${
                isDark
                  ? "bg-gray-800 border-gray-700 text-gray-300 hover:border-amber-600 hover:text-amber-400"
                  : "bg-gray-50 border-gray-200 text-gray-600 hover:text-amber-600 hover:border-amber-300"
              }`}
              data-testid="button-marketplace-location"
            >
              <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="hidden sm:block truncate">{locationLabel}</span>
              <ChevronDown className={`w-3 h-3 shrink-0 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
            </button>
          )}

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-md hidden sm:block">
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
              <Input
                className={`pl-9 h-9 rounded-2xl text-sm transition-colors ${
                  isDark
                    ? "bg-gray-800 border-gray-700 text-gray-200 placeholder:text-gray-500 focus:bg-gray-700 focus:border-gray-600"
                    : "bg-gray-50 border-gray-200 text-gray-900 focus:bg-white"
                }`}
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-marketplace-search"
              />
            </div>
          </form>

          <div className="flex-1" />

          {/* Sun / Moon toggle */}
          <button
            onClick={() => setIsDark((d) => !d)}
            aria-label="Toggle theme"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${
              isDark ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-100 hover:bg-gray-200"
            }`}
          >
            {isDark
              ? <Sun className="w-4 h-4 text-amber-400" />
              : <Moon className="w-4 h-4 text-gray-500" />
            }
          </button>

          {/* ── Authenticated Nav ── */}
          {user ? (
            <div className="flex items-center gap-1">
              {/* Pending notice */}
              {isPending && (
                <div className={`hidden sm:flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 ${
                  isDark
                    ? "text-amber-300 bg-amber-900/40 border border-amber-800/50"
                    : "text-yellow-700 bg-yellow-50 border border-yellow-200"
                }`}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Awaiting approval</span>
                </div>
              )}

              {/* Suppliers — approved/admin only */}
              {hasCommercial && (
                <button
                  onClick={() => setSuppliersOpen(true)}
                  className={`p-2 rounded-xl transition-colors hidden sm:flex items-center gap-1.5 text-xs font-medium ${
                    isDark
                      ? "text-gray-400 hover:text-white hover:bg-gray-800"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                  data-testid="button-suppliers"
                >
                  <Store className="w-4 h-4" />
                  <span className="hidden md:block">Suppliers</span>
                </button>
              )}

              {/* Favorites — approved/admin only */}
              {hasCommercial && (
                <button
                  onClick={() => setFavOpen(true)}
                  className={`relative p-2 rounded-xl transition-colors ${
                    isDark
                      ? "text-gray-400 hover:text-white hover:bg-gray-800"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                  data-testid="button-favorites"
                >
                  <Heart className="w-4 h-4" />
                  {favTotalCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 flex items-center justify-center w-4 h-4 text-[9px] font-bold text-white bg-rose-500 rounded-full">
                      {favTotalCount > 99 ? "99+" : favTotalCount}
                    </span>
                  )}
                </button>
              )}

              {/* Cart — approved/admin only */}
              {hasCommercial && (
                <Link
                  href="/cart"
                  className={`relative p-2 rounded-xl transition-colors ${
                    isDark
                      ? "text-gray-400 hover:text-white hover:bg-gray-800"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                  data-testid="link-cart"
                >
                  <ShoppingBag className="w-4 h-4" />
                  {cartCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 flex items-center justify-center w-4 h-4 text-[9px] font-bold text-white bg-blue-500 rounded-full">
                      {cartCount}
                    </span>
                  )}
                </Link>
              )}

              {/* Profile */}
              <button
                onClick={() => { setProfileOpen(true); }}
                className={`flex items-center gap-2 ml-1 px-3 py-1.5 rounded-2xl border transition-all ${
                  isDark
                    ? "bg-gray-800 border-gray-700 hover:bg-gray-700 hover:border-gray-600"
                    : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                }`}
                data-testid="button-profile"
              >
                <Avatar className="w-6 h-6">
                  <AvatarFallback className={`text-xs font-bold ${isDark ? "bg-gray-700 text-amber-400" : "bg-blue-100 text-blue-700"}`}>
                    {user.name?.charAt(0)?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <span className={`text-sm font-medium hidden md:block ${isDark ? "text-gray-200" : "text-gray-700"}`}>{user.name}</span>
                <ChevronDown className={`w-3.5 h-3.5 hidden md:block ${isDark ? "text-gray-500" : "text-gray-400"}`} />
              </button>
            </div>
          ) : (
            /* ── Visitor Nav ── */
            <Link href="/login">
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white rounded-2xl px-5 shadow-md shadow-amber-500/20">
                Connexion
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* ── Service Switcher Strip ── */}
      <div className={`border-b transition-colors duration-200 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div
            className={`flex gap-1 rounded-2xl p-1 overflow-x-auto ${isDark ? "bg-gray-800" : "bg-gray-100"}`}
            style={{ scrollbarWidth: "none" }}
          >
            {[
              { id: "shop", label: "SHOP", icon: ShoppingBag, href: "/products", service: null },
              { id: "print", label: "PRINT", icon: Printer, href: "/print", service: "PRINTING" as const },
              { id: "barista", label: "BARISTA", icon: Coffee, href: "/barista", service: "BARISTA" as const },
              { id: "marketing", label: "MARKETING", icon: Megaphone, href: "/marketing", service: "MARKETING" as const },
            ].filter((svc) => !svc.service || headerServiceStates[svc.service] !== "HIDDEN").map((svc) => {
              const isActive = location.startsWith("/" + svc.id) || (svc.href === "/products" && (location === "/products" || location.startsWith("/products")));
              return (
                <Link key={svc.id} href={svc.href}>
                  <button
                    data-testid={`nav-service-${svc.id}`}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl transition-all shrink-0 ${
                      isActive
                        ? isDark
                          ? "bg-gray-700 text-white shadow-sm"
                          : "bg-white text-amber-600 shadow-sm"
                        : isDark
                          ? "text-gray-400 hover:text-gray-200"
                          : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    <svc.icon className="w-3.5 h-3.5" />
                    {svc.label}
                  </button>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Pending Account Notice Bar ── */}
      {isPending && (
        <div className="bg-yellow-50 border-b border-yellow-100 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-sm text-yellow-800">
            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
            <p><strong>Your account is awaiting approval.</strong> You can browse the catalog, but prices and ordering will be available once an admin approves your account.</p>
          </div>
        </div>
      )}

      {/* ── Page Content ── */}
      <main className="flex-1">{children}</main>

      {/* ── Floating Chat Button — authenticated only, draggable ── */}
      {user && hasCommercial && (
        <DraggableChatButton onClick={() => setChatOpen(true)} isDark={isDark} />
      )}

      {showSearchLocation && (
        <LocationPickerModal
          open={locationPickerOpen}
          mode="search"
          title="Où voulez-vous rechercher ?"
          onClose={() => setLocationPickerOpen(false)}
          onConfirm={handleLocationConfirm}
          initialAddress={searchLocation?.address}
        />
      )}

      {/* ── Profile Modal ── */}
      {user && (
        <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
          <DialogContent className="sm:max-w-md h-[88vh] max-h-[88vh] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
            <AccountPanel
              user={user}
              onClose={() => setProfileOpen(false)}
              onLogout={() => { logout(); setProfileOpen(false); }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* ── Favorites Modal ── */}
      {user && hasCommercial && (
        <Dialog open={favOpen} onOpenChange={setFavOpen}>
          <DialogContent className="sm:max-w-md h-[88vh] max-h-[88vh] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
            <FavoritesPanel onClose={() => setFavOpen(false)} />
          </DialogContent>
        </Dialog>
      )}

      {/* ── Suppliers Modal ── */}
      {user && hasCommercial && (
        <Dialog open={suppliersOpen} onOpenChange={setSuppliersOpen}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center gap-2"><Store className="w-5 h-5 text-amber-500" /><h2 className="font-bold text-lg">Our Suppliers</h2></div>
              <SuppliersPanel />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Chat Modal ── */}
      {user && hasCommercial && (
        <Dialog open={chatOpen} onOpenChange={setChatOpen}>
          <DialogContent className="sm:max-w-md h-[88vh] max-h-[88vh] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
            <MessagesPanel onClose={() => setChatOpen(false)} />
          </DialogContent>
        </Dialog>
      )}

      {/* ── Product Quick View Modal ── */}
      <ProductQuickViewModal />
      <PackQuickViewModal />
    </div>
  );
}

import { useState, useEffect } from "react";
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

// ── Orders Panel ──────────────────────────────────────────────────────────────

function OrdersPanel() {
  const { data: orders = [], isLoading } = useOrders();
  const sorted = [...(orders as any[])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (isLoading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>;
  if (!sorted.length) return (
    <div className="text-center py-16 text-muted-foreground">
      <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium">No orders yet</p>
    </div>
  );
  return (
    <div className="space-y-3">
      {sorted.map((order: any) => {
        const meta = statusMeta[order.status] ?? statusMeta.PENDING;
        const Icon = meta.icon;
        return (
          <div key={order.id} className="border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-bold">#{String(order.id).padStart(6, "0")}</span>
              <Badge variant="outline" className={`${meta.color} border text-xs`}><Icon className="w-3 h-3 mr-1" />{meta.label}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{order.createdAt ? formatDate(order.createdAt) : "—"}</span>
              <span className="font-semibold text-foreground">{formatCurrency(order.totalAmount)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Dashboard Panel ───────────────────────────────────────────────────────────

function DashboardPanel() {
  const { data: orders = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/orders"] });
  if (isLoading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>;
  const total = orders.length; const delivered = orders.filter((o) => o.status === "DELIVERED").length;
  const inProgress = orders.filter((o) => ["PENDING", "CONFIRMED", "PREPARING"].includes(o.status)).length;
  const spent = orders.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + (o.totalAmount || 0), 0);
  const kpis = [
    { label: "Total Orders", value: total, icon: ShoppingBag, color: "text-foreground" },
    { label: "In Progress", value: inProgress, icon: Clock, color: "text-amber-500" },
    { label: "Delivered", value: delivered, icon: CheckCircle, color: "text-green-500" },
    { label: "Spent", value: `TND ${(spent / 100).toFixed(0)}`, icon: DollarSign, color: "text-primary" },
  ];
  const statusCounts: Record<string, number> = {};
  orders.forEach((o) => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
  const maxCount = Math.max(...Object.values(statusCounts), 1);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-1"><p className="text-xs text-muted-foreground">{k.label}</p><k.icon className={`w-4 h-4 ${k.color}`} /></div>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="font-semibold text-sm mb-3">Order Status Breakdown</p>
        <div className="space-y-2.5">
          {Object.entries(statusCounts).map(([status, count]) => (
            <div key={status} className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground"><span>{status.replace("_", " ")}</span><span>{count}</span></div>
              <Progress value={(count / maxCount) * 100} className="h-1.5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Settings Panel ────────────────────────────────────────────────────────────

function SettingsPanel({ user }: { user: any }) {
  const [notifs, setNotifs] = useState({ orderUpdates: true, promotions: false, newSuppliers: true });
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 bg-secondary/40 rounded-xl">
        <Avatar className="w-12 h-12 border-2 border-blue-200">
          <AvatarFallback className="bg-blue-100 text-blue-700 font-bold text-lg">{user?.name?.charAt(0)?.toUpperCase() ?? "U"}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{user?.status && <span className={`inline-flex items-center gap-1 font-medium ${user.status === 'approved' ? 'text-green-600' : user.status === 'pending' ? 'text-yellow-600' : 'text-red-600'}`}>{user.status === 'pending' ? '⏳ Awaiting approval' : user.status === 'approved' ? '✓ Approved' : '✗ Rejected'}</span>}</p>
        </div>
      </div>
      <div>
        <p className="font-semibold text-sm mb-3 flex items-center gap-2"><User className="w-4 h-4" /> Profile</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Full Name</Label><Input defaultValue={user?.name} className="h-9" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input defaultValue={user?.email} className="h-9" /></div>
        </div>
      </div>
      <Separator />
      <div>
        <p className="font-semibold text-sm mb-3">Notifications</p>
        <div className="space-y-3">
          {[{ key: "orderUpdates", label: "Order Updates" }, { key: "promotions", label: "Promotions" }, { key: "newSuppliers", label: "New Suppliers" }].map((n) => (
            <div key={n.key} className="flex items-center justify-between">
              <span className="text-sm">{n.label}</span>
              <Switch checked={notifs[n.key as keyof typeof notifs]} onCheckedChange={(v) => setNotifs((p) => ({ ...p, [n.key]: v }))} />
            </div>
          ))}
        </div>
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
      {/* <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-8" style={{ WebkitOverflowScrolling: "touch" }}> */}
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

function ChatPanel() {
  const { states: serviceStates } = useServiceStates();
  const visibleServicesList = SERVICES_LIST.filter((s) => {
    const key = SERVICE_ID_TO_KEY[s];
    return !key || serviceStates[key] !== "HIDDEN";
  });
  const [service, setService] = useState<ServiceId>("SHOP");
  const [threads, setThreads] = useState<Thread[]>(fakeThreads);
  const [active, setActive] = useState<Thread | null>(null);
  const [view, setView] = useState<"list" | "chat">("list");
  const [input, setInput] = useState("");

  const filtered = threads.filter((t) => t.service === service);

  const openConversation = (t: Thread) => {
    setActive(t);
    setView("chat");
    // Mark as read
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
    <div className="h-[480px] flex flex-col gap-3">
      {/* Service switcher — same pill style as Profile tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 shrink-0">
        {visibleServicesList.map((s) => (
          <button
            key={s}
            data-testid={`tab-messages-${s.toLowerCase()}`}
            onClick={() => { setService(s); setView("list"); setActive(null); }}
            className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all ${service === s ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* List view */}
      {view === "list" && (
        <div className="flex-1 overflow-y-auto border border-border rounded-xl">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <MessageCircle className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">No conversations yet</p>
              <p className="text-xs text-gray-400 mt-1">for {service}</p>
            </div>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                data-testid={`button-thread-${t.id}`}
                onClick={() => openConversation(t)}
                className="w-full flex items-start gap-3 p-3 text-left hover:bg-secondary/60 transition-colors border-b border-border/30 last:border-0"
              >
                <Avatar className="w-9 h-9 shrink-0">
                  <AvatarFallback className="text-xs bg-blue-100 text-blue-700 font-bold">{t.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-semibold truncate">{t.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{t.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{t.lastMessage}</p>
                </div>
                {t.unread > 0 && (
                  <span className="shrink-0 bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center mt-0.5">
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
        <div className="flex-1 flex flex-col border border-border rounded-xl overflow-hidden">
          {/* Header with back button + name + service badge */}
          <div className="flex items-center gap-2 p-3 border-b border-border/50 bg-secondary/20 shrink-0">
            <button
              onClick={goBack}
              data-testid="button-chat-back"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <Avatar className="w-7 h-7">
              <AvatarFallback className="text-xs bg-blue-100 text-blue-700 font-bold">{active.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="font-semibold text-sm truncate">{active.name}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${SERVICE_BADGE[active.service]}`}>
                {active.service}
              </span>
            </div>
          </div>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {active.messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.from === "me" ? "bg-blue-600 text-white rounded-br-sm" : "bg-secondary text-foreground rounded-bl-sm"}`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          {/* Input */}
          <div className="p-3 border-t border-border/50 flex gap-2 shrink-0">
            <Input
              className="flex-1 h-8 text-sm"
              placeholder="Message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              data-testid="input-message"
            />
            <Button size="sm" className="h-8 w-8 p-0 bg-blue-600 hover:bg-blue-700" onClick={send} data-testid="button-send-message">
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
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

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<"orders" | "dashboard" | "settings">("orders");
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Top Navbar ── */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0 mr-1">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <Coffee className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base text-gray-900 hidden md:block">
              BigBoss<span className="text-amber-500">Coffee</span>
            </span>
          </Link>

          {/* Location — search zone only (never updates profile) */}
          {showSearchLocation && (
            <button
              onClick={handleLocationButtonClick}
              className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-amber-600 transition-colors border border-gray-200 rounded-full px-2.5 py-1.5 shrink-0 max-w-[160px]"
              data-testid="button-marketplace-location"
            >
              <MapPin className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="hidden sm:block truncate">{locationLabel}</span>
              <ChevronDown className="w-3 h-3 shrink-0" />
            </button>
          )}

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-md hidden sm:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                className="pl-8 h-9 bg-gray-50 border-gray-200 text-sm focus:bg-white"
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-marketplace-search"
              />
            </div>
          </form>

          <div className="flex-1" />

          {/* ── Authenticated Nav ── */}
          {user ? (
            <div className="flex items-center gap-1">
              {/* Pending notice */}
              {isPending && (
                <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Awaiting approval</span>
                </div>
              )}

              {/* Suppliers — approved/admin only */}
              {hasCommercial && (
                <button
                  onClick={() => setSuppliersOpen(true)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700 hidden sm:flex items-center gap-1.5 text-xs font-medium"
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
                  className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
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
                <Link href="/cart" className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700" data-testid="link-cart">
                  <ShoppingBag className="w-4 h-4" />
                  {cartCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 flex items-center justify-center w-4 h-4 text-[9px] font-bold text-white bg-blue-600 rounded-full">
                      {cartCount}
                    </span>
                  )}
                </Link>
              )}

              {/* Profile */}
              <button
                onClick={() => { setProfileTab("orders"); setProfileOpen(true); }}
                className="flex items-center gap-2 ml-1 px-3 py-1.5 rounded-full border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
                data-testid="button-profile"
              >
                <Avatar className="w-6 h-6">
                  <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-bold">
                    {user.name?.charAt(0)?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-gray-700 hidden md:block">{user.name}</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 hidden md:block" />
              </button>
            </div>
          ) : (
            /* ── Visitor Nav ── */
            <Link href="/login">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-5 shadow-sm">
                Connexion
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* ── Service Switcher Strip ── */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
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
                    className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all shrink-0 ${
                      isActive
                        ? "border-amber-500 text-amber-500"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
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

      {/* ── Floating Chat Button — authenticated only ── */}
      {user && hasCommercial && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl hover:shadow-2xl flex items-center justify-center transition-all hover:-translate-y-0.5"
          data-testid="button-chat-float"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
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
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between"><h2 className="font-bold text-lg">My Account</h2></div>
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                {([
                  { key: "orders", label: "Orders", icon: ClipboardList },
                  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
                  { key: "settings", label: "Settings", icon: Settings },
                ] as const).map((tab) => (
                  <button key={tab.key} onClick={() => setProfileTab(tab.key)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${profileTab === tab.key ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
                    <tab.icon className="w-3.5 h-3.5" />{tab.label}
                  </button>
                ))}
              </div>
              {profileTab === "orders" && <OrdersPanel />}
              {profileTab === "dashboard" && <DashboardPanel />}
              {profileTab === "settings" && <SettingsPanel user={user} />}
              <Separator />
              <button onClick={() => { logout(); setProfileOpen(false); }} className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors w-full">
                <LogOut className="w-4 h-4" /> Log out
              </button>
            </div>
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
          <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center gap-2"><MessageCircle className="w-5 h-5 text-amber-500" /><h2 className="font-bold text-lg">Messages</h2></div>
              <ChatPanel />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Product Quick View Modal ── */}
      <ProductQuickViewModal />
      <PackQuickViewModal />
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { useThemeStore } from "@/store/theme-store";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
import { useCafeOrders, CAFE_ORDER_STATUS_META, CAFE_ORDER_STATUS_FILTER_OPTS, type CafeOrderTabId } from "@/hooks/use-cafe-orders";
import { deriveOrderStatus, getSupplierStatusEntries, orderMatchesStatus } from "@/lib/order-status";
import { getEffectiveDate } from "@/lib/order-date";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";
import { useSearchLocationStore, formatLocationLabel, pickedToGeoLocation } from "@/store/search-location-store";
import {
  Coffee, MapPin, ChevronDown, ChevronLeft, ShoppingBag, Heart, MessageCircle,
  Search, LogOut, Settings, LayoutDashboard, Store, Send,
  Star, Package, Trash2, CheckCircle, Clock, Calendar, Box, Truck,
  AlertCircle, DollarSign, ClipboardList, Phone, Globe, MapPinIcon, AlertTriangle,
  Printer, Megaphone, Wrench, User, Users, GraduationCap, Sun, Moon, X, Plus, Loader2,
  Archive, RotateCcw, Bell, Lock,
} from "lucide-react";
import { useFavorites, selectTotalFavCount, type MaintenanceFavItem } from "@/hooks/use-favorites";
import { useStoreFavorites } from "@/hooks/use-store-favorites";
import { useServiceStates, type ServiceKey } from "@/hooks/use-service-states";
import { sortServiceIds, useServiceOrder, type MarketplaceServiceId } from "@/hooks/use-service-order";
import { useMessagingSettings } from "@/hooks/use-messaging-settings";
import { useRealtime } from "@/hooks/use-realtime";
import { useQuickView } from "@/hooks/use-quick-view";
import { usePackQuickView } from "@/hooks/use-pack-quick-view";
import { useAccountOpenStore } from "@/store/account-open-store";
import { ProductQuickViewModal } from "@/components/product-quick-view-modal";
import { PackQuickViewModal } from "@/components/pack-quick-view-modal";
import OrderDetailsModal from "@/components/cafe/order-details-modal";
import { AgentDetailModal, type MaintenanceReservationData } from "@/pages/cafe/maintenance/maintenance-page";
import { NotificationModal } from "@/components/cafe/notification-modal";
import { useUnreadNotificationCount } from "@/hooks/use-notifications";
import { useNotificationPreferences, useUpdateNotificationPreferences } from "@/hooks/use-notification-preferences";
import { NOTIFICATION_PREF_DEFS, ROLE_NOTIFICATION_PREF_KEYS } from "@shared/notification-preferences";
import type { CategoryWithCount, ShopFavoriteItem, MarketplaceProduct, PackDetail, StoreCard, ConversationSummary, ConversationMessageRow, EligibleContact, OrderWithDetails, MaintenanceMarketplaceCard, PrintOrderWithParties, AddressDetails } from "@shared/schema";
import type { BaristaMarketplaceCard, BaristaRequest, BaristaMission } from "@/hooks/use-barista-marketplace";
import { BaristaDetailModal } from "@/components/barista/barista-detail-modal";
import { RecruitDialog as BaristaRecruitDialog } from "@/pages/cafe/barista/barista-page";
import { useBaristaRequests, useBaristaMissions } from "@/hooks/use-barista-marketplace";
import type { MarketingMarketplaceCard } from "@/hooks/use-marketing";
import { MarketingDetailModal } from "@/components/marketing/marketing-detail-modal";
import { QuoteRequestDialog as MarketingQuoteRequestDialog } from "@/pages/cafe/marketing/marketing-page";
import { useMarketingProjects, useCancelMarketingProject, useRespondToMarketingQuote, type MarketingProjectWithParties } from "@/hooks/use-marketing";
import { MARKETING_PROJECT_STATUS_META } from "@/lib/marketing-project-status";
import { useAcademyRegistrations, useUpdateAcademyRegistrationStatus, type AcademyRegistrationWithParties, type AcademyCourseCard } from "@/hooks/use-barista-academy";
import { AcademyDetailModal } from "@/components/academy/academy-detail-modal";
import { EnrollDialog as AcademyEnrollDialog } from "@/pages/cafe/barista/barista-academy-page";
import { PRINT_ORDER_STATUS_META } from "@/lib/print-order-status";
import { flattenOrders, topSuppliers, topProducts, FR_STATUS_LABEL } from "@/lib/marketplace-analytics";

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

// ── Fake data ─────────────────────────────────────────────────────────────────

type ServiceId = "SHOP" | "PRINT" | "BARISTA" | "ACADEMY" | "MARKETING" | "MAINTENANCE";
type ThreadMessage = { from: "me" | "them"; text: string; time: string };
type Thread = { id: number; name: string; service: ServiceId; lastMessage: string; time: string; unread: number; messages: ThreadMessage[] };

const SERVICE_BADGE: Record<ServiceId, string> = {
  SHOP:        "bg-blue-100 text-blue-700",
  PRINT:       "bg-orange-100 text-orange-700",
  BARISTA:     "bg-green-100 text-green-700",
  ACADEMY:     "bg-indigo-100 text-indigo-700",
  MARKETING:   "bg-purple-100 text-purple-700",
  MAINTENANCE: "bg-amber-100 text-amber-700",
};

// Legacy placeholder threads retained only as a fallback for old cached UI
// states; all service tabs now use the real conversation API.
const fakeThreads: Thread[] = [
  { id: 4,  name: "ImprimTunis",          service: "PRINT",       lastMessage: "Your flyer proof is ready for review.", time: "30m ago",   unread: 1, messages: [{ from: "them", text: "Hello! Your flyer proof is ready.", time: "09:40 AM" }, { from: "me", text: "Can you adjust the font size?", time: "09:45 AM" }, { from: "them", text: "Of course! Updated version sent.", time: "09:50 AM" }] },
  { id: 5,  name: "PrintExpress Sfax",    service: "PRINT",       lastMessage: "Menu cards delivered, thank you!", time: "Mon",       unread: 0, messages: [{ from: "them", text: "Your menu cards have been delivered!", time: "Mon" }, { from: "me", text: "Perfect, thank you!", time: "Mon" }] },
  { id: 6,  name: "Tunis Barista Academy",service: "BARISTA",     lastMessage: "Enrollment confirmed for next week.", time: "2h ago",   unread: 0, messages: [{ from: "them", text: "Enrollment confirmed for the Espresso Fundamentals course next week.", time: "10:00 AM" }, { from: "me", text: "Great! What should I bring?", time: "10:02 AM" }, { from: "them", text: "Just yourself — all equipment provided.", time: "10:04 AM" }] },
  { id: 7,  name: "Youssef Ben Ali",      service: "BARISTA",     lastMessage: "Available this weekend, confirmed.", time: "Yesterday", unread: 1, messages: [{ from: "me", text: "Are you available Saturday?", time: "Yesterday" }, { from: "them", text: "Available this weekend, confirmed.", time: "Yesterday" }] },
  { id: 8,  name: "TunMedia Agency",      service: "MARKETING",   lastMessage: "Q1 campaign report attached.", time: "Yesterday", unread: 2, messages: [{ from: "them", text: "Q1 campaign report is attached. Reach up 34%.", time: "Yesterday" }, { from: "me", text: "Impressive! Let's schedule a call.", time: "Yesterday" }] },
  { id: 9,  name: "Pixel & Grain Studio", service: "MARKETING",   lastMessage: "Photo shoot scheduled for Tuesday.", time: "Mon",       unread: 0, messages: [{ from: "them", text: "Photo shoot scheduled for Tuesday 10am.", time: "Mon" }, { from: "me", text: "Perfect, see you then.", time: "Mon" }] },
  { id: 10, name: "Mohamed Gharbi",       service: "MAINTENANCE", lastMessage: "Intervention confirmée pour demain 9h.", time: "1h ago", unread: 1, messages: [{ from: "me", text: "La machine espresso ne chauffe plus, pouvez-vous intervenir ?", time: "08:00 AM" }, { from: "them", text: "Bien sûr, je peux venir demain matin à 9h.", time: "08:15 AM" }, { from: "me", text: "Parfait, merci !", time: "08:20 AM" }, { from: "them", text: "Intervention confirmée pour demain 9h.", time: "08:21 AM" }] },
  { id: 11, name: "CleanTech Maintenance",service: "MAINTENANCE", lastMessage: "Devis envoyé par email.", time: "Mon",       unread: 0, messages: [{ from: "me", text: "Bonjour, nous avons besoin d'une maintenance préventive pour nos équipements.", time: "Mon" }, { from: "them", text: "Devis envoyé par email. N'hésitez pas à nous contacter.", time: "Mon" }] },
];

const favItems = [
  { id: 1, type: "product", name: "Espresso Roast 1kg", supplier: "Premium Beans Co", price: 2500, image: "https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=300&q=80" },
  { id: 2, type: "product", name: "Oat Milk 1L x 6", supplier: "Oat & Grain", price: 1800, image: "https://images.unsplash.com/photo-1600788886242-5c96aabe3757?w=300&q=80" },
];

// ── Account Panel (premium dark/light — mirrors FavoritesPanel design) ────────

function AccountPanel({
  user, onClose, onLogout, initialOrderId, initialTab,
}: {
  user: any;
  onClose: () => void;
  onLogout: () => void;
  initialOrderId?: number | null;
   initialTab?: "orders" | "reservations" | "dashboard" | "settings" | null;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const toggle = useThemeStore((s) => s.toggle);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"orders" | "reservations" | "dashboard" | "settings">(initialTab ?? "orders");
  // Dashboard service switcher (Part 15) — each section reuses the exact same
  // queries already fetched below for Reservations (maintenanceReservations,
  // baristaRequests/baristaMissions, academyRegistrations, marketingProjectsForOwner,
  // printOrders) plus the existing SHOP `allOrders` — no duplicate data sources.
  type DashboardService = "SHOP" | "MAINTENANCE" | "BARISTA" | "ACADEMY" | "MARKETING" | "PRINT";
  const [dashboardService, setDashboardService] = useState<DashboardService>("SHOP");
  const { isLoading: ordersLoading, sorted, byCategory, daily, listForTab, toggleFavorite, reorder, isReordering } = useCafeOrders();
  const [ordersSubTab, setOrdersSubTab] = useState<CafeOrderTabId>("today");
  const [ordersStatusFilter, setOrdersStatusFilter] = useState("ALL");
  const { data: allOrders = [], isLoading: dashLoading } = useQuery<any[]>({ queryKey: ["/api/orders"] });
  const { data: maintenanceReservations = [], isLoading: reservationsLoading } = useQuery<any[]>({
    queryKey: ["/api/maintenance/reservations"],
    enabled: !!user,
  });

  // ── Reservations sub-switcher — Admin System Management is the single source
  // of truth for which of these appear and in what order (task requirement).
  // Maintenance's query/rendering above is untouched; PRINT, Marketplace
  // Baristas and Barista Academy all reuse their own existing, already
  // owner-scoped endpoints; Marketing is intentionally empty until that
  // module exists. ──
  const { states: serviceStates } = useServiceStates();
  const { order: serviceOrder } = useServiceOrder();
  const { data: printOrders = [], isLoading: printOrdersLoading } = useQuery<PrintOrderWithParties[]>({
    queryKey: ["/api/print/orders"],
    enabled: !!user,
  });
  const { data: baristaRequests = [], isLoading: baristaRequestsLoading } = useBaristaRequests();
  const { data: baristaMissions = [], isLoading: baristaMissionsLoading } = useBaristaMissions();
  // Barista Academy — same real, owner-scoped endpoint the Academy account's own
  // Inscriptions tab and Admin Academy read from (GET /api/academy/registrations
  // already scopes by session role, returning only this Coffee Owner's own
  // registrations). No duplicate data source.
  const { data: academyRegistrations = [], isLoading: academyRegistrationsLoading } = useAcademyRegistrations();
  // Marketing — real marketingProjects lifecycle (request → devis → project →
  // completion), the same table/hooks the Marketing Account's own Projets tab
  // and Admin → Services → Marketing read from. No duplicate data source.
  const { data: marketingProjectsForOwner = [], isLoading: marketingProjectsLoading } = useMarketingProjects();
  const [detailPrintOrder, setDetailPrintOrder] = useState<PrintOrderWithParties | null>(null);
  const [detailMaintenanceReservation, setDetailMaintenanceReservation] = useState<any | null>(null);
  const [detailBaristaMission, setDetailBaristaMission] = useState<BaristaMission | null>(null);
  const [detailBaristaRequest, setDetailBaristaRequest] = useState<BaristaRequest | null>(null);
  const [detailMarketingProjectId, setDetailMarketingProjectId] = useState<number | null>(null);
  const [detailAcademyRegistrationId, setDetailAcademyRegistrationId] = useState<number | null>(null);

  const RESERVATION_SERVICE_TABS: { key: string; orderId: MarketplaceServiceId; stateKey: ServiceKey; label: string; icon: any }[] = [
    { key: "maintenance", orderId: "MAINTENANCE", stateKey: "MAINTENANCE", label: "Maintenance", icon: Wrench },
    { key: "print", orderId: "PRINT", stateKey: "PRINTING", label: "PRINT", icon: Printer },
    { key: "marketing", orderId: "MARKETING", stateKey: "MARKETING", label: "Marketing", icon: Megaphone },
    { key: "barista_academy", orderId: "BARISTA_ACADEMY", stateKey: "BARISTA_ACADEMY", label: "Academy", icon: GraduationCap },
    { key: "barista_marketplace", orderId: "BARISTA_MARKETPLACE", stateKey: "BARISTA_MARKETPLACE", label: "Barista", icon: Users },
  ];
  const visibleReservationTabs = serviceOrder
    .map((id) => RESERVATION_SERVICE_TABS.find((t) => t.orderId === id))
    .filter((t): t is typeof RESERVATION_SERVICE_TABS[number] => !!t && serviceStates[t.stateKey] !== "HIDDEN");
  const [reservationsService, setReservationsService] = useState<string | null>(null);

  // Default to the first visible service, and if Admin hides the one currently
  // selected, hop to the next visible one — never leave the Coffee Owner on a
  // disabled tab.
  useEffect(() => {
    if (visibleReservationTabs.length === 0) { if (reservationsService !== null) setReservationsService(null); return; }
    if (!reservationsService || !visibleReservationTabs.some((t) => t.key === reservationsService)) {
      setReservationsService(visibleReservationTabs[0].key);
    }
  }, [visibleReservationTabs.map((t) => t.key).join("|")]);

  // If Admin hides every service represented here while the Coffee Owner is on
  // the Reservations tab, fall back to Orders rather than showing an empty tab.
  useEffect(() => {
    if (activeTab === "reservations" && visibleReservationTabs.length === 0) setActiveTab("orders");
  }, [activeTab, visibleReservationTabs.length]);

  const baristaRequestStatusMeta: Record<string, { label: string; color: string }> = {
    PENDING: { label: "En attente", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    DISCUSSION: { label: "En discussion", color: "bg-blue-100 text-blue-800 border-blue-200" },
    ACCEPTED: { label: "Acceptée", color: "bg-green-100 text-green-800 border-green-200" },
    REJECTED: { label: "Refusée", color: "bg-red-100 text-red-800 border-red-200" },
    CANCELLED: { label: "Annulée", color: "bg-gray-100 text-gray-700 border-gray-200" },
    COMPLETED: { label: "Terminée", color: "bg-green-100 text-green-800 border-green-200" },
  };
  const baristaMissionStatusMeta: Record<string, { label: string; color: string }> = {
    UPCOMING: { label: "À venir", color: "bg-blue-100 text-blue-800 border-blue-200" },
    ACTIVE: { label: "En cours", color: "bg-purple-100 text-purple-800 border-purple-200" },
    COMPLETED: { label: "Terminée", color: "bg-green-100 text-green-800 border-green-200" },
    CANCELLED: { label: "Annulée", color: "bg-gray-100 text-gray-700 border-gray-200" },
  };
  const academyRegistrationStatusMeta: Record<string, { label: string; color: string }> = {
    PENDING: { label: "En attente", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    CONFIRMED: { label: "Confirmée", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
    COMPLETED: { label: "Terminée", color: "bg-green-100 text-green-800 border-green-200" },
    CANCELLED: { label: "Annulée", color: "bg-gray-100 text-gray-700 border-gray-200" },
  };
  // A request that has been ACCEPTED has a corresponding mission — show the
  // mission (which carries the real, immutable rate/schedule) instead of the
  // now-superseded request, mirroring how Maintenance inlines its own
  // RESCHEDULE_PENDING sub-state into the same card rather than a second list.
  const acceptedRequestIds = new Set(baristaMissions.map((m) => m.requestId));
  const baristaTimelineItems: ({ kind: "mission"; data: BaristaMission } | { kind: "request"; data: BaristaRequest })[] = [
    ...baristaMissions.map((data) => ({ kind: "mission" as const, data })),
    ...baristaRequests.filter((r) => !acceptedRequestIds.has(r.id)).map((data) => ({ kind: "request" as const, data })),
  ].sort((a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime());

  const [detailOrder, setDetailOrder] = useState<OrderWithDetails | null>(null);
  const { isEnabled: isNotifCategoryEnabled } = useNotificationPreferences();
  const updateNotifPrefs = useUpdateNotificationPreferences();
  const fmt = useFormatCurrency();
  const reservationStatus: Record<string, { label: string; color: string }> = {
    PENDING: { label: "En attente", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    CONFIRMED: { label: "Confirmée", color: "bg-blue-100 text-blue-800 border-blue-200" },
    COMPLETED: { label: "Terminée", color: "bg-green-100 text-green-800 border-green-200" },
    CANCELLED: { label: "Annulée", color: "bg-red-100 text-red-800 border-red-200" },
    RESCHEDULE_PENDING: { label: "Modification à confirmer", color: "bg-purple-100 text-purple-800 border-purple-200" },
    RESCHEDULE_REJECTED: { label: "Modification refusée", color: "bg-gray-100 text-gray-700 border-gray-200" },
  };
  const respondToReschedule = useMutation({
    mutationFn: ({ id, accepted }: { id: number; accepted: boolean }) =>
      apiRequest("PATCH", `/api/maintenance/reservations/${id}/reschedule-response`, { accepted }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/reservations"] });
    },
  });
  // Part 18 — Coffee Owner cancellation, only valid while still PENDING (server
  // enforces this too via cancelMaintenanceReservationByOwner's WHERE clause).
  const cancelMaintenanceReservation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/maintenance/reservations/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/reservations"] });
      setDetailMaintenanceReservation(null);
    },
  });
  const cancelMarketingProject = useCancelMarketingProject();
  const respondToMarketingQuote = useRespondToMarketingQuote();
  const updateAcademyRegistrationStatus = useUpdateAcademyRegistrationStatus();

  // Settings/Profile — reuses the exact same generic account endpoints as every
  // other role's Settings page (PATCH /api/auth/me/profile, PATCH /api/auth/me/location,
  // the same LocationPickerModal mode="account"), mirroring barista-marketplace/settings.tsx
  // and maintenance/settings.tsx. No Coffee-Owner-specific profile system.
  const { toast: settingsToast } = useToast();
  const [settingsName, setSettingsName] = useState(user?.name ?? "");
  const [settingsPhone, setSettingsPhone] = useState(user?.phone ?? "");
  const [settingsWhatsapp, setSettingsWhatsapp] = useState<boolean>((user as any)?.isWhatsapp ?? false);
  const [settingsProfileImageUrl, setSettingsProfileImageUrl] = useState((user as any)?.profileImageUrl ?? "");
  const [settingsCurrentPassword, setSettingsCurrentPassword] = useState("");
  const [settingsNewPassword, setSettingsNewPassword] = useState("");
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    setSettingsName(user.name ?? "");
    setSettingsPhone(user.phone ?? "");
    setSettingsWhatsapp((user as any).isWhatsapp ?? false);
    setSettingsProfileImageUrl((user as any).profileImageUrl ?? "");
  }, [user?.id]);

  const updateAccountProfile = useMutation({
    mutationFn: (data: { name?: string; phone?: string; isWhatsapp?: boolean; profileImageUrl?: string | null }) =>
      apiRequest("PATCH", "/api/auth/me/profile", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      settingsToast({ title: "Informations mises à jour" });
    },
    onError: (error: Error) => settingsToast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const updateAccountPassword = useMutation({
    mutationFn: (data: { password: string; currentPassword: string }) =>
      apiRequest("PATCH", "/api/auth/me/profile", data),
    onSuccess: () => {
      setSettingsCurrentPassword(""); setSettingsNewPassword("");
      settingsToast({ title: "Mot de passe mis à jour" });
    },
    onError: (error: Error) => settingsToast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const updateAccountLocation = useMutation({
    mutationFn: (loc: PickedLocation) => apiRequest("PATCH", "/api/auth/me/location", loc),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocationModalOpen(false);
      settingsToast({ title: "📍 Adresse mise à jour" });
    },
    onError: (error: Error) => settingsToast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  // Auto-open a specific order when directed from the checkout flow
  useEffect(() => {
    if (initialOrderId && sorted.length > 0) {
      const target = sorted.find((o) => o.id === initialOrderId);
      if (target) {
        setActiveTab("orders");
        setDetailOrder(target as OrderWithDetails);
      }
    }
  }, [initialOrderId, sorted]);

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

  // Dashboard
  const total = allOrders.length;
  const delivered = allOrders.filter((o) => o.status === "DELIVERED").length;
  const inProgress = allOrders.filter((o) => ["PENDING", "CONFIRMED", "PREPARING"].includes(o.status)).length;
  const spent = allOrders.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + (o.totalAmount || 0), 0);
  const now = new Date();
  const spentThisMonth = allOrders
    .filter((o) => o.status !== "CANCELLED" && o.createdAt && new Date(o.createdAt).getMonth() === now.getMonth() && new Date(o.createdAt).getFullYear() === now.getFullYear())
    .reduce((s, o) => s + (o.totalAmount || 0), 0);
  const kpis = [
    { label: "Total commandes", value: total, icon: ShoppingBag, color: dk ? "text-white" : "text-gray-900" },
    { label: "En cours", value: inProgress, icon: Clock, color: "text-amber-400" },
    { label: "Livrées", value: delivered, icon: CheckCircle, color: "text-green-400" },
    { label: "Total dépensé", value: fmt(spent), icon: DollarSign, color: "text-blue-400" },
  ];
  const statusCounts: Record<string, number> = {};
  allOrders.forEach((o) => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
  const maxCount = Math.max(...Object.values(statusCounts), 1);
  // Real-data insights derived the same way as the Admin/Supplier dashboards (see
  // lib/marketplace-analytics.ts) — scoped to this Coffee Owner automatically, since
  // GET /api/orders already returns only their own orders for a CAFE_OWNER viewer.
  const dashLines = flattenOrders(allOrders as OrderWithDetails[]);
  const favoriteSuppliers = topSuppliers(dashLines, 3);
  const mostBoughtProducts = topProducts(dashLines, 3);

  const tabs = [
    { key: "orders" as const, label: "Orders", icon: ClipboardList },
    // Hidden entirely when every service represented in Reservations is
    // Admin-hidden (task requirement — never show an empty Reservations tab).
    ...(visibleReservationTabs.length > 0 ? [{ key: "reservations" as const, label: "Reservations", icon: Calendar }] : []),
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
            onClick={() => toggle()}
            aria-label="Toggle theme"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-100 hover:bg-gray-200"}`}
          >
            {dk ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
          </button>
        </div>

        {/* User identity strip */}
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border mb-4 ${cardBg}`}>
          <Avatar className="w-10 h-10 shrink-0">
            <AvatarImage src={getAvatarUrl(user)} alt={user?.name ?? "User"} />
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
        <div className={`flex gap-1 rounded-2xl p-1 overflow-x-auto ${switcherBg}`} style={{ scrollbarWidth: "none" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-max flex items-center justify-center gap-1 py-2 px-2 text-[11px] font-semibold rounded-xl transition-all ${activeTab === tab.key ? switcherActive : switcherInactive}`}
            >
              <tab.icon className="w-3 h-3" />{tab.label}
            </button>
          ))}
        </div>

        <div className={`mt-4 h-px ${dividerColor}`} />
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-8 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full">

        {/* ORDERS — same Today/Planifiées/Daily/Anciennes organization as the
            standalone Orders page (cafe/orders-page.tsx), both driven by the
            shared useCafeOrders() hook so there is a single source of truth
            for categorization, favorites, and reorder. */}
        {activeTab === "orders" && (() => {
          const ordersTabs: { id: CafeOrderTabId; label: string; icon: any; count: number }[] = [
            { id: "today", label: "Today", icon: Sun, count: byCategory.TODAY.length },
            { id: "planned", label: "Planifiées", icon: Calendar, count: byCategory.PLANIFIEE.length },
            { id: "daily", label: "Daily", icon: Star, count: daily.length },
            { id: "old", label: "Anciennes", icon: Archive, count: byCategory.ANCIENNE.length },
          ];
          const baseList = listForTab(ordersSubTab);
          // At least one sub-order matching the selected status is enough — see
          // lib/order-status.ts orderMatchesStatus.
          const filtered = baseList.filter((o) => orderMatchesStatus(o, ordersStatusFilter));
          return (
            <div className="space-y-3 pt-2">
              <div className={`flex gap-1 rounded-2xl p-1 overflow-x-auto ${switcherBg}`} style={{ scrollbarWidth: "none" }}>
                {ordersTabs.map(({ id, label, icon: Icon, count }) => (
                  <button
                    key={id}
                    onClick={() => setOrdersSubTab(id)}
                    className={`flex-1 min-w-max flex items-center justify-center gap-1 py-2 px-2 text-[11px] font-semibold rounded-xl transition-all ${ordersSubTab === id ? switcherActive : switcherInactive}`}
                    data-testid={`account-tab-orders-${id}`}
                  >
                    <Icon className="w-3 h-3" />{label}
                    {count > 0 && (
                      <span className={`text-[10px] font-bold px-1.5 rounded-full ${ordersSubTab === id ? "bg-amber-500 text-white" : dk ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"}`}>{count}</span>
                    )}
                  </button>
                ))}
              </div>

              <Select value={ordersStatusFilter} onValueChange={setOrdersStatusFilter}>
                <SelectTrigger className={`h-8 text-xs ${dk ? "border-gray-700 bg-gray-800 text-gray-200" : "border-gray-200 bg-gray-50"}`} data-testid="account-select-status-filter">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent className={dk ? "bg-gray-800 border-gray-700 text-gray-200" : "bg-white border-gray-200 text-gray-900"}>
                  {CAFE_ORDER_STATUS_FILTER_OPTS.map((o) => (
                    <SelectItem
                      key={o.value}
                      value={o.value}
                      className={dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : "text-gray-900 focus:bg-gray-100 focus:text-gray-900"}
                    >
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {ordersSubTab === "daily" && (
                <p className={`text-[11px] -mt-1 ${textMuted}`}>Commandes marquées ⭐ — réutilisez-les comme modèles pour recommander rapidement.</p>
              )}

              {ordersLoading ? (
                <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className={`h-20 rounded-2xl animate-pulse ${dk ? "bg-gray-800" : "bg-gray-100"}`} />)}</div>
              ) : !filtered.length ? (
                <div className={`text-center py-16 ${textMuted}`}>
                  <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className={`font-medium text-sm ${textPrimary}`}>
                    {ordersSubTab === "today" ? "Aucune commande aujourd'hui" : ordersSubTab === "planned" ? "Aucune commande planifiée" : ordersSubTab === "daily" ? "Aucune commande favorite" : "Aucune commande"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((order: any) => {
                    const displayStatus = deriveOrderStatus(order);
                    const meta = CAFE_ORDER_STATUS_META[displayStatus] ?? CAFE_ORDER_STATUS_META.PENDING;
                    const Icon = meta.icon;
                    // A single collapsed badge hides other suppliers' state on a
                    // multi-supplier order — null (one supplier, or none) keeps the
                    // existing single-badge display.
                    const supplierStatuses = getSupplierStatusEntries(order);
                    const supplierNames = (order.subOrders ?? []).map((s: any) => s.supplierName).filter(Boolean);
                    const isFavorite = !!order.isFavorite;
                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setDetailOrder(order as OrderWithDetails)}
                        className={`w-full text-left border rounded-2xl p-4 space-y-2 transition-all hover:shadow-md active:scale-[0.99] ${cardBg} ${dk ? "hover:border-gray-600" : "hover:border-gray-200"}`}
                        data-testid={`account-order-card-${order.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); toggleFavorite(order); }}
                              aria-label={isFavorite ? "Retirer de Daily" : "Ajouter à Daily"}
                              className="p-1 -m-1"
                              data-testid={`account-button-favorite-order-${order.id}`}
                            >
                              <Star className={`w-3.5 h-3.5 transition-colors ${isFavorite ? "fill-amber-400 text-amber-400" : "text-gray-400 hover:text-amber-400"}`} />
                            </span>
                            <span className={`font-mono text-sm font-bold ${textPrimary}`}>#{String(order.id).padStart(6, "0")}</span>
                          </div>
                          {!supplierStatuses && (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-xl border ${meta.color}`}><Icon className="w-3 h-3" />{meta.label}</span>
                          )}
                        </div>
                        {supplierStatuses ? (
                          // One row per supplier — name left, its own status badge right —
                          // instead of a single collapsed badge or one line of concatenated
                          // "Name — Status" text, so each supplier's state reads on its own.
                          <div className="space-y-1">
                            {supplierStatuses.map((s) => {
                              const sMeta = CAFE_ORDER_STATUS_META[s.status] ?? CAFE_ORDER_STATUS_META.PENDING;
                              const SIcon = sMeta.icon;
                              return (
                                <div key={s.supplierId} className="flex items-center justify-between gap-2">
                                  <span className={`text-xs truncate ${textMuted}`}>{s.supplierName}</span>
                                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-xl border shrink-0 ${sMeta.color}`}>
                                    <SIcon className="w-3 h-3" />{sMeta.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          supplierNames.length > 0 && (
                            <p className={`text-xs truncate ${textMuted}`}>{supplierNames.join(" · ")}</p>
                          )
                        )}
                        <div className="flex items-center justify-between">
                          <span className={`text-xs ${textMuted}`}>{formatDate(getEffectiveDate(order))}</span>
                          <span className={`text-sm font-bold ${dk ? "text-amber-400" : "text-amber-600"}`}>{fmt(order.totalAmount)}</span>
                        </div>
                        {ordersSubTab === "daily" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className={`h-7 text-xs gap-1.5 w-full mt-1 ${dk ? "border-white text-white hover:bg-gray-700 hover:text-white hover:border-white" : ""}`}
                            disabled={isReordering}
                            onClick={(e) => { e.stopPropagation(); reorder(order.id); }}
                            data-testid={`account-button-reorder-daily-${order.id}`}
                          >
                            <RotateCcw className="w-3 h-3" /> Recommander
                          </Button>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
       
        {/* MAINTENANCE RESERVATIONS */}
        {activeTab === "reservations" && visibleReservationTabs.length > 0 && (
          <div className="space-y-3 pt-2">
            {/* ── Service sub-switcher — visibility + order from Admin System Management ── */}
            {visibleReservationTabs.length > 1 && (
              <div className={`flex gap-1 rounded-2xl p-1 overflow-x-auto ${switcherBg}`} style={{ scrollbarWidth: "none" }}>
                {visibleReservationTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setReservationsService(tab.key)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${reservationsService === tab.key ? switcherActive : switcherInactive}`}
                    data-testid={`tab-reservations-${tab.key}`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />{tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* ── Maintenance — UNCHANGED from the existing implementation ── */}
            {reservationsService === "maintenance" && (
              reservationsLoading ? (
                <div className="space-y-3 pt-2">
                  {[...Array(2)].map((_, i) => (
                    <div
                      key={i}
                      className={`h-32 rounded-2xl animate-pulse ${
                        dk ? "bg-gray-800" : "bg-gray-100"
                      }`}
                    />
                  ))}
                </div>
              ) : maintenanceReservations.length === 0 ? (
                <div className={`text-center py-16 ${textMuted}`}>
                  <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className={`font-medium text-sm ${textPrimary}`}>
                    No maintenance reservations yet
                  </p>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  {[...maintenanceReservations]
                    .sort((a: any, b: any) => {
                      const dateA = new Date(
                        `${a.date}T${a.time || "00:00"}`
                      ).getTime();

                      const dateB = new Date(
                        `${b.date}T${b.time || "00:00"}`
                      ).getTime();

                      return dateB - dateA; // Newest → Oldest
                    })
                    .map((reservation: any) => {
                      const meta =
                        reservationStatus[reservation.status] ??
                        reservationStatus.PENDING;

                      return (
                        <div
                          key={reservation.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setDetailMaintenanceReservation(reservation)}
                          className={`w-full text-left border rounded-2xl p-4 space-y-3 cursor-pointer ${cardBg}`}
                          data-testid={`card-reservation-maintenance-${reservation.id}`}
                        >
                          {/* Header */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p
                                className={`font-semibold text-sm truncate ${textPrimary}`}
                              >
                                {reservation.maintenanceName ||
                                  "Maintenance professional"}
                              </p>

                              <p className={`text-xs mt-0.5 ${textMuted}`}>
                                {reservation.service} · {reservation.category || "—"}
                              </p>
                            </div>

                            <span
                              className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-xl border ${meta.color}`}
                            >
                              {meta.label}
                            </span>
                          </div>

                          {/* Date / Time / Location */}
                          <div
                            className={`grid grid-cols-2 gap-2 text-xs ${textMuted}`}
                          >
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-amber-500" />
                              {reservation.date}
                            </span>

                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-500" />
                              {reservation.time || "—"}
                            </span>

                            <span className="flex items-center gap-1 col-span-2">
                              <MapPin className="w-3 h-3 text-amber-500" />
                              {reservation.location || "—"}
                            </span>
                          </div>

                          {/* Urgency / Description */}
                          <div
                            className={`flex flex-wrap gap-2 text-[11px] ${textMuted}`}
                          >
                            <span>
                              Urgence : {reservation.urgency || "NORMAL"}
                            </span>

                            {reservation.description && (
                              <span className="truncate">
                                · {reservation.description}
                              </span>
                            )}
                          </div>

                          {/* Reschedule Request */}
                          {reservation.status === "RESCHEDULE_PENDING" &&
                            reservation.proposedDate && (
                              <div
                                className={`rounded-xl border px-3 py-2 text-xs ${
                                  dk
                                    ? "bg-purple-900/20 border-purple-800 text-purple-300"
                                    : "bg-purple-50 border-purple-100 text-purple-700"
                                }`}
                              >
                                Le technicien propose le{" "}
                                <strong>{reservation.proposedDate}</strong>
                                {reservation.proposedTime
                                  ? ` à ${reservation.proposedTime}`
                                  : ""}
                                .

                                <div className="flex gap-2 mt-2">
                                  <Button
                                    size="sm"
                                    className="h-8 rounded-xl bg-green-600 hover:bg-green-700 text-white"
                                    disabled={respondToReschedule.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      respondToReschedule.mutate({
                                        id: reservation.id,
                                        accepted: true,
                                      });
                                    }}
                                  >
                                    Confirmer modification
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 rounded-xl border-red-200 text-red-600"
                                    disabled={respondToReschedule.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      respondToReschedule.mutate({
                                        id: reservation.id,
                                        accepted: false,
                                      });
                                    }}
                                  >
                                    Rejeter modification
                                  </Button>
                                </div>
                              </div>
                            )}

                          {/* Part 18 — cancellation only while still unconfirmed */}
                          {reservation.status === "PENDING" && (
                            <div className="pt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                                disabled={cancelMaintenanceReservation.isPending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cancelMaintenanceReservation.mutate(reservation.id);
                                }}
                                data-testid={`button-cancel-reservation-${reservation.id}`}
                              >
                                Annuler
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )
            )}

            {/* ── PRINT — real orders from the same /api/print/orders endpoint the
                dedicated "Mes commandes PRINT" page uses; no duplicate data source. ── */}
            {reservationsService === "print" && (
              printOrdersLoading ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => <div key={i} className={`h-28 rounded-2xl animate-pulse ${dk ? "bg-gray-800" : "bg-gray-100"}`} />)}
                </div>
              ) : printOrders.length === 0 ? (
                <div className={`text-center py-16 ${textMuted}`}>
                  <Printer className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className={`font-medium text-sm ${textPrimary}`}>Aucune commande PRINT pour le moment</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...printOrders]
                    .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
                    .map((order) => {
                      const meta = PRINT_ORDER_STATUS_META[order.status as keyof typeof PRINT_ORDER_STATUS_META] ?? PRINT_ORDER_STATUS_META.PENDING;
                      return (
                        <button
                          key={order.id}
                          onClick={() => setDetailPrintOrder(order)}
                          className={`w-full text-left border rounded-2xl p-4 space-y-3 ${cardBg}`}
                          data-testid={`card-reservation-print-${order.id}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={`font-semibold text-sm truncate ${textPrimary}`}>{order.printerName}</p>
                              <p className={`text-xs mt-0.5 ${textMuted}`}>{order.itemName} · {order.quantity} unité(s)</p>
                            </div>
                            <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-xl border ${meta.className}`}>{meta.label}</span>
                          </div>
                          <div className={`flex items-center justify-between text-xs ${textMuted}`}>
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-amber-500" />{order.createdAt ? formatDate(order.createdAt as any) : "—"}</span>
                            <span className={`font-semibold ${textPrimary}`}>{fmt(order.totalInCents)}</span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )
            )}

            {/* ── Marketplace Baristas — merges requests (not yet accepted) with
                missions (accepted), reusing the existing role-scoped endpoints
                a Barista Marketplace professional already sees on their own
                side; nothing new server-side. ── */}
            {reservationsService === "barista_marketplace" && (
              (baristaRequestsLoading || baristaMissionsLoading) ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => <div key={i} className={`h-28 rounded-2xl animate-pulse ${dk ? "bg-gray-800" : "bg-gray-100"}`} />)}
                </div>
              ) : baristaTimelineItems.length === 0 ? (
                <div className={`text-center py-16 ${textMuted}`}>
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className={`font-medium text-sm ${textPrimary}`}>Aucune réservation Barista pour le moment</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {baristaTimelineItems.map((item) => {
                    const meta = item.kind === "mission"
                      ? (baristaMissionStatusMeta[item.data.status] ?? baristaMissionStatusMeta.UPCOMING)
                      : (baristaRequestStatusMeta[item.data.status] ?? baristaRequestStatusMeta.PENDING);
                    return (
                      <button
                        key={`${item.kind}-${item.data.id}`}
                        onClick={() => item.kind === "mission" ? setDetailBaristaMission(item.data) : setDetailBaristaRequest(item.data)}
                        className={`w-full text-left border rounded-2xl p-4 space-y-3 ${cardBg}`}
                        data-testid={`card-reservation-barista-${item.kind}-${item.data.id}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={`font-semibold text-sm truncate ${textPrimary}`}>{item.data.baristaName}</p>
                            <p className={`text-xs mt-0.5 ${textMuted}`}>{item.data.missionType}</p>
                          </div>
                          <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-xl border ${meta.color}`}>{meta.label}</span>
                        </div>
                        <div className={`flex items-center gap-1 text-xs ${textMuted}`}>
                          <Calendar className="w-3 h-3 text-amber-500" />
                          {item.data.startDate}{item.data.endDate ? ` → ${item.data.endDate}` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            )}

            {/* ── Marketing — real marketingProjects lifecycle (request → devis →
                project → completion), the same table the Marketing Account's own
                Projets tab and Admin → Services → Marketing read from. ── */}
            {reservationsService === "marketing" && (
              marketingProjectsLoading ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => <div key={i} className={`h-28 rounded-2xl animate-pulse ${dk ? "bg-gray-800" : "bg-gray-100"}`} />)}
                </div>
              ) : marketingProjectsForOwner.length === 0 ? (
                <div className={`text-center py-16 ${textMuted}`}>
                  <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className={`font-medium text-sm ${textPrimary}`}>Aucune activité Marketing pour le moment</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...marketingProjectsForOwner]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((project) => {
                      const meta = MARKETING_PROJECT_STATUS_META[project.status] ?? MARKETING_PROJECT_STATUS_META.PENDING;
                      return (
                        <div
                          key={project.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setDetailMarketingProjectId(project.id)}
                          className={`w-full text-left border rounded-2xl p-4 space-y-3 cursor-pointer ${cardBg}`}
                          data-testid={`card-reservation-marketing-${project.id}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={`font-semibold text-sm truncate ${textPrimary}`}>{project.marketingName || "Prestataire Marketing"}</p>
                              <p className={`text-xs mt-0.5 ${textMuted}`}>{project.service}{project.title ? ` · ${project.title}` : ""}</p>
                            </div>
                            <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-xl border ${meta.className}`}>{meta.label}</span>
                          </div>
                          <div className={`flex flex-wrap items-center gap-3 text-xs ${textMuted}`}>
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-purple-500" />{new Date(project.createdAt).toLocaleDateString("fr-FR")}</span>
                            {project.quoteAmountInCents != null && (
                              <span className="flex items-center gap-1"><DollarSign className="w-3 h-3 text-purple-500" />{fmt(project.finalAmountInCents ?? project.quoteAmountInCents)}</span>
                            )}
                          </div>
                          {project.status === "QUOTED" && (
                            <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                className="h-8 rounded-xl bg-green-600 hover:bg-green-700 text-white"
                                disabled={respondToMarketingQuote.isPending}
                                onClick={() => respondToMarketingQuote.mutate({ id: project.id, accepted: true })}
                                data-testid={`button-accept-quote-${project.id}`}
                              >
                                Accepter le devis
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                                disabled={respondToMarketingQuote.isPending}
                                onClick={() => respondToMarketingQuote.mutate({ id: project.id, accepted: false })}
                                data-testid={`button-reject-quote-${project.id}`}
                              >
                                Refuser
                              </Button>
                            </div>
                          )}
                          {project.status === "PENDING" && (
                            <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                                disabled={cancelMarketingProject.isPending}
                                onClick={() => cancelMarketingProject.mutate(project.id)}
                                data-testid={`button-cancel-marketing-${project.id}`}
                              >
                                Annuler
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )
            )}

            {/* ── Barista Academy — real registrations from the same
                /api/academy/registrations endpoint the Academy account's own
                Inscriptions tab and Admin Academy read from. ── */}
            {reservationsService === "barista_academy" && (
              academyRegistrationsLoading ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => <div key={i} className={`h-28 rounded-2xl animate-pulse ${dk ? "bg-gray-800" : "bg-gray-100"}`} />)}
                </div>
              ) : academyRegistrations.length === 0 ? (
                <div className={`text-center py-16 ${textMuted}`}>
                  <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className={`font-medium text-sm ${textPrimary}`}>Aucune inscription Academy pour le moment</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...academyRegistrations]
                    .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
                    .map((registration) => {
                      const meta = academyRegistrationStatusMeta[registration.status] ?? academyRegistrationStatusMeta.PENDING;
                      return (
                        <div
                          key={registration.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setDetailAcademyRegistrationId(registration.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setDetailAcademyRegistrationId(registration.id);
                            }
                          }}
                          className={`w-full text-left border rounded-2xl p-4 space-y-3 cursor-pointer ${cardBg}`}
                          data-testid={`card-reservation-academy-${registration.id}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={`font-semibold text-sm truncate ${textPrimary}`}>{registration.academyName}</p>
                              <p className={`text-xs mt-0.5 ${textMuted}`}>{registration.courseTitle} · {registration.participantCount} participant{registration.participantCount > 1 ? "s" : ""}</p>
                            </div>
                            <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-xl border ${meta.color}`}>{meta.label}</span>
                          </div>
                          <div className={`flex items-center justify-between text-xs ${textMuted}`}>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-amber-500" />
                              {registration.sessionStartDate ?? (registration.createdAt ? formatDate(registration.createdAt as any) : "—")}
                            </span>
                            <span className={`font-semibold ${textPrimary}`}>{fmt(registration.priceInCents)}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )
            )}
          </div>
        )}

        {/* Order Details Modal — rendered inside AccountPanel so it sits above the panel dialog.
            Resolved from the live orders query (not the raw clicked reference) so a per-supplier
            cancellation made inside stays visible immediately without closing and reopening. */}
        <OrderDetailsModal
          open={!!detailOrder}
          onClose={() => setDetailOrder(null)}
          order={detailOrder ? (sorted.find((o) => o.id === detailOrder.id) ?? detailOrder) : null}
          showReorder={true}
          showCancel={true}
          showPayoutInfo={false}
        />

        {/* PRINT order details — resolved live from the same printOrders query so a
            realtime status update shows immediately if this dialog is left open. */}
        <Dialog open={!!detailPrintOrder} onOpenChange={(o) => !o && setDetailPrintOrder(null)}>
          <DialogContent className={`sm:max-w-md ${bg} ${textPrimary}`}>
            <DialogTitle className={textPrimary}>Commande PRINT {detailPrintOrder ? `#${detailPrintOrder.id}` : ""}</DialogTitle>
            <DialogDescription className="sr-only">Détails de la commande PRINT</DialogDescription>
            {(() => {
              const order = detailPrintOrder ? (printOrders.find((o) => o.id === detailPrintOrder.id) ?? detailPrintOrder) : null;
              if (!order) return null;
              const meta = PRINT_ORDER_STATUS_META[order.status as keyof typeof PRINT_ORDER_STATUS_META] ?? PRINT_ORDER_STATUS_META.PENDING;
              return (
                <div className="space-y-3 text-sm">
                  <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-xl border ${meta.className}`}>{meta.label}</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className={`text-xs ${textMuted}`}>Imprimeur</p><p className={`font-medium ${textPrimary}`}>{order.printerName}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Service</p><p className={`font-medium ${textPrimary}`}>{order.itemName}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Quantité</p><p className={textPrimary}>{order.quantity}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Prix unitaire</p><p className={textPrimary}>{fmt(order.unitPriceInCents)}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Total</p><p className={`font-semibold ${textPrimary}`}>{fmt(order.totalInCents)}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Créée le</p><p className={textPrimary}>{order.createdAt ? formatDate(order.createdAt as any) : "—"}</p></div>
                  </div>
                  {order.deliveryAddress && <div><p className={`text-xs ${textMuted}`}>Livraison</p><p className={textPrimary}>{order.deliveryAddress}</p></div>}
                  {order.notes && <div><p className={`text-xs ${textMuted}`}>Notes</p><p className={textPrimary}>{order.notes}</p></div>}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Maintenance reservation details (Part 19) — resolved live from the
            same maintenanceReservations query, same status vocabulary/meta as
            the card above. */}
        <Dialog open={!!detailMaintenanceReservation} onOpenChange={(o) => !o && setDetailMaintenanceReservation(null)}>
          <DialogContent className={`sm:max-w-md ${bg} ${textPrimary}`}>
            <DialogTitle className={textPrimary}>Réservation Maintenance {detailMaintenanceReservation ? `#${detailMaintenanceReservation.id}` : ""}</DialogTitle>
            <DialogDescription className="sr-only">Détails de la réservation Maintenance</DialogDescription>
            {(() => {
              const reservation = detailMaintenanceReservation
                ? (maintenanceReservations.find((r: any) => r.id === detailMaintenanceReservation.id) ?? detailMaintenanceReservation)
                : null;
              if (!reservation) return null;
              const meta = reservationStatus[reservation.status] ?? reservationStatus.PENDING;
              return (
                <div className="space-y-3 text-sm">
                  <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-xl border ${meta.color}`}>{meta.label}</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className={`text-xs ${textMuted}`}>Maintenance</p><p className={`font-medium ${textPrimary}`}>{reservation.maintenanceName || "—"}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Service / catégorie</p><p className={`font-medium ${textPrimary}`}>{reservation.service}{reservation.category ? ` · ${reservation.category}` : ""}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Date / heure</p><p className={textPrimary}>{reservation.date} {reservation.time || ""}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Urgence</p><p className={textPrimary}>{reservation.urgency || "NORMAL"}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Lieu</p><p className={textPrimary}>{reservation.location || "—"}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Contact</p><p className={textPrimary}>{reservation.contactPhone || reservation.ownerPhone || "—"}</p></div>
                  </div>
                  {reservation.description && <div><p className={`text-xs ${textMuted}`}>Besoin</p><p className={textPrimary}>{reservation.description}</p></div>}
                  {reservation.status === "PENDING" && (
                    <div className={`pt-2 border-t flex justify-end ${borderClr}`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className={dk ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : "border-red-200 text-red-600 hover:bg-red-50"}
                        disabled={cancelMaintenanceReservation.isPending}
                        onClick={() => cancelMaintenanceReservation.mutate(reservation.id)}
                        data-testid="button-cancel-reservation-modal"
                      >
                        {cancelMaintenanceReservation.isPending ? "Annulation…" : "Annuler la réservation"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Barista Marketplace mission details */}
        <Dialog open={!!detailBaristaMission} onOpenChange={(o) => !o && setDetailBaristaMission(null)}>
          <DialogContent className={`sm:max-w-md ${bg} ${textPrimary}`}>
            <DialogTitle className={textPrimary}>Mission {detailBaristaMission ? `#${detailBaristaMission.id}` : ""}</DialogTitle>
            <DialogDescription className="sr-only">Détails de la mission Barista</DialogDescription>
            {(() => {
              const mission = detailBaristaMission ? (baristaMissions.find((m) => m.id === detailBaristaMission.id) ?? detailBaristaMission) : null;
              if (!mission) return null;
              const meta = baristaMissionStatusMeta[mission.status] ?? baristaMissionStatusMeta.UPCOMING;
              return (
                <div className="space-y-3 text-sm">
                  <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-xl border ${meta.color}`}>{meta.label}</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className={`text-xs ${textMuted}`}>Barista</p><p className={`font-medium ${textPrimary}`}>{mission.baristaName}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Mission</p><p className={`font-medium ${textPrimary}`}>{mission.missionType}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Tarif</p><p className={textPrimary}>{fmt(mission.rateInCents)}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Dates</p><p className={textPrimary}>{mission.startDate}{mission.endDate ? ` → ${mission.endDate}` : ""}</p></div>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Barista Marketplace request details (not yet accepted into a mission) */}
        <Dialog open={!!detailBaristaRequest} onOpenChange={(o) => !o && setDetailBaristaRequest(null)}>
          <DialogContent className={`sm:max-w-md ${bg} ${textPrimary}`}>
            <DialogTitle className={textPrimary}>Demande {detailBaristaRequest ? `#${detailBaristaRequest.id}` : ""}</DialogTitle>
            <DialogDescription className="sr-only">Détails de la demande Barista</DialogDescription>
            {(() => {
              const request = detailBaristaRequest ? (baristaRequests.find((r) => r.id === detailBaristaRequest.id) ?? detailBaristaRequest) : null;
              if (!request) return null;
              const meta = baristaRequestStatusMeta[request.status] ?? baristaRequestStatusMeta.PENDING;
              return (
                <div className="space-y-3 text-sm">
                  <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-xl border ${meta.color}`}>{meta.label}</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className={`text-xs ${textMuted}`}>Barista</p><p className={`font-medium ${textPrimary}`}>{request.baristaName}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Mission</p><p className={`font-medium ${textPrimary}`}>{request.missionType}</p></div>
                    {request.proposedRateInCents != null && <div><p className={`text-xs ${textMuted}`}>Tarif proposé</p><p className={textPrimary}>{fmt(request.proposedRateInCents)}</p></div>}
                    <div><p className={`text-xs ${textMuted}`}>Dates</p><p className={textPrimary}>{request.startDate}{request.endDate ? ` → ${request.endDate}` : ""}</p></div>
                  </div>
                  {request.message && <div><p className={`text-xs ${textMuted}`}>Message</p><p className={textPrimary}>{request.message}</p></div>}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Marketing project details (Part 15) — resolved live from the same
            marketingProjects query, same status vocabulary/meta as the card above. */}
        <Dialog open={detailMarketingProjectId != null} onOpenChange={(o) => !o && setDetailMarketingProjectId(null)}>
          <DialogContent className={`sm:max-w-md ${bg} ${textPrimary}`}>
            <DialogTitle className={textPrimary}>Projet Marketing {detailMarketingProjectId ? `#${detailMarketingProjectId}` : ""}</DialogTitle>
            <DialogDescription className="sr-only">Détails du projet Marketing</DialogDescription>
            {(() => {
              const project = marketingProjectsForOwner.find((p) => p.id === detailMarketingProjectId);
              if (!project) return null;
              const meta = MARKETING_PROJECT_STATUS_META[project.status] ?? MARKETING_PROJECT_STATUS_META.PENDING;
              return (
                <div className="space-y-3 text-sm">
                  <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-xl border ${meta.className}`}>{meta.label}</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className={`text-xs ${textMuted}`}>Prestataire</p><p className={`font-medium ${textPrimary}`}>{project.marketingName || "—"}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Service</p><p className={`font-medium ${textPrimary}`}>{project.service}</p></div>
                    {project.title && <div><p className={`text-xs ${textMuted}`}>Titre</p><p className={textPrimary}>{project.title}</p></div>}
                    <div><p className={`text-xs ${textMuted}`}>Créé le</p><p className={textPrimary}>{new Date(project.createdAt).toLocaleDateString("fr-FR")}</p></div>
                    {project.startDate && <div><p className={`text-xs ${textMuted}`}>Début</p><p className={textPrimary}>{project.startDate}</p></div>}
                    {project.deadline && <div><p className={`text-xs ${textMuted}`}>Échéance</p><p className={textPrimary}>{project.deadline}</p></div>}
                    {project.quoteAmountInCents != null && <div><p className={`text-xs ${textMuted}`}>Devis</p><p className={textPrimary}>{fmt(project.quoteAmountInCents)}</p></div>}
                    {project.finalAmountInCents != null && <div><p className={`text-xs ${textMuted}`}>Facture finale</p><p className={textPrimary}>{fmt(project.finalAmountInCents)}</p></div>}
                    {project.status === "IN_PROGRESS" && <div><p className={`text-xs ${textMuted}`}>Progression</p><p className={textPrimary}>{project.progress}%</p></div>}
                  </div>
                  {project.description && <div><p className={`text-xs ${textMuted}`}>Description</p><p className={textPrimary}>{project.description}</p></div>}
                  {project.status === "QUOTED" && (
                    <div className={`pt-2 border-t flex justify-end gap-2 ${borderClr}`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className={dk ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : "border-red-200 text-red-600 hover:bg-red-50"}
                        disabled={respondToMarketingQuote.isPending}
                        onClick={() => respondToMarketingQuote.mutate({ id: project.id, accepted: false })}
                        data-testid="button-reject-quote-modal"
                      >
                        Refuser
                      </Button>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={respondToMarketingQuote.isPending}
                        onClick={() => respondToMarketingQuote.mutate({ id: project.id, accepted: true })}
                        data-testid="button-accept-quote-modal"
                      >
                        Accepter le devis
                      </Button>
                    </div>
                  )}
                  {project.status === "PENDING" && (
                    <div className={`pt-2 border-t flex justify-end ${borderClr}`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className={dk ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : "border-red-200 text-red-600 hover:bg-red-50"}
                        disabled={cancelMarketingProject.isPending}
                        onClick={() => cancelMarketingProject.mutate(project.id)}
                        data-testid="button-cancel-marketing-modal"
                      >
                        {cancelMarketingProject.isPending ? "Annulation…" : "Annuler la demande"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Academy reservation details — resolved live from the same
            academyRegistrations query, same status vocabulary/meta as the card
            above. Mirrors the Maintenance/Marketing detail dialogs exactly. */}
        <Dialog open={detailAcademyRegistrationId != null} onOpenChange={(o) => !o && setDetailAcademyRegistrationId(null)}>
          <DialogContent className={`sm:max-w-md ${bg} ${textPrimary}`}>
            <DialogTitle className={textPrimary}>Inscription Academy {detailAcademyRegistrationId ? `#${detailAcademyRegistrationId}` : ""}</DialogTitle>
            <DialogDescription className="sr-only">Détails de l'inscription Academy</DialogDescription>
            {(() => {
              const registration = academyRegistrations.find((r) => r.id === detailAcademyRegistrationId);
              if (!registration) return null;
              const meta = academyRegistrationStatusMeta[registration.status] ?? academyRegistrationStatusMeta.PENDING;
              return (
                <div className="space-y-3 text-sm">
                  <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-xl border ${meta.color}`}>{meta.label}</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className={`text-xs ${textMuted}`}>Academy</p><p className={`font-medium ${textPrimary}`}>{registration.academyName}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Formation</p><p className={`font-medium ${textPrimary}`}>{registration.courseTitle}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Participants</p><p className={textPrimary}>{registration.participantCount}</p></div>
                    <div><p className={`text-xs ${textMuted}`}>Prix</p><p className={`font-semibold ${textPrimary}`}>{fmt(registration.priceInCents)}</p></div>
                    {registration.sessionStartDate && (
                      <div><p className={`text-xs ${textMuted}`}>Date de formation</p><p className={textPrimary}>{registration.sessionStartDate}{registration.sessionEndDate ? ` → ${registration.sessionEndDate}` : ""}</p></div>
                    )}
                    <div><p className={`text-xs ${textMuted}`}>Inscrit le</p><p className={textPrimary}>{registration.createdAt ? formatDate(registration.createdAt as any) : "—"}</p></div>
                    {registration.confirmedAt && <div><p className={`text-xs ${textMuted}`}>Confirmée le</p><p className={textPrimary}>{formatDate(registration.confirmedAt as any)}</p></div>}
                    {registration.completedAt && <div><p className={`text-xs ${textMuted}`}>Terminée le</p><p className={textPrimary}>{formatDate(registration.completedAt as any)}</p></div>}
                  </div>
                  {registration.participants.length > 0 && (
                    <div><p className={`text-xs ${textMuted}`}>Participants nommés</p><p className={textPrimary}>{registration.participants.join(", ")}</p></div>
                  )}
                  {registration.notes && <div><p className={`text-xs ${textMuted}`}>Notes</p><p className={textPrimary}>{registration.notes}</p></div>}
                  {registration.status === "PENDING" && (
                    <div className={`pt-2 border-t flex justify-end ${borderClr}`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className={dk ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : "border-red-200 text-red-600 hover:bg-red-50"}
                        disabled={updateAcademyRegistrationStatus.isPending}
                        onClick={() => updateAcademyRegistrationStatus.mutate({ id: registration.id, status: "CANCELLED" })}
                        data-testid="button-cancel-academy-modal"
                      >
                        {updateAcademyRegistrationStatus.isPending ? "Annulation…" : "Annuler l'inscription"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

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
                <div className={`border rounded-2xl p-4 flex items-center justify-between ${cardBg}`}>
                  <p className={`text-xs ${textMuted}`}>Dépensé ce mois-ci</p>
                  <p className={`text-lg font-bold ${dk ? "text-white" : "text-gray-900"}`}>{fmt(spentThisMonth)}</p>
                </div>
                {Object.keys(statusCounts).length > 0 && (
                  <div className={`border rounded-2xl p-4 ${cardBg}`}>
                    <p className={`font-semibold text-sm mb-3 ${textPrimary}`}>Répartition des commandes</p>
                    <div className="space-y-2.5">
                      {Object.entries(statusCounts).map(([status, count]) => (
                        <div key={status} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className={textMuted}>{FR_STATUS_LABEL[status] ?? status}</span>
                            <span className={textPrimary}>{count}</span>
                          </div>
                          <Progress value={(count / maxCount) * 100} className="h-1.5" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {favoriteSuppliers.length > 0 && (
                  <div className={`border rounded-2xl p-4 ${cardBg}`}>
                    <p className={`font-semibold text-sm mb-3 ${textPrimary}`}>Fournisseurs favoris</p>
                    <div className="space-y-2">
                      {favoriteSuppliers.map((s, i) => (
                        <div key={s.id} className="flex items-center justify-between text-xs">
                          <span className={`truncate ${textMuted}`}><span className="mr-1.5">#{i + 1}</span>{s.name}</span>
                          <span className={`font-semibold shrink-0 ${textPrimary}`}>{fmt(s.revenue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {mostBoughtProducts.length > 0 && (
                  <div className={`border rounded-2xl p-4 ${cardBg}`}>
                    <p className={`font-semibold text-sm mb-3 ${textPrimary}`}>Produits les plus achetés</p>
                    <div className="space-y-2">
                      {mostBoughtProducts.map((p, i) => (
                        <div key={p.id} className="flex items-center justify-between text-xs">
                          <span className={`truncate ${textMuted}`}><span className="mr-1.5">#{i + 1}</span>{p.name}</span>
                          <span className={`font-semibold shrink-0 ${textPrimary}`}>×{p.quantity}</span>
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
            {/* Profile — real Coffee Owner account fields (users.name/phone/isWhatsapp/
                profileImageUrl), same fields every other role's Settings page edits. */}
            <div className={`border rounded-2xl p-4 ${cardBg}`}>
              <p className={`font-semibold text-sm mb-3 flex items-center gap-2 ${textPrimary}`}><User className="w-4 h-4" /> Profile</p>
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="w-12 h-12 shrink-0">
                  <AvatarImage src={getAvatarUrl({ profileImageUrl: settingsProfileImageUrl })} alt={settingsName || "Coffee Owner"} />
                  <AvatarFallback className={`font-bold ${dk ? "bg-gray-700 text-amber-400" : "bg-blue-100 text-blue-700"}`}>
                    {settingsName?.charAt(0)?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1.5">
                  <Label className={`text-xs ${textMuted}`}>Photo de profil (URL)</Label>
                  <Input
                    value={settingsProfileImageUrl}
                    onChange={(e) => setSettingsProfileImageUrl(e.target.value)}
                    placeholder="https://…"
                    className={`h-9 ${inputCls}`}
                    data-testid="input-settings-picture"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={`text-xs ${textMuted}`}>Full Name / Café</Label>
                  <Input value={settingsName} onChange={(e) => setSettingsName(e.target.value)} className={`h-9 ${inputCls}`} data-testid="input-settings-name" />
                </div>
                <div className="space-y-1.5">
                  <Label className={`text-xs ${textMuted}`}>Email</Label>
                  <Input value={user?.email ?? ""} disabled className={`h-9 ${inputCls} opacity-70`} data-testid="input-settings-email" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className={`text-xs ${textMuted}`}>Téléphone</Label>
                    <label className={`flex items-center gap-1.5 text-xs cursor-pointer select-none ${textMuted}`}>
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded accent-blue-600"
                        checked={settingsWhatsapp}
                        onChange={(e) => setSettingsWhatsapp(e.target.checked)}
                        data-testid="checkbox-settings-whatsapp"
                      />
                      WhatsApp
                    </label>
                  </div>
                  <Input value={settingsPhone} onChange={(e) => setSettingsPhone(e.target.value)} className={`h-9 ${inputCls}`} data-testid="input-settings-phone" />
                </div>
              </div>
              <Button
                onClick={() => updateAccountProfile.mutate({
                  name: settingsName.trim() || undefined,
                  phone: settingsPhone.trim(),
                  isWhatsapp: settingsWhatsapp,
                  profileImageUrl: settingsProfileImageUrl.trim() || null,
                })}
                disabled={updateAccountProfile.isPending || !settingsName.trim()}
                className="mt-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
                data-testid="button-save-settings-account"
              >
                {updateAccountProfile.isPending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>

            {/* Location — the same users.locationAddress/locationLat/locationLng used
                everywhere else (delivery, distance calculations); editing it here keeps
                every surface synchronized, reusing the existing LocationPickerModal. */}
            <div className={`border rounded-2xl p-4 ${cardBg}`}>
              <p className={`font-semibold text-sm mb-3 flex items-center gap-2 ${textPrimary}`}><MapPin className="w-4 h-4" /> Localisation</p>
              <p className={`text-sm ${textPrimary}`}>{(user as any)?.locationAddress || "Aucune adresse enregistrée."}</p>
              <p className={`text-xs mt-1 mb-3 ${textMuted}`}>Cette adresse est utilisée pour la livraison et les calculs de distance avec les prestataires.</p>
              <Button
                variant="outline"
                className={`rounded-xl ${dk ? "border-gray-700 text-gray-200 hover:bg-gray-700" : ""}`}
                onClick={() => setLocationModalOpen(true)}
                data-testid="button-edit-settings-location"
              >
                {(user as any)?.locationAddress ? "Modifier l'adresse" : "Ajouter une adresse"}
              </Button>
            </div>

            {/* Security — same generic password-change flow (currentPassword required
                server-side) every other role's Settings page uses. */}
            <div className={`border rounded-2xl p-4 ${cardBg}`}>
              <p className={`font-semibold text-sm mb-3 flex items-center gap-2 ${textPrimary}`}><Lock className="w-4 h-4" /> Sécurité</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={`text-xs ${textMuted}`}>Mot de passe actuel</Label>
                  <Input type="password" value={settingsCurrentPassword} onChange={(e) => setSettingsCurrentPassword(e.target.value)} className={`h-9 ${inputCls}`} data-testid="input-settings-current-password" />
                </div>
                <div className="space-y-1.5">
                  <Label className={`text-xs ${textMuted}`}>Nouveau mot de passe</Label>
                  <Input type="password" value={settingsNewPassword} onChange={(e) => setSettingsNewPassword(e.target.value)} className={`h-9 ${inputCls}`} data-testid="input-settings-new-password" />
                </div>
              </div>
              <Button
                variant="outline"
                className={`mt-3 rounded-xl ${dk ? "border-gray-700 text-gray-200 hover:bg-gray-700" : ""}`}
                disabled={updateAccountPassword.isPending || !settingsCurrentPassword || !settingsNewPassword}
                onClick={() => updateAccountPassword.mutate({ password: settingsNewPassword, currentPassword: settingsCurrentPassword })}
                data-testid="button-change-settings-password"
              >
                {updateAccountPassword.isPending ? "Enregistrement…" : "Changer le mot de passe"}
              </Button>
            </div>

            <div className={`border rounded-2xl p-4 ${cardBg}`}>
              <p className={`font-semibold text-sm mb-3 ${textPrimary}`}>Notifications</p>
              <div className="space-y-3">
                {(ROLE_NOTIFICATION_PREF_KEYS.CAFE_OWNER ?? []).map((key) => {
                  const def = NOTIFICATION_PREF_DEFS[key];
                  return (
                    <div key={key} className={`flex items-center justify-between py-1 border-b last:border-0 ${borderClr}`}>
                      <span className={`text-sm ${textPrimary}`}>{def.label}</span>
                      <Switch
                        checked={isNotifCategoryEnabled(key)}
                        onCheckedChange={(v) => updateNotifPrefs.mutate({ [key]: v })}
                        data-testid={`switch-notif-pref-${key}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <button
              onClick={onLogout}
              className={`w-full flex items-center justify-center gap-2 text-sm font-medium py-3 rounded-2xl border transition-colors ${dk ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : "border-red-200 text-red-500 hover:bg-red-50"}`}
            >
              <LogOut className="w-4 h-4" /> Log out
            </button>

            <LocationPickerModal
              open={locationModalOpen}
              mode="account"
              title="Choisissez votre adresse"
              initialAddress={(user as any)?.locationAddress ?? undefined}
              initialDetails={(user as any)?.locationDetails as AddressDetails | undefined}
              onClose={() => setLocationModalOpen(false)}
              onConfirm={(loc: PickedLocation) => updateAccountLocation.mutate(loc)}
            />
          </div>
        )}
      </div>
    </div>
  );
}


// ── Favorites Panel ───────────────────────────────────────────────────────────

// BARISTA is split into two independent top-level tabs (Marketplace Baristas
// and Barista Academy — matching the /barista vs /academy page split), so the
// former inner BARISTA sub-switcher is gone; each is just its own tab now,
// same as SHOP/MAINTENANCE/PRINT/MARKETING.
type FavService = "SHOP" | "MAINTENANCE" | "PRINT" | "BARISTA_MARKETPLACE" | "BARISTA_ACADEMY" | "MARKETING";
type ShopSubTab = "products" | "packs" | "stores";

const FAV_SERVICES: FavService[] = ["SHOP", "MAINTENANCE", "PRINT", "BARISTA_MARKETPLACE", "BARISTA_ACADEMY", "MARKETING"];
const FAV_SERVICE_TO_KEY: Record<FavService, "MAINTENANCE" | "PRINTING" | "BARISTA_MARKETPLACE" | "BARISTA_ACADEMY" | "MARKETING" | null> = {
  SHOP: null,
  MAINTENANCE: "MAINTENANCE",
  PRINT: "PRINTING",
  BARISTA_MARKETPLACE: "BARISTA_MARKETPLACE",
  BARISTA_ACADEMY: "BARISTA_ACADEMY",
  MARKETING: "MARKETING",
};
const FAV_SERVICE_LABEL: Record<FavService, string> = {
  SHOP: "SHOP", MAINTENANCE: "MAINTENANCE", PRINT: "PRINT",
  BARISTA_MARKETPLACE: "BARISTA", BARISTA_ACADEMY: "ACADEMY", MARKETING: "MARKETING",
};

function FavoritesPanel({ onClose }: { onClose: () => void }) {
  const [, navigate] = useLocation();
  const { states: serviceStates } = useServiceStates();
  const { order: serviceOrder } = useServiceOrder();
  const isDark = useThemeStore((s) => s.isDark);
  const toggle = useThemeStore((s) => s.toggle);
  const [activeService, setActiveService] = useState<FavService>("SHOP");
  const [shopTab, setShopTab] = useState<ShopSubTab>("products");
  const [selectedMaintenanceAgent, setSelectedMaintenanceAgent] = useState<MaintenanceMarketplaceCard | null>(null);
  const [maintenanceDetailOpen, setMaintenanceDetailOpen] = useState(false);
  // Clicking a favorite Barista card opens the same comprehensive detail modal
  // used on /barista (Part 22) — no separate favorites-only barista view.
  const [detailBaristaId, setDetailBaristaId] = useState<number | null>(null);
  const [recruitBarista, setRecruitBarista] = useState<BaristaMarketplaceCard | null>(null);
  // Clicking a favorite Marketing card opens the same comprehensive detail
  // modal used on /marketing — no separate favorites-only Marketing view.
  const [detailMarketingId, setDetailMarketingId] = useState<number | null>(null);
  const [quoteMarketingProvider, setQuoteMarketingProvider] = useState<MarketingMarketplaceCard | null>(null);
  // Clicking a favorite Academy formation opens the same comprehensive detail
  // modal used on /academy — no separate favorites-only Academy view.
  const [detailAcademyCourseId, setDetailAcademyCourseId] = useState<number | null>(null);
  const [enrollAcademyTarget, setEnrollAcademyTarget] = useState<AcademyCourseCard | null>(null);

  const {
    shop, print, academy, baristaMarket, marketing, maintenance, pack,
    removeShop, removePrint, removeAcademy, removeBaristaMarket, removeMarketing, removeMaintenance, removePack,
    syncMaintenance, syncBaristaMarket, syncMarketing, syncAcademy,
  } = useFavorites();
  const { stores, toggleStore: toggleStoreFav } = useStoreFavorites();

  const openQuickView = useQuickView((s) => s.open);
  const openPackQuickView = usePackQuickView((s) => s.open);
  const fmt = useFormatCurrency();

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

  // Resolve favorited products against the live marketplace. The marketplace
  // response only includes products with at least one in-stock, visible
  // supplier listing, and provides the same taxonomy labels as Shop.
  const shopFavIds = Object.keys(shop).map(Number);
  const { data: availableProducts = [], isLoading: productsLoading } = useQuery<MarketplaceProduct[]>({
    queryKey: ["/api/marketplace"],
    enabled: shopFavIds.length > 0,
  });
  const favProducts = availableProducts.filter((product) => !!shop[product.id]);

  // Favorites persist as Maintenance account IDs. Resolve them against the
  // live profiles so this modal never displays placeholder or stale agent data.
  const { data: maintenanceFavoriteIds } = useQuery<number[]>({
    queryKey: ["/api/maintenance-favorites"],
  });
  const { data: maintenanceProfiles = [], isLoading: maintenanceProfilesLoading } = useQuery<MaintenanceMarketplaceCard[]>({
    queryKey: ["/api/maintenance/profiles"],
    enabled: (maintenanceFavoriteIds?.length ?? 0) > 0,
  });
  useEffect(() => {
    if (maintenanceFavoriteIds === undefined || maintenanceProfilesLoading) return;
    syncMaintenance(maintenanceFavoriteIds, maintenanceProfiles);
  }, [maintenanceFavoriteIds, maintenanceProfiles, maintenanceProfilesLoading, syncMaintenance]);

  // Favorites persist as Barista Marketplace account IDs. Resolve them against
  // the live profiles, mirroring the Maintenance favorites sync above exactly.
  const { data: baristaFavoriteIds } = useQuery<number[]>({
    queryKey: ["/api/barista-favorites"],
  });
  const { data: baristaProfiles = [], isLoading: baristaProfilesLoading } = useQuery<BaristaMarketplaceCard[]>({
    queryKey: ["/api/barista/profiles"],
    enabled: (baristaFavoriteIds?.length ?? 0) > 0,
  });
  useEffect(() => {
    if (baristaFavoriteIds === undefined || baristaProfilesLoading) return;
    syncBaristaMarket(baristaFavoriteIds, baristaProfiles);
  }, [baristaFavoriteIds, baristaProfiles, baristaProfilesLoading, syncBaristaMarket]);

  // Favorites persist as Marketing provider IDs. Resolve them against the
  // live profiles, mirroring the Maintenance/Barista favorites sync above.
  const { data: marketingFavoriteIds } = useQuery<number[]>({
    queryKey: ["/api/marketing-favorites"],
  });
  const { data: marketingProfiles = [], isLoading: marketingProfilesLoading } = useQuery<MarketingMarketplaceCard[]>({
    queryKey: ["/api/marketing/profiles"],
    enabled: (marketingFavoriteIds?.length ?? 0) > 0,
  });
  useEffect(() => {
    if (marketingFavoriteIds === undefined || marketingProfilesLoading) return;
    syncMarketing(marketingFavoriteIds, marketingProfiles);
  }, [marketingFavoriteIds, marketingProfiles, marketingProfilesLoading, syncMarketing]);

  // Favorites persist as Academy course (formation) IDs. Resolve them against
  // the live published courses, mirroring the Marketing favorites sync above.
  const { data: academyFavoriteIds } = useQuery<number[]>({
    queryKey: ["/api/academy-favorites"],
  });
  const { data: academyCourses = [], isLoading: academyCoursesLoading } = useQuery<AcademyCourseCard[]>({
    queryKey: ["/api/academy/courses"],
    enabled: (academyFavoriteIds?.length ?? 0) > 0,
  });
  useEffect(() => {
    if (academyFavoriteIds === undefined || academyCoursesLoading) return;
    syncAcademy(academyFavoriteIds, academyCourses);
  }, [academyFavoriteIds, academyCourses, academyCoursesLoading, syncAcademy]);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const openMaintenanceDetail = (agentId: number) => {
    const agent = maintenanceProfiles.find((profile) => profile.userId === agentId);
    if (!agent) return;
    setSelectedMaintenanceAgent(agent);
    setMaintenanceDetailOpen(true);
  };
  // Opens the same MarketingDetailModal used on /marketing — it resolves the
  // full profile itself via useMarketingProfileDetail, no lookup needed here.
  const openMarketingDetail = (marketingUserId: number) => setDetailMarketingId(marketingUserId);
  const contactMaintenance = async (agent: MaintenanceMarketplaceCard) => {
    try {
      const response = await apiRequest("POST", "/api/messages/conversations", {
        targetUserId: agent.userId,
        service: "MAINTENANCE",
      });
      const conversation = await response.json() as { conversation: { id: number } };
      setMaintenanceDetailOpen(false);
      setSelectedMaintenanceAgent(null);
      onClose();
      navigate(`/cafe/messages?service=MAINTENANCE&conversationId=${conversation.conversation.id}`);
    } catch (error) {
      toast({ title: "Contact impossible", description: error instanceof Error ? error.message : "Veuillez réessayer.", variant: "destructive" });
    }
  };
  const reserveMaintenance = useMutation({
    mutationFn: ({ agent, data }: { agent: MaintenanceMarketplaceCard; data: MaintenanceReservationData }) =>
      apiRequest("POST", "/api/maintenance/reservations", {
        maintenanceUserId: agent.userId,
        service: agent.jobTitle,
        ...data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/reservations"] });
      setMaintenanceDetailOpen(false);
      setSelectedMaintenanceAgent(null);
      toast({ title: "Demande envoyée", description: "Le technicien pourra maintenant la confirmer." });
    },
    onError: (error: Error) => toast({ title: "Impossible d'envoyer la demande", description: error.message, variant: "destructive" }),
  });

  const visibleFavServices = sortServiceIds(FAV_SERVICES, serviceOrder).filter((s) => {
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

  const printItems = Object.values(print);
  const academyItems = Object.values(academy);
  const baristaItems = Object.values(baristaMarket);
  const marketingItems = Object.values(marketing);
  const maintenanceItems = Object.values(maintenance) as MaintenanceFavItem[];

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
            onClick={() => toggle()}
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
        <div className={`flex gap-2 overflow-x-auto rounded-2xl p-1
    [-ms-overflow-style:none]
    [scrollbar-width:none]
    [&::-webkit-scrollbar]:hidden ${switcherBg}`}>
          {visibleFavServices.map((s) => (
            <button
              key={s}
              data-testid={`tab-fav-${s.toLowerCase()}`}
              onClick={() => setActiveService(s)}
              className={`shrink-0 min-w-[110px] h-7 px-4 flex items-center justify-center text-[11px] font-semibold rounded-xl transition-all whitespace-nowrap scrollbar-hide ${activeService === s ? switcherActive : switcherInactive}`}
            >
              {FAV_SERVICE_LABEL[s]}
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

        {/* Divider */}
        <div className={`mt-4 h-px ${dividerColor}`} />
      </div>

      {/* ── Scrollable content ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-8 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600" style={{ WebkitOverflowScrolling: "touch" }}>
        {/* SHOP — Products */}
        {activeService === "SHOP" && shopTab === "products" && (
          shopFavIds.length === 0 ? renderEmpty() : productsLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {shopFavIds.map((id) => <div key={id} className={`h-40 rounded-2xl animate-pulse ${skeletonBg}`} />)}
            </div>
          ) : favProducts.length === 0 ? renderEmpty() : (
            <div className="grid grid-cols-2 gap-3">
              {favProducts.map((product) => {
                const categoryName = product.categoryLabel?.name ?? product.category ?? null;
                const brandName = product.brandLabel?.name ?? null;
                return (
                <div
                  key={product.id}
                  className={`group border rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-shadow ${cardBg}`}
                  onClick={() => openQuickView(product.id)}
                  data-testid={`card-fav-shop-${product.id}`}
                >
                  <div className="relative h-28">
                    {product.imageUrl
                      ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                      : <div className={`w-full h-full ${dk ? "bg-gray-700" : "bg-gray-50"} flex items-center justify-center`}><Package className="w-8 h-8 text-gray-400 opacity-30" /></div>
                    }
                    <button
                      className="absolute top-2 right-2 w-7 h-7 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                      onClick={(event) => { event.stopPropagation(); removeShop(product.id); }}
                      data-testid={`button-fav-remove-shop-${product.id}`}
                    >
                      <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                    </button>
                  </div>
                  <div className="p-3 flex flex-col gap-1.5">
                    <p className={`font-bold text-sm leading-tight line-clamp-1 ${textPrimary}`}>{product.name}</p>
                    {[categoryName, brandName].some(Boolean) && (
                    <div
                      className={`mt-auto pt-1.5 border-t flex items-center gap-2 ${
                        dk ? "border-gray-700" : "border-gray-100"
                      }`}
                    >
                      <span
                        className={`w-full min-w-0 text-[10px] px-1.5 py-0.5 rounded-md border truncate ${
                          dk
                            ? "bg-gray-700 border-gray-600"
                            : "bg-gray-100 border-gray-200"
                        }`}
                      >
                        {categoryName && (
                          <span className={textPrimary}>
                            {categoryName}
                          </span>
                        )}

                        {categoryName && brandName && (
                          <span className={textPrimary}>{" • "}</span>
                        )}

                        {brandName && (
                          <span className="text-rose-500">
                            {brandName}
                          </span>
                        )}
                      </span>
                    </div>
                    )}
                  </div>
                </div>
                );
              })}
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
                    <p className={`text-sm font-bold mt-1 ${dk ? "text-amber-400" : "text-amber-600"}`}>{fmt(p.price)}</p>
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
                      {fmt(item.price)}<span className={`text-[10px] font-normal ${textMuted}`}>/{item.priceUnit}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* BARISTA — Academy. Same left-photo/right-info clickable layout as
            BARISTA_MARKETPLACE below — mirrors the /academy card design (Part 10),
            clicking opens the same AcademyDetailModal used on /academy (Part 9). */}
        {activeService === "BARISTA_ACADEMY" && (
          academyItems.length === 0 ? renderEmpty() : (
            <div className="space-y-3">
              {academyItems.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetailAcademyCourseId(item.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailAcademyCourseId(item.id); } }}
                  className={`group flex items-stretch border rounded-2xl overflow-hidden cursor-pointer h-28 ${cardBg}`}
                  data-testid={`row-fav-academy-${item.id}`}
                >
                  <div className="w-2/5 shrink-0 relative">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${dk ? "bg-indigo-950" : "bg-indigo-100"}`}>
                        <GraduationCap className={`w-6 h-6 ${dk ? "text-indigo-300" : "text-indigo-500"}`} />
                      </div>
                    )}
                    {item.hasCertification && (
                      <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-400/90 text-amber-900">
                        Certifié
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 p-3 flex flex-col gap-1 justify-center">
                    <p className={`font-semibold text-sm truncate ${textPrimary}`}>{item.title}</p>
                    <p className={`text-xs truncate ${textMuted}`}>{item.provider}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-amber-400 flex items-center gap-0.5"><Star className="w-2.5 h-2.5 fill-amber-400" />{item.rating.toFixed(1)}</span>
                      {item.duration && <span className={`text-[10px] ${textMuted}`}>{item.duration}</span>}
                      {item.location && (
                        <span className={`text-[10px] flex items-center gap-0.5 ${textMuted}`}>
                          <MapPinIcon className="w-2.5 h-2.5 shrink-0" />{item.location}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-indigo-600 mt-0.5">{fmt(item.price)}</p>
                  </div>
                  <div className="flex items-start p-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="p-1 rounded-lg hover:bg-rose-500/10 transition-colors"
                      onClick={(e) => { e.stopPropagation(); removeAcademy(item.id); }}
                      data-testid={`button-fav-remove-academy-${item.id}`}
                      aria-label={`Remove ${item.title} from favorites`}
                    >
                      <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* BARISTA — Marketplace. Left half = large photo, right half = info
            (Parts 12-13), mirroring the /barista card's own wide layout —
            same visual language, just applied to this list's row shape. */}
        {activeService === "BARISTA_MARKETPLACE" && (
          baristaItems.length === 0 ? renderEmpty() : (
            <div className="space-y-3">
              {baristaItems.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetailBaristaId(item.id)}
                  className={`group flex items-stretch border rounded-2xl overflow-hidden cursor-pointer h-28 ${cardBg}`}
                  data-testid={`row-fav-barista-${item.id}`}
                >
                  <div className="w-2/5 shrink-0 relative">
                    <Avatar className="w-full h-full rounded-none">
                      <AvatarImage src={getAvatarUrl(item as any)} alt={item.name} className="object-cover" />
                      <AvatarFallback className={`rounded-none font-bold text-xl ${dk ? "bg-green-900 text-green-300" : "bg-green-100 text-green-700"}`}>{item.initials}</AvatarFallback>
                    </Avatar>
                    <span
                      className={`absolute bottom-1.5 left-1.5 w-2 h-2 rounded-full border-2 border-white ${item.available ? "bg-green-500" : "bg-gray-300"}`}
                      title={item.available ? "Disponible" : "Indisponible"}
                    />
                  </div>
                  <div className="flex-1 min-w-0 p-3 flex flex-col gap-1 justify-center">
                    <div className="flex items-center gap-1.5">
                      <p className={`font-semibold text-sm truncate ${textPrimary}`}>{item.name}</p>
                    </div>
                    <p className={`text-xs flex items-center gap-1 ${textMuted}`}>
                      <MapPinIcon className="w-2.5 h-2.5 shrink-0" />{item.location}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-amber-400 flex items-center gap-0.5"><Star className="w-2.5 h-2.5 fill-amber-400" />{item.rating.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="flex items-start p-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="p-1 rounded-lg hover:bg-rose-500/10 transition-colors"
                      onClick={(e) => { e.stopPropagation(); removeBaristaMarket(item.id); }}
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
        {/* MARKETING — same left-photo/right-info Favorites layout as
            MAINTENANCE above; clicking opens the same MarketingDetailModal
            used on /marketing (Part 11) — no separate favorites-only view. */}
        {activeService === "MARKETING" && (
          marketingItems.length === 0 ? renderEmpty() : (
            <div className="space-y-3">
              {marketingItems.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openMarketingDetail(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMarketingDetail(item.id);
                    }
                  }}
                  className={`group flex items-stretch border rounded-2xl overflow-hidden cursor-pointer h-28 ${cardBg}`}
                  data-testid={`card-fav-marketing-${item.id}`}
                >
                  <div className="w-2/5 shrink-0 relative">
                    {item.portfolioImages[0] ? (
                      <img src={item.portfolioImages[0]} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <Avatar className="w-full h-full rounded-none">
                        <AvatarImage src={getAvatarUrl(item as any)} alt={item.name} className="object-cover" />
                        <AvatarFallback className={`rounded-none font-bold text-xl ${dk ? "bg-purple-900 text-purple-300" : "bg-purple-100 text-purple-700"}`}>{item.initials}</AvatarFallback>
                      </Avatar>
                    )}
                    {item.available != null && (
                      <span
                        className={`absolute bottom-1.5 left-1.5 w-2 h-2 rounded-full border-2 border-white ${item.available ? "bg-green-500" : "bg-gray-300"}`}
                        title={item.available ? "Disponible" : "Indisponible"}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 p-3 flex flex-col gap-1 justify-center">
                    <p className={`font-semibold text-sm truncate ${textPrimary}`}>{item.name}</p>
                    <p className={`text-xs mt-0.5 ${textMuted}`}>{item.type}</p>
                    {item.location && (
                      <p className={`text-xs flex items-center gap-1 ${textMuted}`}>
                        <MapPinIcon className="w-2.5 h-2.5 shrink-0" />{item.location}
                      </p>
                    )}
                    <span className="text-[11px] text-amber-400 flex items-center gap-0.5"><Star className="w-2.5 h-2.5 fill-amber-400" />{item.rating.toFixed(1)}</span>
                  </div>
                  <div className="flex items-start p-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="p-1 rounded-lg hover:bg-rose-500/10 transition-colors"
                      onClick={(event) => { event.stopPropagation(); removeMarketing(item.id); }}
                      data-testid={`button-fav-remove-marketing-${item.id}`}
                      aria-label={`Remove ${item.name} from favorites`}
                    >
                      <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* MAINTENANCE — same left-photo/right-info Favorites layout as
            BARISTA_MARKETPLACE above (visual reference only); skills/categories
            and actions dropped from the card, kept in the details modal. */}
        {activeService === "MAINTENANCE" && (
          maintenanceItems.length === 0 ? renderEmpty() : (
            <div className="space-y-3">
              {maintenanceItems.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openMaintenanceDetail(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMaintenanceDetail(item.id);
                    }
                  }}
                  className={`group flex items-stretch border rounded-2xl overflow-hidden cursor-pointer h-28 ${cardBg}`}
                  data-testid={`card-fav-maintenance-${item.id}`}
                >
                  <div className="w-2/5 shrink-0 relative">
                    <Avatar className="w-full h-full rounded-none">
                      <AvatarImage src={getAvatarUrl(item as any)} alt={item.name} className="object-cover" />
                      <AvatarFallback className={`rounded-none font-bold text-xl ${dk ? "bg-orange-900 text-orange-300" : "bg-orange-100 text-orange-700"}`}>{item.initials}</AvatarFallback>
                    </Avatar>
                    <span
                      className={`absolute bottom-1.5 left-1.5 w-2 h-2 rounded-full border-2 border-white ${item.available ? "bg-green-500" : "bg-gray-300"}`}
                      title={item.available ? "Disponible" : "Indisponible"}
                    />
                  </div>
                  <div className="flex-1 min-w-0 p-3 flex flex-col gap-1 justify-center">
                    <p className={`font-semibold text-sm truncate ${textPrimary}`}>{item.name}</p>
                    <p className={`text-xs flex items-center gap-1 ${textMuted}`}>
                      <MapPinIcon className="w-2.5 h-2.5 shrink-0" />{item.location || "—"}
                    </p>
                    <span className="text-[11px] text-amber-400 flex items-center gap-0.5"><Star className="w-2.5 h-2.5 fill-amber-400" />{item.rating.toFixed(1)}</span>
                  </div>
                  <div className="flex items-start p-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="p-1 rounded-lg hover:bg-rose-500/10 transition-colors"
                      onClick={(event) => { event.stopPropagation(); removeMaintenance(item.id); }}
                      data-testid={`button-fav-remove-maintenance-${item.id}`}
                      aria-label={`Remove ${item.name} from favorites`}
                    >
                      <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

      </div>
      <AgentDetailModal
        agent={selectedMaintenanceAgent}
        open={maintenanceDetailOpen}
        onClose={() => {
          setMaintenanceDetailOpen(false);
          setSelectedMaintenanceAgent(null);
        }}
        onContact={contactMaintenance}
        onReserve={(agent, data) => reserveMaintenance.mutate({ agent, data })}
        isDark={dk}
      />

      <BaristaDetailModal
        baristaUserId={detailBaristaId}
        open={detailBaristaId != null}
        onClose={() => setDetailBaristaId(null)}
        onRecruit={(b) => { setDetailBaristaId(null); setRecruitBarista(b); }}
      />
      <BaristaRecruitDialog
        barista={recruitBarista}
        open={!!recruitBarista}
        onClose={() => setRecruitBarista(null)}
        isDark={dk}
      />

      <MarketingDetailModal
        marketingUserId={detailMarketingId}
        open={detailMarketingId != null}
        onClose={() => setDetailMarketingId(null)}
        onRequestQuote={(p) => { setDetailMarketingId(null); setQuoteMarketingProvider(p); }}
      />
      <MarketingQuoteRequestDialog provider={quoteMarketingProvider} onClose={() => setQuoteMarketingProvider(null)} />

      <AcademyDetailModal
        courseId={detailAcademyCourseId}
        open={detailAcademyCourseId != null}
        onClose={() => setDetailAcademyCourseId(null)}
        onEnroll={(c) => { setDetailAcademyCourseId(null); setEnrollAcademyTarget(c); }}
      />
      <AcademyEnrollDialog course={enrollAcademyTarget} open={!!enrollAcademyTarget} onClose={() => setEnrollAcademyTarget(null)} isDark={dk} />
    </div>
  );
}

// ── Chat Panel ────────────────────────────────────────────────────────────────

// ServiceId here still matches the DB's messaging-conversation `service` column
// value ("BARISTA" — a separate, generic string enum from the ServiceKey
// visibility gate below), which stays a single value for Marketplace: there's
// no real Coffee-Owner-facing messaging flow for Barista Academy under that
// tag (see the serviceRoles.BARISTA note in server/storage.ts's
// getEligibleContacts) — Academy instead gets its own "ACADEMY" tag, since it
// now has a real registration-backed relationship of its own (see
// serviceRoles.ACADEMY). Its VISIBILITY gate points at BARISTA_ACADEMY.
const SERVICES_LIST: ServiceId[] = ["SHOP", "MAINTENANCE", "PRINT", "BARISTA", "ACADEMY", "MARKETING"];
const SERVICE_ID_TO_KEY: Record<ServiceId, "PRINTING" | "MAINTENANCE" | "BARISTA_MARKETPLACE" | "BARISTA_ACADEMY" | "MARKETING" | null> = {
  SHOP: null,
  MAINTENANCE: "MAINTENANCE",
  PRINT: "PRINTING",
  BARISTA: "BARISTA_MARKETPLACE",
  ACADEMY: "BARISTA_ACADEMY",
  MARKETING: "MARKETING",
};
const SERVICE_ID_LABEL: Record<ServiceId, string> = {
  SHOP: "SHOP", MAINTENANCE: "MAINTENANCE", PRINT: "PRINT", BARISTA: "Barista", ACADEMY: "Academy", MARKETING: "MARKETING",
};

// ── Messages Panel (premium dark/light — mirrors FavoritesPanel design) ───────

function MessagesPanel({
  onClose,
  initialService,
  initialConversationId = null,
}: {
  onClose: () => void;
  initialService?: ServiceId;
  initialConversationId?: number | null;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { states: serviceStates } = useServiceStates();
  const { order: serviceOrder } = useServiceOrder();
  const visibleServicesList = sortServiceIds(SERVICES_LIST, serviceOrder).filter((s) => {
    const key = SERVICE_ID_TO_KEY[s];
    return !key || serviceStates[key] !== "HIDDEN";
  });

  const isDark = useThemeStore((s) => s.isDark);
  const toggle = useThemeStore((s) => s.toggle);
  const [service, setService] = useState<ServiceId>(initialService ?? "SHOP");
  const [view, setView] = useState<"list" | "chat">("list");

  // ── SHOP real data state ──────────────────────────────────────────────────
  const [shopConvId, setShopConvId] = useState<number | null>(initialConversationId);
  const [shopInput, setShopInput] = useState("");
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [shopSearch, setShopSearch] = useState("");
  const shopMsgsBottomRef = useRef<HTMLDivElement>(null);

  // ── Non-SHOP fake data state ──────────────────────────────────────────────
  const [threads, setThreads] = useState<Thread[]>(fakeThreads);
  const [active, setActive] = useState<Thread | null>(null);
  const [staticInput, setStaticInput] = useState("");

  // ── Theme tokens ──────────────────────────────────────────────────────────
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

  // ── SHOP queries ──────────────────────────────────────────────────────────
  const isRealMessagingService = true;
  const { data: shopConversations = [], isLoading: shopConvsLoading } = useQuery<ConversationSummary[]>({
    queryKey: ["/api/messages/conversations", service],
    queryFn: async () => {
      const r = await fetch(`/api/messages/conversations?service=${encodeURIComponent(service)}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 30000,
    enabled: isRealMessagingService,
  });

  const { data: shopContacts = [] } = useQuery<EligibleContact[]>({
    queryKey: ["/api/messages/eligible-contacts", service],
    queryFn: async () => {
      const r = await fetch(`/api/messages/eligible-contacts?service=${encodeURIComponent(service)}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: isRealMessagingService,
  });

  // The API is service-scoped; keep the client-side guard exact as well so
  // switching between real service tabs never leaks or hides conversations.
  const realConversations = shopConversations.filter((c) => c.service === service);
  const shopActiveConv = realConversations.find(c => c.id === shopConvId) ?? null;

  const { data: shopMsgsData, isLoading: shopMsgsLoading } = useQuery<{ messages: ConversationMessageRow[] }>({
    queryKey: ["/api/messages/conversations", shopConvId, "messages"],
    queryFn: async () => {
      const r = await fetch(`/api/messages/conversations/${shopConvId}/messages?pageSize=100`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!shopConvId,
    refetchInterval: shopConvId ? 10000 : false,
  });

  useEffect(() => {
    if (service === "SHOP" && view === "chat") {
      shopMsgsBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [shopMsgsData?.messages.length, service, view]);

  // ── SHOP mutations ────────────────────────────────────────────────────────
  const sendShopMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/messages/conversations/${shopConvId}/messages`, { content }),
    onSuccess: () => {
      setShopInput("");
      qc.invalidateQueries({ queryKey: ["/api/messages/conversations", shopConvId, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
    onError: (err: any) => toast({ title: "Failed to send", description: err?.message, variant: "destructive" }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/messages/conversations/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/messages/conversations"] }),
  });

  const newConvMutation = useMutation({
    mutationFn: async (targetUserId: number) => {
      const response = await apiRequest("POST", "/api/messages/conversations", {
        targetUserId,
        service,
      });
      return response.json() as Promise<{ conversation: { id: number }; isNew: boolean }>;
    },
    onSuccess: (data: any) => {
      setShopConvId(data.conversation.id);
      setView("chat");
      setNewConvOpen(false);
      setContactSearch("");
      qc.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
    onError: (err: any) => toast({ title: "Cannot start conversation", description: err?.message, variant: "destructive" }),
  });

  // ── SHOP helpers ──────────────────────────────────────────────────────────
  const openShopConv = (id: number) => {
    setShopConvId(id);
    setView("chat");
    setShopSearch("");
    markReadMutation.mutate(id);
  };

  const filteredShopConvs = realConversations.filter(c => {
    const name = c.title ?? c.otherParticipants.map(p => p.name).join(", ");
    return name.toLowerCase().includes(shopSearch.toLowerCase());
  });

  const filteredContacts = shopContacts.filter(c =>
    c.name.toLowerCase().includes(contactSearch.toLowerCase())
  );

  function formatRelTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return days === 1 ? "Yesterday" : `${days}d ago`;
  }

  // ── Non-SHOP helpers ──────────────────────────────────────────────────────
  const filteredFake = threads.filter((t) => t.service === service);

  const openConversation = (t: Thread) => {
    setActive(t);
    setView("chat");
    setThreads((prev) => prev.map((th) => th.id === t.id ? { ...th, unread: 0 } : th));
  };

  const sendStatic = () => {
    if (!staticInput.trim() || !active) return;
    const msg: ThreadMessage = { from: "me", text: staticInput.trim(), time: "Now" };
    setThreads((prev) => prev.map((t) => t.id === active.id ? { ...t, messages: [...t.messages, msg], lastMessage: staticInput.trim() } : t));
    setActive((a) => a ? { ...a, messages: [...a.messages, msg] } : a);
    setStaticInput("");
  };

  const switchService = (s: ServiceId) => {
    setService(s);
    setView("list");
    setActive(null);
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
            onClick={() => toggle()
            }
            aria-label="Toggle theme"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-100 hover:bg-gray-200"}`}
          >
            {dk ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
          </button>
        </div>

        {/* Service switcher */}
        <div className={`flex gap-2 overflow-x-auto rounded-2xl p-1
    [-ms-overflow-style:none]
    [scrollbar-width:none]
    [&::-webkit-scrollbar]:hidden ${switcherBg}`}>
          {visibleServicesList.map((s) => (
            <button
              key={s}
              data-testid={`tab-messages-${s.toLowerCase()}`}
              onClick={() => switchService(s)}
              className={`shrink-0 min-w-[110px] h-7 px-4 flex items-center justify-center text-[11px] font-semibold rounded-xl transition-all whitespace-nowrap scrollbar-hide ${service === s ? switcherActive : switcherInactive}`}
            >
              {SERVICE_ID_LABEL[s]}
            </button>
          ))}
        </div>

        <div className={`mt-4 h-px ${dividerColor}`} />
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-5 pb-5">

        {isRealMessagingService ? (
          <>
            {/* ── SHOP list view (real data) ── */}
            {view === "list" && (
              <div className={`flex-1 overflow-hidden flex flex-col rounded-2xl border ${cardBg}`}>
                {/* Search bar + new conv button */}
                <div className={`flex items-center gap-2 px-3 py-2.5 border-b shrink-0 ${dk ? "border-gray-700/40" : "border-gray-100"}`}>
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                    <input
                      className={`w-full pl-7 pr-2 h-7 text-xs rounded-xl outline-none ${dk ? "bg-gray-700/60 text-white placeholder:text-gray-500 focus:bg-gray-700" : "bg-gray-100 text-gray-900 placeholder:text-gray-400 focus:bg-gray-200"}`}
                      placeholder="Search conversations…"
                      value={shopSearch}
                      onChange={e => setShopSearch(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => setNewConvOpen(true)}
                    title="New conversation"
                    className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors shrink-0 ${dk ? "bg-blue-600/20 hover:bg-blue-600/30 text-blue-400" : "bg-blue-100 hover:bg-blue-200 text-blue-600"}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full">
                  {shopConvsLoading ? (
                    <div className="p-3 space-y-2">
                      {[1,2,3].map(i => <div key={i} className={`h-12 rounded-xl animate-pulse ${dk ? "bg-gray-700/50" : "bg-gray-100"}`} />)}
                    </div>
                  ) : filteredShopConvs.length === 0 ? (
                    <div className={`flex flex-col items-center justify-center h-full py-16 ${textMuted}`}>
                      <MessageCircle className="w-10 h-10 mb-3 opacity-20" />
                      <p className={`text-sm font-medium ${textPrimary}`}>No conversations yet</p>
                      <p className="text-xs mt-1 opacity-50">Tap + to start a new chat</p>
                    </div>
                  ) : (
                    filteredShopConvs.map((conv) => {
                      const name = (conv.title ?? conv.otherParticipants.map(p => p.name).join(", ")) || "Unknown";
                      return (
                        <button
                          key={conv.id}
                          data-testid={`button-thread-${conv.id}`}
                          onClick={() => openShopConv(conv.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-b last:border-0 ${hoverRow} ${borderRow}`}
                        >
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 font-bold text-sm ${dk ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <span className={`text-sm font-semibold truncate ${textPrimary}`}>{name}</span>
                              <span className={`text-[10px] shrink-0 ${textMuted}`}>{formatRelTime(conv.lastMessageAt)}</span>
                            </div>
                            <p className={`text-xs truncate ${textMuted}`}>{conv.lastMessage?.content ?? "No messages yet"}</p>
                          </div>
                          {conv.unreadCount > 0 && (
                            <span className="shrink-0 bg-blue-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                              {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ── SHOP chat view (real data) ── */}
            {view === "chat" && shopActiveConv && (
              <div className={`flex-1 flex flex-col border rounded-2xl overflow-hidden ${cardBg}`}>
                {/* Header */}
                <div className={`flex items-center gap-2.5 px-4 py-3 border-b shrink-0 ${dk ? "border-gray-700/60" : "border-gray-100"}`}>
                  <button
                    onClick={() => setView("list")}
                    data-testid="button-chat-back"
                    className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors shrink-0 ${dk ? "bg-gray-700 hover:bg-gray-600 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${dk ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
                    {(shopActiveConv.title ?? shopActiveConv.otherParticipants[0]?.name ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className={`font-semibold text-sm truncate ${textPrimary}`}>
                      {(shopActiveConv.title ?? shopActiveConv.otherParticipants.map(p => p.name).join(", ")) || "Unknown"}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-lg shrink-0 ${SERVICE_BADGE[service]}`}>{service}</span>
                  </div>
                </div>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full">
                  {shopMsgsLoading ? (
                    <div className="flex justify-center pt-8">
                      <Loader2 className={`w-5 h-5 animate-spin ${textMuted}`} />
                    </div>
                  ) : (shopMsgsData?.messages ?? []).length === 0 ? (
                    <div className={`flex items-center justify-center h-full ${textMuted}`}>
                      <p className="text-sm">No messages yet. Say hello!</p>
                    </div>
                  ) : (
                    (shopMsgsData?.messages ?? []).map((m) => {
                      const isOwn = m.senderId === user?.id;
                      return (
                        <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                            isOwn ? "bg-amber-600 text-white rounded-br-sm" : `${chatBubbleBg} rounded-bl-sm`
                          }`}>
                            {!isOwn && shopActiveConv.type === "BROADCAST" && (
                              <p className="text-[10px] font-semibold mb-1 opacity-70">{m.senderName}</p>
                            )}
                            {m.content}
                            <span className={`block text-[10px] mt-1 opacity-60 ${isOwn ? "text-right" : ""}`}>
                              {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={shopMsgsBottomRef} />
                </div>
                {/* Input */}
                <div className={`p-3 border-t flex gap-2 shrink-0 ${dk ? "border-gray-700/60" : "border-gray-100"}`}>
                  <Input
                    className={`flex-1 h-9 text-sm ${inputCls}`}
                    placeholder="Message…"
                    value={shopInput}
                    onChange={(e) => setShopInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (shopInput.trim()) sendShopMutation.mutate(shopInput.trim()); } }}
                    disabled={sendShopMutation.isPending}
                    data-testid="input-message"
                  />
                  <button
                    onClick={() => { if (shopInput.trim()) sendShopMutation.mutate(shopInput.trim()); }}
                    disabled={!shopInput.trim() || sendShopMutation.isPending}
                    data-testid="button-send-message"
                    className="w-9 h-9 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white flex items-center justify-center transition-colors shrink-0"
                  >
                    {sendShopMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {/* ── New conversation dialog ── */}
            <Dialog open={newConvOpen} onOpenChange={o => { setNewConvOpen(o); if (!o) setContactSearch(""); }}>
              <DialogContent className={dk ? "bg-gray-900 border-gray-700 text-white" : ""}>
                <DialogTitle className={`text-sm font-semibold ${textPrimary}`}>New Conversation</DialogTitle>
                <DialogDescription className="sr-only">Search and select a contact to start a conversation with.</DialogDescription>
                <Input
                  className={`mb-3 ${inputCls}`}
                  placeholder="Search contacts…"
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                />
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {filteredContacts.length === 0 ? (
                    <p className={`text-xs py-4 text-center ${textMuted}`}>No contacts available</p>
                  ) : (
                    filteredContacts.map(c => (
                      <button
                        key={c.id}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors ${hoverRow}`}
                        onClick={() => newConvMutation.mutate(c.id)}
                        disabled={newConvMutation.isPending}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${dk ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
                          {c.name.charAt(0)}
                        </div>
                        <span className={`flex-1 text-sm font-medium truncate ${textPrimary}`}>{c.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-lg ${dk ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                          {c.role.replace(/_/g, " ").toLowerCase().replace(/^\w/, ch => ch.toUpperCase())}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <>
            {/* ── Non-SHOP list view (fake data) ── */}
            {view === "list" && (
              <div className={`flex-1 overflow-y-auto rounded-2xl border [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full ${cardBg}`}>
                {filteredFake.length === 0 ? (
                  <div className={`flex flex-col items-center justify-center h-full py-16 ${textMuted}`}>
                    <MessageCircle className="w-10 h-10 mb-3 opacity-20" />
                    <p className={`text-sm font-medium ${textPrimary}`}>No conversations yet</p>
                    <p className={`text-xs mt-1 opacity-50`}>for {service}</p>
                  </div>
                ) : (
                  filteredFake.map((t) => (
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

            {/* ── Non-SHOP chat view (fake data) ── */}
            {view === "chat" && active && (
              <div className={`flex-1 flex flex-col border rounded-2xl overflow-hidden ${cardBg}`}>
                <div className={`flex items-center gap-2.5 px-4 py-3 border-b shrink-0 ${dk ? "border-gray-700/60" : "border-gray-100"}`}>
                  <button
                    onClick={() => { setView("list"); }}
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
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full">
                  {active.messages.map((m, i) => (
                    <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        m.from === "me" ? "bg-amber-600 text-white rounded-br-sm" : `${chatBubbleBg} rounded-bl-sm`
                      }`}>
                        {m.text}
                        <span className={`block text-[10px] mt-1 opacity-60 ${m.from === "me" ? "text-right" : ""}`}>{m.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={`p-3 border-t flex gap-2 shrink-0 ${dk ? "border-gray-700/60" : "border-gray-100"}`}>
                  <Input
                    className={`flex-1 h-9 text-sm ${inputCls}`}
                    placeholder="Message…"
                    value={staticInput}
                    onChange={(e) => setStaticInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendStatic()}
                    data-testid="input-message"
                  />
                  <button
                    onClick={sendStatic}
                    data-testid="button-send-message"
                    className="w-9 h-9 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-colors shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
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
          ? "bg-gradient-to-br from-yellow-400 to-yellow-700 text-white shadow-amber-500/30 hover:shadow-amber-500/50"
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

  // Establish WebSocket connection for real-time message push on marketplace pages
  // (cafe routes use MarketplaceLayout instead of DashboardLayout which has its own useRealtime)
  useRealtime(user?.id);

  const { isVisitor, isPending, isApproved, hasCommercial } = computeAccess(user);
  const favTotalCount = useFavorites(selectTotalFavCount);
  const hydrateShop = useFavorites((s) => s.hydrateShop);
  const hydratePack = useFavorites((s) => s.hydratePack);
  const hydrateStores = useStoreFavorites((s) => s.hydrateStores);
  const { states: headerServiceStates } = useServiceStates();
  const { order: headerServiceOrder } = useServiceOrder();
  const { settings: messagingSettings } = useMessagingSettings();
  const messagesVisible = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || messagingSettings.globalVisible;

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

  const isDark = useThemeStore((s) => s.isDark);
  const toggle = useThemeStore((s) => s.toggle);
  const t = useTheme(isDark);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileInitialTab, setProfileInitialTab] = useState<"orders" | "reservations" | "dashboard" | "settings" | null>(null);
  const [favOpen, setFavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInitialService, setChatInitialService] = useState<ServiceId | undefined>(undefined);
  const [chatInitialConversationId, setChatInitialConversationId] = useState<number | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);

  // Watch the account-open-store so external routes can trigger the profile panel or chat
  const {
    shouldOpen,
    orderIdToOpen,
    initialTab,
    shouldOpenChat,
    initialChatService,
    initialConversationId,
    clearOpen,
  } = useAccountOpenStore();
  useEffect(() => {
    if (shouldOpen) {
      setProfileOpen(true);
      setPendingOrderId(orderIdToOpen);
      setProfileInitialTab(initialTab);
      clearOpen();
    }
    if (shouldOpenChat) {
      setChatInitialService(
        initialChatService === "SHOP" || initialChatService === "MAINTENANCE"
          ? initialChatService
          : undefined,
      );
      setChatInitialConversationId(initialConversationId);
      setChatOpen(true);
      clearOpen();
    }
  }, [shouldOpen, shouldOpenChat, initialChatService, initialConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cartCount = getTotalItemCount();
  const { data: unreadNotifData } = useUnreadNotificationCount();
  const unreadNotifCount = unreadNotifData?.count ?? 0;

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
            onClick={() => toggle()}
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

              {/* Notifications */}
              <button
                onClick={() => setNotifOpen(true)}
                className={`relative p-2 rounded-xl transition-colors ${
                  isDark
                    ? "text-gray-400 hover:text-white hover:bg-gray-800"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
                data-testid="button-notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 flex items-center justify-center w-4 h-4 text-[9px] font-bold text-white bg-amber-500 rounded-full">
                    {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
                  </span>
                )}
              </button>

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
                  <AvatarImage src={getAvatarUrl(user)} alt={user.name ?? "User"} />
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
              { id: "shop", orderId: "SHOP" as const, label: "SHOP", icon: ShoppingBag, href: "/products", service: null },
              { id: "maintenance", orderId: "MAINTENANCE" as const, label: "MAINTENANCE", icon: Wrench, href: "/maintenance", service: "MAINTENANCE" as const },
              { id: "print", orderId: "PRINT" as const, label: "PRINT", icon: Printer, href: "/print", service: "PRINTING" as const },
              // BARISTA now means Marketplace Baristas only; Barista Academy is its
              // own independent service/page — see the split at /barista vs /academy.
              { id: "barista", orderId: "BARISTA_MARKETPLACE" as const, label: "BARISTA", icon: Coffee, href: "/barista", service: "BARISTA_MARKETPLACE" as const },
              { id: "academy", orderId: "BARISTA_ACADEMY" as const, label: "ACADEMY", icon: GraduationCap, href: "/academy", service: "BARISTA_ACADEMY" as const },
              { id: "marketing", orderId: "MARKETING" as const, label: "MARKETING", icon: Megaphone, href: "/marketing", service: "MARKETING" as const },
            ].sort((a, b) => sortServiceIds([a.orderId, b.orderId], headerServiceOrder)[0] === a.orderId ? -1 : 1)
              .filter((svc) => !svc.service || headerServiceStates[svc.service] !== "HIDDEN").map((svc) => {
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
        <DraggableChatButton
          onClick={() => {
            setChatInitialService(undefined);
            setChatInitialConversationId(null);
            setChatOpen(true);
          }}
          isDark={isDark}
        />
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
        <Dialog open={profileOpen} onOpenChange={(v) => { setProfileOpen(v); if (!v) { setPendingOrderId(null); setProfileInitialTab(null); } }}>
          <DialogContent className="sm:max-w-md h-[88vh] max-h-[88vh] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
            <AccountPanel
              user={user}
              onClose={() => { setProfileOpen(false); setPendingOrderId(null); setProfileInitialTab(null); }}
              onLogout={() => { logout(); setProfileOpen(false); setPendingOrderId(null); setProfileInitialTab(null); }}
              initialOrderId={pendingOrderId}
              initialTab={profileInitialTab}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* ── Notifications Modal ── */}
      {user && <NotificationModal open={notifOpen} onOpenChange={setNotifOpen} isDark={isDark} />}

      {/* ── Favorites Modal ── */}
      {user && hasCommercial && (
        <Dialog open={favOpen} onOpenChange={setFavOpen}>
          <DialogContent className="sm:max-w-md h-[88vh] max-h-[88vh] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
            <FavoritesPanel onClose={() => setFavOpen(false)} />
          </DialogContent>
        </Dialog>
      )}

      {/* ── Chat Modal ── */}
      {user && hasCommercial && messagesVisible && (
        <Dialog
          open={chatOpen}
          onOpenChange={(open) => {
            setChatOpen(open);
            if (!open) {
              setChatInitialService(undefined);
              setChatInitialConversationId(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md h-[88vh] max-h-[88vh] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
            <MessagesPanel
              key={`${chatInitialService ?? "SHOP"}-${chatInitialConversationId ?? "new"}`}
              onClose={() => setChatOpen(false)}
              initialService={chatInitialService}
              initialConversationId={chatInitialConversationId}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* ── Product Quick View Modal ── */}
      <ProductQuickViewModal />
      <PackQuickViewModal />
    </div>
  );
}

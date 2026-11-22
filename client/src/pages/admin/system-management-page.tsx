import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Printer, Megaphone, Wrench, ShoppingBag, GripVertical, Eye, EyeOff, Clock, Sliders, LayoutTemplate, Image, FootprintsIcon, Plus, Trash2, ChevronDown, ChevronUp, CircleDollarSign, MessageSquare, GraduationCap, Users, Truck, Zap, Ban, Moon, Sun, SunMoon, Car, Store, ShieldCheck, LogIn, AlertTriangle, X, RotateCcw, Save, Palette, Tag, Percent, DollarSign, BarChart3, Gift, Star, Ticket, Coffee, Video, Music, LayoutDashboard, TrendingUp, Briefcase, ClipboardList, HelpCircle, Warehouse, MessageCircle, Bell, Folder, Package, Layers, FileText } from "lucide-react";
import { useDeliveryPricingSettings, useUpdateDeliveryPricingSettings, VEHICLE_TYPE_LABELS, type DeliveryVehicleType, type DeliveryPricingSettings } from "@/hooks/use-delivery-ecosystem";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useFormatCurrency } from "@/hooks/use-currency";
import { formatDate } from "@/lib/format";
import { usePagination, DataPagination } from "@/components/ui/data-pagination";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ServiceKey, ServiceState, ServiceStatesMap } from "@/hooks/use-service-states";
import { useServiceOrder, type MarketplaceServiceId } from "@/hooks/use-service-order";
import { useHeroActionSettings, type HeroService, type HeroActionSettingsMap } from "@/hooks/use-hero-actions";
import { useServiceHeroConfigMap, DEFAULT_SERVICE_HERO_CONFIG, type ServiceHeroConfig, type ServiceHeroConfigMap } from "@/hooks/use-service-hero-config";
import { ServiceHeroShell, H_ALIGN_ICON_MX, H_ALIGN_ROW_JUSTIFY, getHeroSubtitleColorStyle } from "@/components/shared/service-hero";
// Same image assets as the real BARISTA/ACADEMY, PRINT and MARKETING heroes
// (barista-page.tsx/barista-academy-page.tsx, print-page.tsx, marketing-page.tsx)
// — reused here only so the Admin preview's default background (shown when no
// custom image/gradient is configured) matches the real coffee-owner hero
// exactly, instead of a generic placeholder.
import baristaHeroImg from "@assets/8d80708f-be87-4e8d-8805-f60e3c292914-1000x562.5-rjZKXkudAsN4bH_1780680229193.jpg";
import marketingHeroImg from "@assets/image_1780681027926.png";
import printBannerImg from "@assets/1000_F_446608261_m4mqK7D6A8O68SkqWo4ea4VQgrGVbRHY_(1)_1780853922496.jpg";
import { useAccountDarkModeSettings, type DarkModeAccount, type AccountDarkModeSettingsMap, type AccountThemeMode } from "@/hooks/use-account-dark-mode";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import type { LandingConfig, HeroSlide } from "@shared/schema";

// ── System Management horizontal switcher ─────────────────────────────────────
// Groups the page's many configuration areas into logical tabs (task: "the page has become
// too long"). Purely a UI reorganization — every component below still renders exactly as
// before, just conditionally by active tab instead of always stacked.

// "promotion" → "supplier" (task: "Supplier System Management — Rename Promotion
// Section & Add Discount Code Visibility Controls"): this used to be a single
// Promotion-only settings section; it now hosts an internal switcher (Promotion /
// Codes promotionnels, see SUPPLIER_SUB_SECTIONS below) — the id/type rename is a
// purely internal identifier change (never user-facing on its own) to keep the code
// readable now that this top-level tab covers more than just Promotions. Only the
// displayed label actually needed to change per the task; renaming the id too avoids
// a confusingly-named "promotion" tab that now also contains Discount Codes settings.
type SystemManagementSection = "landing" | "delivery" | "services" | "messages" | "global" | "supplier";

const SYSTEM_MANAGEMENT_SECTIONS: { id: SystemManagementSection; label: string; icon: any }[] = [
  { id: "landing",  label: "Landing Page",     icon: LayoutTemplate },
  { id: "delivery", label: "Delivery",         icon: Truck },
  { id: "services", label: "Services",         icon: Zap },
  { id: "messages", label: "Messages System",  icon: MessageSquare },
  { id: "global",   label: "Global Settings",  icon: Sliders },
  { id: "supplier", label: "Supplier",         icon: Store },
];

// Internal switcher inside the "Supplier" top-level tab (task's Part 2): Promotion
// (the existing, unmodified settings — see PromotionSettingsSection) and Codes
// promotionnels (new — see DiscountCodeSettingsSection).
// "Onglet" (task: "Admin Supplier Settings — Add Tab Visibility Management") added
// as a third sub-section — controls visibility of the existing Returns and Cafés
// Supplier nav tabs (see SupplierTabVisibilitySection below), independent of the
// other two sub-sections.
// "Store" (task: "Admin Supplier Settings — Add Tab Visibility Management" — Store)
// added as a fourth sub-section — controls global visibility of the existing
// Supplier Store page/controls/fields (see StoreSettingsSection below). Order
// follows the task's own "Expected switcher: Onglet | Store | Promotion | Codes
// promotionnels" — a pure reordering of the switcher's display order, the
// Promotion/Codes promotionnels settings and components themselves are untouched.
// "categories"/"products" (task: "Admin Supplier Settings — Catégories & Produits Tab
// Visibility Management") added as two further sub-sections — control visibility of the
// existing Supplier Catégories (/supplier/categories) and Produits (/supplier/products)
// nav entries and two of each page's own in-page sections/tabs (see
// CategoriesTabVisibilitySection/ProductsTabVisibilitySection below). Order follows the
// task's own "Expected switcher: Onglet | Store | Catégories | Produits | Promotion | Codes
// promotionnels" — a pure reordering/insertion, every other sub-section is untouched.
type SupplierSubSection = "tabs" | "store" | "categories" | "products" | "promotion" | "discount-codes";
const SUPPLIER_SUB_SECTIONS: { id: SupplierSubSection; label: string; icon: any }[] = [
  { id: "tabs", label: "Onglet", icon: Eye },
  { id: "store", label: "Store", icon: Store },
  { id: "categories", label: "Catégories", icon: Folder },
  { id: "products", label: "Produits", icon: Package },
  { id: "promotion", label: "Promotion", icon: Tag },
  { id: "discount-codes", label: "Codes promotionnels", icon: Ticket },
];

// ── Service visibility ────────────────────────────────────────────────────────

// The old combined "Barista" service/card is retired — Barista Marketplace and
// Barista Academy are now two fully independent services, each with its own
// discovery page (/barista, /academy) AND its own tab in the Coffee Owner's
// "My Account → Reservations" switcher, both controlled by the single card
// below (one source of truth for both surfaces — no "(réservations)"-only card).
const SERVICES: { key: ServiceKey; label: string; description: string; icon: any }[] = [
  { key: "PRINTING",            label: "PRINTING",             description: "Marketplace PRINT — services d'impression pour les cafés.", icon: Printer },
  { key: "BARISTA_MARKETPLACE", label: "BARISTAS", description: "Page /barista — recrutement de baristas indépendants.", icon: Users },
  { key: "BARISTA_ACADEMY",     label: "ACADEMY",      description: "Page /academy — formations et cours barista.", icon: GraduationCap },
  { key: "MARKETING",           label: "MARKETING",            description: "Services MARKETING — agences et prestataires marketing.",   icon: Megaphone },
  { key: "MAINTENANCE",         label: "MAINTENANCE",          description: "Services MAINTENANCE — techniciens pour équipements café.", icon: Wrench },
];

const SERVICE_ORDER_CARDS: { id: MarketplaceServiceId; key?: ServiceKey; label: string; description: string; icon: any }[] = [
  { id: "SHOP", key: undefined, label: "Shop", description: "Marketplace SHOP — produits professionnels pour les cafés.", icon: ShoppingBag },
  ...SERVICES.map((service) => ({ id: service.key === "PRINTING" ? "PRINT" : service.key, key: service.key, label: service.label, description: service.description, icon: service.icon })) as any,
];

const STATE_OPTIONS: { value: ServiceState; label: string; icon: any; badgeClass: string }[] = [
  { value: "VISIBLE",     label: "Visible",      icon: Eye,    badgeClass: "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30" },
  { value: "COMING_SOON", label: "Coming Soon",  icon: Clock,  badgeClass: "bg-amber-400 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30" },
  { value: "HIDDEN",      label: "Hidden",       icon: EyeOff, badgeClass: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-500/15 dark:text-gray-400 dark:border-gray-500/30" },
];

type MessagingSettings = {
  globalVisible: boolean;
  supplierMessagingEnabled: boolean;
  maintenanceMessagingEnabled: boolean;
  baristaMessagingEnabled: boolean;
  academyMessagingEnabled: boolean;
  broadcastsEnabled: boolean;
  gracePeriodMinutes: number;
};

function MessagesSystemSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<MessagingSettings>({ queryKey: ["/api/messages/settings"] });
  const [local, setLocal] = useState<MessagingSettings | null>(null);

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<MessagingSettings>) =>
      apiRequest("PATCH", "/api/admin/messages/settings", updates),
    onSuccess: async (response) => {
      const saved = await response.json();
      setLocal(saved);
      queryClient.setQueryData(["/api/messages/settings"], saved);
      toast({ title: "Messages System updated" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Failed to update Messages System", description: error?.message }),
  });

  const value = local ?? settings;
  const update = (field: keyof MessagingSettings, next: boolean | number) => {
    if (!value) return;
    setLocal({ ...value, [field]: next });
    saveMutation.mutate({ [field]: next });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/10 rounded-xl p-3"><MessageSquare className="w-5 h-5 text-blue-600" /></div>
          <div>
            <CardTitle className="text-base">Messages System</CardTitle>
            <CardDescription className="pt-1">Control messaging availability without deleting conversations or messages.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!value ? <Skeleton className="h-20 w-full" /> : (
          <>
            {([
              ["globalVisible", "Messages visibility", "Allow affected users to access Messages."],
              ["supplierMessagingEnabled", "Supplier ↔ Coffee Owner", "Allow conversations for eligible active Shop orders."],
              ["maintenanceMessagingEnabled", "Maintenance ↔ Coffee Owner", "Allow conversations for eligible active reservations."],
              ["baristaMessagingEnabled", "Barista ↔ Coffee Owner", "Allow conversations for eligible active Barista Marketplace requests."],
              ["academyMessagingEnabled", "Academy ↔ Coffee Owner", "Allow conversations for eligible active Academy registrations."],
              ["broadcastsEnabled", "Admin broadcasts", "Allow new broadcasts; existing broadcast data is preserved."],
            ] as const).map(([field, label, description]) => (
              <div key={field} className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </div>
                <Switch
                  checked={value[field] as boolean}
                  onCheckedChange={(checked) => update(field, checked)}
                  disabled={saveMutation.isPending}
                  aria-label={label}
                />
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
              <div>
                <p className="text-sm font-medium">Post-closure conversation window</p>
                <p className="text-xs text-muted-foreground mt-0.5">Minutes users may continue messaging after an order or reservation closes.</p>
              </div>
              <Input
                type="number"
                min={1}
                max={240}
                className="w-24"
                value={value.gracePeriodMinutes}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isInteger(next) && next >= 1 && next <= 240) update("gracePeriodMinutes", next);
                }}
                disabled={saveMutation.isPending}
                aria-label="Post-closure conversation window in minutes"
              />
            </div>
            <p className="text-xs text-muted-foreground">Admins always retain access to manage Messages, including when visibility is hidden.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Promotion Settings (Admin → System Management → Promotion) ───────────────
// Admin-controlled AVAILABILITY of the Supplier Promotions feature — entirely
// separate from promotion eligibility/pricing (server/promotions-engine.ts), never
// touched here. Reuses the actual promotionTypeEnum values already defined in
// shared/schema.ts (never an invented type) and the French labels already
// established on the Supplier's own Créer une promotion form
// (client/src/pages/supplier/promotions-page.tsx's TYPE_LABELS), kept identical here
// for consistency. Same local-state + mutation + setQueryData pattern as
// MessagesSystemSection above.

type PromotionSettings = { globalVisible: boolean };
type AdminPromotionType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'BUY_X_GET_Y' | 'QUANTITY_TIER' | 'CATEGORY_DISCOUNT' | 'FREE_SHIPPING' | 'GIFT' | 'MIN_ORDER_AMOUNT' | 'MIN_QUANTITY' | 'FIRST_ORDER';
type PromotionTypeSettingsMap = Record<AdminPromotionType, boolean>;

const PROMOTION_TYPES: { type: AdminPromotionType; label: string; description: string; icon: any }[] = [
  { type: "PERCENTAGE",       label: "Réduction en %",              description: "Réduction en pourcentage sur le total ou sur des produits/catégories spécifiques.", icon: Percent },
  { type: "FIXED_AMOUNT",     label: "Montant fixe",                description: "Montant fixe déduit du prix.", icon: DollarSign },
  { type: "BUY_X_GET_Y",      label: "Achetez X, obtenez Y",        description: "Achetez X articles, obtenez Y gratuitement.", icon: ShoppingBag },
  { type: "QUANTITY_TIER",    label: "Tarification par palier",     description: "Le prix unitaire diminue selon la quantité achetée.", icon: BarChart3 },
  { type: "CATEGORY_DISCOUNT", label: "Réduction par catégorie",    description: "Réduction en pourcentage ou montant fixe sur des catégories spécifiques.", icon: Tag },
  { type: "FREE_SHIPPING",    label: "Livraison gratuite",          description: "Livraison gratuite, avec un montant minimum de commande optionnel.", icon: Truck },
  { type: "GIFT",             label: "Cadeau gratuit",               description: "Cadeau offert après un montant minimum de commande.", icon: Gift },
  { type: "MIN_ORDER_AMOUNT", label: "Montant minimum de commande", description: "Réduction accordée à partir d'un montant minimum de commande.", icon: DollarSign },
  { type: "MIN_QUANTITY",     label: "Quantité minimum",             description: "Réduction accordée à partir d'une quantité minimale d'articles achetés.", icon: ShoppingBag },
  { type: "FIRST_ORDER",      label: "Première commande",            description: "Réduction sur la première commande passée auprès de ce fournisseur.", icon: Star },
];

function PromotionSettingsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: globalSettings } = useQuery<PromotionSettings>({ queryKey: ["/api/promotion-settings"] });
  const { data: typeSettings } = useQuery<PromotionTypeSettingsMap>({ queryKey: ["/api/promotion-type-settings"] });
  const [localGlobal, setLocalGlobal] = useState<PromotionSettings | null>(null);

  useEffect(() => {
    if (globalSettings) setLocalGlobal(globalSettings);
  }, [globalSettings]);

  const globalValue = localGlobal ?? globalSettings;

  const saveGlobal = useMutation({
    mutationFn: (updates: Partial<PromotionSettings>) =>
      apiRequest("PATCH", "/api/admin/promotion-settings", updates),
    onSuccess: async (response) => {
      const saved = await response.json();
      setLocalGlobal(saved);
      queryClient.setQueryData(["/api/promotion-settings"], saved);
      toast({ title: "Disponibilité des promotions mise à jour" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: error?.message }),
  });

  const saveType = useMutation({
    mutationFn: ({ type, enabled }: { type: AdminPromotionType; enabled: boolean }) =>
      apiRequest("PATCH", `/api/admin/promotion-type-settings/${type}`, { enabled }),
    onSuccess: async (response) => {
      const saved = await response.json();
      queryClient.setQueryData(["/api/promotion-type-settings"], saved);
      toast({ title: "Type de promotion mis à jour" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: error?.message }),
  });

  const statusBadgeClass = (enabled: boolean) => enabled
    ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30"
    : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-500/15 dark:text-gray-400 dark:border-gray-500/30";

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/10 rounded-xl p-3"><Tag className="w-5 h-5 text-amber-600" /></div>
            <div>
              <CardTitle className="text-base">Disponibilité des promotions</CardTitle>
              <CardDescription className="pt-1">Contrôlez l'accès à la fonctionnalité Promotions dans l'espace fournisseur.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!globalValue ? <Skeleton className="h-16 w-full" /> : (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
              <div>
                <p className="text-sm font-medium">Onglet Promotions</p>
                <p className="text-xs text-muted-foreground mt-0.5">Autorise les fournisseurs à accéder à la gestion des promotions (/supplier/promotions).</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline" className={`text-xs ${statusBadgeClass(globalValue.globalVisible)}`} data-testid="badge-promotions-global-status">
                  {globalValue.globalVisible ? "Visible" : "Masqué"}
                </Badge>
                <Switch
                  checked={globalValue.globalVisible}
                  onCheckedChange={(checked) => { setLocalGlobal({ globalVisible: checked }); saveGlobal.mutate({ globalVisible: checked }); }}
                  disabled={saveGlobal.isPending}
                  aria-label="Onglet Promotions"
                  data-testid="switch-promotions-global-visible"
                />
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Masquer cet onglet ne supprime ni ne modifie les promotions déjà créées par les fournisseurs ; les commandes et réductions en cours restent inchangées.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/10 rounded-xl p-3"><Percent className="w-5 h-5 text-amber-600" /></div>
            <div>
              <CardTitle className="text-base">Types de promotions disponibles</CardTitle>
              <CardDescription className="pt-1">Activez ou désactivez les types de promotions que les fournisseurs peuvent utiliser lors de la création ou de la modification de leurs promotions.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!typeSettings ? <Skeleton className="h-64 w-full" /> : (
            PROMOTION_TYPES.map(({ type, label, description, icon: Icon }) => {
              const enabled = typeSettings[type] !== false;
              const isPending = saveType.isPending && saveType.variables?.type === type;
              return (
                <div key={type} className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3" data-testid={`row-promotion-type-${type.toLowerCase()}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="bg-muted rounded-lg p-2 shrink-0"><Icon className="w-4 h-4 text-foreground/70" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="outline" className={`text-xs ${statusBadgeClass(enabled)}`} data-testid={`badge-status-promotion-type-${type.toLowerCase()}`}>
                      {enabled ? "Disponible" : "Masqué"}
                    </Badge>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(checked) => saveType.mutate({ type, enabled: checked })}
                      disabled={isPending}
                      aria-label={label}
                      data-testid={`switch-promotion-type-${type.toLowerCase()}`}
                    />
                  </div>
                </div>
              );
            })
          )}
          <p className="text-xs text-muted-foreground">Masquer un type ne modifie ni ne désactive les promotions existantes qui l'utilisent déjà ; elles restent gérables par leur fournisseur avec leur type d'origine.</p>
        </CardContent>
      </Card>
    </>
  );
}

// ── Discount Codes (Supplier) visibility ───────────────────────────────────────
// New sub-tab under "Supplier" (task: "Supplier System Management — Rename
// Promotion Section & Add Discount Code Visibility Controls"). Same single
// auto-seeded settings row + Switch/Badge pattern as PromotionSettingsSection
// above, against the new /api/discount-code-settings + PATCH
// /api/admin/discount-code-settings endpoints. Two independent settings —
// see server/routes/shop-catalog.routes.ts's requireDiscountCodesEnabled and
// the newCodeButtonVisible check inside POST /api/discount-codes for backend
// enforcement; this UI never deletes/deactivates/modifies existing codes.
type DiscountCodeSettingsAdmin = { tabVisible: boolean; newCodeButtonVisible: boolean };

function DiscountCodeSettingsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<DiscountCodeSettingsAdmin>({ queryKey: ["/api/discount-code-settings"] });
  const [local, setLocal] = useState<DiscountCodeSettingsAdmin | null>(null);

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  const value = local ?? settings;

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<DiscountCodeSettingsAdmin>) =>
      apiRequest("PATCH", "/api/admin/discount-code-settings", updates),
    onSuccess: async (response) => {
      const saved = await response.json();
      setLocal(saved);
      queryClient.setQueryData(["/api/discount-code-settings"], saved);
      toast({ title: "Paramètres des codes promotionnels mis à jour" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: error?.message }),
  });

  const statusBadgeClass = (enabled: boolean) => enabled
    ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30"
    : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-500/15 dark:text-gray-400 dark:border-gray-500/30";

  const update = (field: keyof DiscountCodeSettingsAdmin, next: boolean) => {
    if (!value) return;
    setLocal({ ...value, [field]: next });
    saveMutation.mutate({ [field]: next });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-sky-500/10 rounded-xl p-3"><Ticket className="w-5 h-5 text-sky-600" /></div>
          <div>
            <CardTitle className="text-base">Codes promotionnels</CardTitle>
            <CardDescription className="pt-1">Contrôlez l'accès à la fonctionnalité Codes promotionnels dans l'espace fournisseur.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!value ? <Skeleton className="h-32 w-full" /> : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
              <div>
                <p className="text-sm font-medium">Onglet Codes promotionnels</p>
                <p className="text-xs text-muted-foreground mt-0.5">Autorisez les fournisseurs à accéder à la gestion de leurs codes promotionnels dans leur espace fournisseur.</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.tabVisible)}`} data-testid="badge-discount-codes-tab-status">
                  {value.tabVisible ? "Visible" : "Masqué"}
                </Badge>
                <Switch
                  checked={value.tabVisible}
                  onCheckedChange={(checked) => update("tabVisible", checked)}
                  disabled={saveMutation.isPending}
                  aria-label="Onglet Codes promotionnels"
                  data-testid="switch-discount-codes-tab-visible"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
              <div>
                <p className="text-sm font-medium">Bouton Nouveau code</p>
                <p className="text-xs text-muted-foreground mt-0.5">Autorisez les fournisseurs à créer de nouveaux codes promotionnels.</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.newCodeButtonVisible)}`} data-testid="badge-discount-codes-new-button-status">
                  {value.newCodeButtonVisible ? "Visible" : "Masqué"}
                </Badge>
                <Switch
                  checked={value.newCodeButtonVisible}
                  onCheckedChange={(checked) => update("newCodeButtonVisible", checked)}
                  disabled={saveMutation.isPending}
                  aria-label="Bouton Nouveau code"
                  data-testid="switch-discount-codes-new-button-visible"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Masquer l'un ou l'autre ne supprime, ne désactive ni ne modifie les codes déjà créés par les fournisseurs ; l'historique d'utilisation et les commandes restent inchangés.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Supplier Tab Visibility (Returns / Cafés / Performance) ───────────────────
// New sub-tab under "Supplier" (task: "Admin Supplier Settings — Add Tab
// Visibility Management"). Same single auto-seeded settings row + Switch/Badge
// pattern as DiscountCodeSettingsSection above, against the new
// /api/supplier-tab-settings + PATCH /api/admin/supplier-tab-settings endpoints.
// Two independent settings — see server/routes/shared/middleware.ts's
// requireCafesTabEnabled and the SUPPLIER-scoped checks inside GET/PATCH
// /api/returns for backend enforcement; this UI never deletes/modifies existing
// returns or café data.
// dashboardTabVisible/analyticsTabVisible/earningsTabVisible (task: "Admin
// Supplier Settings — Supplier Performance Tab Visibility Management") are
// three further independent settings on this exact same row;
// performanceTabVisible is NEVER sent in a PATCH — it's always derived
// server-side from those three (see platform-settings.storage.ts) and shown
// here purely as a read-only status, never its own Switch.
type SupplierTabSettingsAdmin = {
  returnsTabVisible: boolean;
  cafesTabVisible: boolean;
  dashboardTabVisible: boolean;
  analyticsTabVisible: boolean;
  earningsTabVisible: boolean;
  performanceTabVisible: boolean;
  helpCenterTabVisible: boolean;
  inventoryTabVisible: boolean;
  messagesTabVisible: boolean;
  notificationsTabVisible: boolean;
  reviewsTabVisible: boolean;
  communicationTabVisible: boolean;
  categoriesTabVisible: boolean;
  myCategoriesVisible: boolean;
  categoryRequestsVisible: boolean;
  productsTabVisible: boolean;
  newProductVisible: boolean;
  packVisible: boolean;
  paymentsTabVisible: boolean;
  invoicesTabVisible: boolean;
};

function SupplierTabVisibilitySection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<SupplierTabSettingsAdmin>({ queryKey: ["/api/supplier-tab-settings"] });
  const [local, setLocal] = useState<SupplierTabSettingsAdmin | null>(null);

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  const value = local ?? settings;

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<SupplierTabSettingsAdmin>) =>
      apiRequest("PATCH", "/api/admin/supplier-tab-settings", updates),
    onSuccess: async (response) => {
      const saved = await response.json();
      setLocal(saved);
      queryClient.setQueryData(["/api/supplier-tab-settings"], saved);
      toast({ title: "Paramètres des onglets mis à jour" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: error?.message }),
  });

  const statusBadgeClass = (enabled: boolean) => enabled
    ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30"
    : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-500/15 dark:text-gray-400 dark:border-gray-500/30";

  const update = (field: keyof SupplierTabSettingsAdmin, next: boolean) => {
    if (!value) return;
    setLocal({ ...value, [field]: next });
    saveMutation.mutate({ [field]: next });
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500/10 rounded-xl p-3"><Eye className="w-5 h-5 text-indigo-600" /></div>
            <div>
              <CardTitle className="text-base">Visibilité des onglets</CardTitle>
              <CardDescription className="pt-1">Contrôlez l'accès aux onglets Retours et Cafés dans l'espace fournisseur.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!value ? <Skeleton className="h-32 w-full" /> : (
            <>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted rounded-lg p-2 shrink-0"><RotateCcw className="w-4 h-4 text-foreground/70" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Onglet Retours</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Contrôlez l'accès à l'onglet Retours dans l'espace fournisseur.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.returnsTabVisible)}`} data-testid="badge-supplier-tab-returns-status">
                    {value.returnsTabVisible ? "Visible" : "Masqué"}
                  </Badge>
                  <Switch
                    checked={value.returnsTabVisible}
                    onCheckedChange={(checked) => update("returnsTabVisible", checked)}
                    disabled={saveMutation.isPending}
                    aria-label="Onglet Retours"
                    data-testid="switch-supplier-tab-returns-visible"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted rounded-lg p-2 shrink-0"><Coffee className="w-4 h-4 text-foreground/70" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Onglet Cafés</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Contrôlez l'accès à l'onglet Cafés dans l'espace fournisseur.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.cafesTabVisible)}`} data-testid="badge-supplier-tab-cafes-status">
                    {value.cafesTabVisible ? "Visible" : "Masqué"}
                  </Badge>
                  <Switch
                    checked={value.cafesTabVisible}
                    onCheckedChange={(checked) => update("cafesTabVisible", checked)}
                    disabled={saveMutation.isPending}
                    aria-label="Onglet Cafés"
                    data-testid="switch-supplier-tab-cafes-visible"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted rounded-lg p-2 shrink-0"><HelpCircle className="w-4 h-4 text-foreground/70" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Onglet Centre d'aide</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Contrôlez l'accès à l'onglet Centre d'aide dans l'espace fournisseur.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.helpCenterTabVisible)}`} data-testid="badge-supplier-tab-helpcenter-status">
                    {value.helpCenterTabVisible ? "Visible" : "Masqué"}
                  </Badge>
                  <Switch
                    checked={value.helpCenterTabVisible}
                    onCheckedChange={(checked) => update("helpCenterTabVisible", checked)}
                    disabled={saveMutation.isPending}
                    aria-label="Onglet Centre d'aide"
                    data-testid="switch-supplier-tab-helpcenter-visible"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted rounded-lg p-2 shrink-0"><Warehouse className="w-4 h-4 text-foreground/70" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Onglet Stock</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Contrôlez l'accès à l'onglet Stock dans l'espace fournisseur.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.inventoryTabVisible)}`} data-testid="badge-supplier-tab-inventory-status">
                    {value.inventoryTabVisible ? "Visible" : "Masqué"}
                  </Badge>
                  <Switch
                    checked={value.inventoryTabVisible}
                    onCheckedChange={(checked) => update("inventoryTabVisible", checked)}
                    disabled={saveMutation.isPending}
                    aria-label="Onglet Stock"
                    data-testid="switch-supplier-tab-inventory-visible"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted rounded-lg p-2 shrink-0"><DollarSign className="w-4 h-4 text-foreground/70" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Onglet Paiements</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Contrôlez l'accès à l'onglet Paiements dans l'espace fournisseur.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.paymentsTabVisible)}`} data-testid="badge-supplier-tab-payments-status">
                    {value.paymentsTabVisible ? "Visible" : "Masqué"}
                  </Badge>
                  <Switch
                    checked={value.paymentsTabVisible}
                    onCheckedChange={(checked) => update("paymentsTabVisible", checked)}
                    disabled={saveMutation.isPending}
                    aria-label="Onglet Paiements"
                    data-testid="switch-supplier-tab-payments-visible"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted rounded-lg p-2 shrink-0"><FileText className="w-4 h-4 text-foreground/70" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Onglet Factures</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Contrôlez l'accès à l'onglet Factures dans l'espace fournisseur.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.invoicesTabVisible)}`} data-testid="badge-supplier-tab-invoices-status">
                    {value.invoicesTabVisible ? "Visible" : "Masqué"}
                  </Badge>
                  <Switch
                    checked={value.invoicesTabVisible}
                    onCheckedChange={(checked) => update("invoicesTabVisible", checked)}
                    disabled={saveMutation.isPending}
                    aria-label="Onglet Factures"
                    data-testid="switch-supplier-tab-invoices-visible"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Masquer l'un ou l'autre ne supprime, ne modifie ni ne désactive les retours, cafés, support, stock, paiements ou factures déjà existants ; ces réglages sont indépendants les uns des autres.</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Visibilité de l'onglet Communication ── mirrors "Visibilité de l'onglet
          Performance" below exactly: the parent "Onglet Communication" row is
          READ-ONLY (Badge only, no Switch) — its value is always derived
          server-side from the three child settings, so there is no independently
          editable parent control to conflict with them. */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500/10 rounded-xl p-3"><MessageCircle className="w-5 h-5 text-indigo-600" /></div>
            <div>
              <CardTitle className="text-base">Visibilité de l'onglet Communication</CardTitle>
              <CardDescription className="pt-1">Contrôlez l'accès à l'espace Communication et à ses différentes sections dans l'espace fournisseur.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!value ? <Skeleton className="h-48 w-full" /> : (
            <>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3 bg-muted/30" data-testid="row-supplier-tab-communication-parent">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted rounded-lg p-2 shrink-0"><Eye className="w-4 h-4 text-foreground/70" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Onglet Communication</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Contrôlez la visibilité de l'espace Communication dans l'espace fournisseur.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.communicationTabVisible)}`} data-testid="badge-supplier-tab-communication-status">
                    {value.communicationTabVisible ? "Visible" : "Masqué"}
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">Visible dès qu'au moins un des trois onglets ci-dessous est activé ; masqué uniquement si les trois sont désactivés. Ce statut est automatique et ne se configure pas directement.</p>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted rounded-lg p-2 shrink-0"><MessageCircle className="w-4 h-4 text-foreground/70" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Onglet Messages</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Autorisez les fournisseurs à accéder aux messages de leur espace Communication.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.messagesTabVisible)}`} data-testid="badge-supplier-tab-messages-status">
                    {value.messagesTabVisible ? "Visible" : "Masqué"}
                  </Badge>
                  <Switch
                    checked={value.messagesTabVisible}
                    onCheckedChange={(checked) => update("messagesTabVisible", checked)}
                    disabled={saveMutation.isPending}
                    aria-label="Onglet Messages"
                    data-testid="switch-supplier-tab-messages-visible"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted rounded-lg p-2 shrink-0"><Bell className="w-4 h-4 text-foreground/70" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Onglet Notifications</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Autorisez les fournisseurs à accéder aux notifications de leur espace Communication.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.notificationsTabVisible)}`} data-testid="badge-supplier-tab-notifications-status">
                    {value.notificationsTabVisible ? "Visible" : "Masqué"}
                  </Badge>
                  <Switch
                    checked={value.notificationsTabVisible}
                    onCheckedChange={(checked) => update("notificationsTabVisible", checked)}
                    disabled={saveMutation.isPending}
                    aria-label="Onglet Notifications"
                    data-testid="switch-supplier-tab-notifications-visible"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted rounded-lg p-2 shrink-0"><Star className="w-4 h-4 text-foreground/70" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Onglet Avis</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Autorisez les fournisseurs à accéder aux avis de leur espace Communication.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.reviewsTabVisible)}`} data-testid="badge-supplier-tab-reviews-status">
                    {value.reviewsTabVisible ? "Visible" : "Masqué"}
                  </Badge>
                  <Switch
                    checked={value.reviewsTabVisible}
                    onCheckedChange={(checked) => update("reviewsTabVisible", checked)}
                    disabled={saveMutation.isPending}
                    aria-label="Onglet Avis"
                    data-testid="switch-supplier-tab-reviews-visible"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Ces trois réglages sont indépendants : masquer l'un ne modifie, ne supprime ni ne désactive jamais les messages, notifications ou avis déjà existants des deux autres.</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Visibilité de l'onglet Performance ── task: "Admin Supplier Settings —
          Supplier Performance Tab Visibility Management". The parent "Onglet
          Performance" row is READ-ONLY (Badge only, no Switch) — its value is
          always derived server-side from the three child settings below, so
          there is no independently editable parent control to conflict with them. */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500/10 rounded-xl p-3"><LayoutDashboard className="w-5 h-5 text-indigo-600" /></div>
            <div>
              <CardTitle className="text-base">Visibilité de l'onglet Performance</CardTitle>
              <CardDescription className="pt-1">Contrôlez l'accès à l'espace Performance et à ses différentes sections dans l'espace fournisseur.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!value ? <Skeleton className="h-48 w-full" /> : (
            <>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3 bg-muted/30" data-testid="row-supplier-tab-performance-parent">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted rounded-lg p-2 shrink-0"><Eye className="w-4 h-4 text-foreground/70" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Onglet Performance</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Contrôlez la visibilité de l'espace Performance dans l'espace fournisseur.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.performanceTabVisible)}`} data-testid="badge-supplier-tab-performance-status">
                    {value.performanceTabVisible ? "Visible" : "Masqué"}
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">Visible dès qu'au moins un des trois onglets ci-dessous est activé ; masqué uniquement si les trois sont désactivés. Ce statut est automatique et ne se configure pas directement.</p>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted rounded-lg p-2 shrink-0"><LayoutDashboard className="w-4 h-4 text-foreground/70" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Onglet Dashboard</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Autorisez les fournisseurs à accéder au tableau de bord de leur espace Performance.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.dashboardTabVisible)}`} data-testid="badge-supplier-tab-dashboard-status">
                    {value.dashboardTabVisible ? "Visible" : "Masqué"}
                  </Badge>
                  <Switch
                    checked={value.dashboardTabVisible}
                    onCheckedChange={(checked) => update("dashboardTabVisible", checked)}
                    disabled={saveMutation.isPending}
                    aria-label="Onglet Dashboard"
                    data-testid="switch-supplier-tab-dashboard-visible"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted rounded-lg p-2 shrink-0"><BarChart3 className="w-4 h-4 text-foreground/70" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Onglet Analytics</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Autorisez les fournisseurs à accéder aux statistiques et analyses de leur espace Performance.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.analyticsTabVisible)}`} data-testid="badge-supplier-tab-analytics-status">
                    {value.analyticsTabVisible ? "Visible" : "Masqué"}
                  </Badge>
                  <Switch
                    checked={value.analyticsTabVisible}
                    onCheckedChange={(checked) => update("analyticsTabVisible", checked)}
                    disabled={saveMutation.isPending}
                    aria-label="Onglet Analytics"
                    data-testid="switch-supplier-tab-analytics-visible"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-muted rounded-lg p-2 shrink-0"><TrendingUp className="w-4 h-4 text-foreground/70" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Onglet Earnings</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Autorisez les fournisseurs à accéder aux revenus de leur espace Performance.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.earningsTabVisible)}`} data-testid="badge-supplier-tab-earnings-status">
                    {value.earningsTabVisible ? "Visible" : "Masqué"}
                  </Badge>
                  <Switch
                    checked={value.earningsTabVisible}
                    onCheckedChange={(checked) => update("earningsTabVisible", checked)}
                    disabled={saveMutation.isPending}
                    aria-label="Onglet Earnings"
                    data-testid="switch-supplier-tab-earnings-visible"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Ces trois réglages sont indépendants : masquer l'un ne modifie, ne supprime ni ne réinitialise jamais les données, statistiques, revenus ou calculs des deux autres.</p>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ── Catégories (Supplier) tab visibility ──────────────────────────────────────
// New sub-tab under "Supplier" (task: "Admin Supplier Settings — Catégories & Produits Tab
// Visibility Management"). Same single auto-seeded settings row + Switch/Badge pattern as
// SupplierTabVisibilitySection above, against the SAME /api/supplier-tab-settings +
// PATCH /api/admin/supplier-tab-settings endpoints (React Query dedupes the shared cache key
// automatically). Unlike Performance/Communication's read-only derived parent, "Onglet
// Catégories" IS its own independently editable master Switch — it overrides both children
// to hidden when off, and the status badge below additionally reflects the auto-hide that
// happens when both children are off even while this switch stays on (see
// categoriesEffectivelyVisible in use-supplier-tab-settings.ts, mirrored here for display).
function CategoriesTabVisibilitySection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<SupplierTabSettingsAdmin>({ queryKey: ["/api/supplier-tab-settings"] });
  const [local, setLocal] = useState<SupplierTabSettingsAdmin | null>(null);

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  const value = local ?? settings;

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<SupplierTabSettingsAdmin>) =>
      apiRequest("PATCH", "/api/admin/supplier-tab-settings", updates),
    onSuccess: async (response) => {
      const saved = await response.json();
      setLocal(saved);
      queryClient.setQueryData(["/api/supplier-tab-settings"], saved);
      toast({ title: "Paramètres des onglets mis à jour" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: error?.message }),
  });

  const statusBadgeClass = (enabled: boolean) => enabled
    ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30"
    : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-500/15 dark:text-gray-400 dark:border-gray-500/30";

  const update = (field: keyof SupplierTabSettingsAdmin, next: boolean) => {
    if (!value) return;
    setLocal({ ...value, [field]: next });
    saveMutation.mutate({ [field]: next });
  };

  const effectivelyVisible = !!value && value.categoriesTabVisible && (value.myCategoriesVisible || value.categoryRequestsVisible);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500/10 rounded-xl p-3"><Folder className="w-5 h-5 text-indigo-600" /></div>
          <div>
            <CardTitle className="text-base">Visibilité de l'onglet Catégories</CardTitle>
            <CardDescription className="pt-1">Contrôlez l'accès à l'espace Catégories et à ses différentes sections dans l'espace fournisseur.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!value ? <Skeleton className="h-48 w-full" /> : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3 bg-muted/30" data-testid="row-supplier-tab-categories-parent">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-muted rounded-lg p-2 shrink-0"><Folder className="w-4 h-4 text-foreground/70" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Onglet Catégories</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Contrôle principal : désactivé, masque Mes catégories et Demandes de catégories quel que soit leur propre réglage.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline" className={`text-xs ${statusBadgeClass(effectivelyVisible)}`} data-testid="badge-supplier-tab-categories-status">
                  {effectivelyVisible ? "Visible" : "Masqué"}
                </Badge>
                <Switch
                  checked={value.categoriesTabVisible}
                  onCheckedChange={(checked) => update("categoriesTabVisible", checked)}
                  disabled={saveMutation.isPending}
                  aria-label="Onglet Catégories"
                  data-testid="switch-supplier-tab-categories-visible"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">Si Mes catégories et Demandes de catégories sont désactivées, l'onglet Catégories disparaît automatiquement de l'espace fournisseur, même si ce réglage principal reste activé.</p>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-muted rounded-lg p-2 shrink-0"><Folder className="w-4 h-4 text-foreground/70" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Mes catégories</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Autorisez les fournisseurs à gérer leurs catégories dans l'onglet Catégories.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.myCategoriesVisible)}`} data-testid="badge-supplier-tab-mycategories-status">
                  {value.myCategoriesVisible ? "Visible" : "Masqué"}
                </Badge>
                <Switch
                  checked={value.myCategoriesVisible}
                  onCheckedChange={(checked) => update("myCategoriesVisible", checked)}
                  disabled={saveMutation.isPending}
                  aria-label="Mes catégories"
                  data-testid="switch-supplier-tab-mycategories-visible"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-muted rounded-lg p-2 shrink-0"><ClipboardList className="w-4 h-4 text-foreground/70" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Demandes de catégories</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Autorisez les fournisseurs à proposer de nouvelles catégories pour validation par l'administration.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.categoryRequestsVisible)}`} data-testid="badge-supplier-tab-categoryrequests-status">
                  {value.categoryRequestsVisible ? "Visible" : "Masqué"}
                </Badge>
                <Switch
                  checked={value.categoryRequestsVisible}
                  onCheckedChange={(checked) => update("categoryRequestsVisible", checked)}
                  disabled={saveMutation.isPending}
                  aria-label="Demandes de catégories"
                  data-testid="switch-supplier-tab-categoryrequests-visible"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Masquer une section ne modifie, ne supprime ni ne réinitialise jamais les catégories ou demandes déjà existantes.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Produits (Supplier) tab visibility ────────────────────────────────────────
// Mirrors CategoriesTabVisibilitySection exactly, for the Supplier's "Produits" nav entry
// and two of its four existing tabs — Nouveau produit and Pack (see
// client/src/pages/supplier/manage-products.tsx). "Produits du catalogue"/"Mes produits" are
// deliberately never surfaced here — the task explicitly requires the existing product
// listing/management tabs to stay ungated.
function ProductsTabVisibilitySection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<SupplierTabSettingsAdmin>({ queryKey: ["/api/supplier-tab-settings"] });
  const [local, setLocal] = useState<SupplierTabSettingsAdmin | null>(null);

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  const value = local ?? settings;

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<SupplierTabSettingsAdmin>) =>
      apiRequest("PATCH", "/api/admin/supplier-tab-settings", updates),
    onSuccess: async (response) => {
      const saved = await response.json();
      setLocal(saved);
      queryClient.setQueryData(["/api/supplier-tab-settings"], saved);
      toast({ title: "Paramètres des onglets mis à jour" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: error?.message }),
  });

  const statusBadgeClass = (enabled: boolean) => enabled
    ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30"
    : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-500/15 dark:text-gray-400 dark:border-gray-500/30";

  const update = (field: keyof SupplierTabSettingsAdmin, next: boolean) => {
    if (!value) return;
    setLocal({ ...value, [field]: next });
    saveMutation.mutate({ [field]: next });
  };

  // Produits' main entry depends EXCLUSIVELY on productsTabVisible (task: "Fix Supplier
  // Produits Tab Visibility Logic") — unlike Catégories above, whose only two tabs ARE its
  // two children, Produits has two further tabs (Produits du catalogue, Mes produits) that
  // are never gated by newProductVisible/packVisible, so "both children off" must never be
  // read as "nothing left to show" here.
  const effectivelyVisible = !!value && value.productsTabVisible;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500/10 rounded-xl p-3"><Package className="w-5 h-5 text-indigo-600" /></div>
          <div>
            <CardTitle className="text-base">Visibilité de l'onglet Produits</CardTitle>
            <CardDescription className="pt-1">Contrôlez l'accès à l'espace Produits et à deux de ses sections dans l'espace fournisseur.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!value ? <Skeleton className="h-48 w-full" /> : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3 bg-muted/30" data-testid="row-supplier-tab-products-parent">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-muted rounded-lg p-2 shrink-0"><Package className="w-4 h-4 text-foreground/70" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Onglet Produits</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Contrôle principal : désactivé, masque Nouveau produit et Pack quel que soit leur propre réglage. Ne masque jamais Produits du catalogue ni Mes produits.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline" className={`text-xs ${statusBadgeClass(effectivelyVisible)}`} data-testid="badge-supplier-tab-products-status">
                  {effectivelyVisible ? "Visible" : "Masqué"}
                </Badge>
                <Switch
                  checked={value.productsTabVisible}
                  onCheckedChange={(checked) => update("productsTabVisible", checked)}
                  disabled={saveMutation.isPending}
                  aria-label="Onglet Produits"
                  data-testid="switch-supplier-tab-products-visible"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">Produits du catalogue et Mes produits restent toujours visibles et accessibles dès que ce réglage principal est activé, même si Nouveau produit et Pack sont tous les deux désactivés.</p>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-muted rounded-lg p-2 shrink-0"><Plus className="w-4 h-4 text-foreground/70" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Nouveau produit</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Autorisez les fournisseurs à créer de nouveaux produits dans l'onglet Produits.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.newProductVisible)}`} data-testid="badge-supplier-tab-newproduct-status">
                  {value.newProductVisible ? "Visible" : "Masqué"}
                </Badge>
                <Switch
                  checked={value.newProductVisible}
                  onCheckedChange={(checked) => update("newProductVisible", checked)}
                  disabled={saveMutation.isPending}
                  aria-label="Nouveau produit"
                  data-testid="switch-supplier-tab-newproduct-visible"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-muted rounded-lg p-2 shrink-0"><Layers className="w-4 h-4 text-foreground/70" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Pack</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Autorisez les fournisseurs à gérer leurs packs dans l'onglet Produits.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.packVisible)}`} data-testid="badge-supplier-tab-pack-status">
                  {value.packVisible ? "Visible" : "Masqué"}
                </Badge>
                <Switch
                  checked={value.packVisible}
                  onCheckedChange={(checked) => update("packVisible", checked)}
                  disabled={saveMutation.isPending}
                  aria-label="Pack"
                  data-testid="switch-supplier-tab-pack-visible"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Masquer une section ne modifie, ne supprime ni ne réinitialise jamais les produits ou packs déjà existants.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Store (Supplier) global configuration ──────────────────────────────────────
// New sub-tab under "Supplier" (task: "Admin Supplier Settings — Add Tab
// Visibility Management" — Store). Global configuration applied to EVERY
// supplier's existing Store page (/supplier/store) — never stores or touches any
// individual supplier's own store data (name/description/media/hours stay in
// supplierStores, entirely supplier-owned). Against the new
// /api/supplier-store-settings + PATCH /api/admin/supplier-store-settings
// endpoints; see server/routes/shared/middleware.ts's requireStoreTabEnabled and
// the per-field checks inside PUT /api/supplier/store for backend enforcement.
type SupplierStoreSettingsAdmin = {
  storeTabVisible: boolean;
  openControlVisible: boolean;
  marketplaceVisibilityControlVisible: boolean;
  imagesTabVisible: boolean;
  videoTabVisible: boolean;
  maxCoverImages: number;
  musicVisible: boolean;
  videoUrlFieldVisible: boolean;
  hoursTabVisible: boolean;
};

function StoreSettingsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<SupplierStoreSettingsAdmin>({ queryKey: ["/api/supplier-store-settings"] });
  const [local, setLocal] = useState<SupplierStoreSettingsAdmin | null>(null);
  const [maxInput, setMaxInput] = useState("5");

  useEffect(() => {
    if (settings) {
      setLocal(settings);
      setMaxInput(String(settings.maxCoverImages));
    }
  }, [settings]);

  const value = local ?? settings;

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<SupplierStoreSettingsAdmin>) =>
      apiRequest("PATCH", "/api/admin/supplier-store-settings", updates),
    onSuccess: async (response) => {
      const saved = await response.json();
      setLocal(saved);
      setMaxInput(String(saved.maxCoverImages));
      queryClient.setQueryData(["/api/supplier-store-settings"], saved);
      toast({ title: "Paramètres de la boutique mis à jour" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Échec de la mise à jour", description: error?.message });
      if (local) setMaxInput(String(local.maxCoverImages));
    },
  });

  const statusBadgeClass = (enabled: boolean) => enabled
    ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30"
    : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-500/15 dark:text-gray-400 dark:border-gray-500/30";

  const update = (field: keyof SupplierStoreSettingsAdmin, next: boolean) => {
    if (!value) return;
    setLocal({ ...value, [field]: next });
    saveMutation.mutate({ [field]: next });
  };

  const updateMax = (raw: string) => {
    setMaxInput(raw);
    const next = Number(raw);
    if (raw.trim() !== "" && Number.isInteger(next) && next >= 1 && next <= 5) {
      saveMutation.mutate({ maxCoverImages: next });
    }
  };

  const ToggleRow = ({ icon: Icon, title, description, field }: { icon: any; title: string; description: string; field: keyof SupplierStoreSettingsAdmin }) => {
    if (!value) return null;
    const enabled = value[field] as boolean;
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3" data-testid={`row-store-${field}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-muted rounded-lg p-2 shrink-0"><Icon className="w-4 h-4 text-foreground/70" /></div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge variant="outline" className={`text-xs ${statusBadgeClass(enabled)}`} data-testid={`badge-store-${field}-status`}>
            {enabled ? "Visible" : "Masqué"}
          </Badge>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => update(field, checked)}
            disabled={saveMutation.isPending}
            aria-label={title}
            data-testid={`switch-store-${field}`}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 rounded-xl p-3"><Store className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <CardTitle className="text-base">Boutique fournisseur</CardTitle>
              <CardDescription className="pt-1">Contrôlez l'accès à la gestion de la boutique dans l'espace fournisseur.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!value ? <Skeleton className="h-16 w-full" /> : (
            <ToggleRow icon={Store} title="Onglet Store" description="Contrôlez l'accès à la gestion de la boutique dans l'espace fournisseur." field="storeTabVisible" />
          )}
          <p className="text-xs text-muted-foreground">Masquer cet onglet ne supprime ni ne modifie les informations, médias ou horaires déjà enregistrés par les fournisseurs.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 rounded-xl p-3"><LayoutTemplate className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <CardTitle className="text-base">Détails de la boutique</CardTitle>
              <CardDescription className="pt-1">Contrôlez les contrôles disponibles sur la page Détails de la boutique du fournisseur.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!value ? <Skeleton className="h-32 w-full" /> : (
            <>
              <ToggleRow icon={Store} title="Afficher le contrôle « Boutique ouverte »" description="Autorisez les fournisseurs à gérer l'ouverture et la fermeture de leur boutique." field="openControlVisible" />
              <ToggleRow icon={Eye} title="Afficher le contrôle « Visible sur la marketplace »" description="Autorisez les fournisseurs à gérer la visibilité de leur boutique sur la marketplace." field="marketplaceVisibilityControlVisible" />
            </>
          )}
          <p className="text-xs text-muted-foreground">Masquer l'un ou l'autre ne réinitialise jamais sa valeur enregistrée ; Nom de la boutique, Description et URL du logo restent toujours modifiables.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 rounded-xl p-3"><Image className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <CardTitle className="text-base">Médias d'arrière-plan</CardTitle>
              <CardDescription className="pt-1">Contrôlez les modes et fonctionnalités disponibles pour les médias d'arrière-plan de la boutique.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!value ? <Skeleton className="h-64 w-full" /> : (
            <>
              <ToggleRow icon={Image} title="Onglet Images" description="Autorisez les fournisseurs à configurer des images de couverture pour leur boutique." field="imagesTabVisible" />
              <ToggleRow icon={Video} title="Onglet Vidéo" description="Autorisez les fournisseurs à configurer une vidéo d'arrière-plan pour leur boutique." field="videoTabVisible" />
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div>
                  <p className="text-sm font-medium">Nombre maximum d'images de couverture</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Définissez le nombre maximal d'images de couverture qu'un fournisseur peut ajouter à sa boutique (1 à 5).</p>
                </div>
                <Input
                  type="number" min={1} max={5} className="w-20"
                  value={maxInput}
                  onChange={(e) => updateMax(e.target.value)}
                  disabled={saveMutation.isPending}
                  aria-label="Nombre maximum d'images de couverture"
                  data-testid="input-store-max-cover-images"
                />
              </div>
              <ToggleRow icon={Music} title="Musique d'ambiance" description="Autorisez les fournisseurs à configurer une musique d'ambiance pour leur boutique." field="musicVisible" />
              <ToggleRow icon={Video} title="URL de la vidéo" description="Autorisez les fournisseurs à configurer l'URL de leur vidéo d'arrière-plan." field="videoUrlFieldVisible" />
            </>
          )}
          <p className="text-xs text-muted-foreground">Réduire le nombre maximum ne supprime jamais les images déjà enregistrées par un fournisseur ; seul l'ajout de nouvelles images au-delà de la limite est bloqué.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 rounded-xl p-3"><Clock className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <CardTitle className="text-base">Horaires d'ouverture</CardTitle>
              <CardDescription className="pt-1">Contrôlez l'accès à la configuration des horaires d'ouverture dans l'espace fournisseur.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!value ? <Skeleton className="h-16 w-full" /> : (
            <ToggleRow icon={Clock} title="Onglet Horaires d'ouverture" description="Contrôlez l'accès à la configuration des horaires d'ouverture dans l'espace fournisseur." field="hoursTabVisible" />
          )}
          <p className="text-xs text-muted-foreground">Masquer cet onglet ne réinitialise jamais les horaires, créneaux ou jours de fermeture déjà enregistrés.</p>
        </CardContent>
      </Card>
    </>
  );
}

// ── Google/Facebook sign-in ────────────────────────────────────────────────────
// Same Switch-row pattern as MessagesSystemSection. GET here (requireAdmin) returns the
// raw googleEnabled/facebookEnabled toggle PLUS googleConfigured/facebookConfigured
// (whether GOOGLE_CLIENT_ID/SECRET or FACEBOOK_APP_ID/SECRET env vars are actually set) —
// so an admin who enables a provider without configuring credentials sees a clear warning
// here rather than a silently-broken public button. Never exposes the credentials
// themselves, only these two booleans.
type AuthProviderSettings = { googleEnabled: boolean; facebookEnabled: boolean; googleConfigured: boolean; facebookConfigured: boolean };

function AuthProviderSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<AuthProviderSettings>({ queryKey: ["/api/admin/auth-provider-settings"] });
  const [local, setLocal] = useState<AuthProviderSettings | null>(null);

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<{ googleEnabled: boolean; facebookEnabled: boolean }>) =>
      apiRequest("PATCH", "/api/admin/auth-provider-settings", updates),
    onSuccess: async (response) => {
      const saved = await response.json();
      setLocal(saved);
      queryClient.setQueryData(["/api/admin/auth-provider-settings"], saved);
      queryClient.invalidateQueries({ queryKey: ["/api/auth-provider-settings"] });
      toast({ title: "Paramètres de connexion mis à jour" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: error?.message }),
  });

  const value = local ?? settings;
  const update = (field: "googleEnabled" | "facebookEnabled", next: boolean) => {
    if (!value) return;
    setLocal({ ...value, [field]: next });
    saveMutation.mutate({ [field]: next });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500/10 rounded-xl p-3"><LogIn className="w-5 h-5 text-indigo-600" /></div>
          <div>
            <CardTitle className="text-base">Connexion Google / Facebook</CardTitle>
            <CardDescription className="pt-1">Autoriser la connexion via Google ou Facebook sur la Connexion publique, pour les comptes existants uniquement.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!value ? <Skeleton className="h-20 w-full" /> : (
          <>
            {([
              ["googleEnabled", "googleConfigured", "Google", "Autorise \"Continuer avec Google\" sur la Connexion."],
              ["facebookEnabled", "facebookConfigured", "Facebook", "Autorise \"Continuer avec Facebook\" sur la Connexion."],
            ] as const).map(([field, configuredField, label, description]) => (
              <div key={field} className="rounded-xl border border-border/50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                  </div>
                  <Switch
                    checked={value[field]}
                    onCheckedChange={(checked) => update(field, checked)}
                    disabled={saveMutation.isPending}
                    aria-label={label}
                    data-testid={`switch-auth-${label.toLowerCase()}`}
                  />
                </div>
                {value[field] && !value[configuredField] && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5" data-testid={`warning-auth-${label.toLowerCase()}-not-configured`}>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Activé mais non configuré — ajoutez les identifiants {label} (Client ID/Secret) dans les variables d'environnement du serveur pour l'activer réellement.
                  </p>
                )}
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Authentication & Security Settings ─────────────────────────────────────────
// Upgraded from the original cooldown-only "Durée du blocage" card into a
// centralized panel (task: "Expand Global Authentication & Security Settings").
// Same immediate-save-on-valid-input pattern already used throughout this file
// (MessagesSystemSection, AuthProviderSection) — no separate Save button, each
// field persists the instant it's a valid value. Every field here is actually
// read and enforced server-side on every login/registration/password-change
// request (server/routes.ts, server/login-attempts.ts, server/login-rate-limit.ts)
// — never a frontend-only toggle.
type LoginSecuritySettings = {
  lockoutEnabled: boolean;
  maxFailedAttempts: number;
  cooldownSeconds: number;
  rateLimitEnabled: boolean;
  rateLimitMaxRequests: number;
  rateLimitWindowSeconds: number;
  passwordMinLength: number;
  sessionInactivityTimeoutSeconds: number | null;
};

function AuthSecuritySettingsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<LoginSecuritySettings>({ queryKey: ["/api/admin/login-security-settings"] });
  const [local, setLocal] = useState<LoginSecuritySettings | null>(null);
  // Separate text-input mirrors for numeric fields — lets the admin clear a
  // field or type a transient out-of-range value without it being force-reset
  // on every keystroke; only a value that actually validates gets saved.
  const [inputs, setInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings) {
      setLocal(settings);
      setInputs({
        maxFailedAttempts: String(settings.maxFailedAttempts),
        cooldownSeconds: String(settings.cooldownSeconds),
        rateLimitMaxRequests: String(settings.rateLimitMaxRequests),
        rateLimitWindowSeconds: String(settings.rateLimitWindowSeconds),
        passwordMinLength: String(settings.passwordMinLength),
        sessionInactivityTimeoutSeconds: settings.sessionInactivityTimeoutSeconds != null ? String(settings.sessionInactivityTimeoutSeconds) : "",
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<LoginSecuritySettings>) => apiRequest("PATCH", "/api/admin/login-security-settings", updates),
    onSuccess: async (response) => {
      const saved: LoginSecuritySettings = await response.json();
      setLocal(saved);
      queryClient.setQueryData(["/api/admin/login-security-settings"], saved);
      toast({ title: "Paramètres de sécurité mis à jour" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Échec de la mise à jour", description: error?.message });
      // Revert the affected input to the last known-good saved value so an
      // invalid entry doesn't linger looking "saved" when it wasn't.
      if (local) {
        setInputs((prev) => ({
          ...prev,
          maxFailedAttempts: String(local.maxFailedAttempts),
          cooldownSeconds: String(local.cooldownSeconds),
          rateLimitMaxRequests: String(local.rateLimitMaxRequests),
          rateLimitWindowSeconds: String(local.rateLimitWindowSeconds),
          passwordMinLength: String(local.passwordMinLength),
          sessionInactivityTimeoutSeconds: local.sessionInactivityTimeoutSeconds != null ? String(local.sessionInactivityTimeoutSeconds) : "",
        }));
      }
    },
  });

  const updateBool = (field: "lockoutEnabled" | "rateLimitEnabled", next: boolean) => {
    if (!local) return;
    setLocal({ ...local, [field]: next });
    saveMutation.mutate({ [field]: next });
  };

  const updateNumber = (field: keyof LoginSecuritySettings, raw: string, min: number, max: number) => {
    setInputs((prev) => ({ ...prev, [field]: raw }));
    const next = Number(raw);
    if (raw.trim() !== "" && Number.isInteger(next) && next >= min && next <= max) {
      saveMutation.mutate({ [field]: next } as Partial<LoginSecuritySettings>);
    }
  };

  // Session timeout is nullable — an empty field means "disabled", a real
  // number enables it. Both are valid, deliberate states, not an error.
  const updateSessionTimeout = (raw: string) => {
    setInputs((prev) => ({ ...prev, sessionInactivityTimeoutSeconds: raw }));
    if (raw.trim() === "") {
      saveMutation.mutate({ sessionInactivityTimeoutSeconds: null });
      return;
    }
    const next = Number(raw);
    if (Number.isInteger(next) && next >= 60 && next <= 2592000) {
      saveMutation.mutate({ sessionInactivityTimeoutSeconds: next });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-red-500/10 rounded-xl p-3"><ShieldCheck className="w-5 h-5 text-red-600" /></div>
          <div>
            <CardTitle className="text-base">Authentification &amp; Sécurité</CardTitle>
            <CardDescription className="pt-1">Protection contre les tentatives de connexion échouées, limitation du débit de connexion, politique de mot de passe et sécurité de session.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!local ? <Skeleton className="h-64 w-full" /> : (
          <>
            {/* ── A. Failed Login Protection ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Protection contre les tentatives échouées</p>
              <div className="rounded-xl border border-border/50 p-3 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Activer le blocage après échecs de connexion</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {local.lockoutEnabled
                        ? "Un compte est temporairement bloqué après plusieurs échecs consécutifs."
                        : "Désactivé : aucun compte n'est bloqué par cette règle. La limitation du débit ci-dessous reste une protection indépendante."}
                    </p>
                  </div>
                  <Switch
                    checked={local.lockoutEnabled}
                    onCheckedChange={(checked) => updateBool("lockoutEnabled", checked)}
                    disabled={saveMutation.isPending}
                    aria-label="Activer le blocage après échecs de connexion"
                    data-testid="switch-lockout-enabled"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Tentatives échouées consécutives maximum</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Nombre d'échecs, pour un même compte, avant déclenchement du blocage.</p>
                  </div>
                  <Input
                    type="number" min={1} max={20} className="w-24"
                    value={inputs.maxFailedAttempts ?? ""}
                    onChange={(e) => updateNumber("maxFailedAttempts", e.target.value, 1, 20)}
                    disabled={saveMutation.isPending || !local.lockoutEnabled}
                    aria-label="Tentatives échouées consécutives maximum"
                    data-testid="input-max-failed-attempts"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Durée du blocage (secondes)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Temps d'attente, par compte, une fois le seuil atteint.</p>
                  </div>
                  <Input
                    type="number" min={1} max={3600} className="w-24"
                    value={inputs.cooldownSeconds ?? ""}
                    onChange={(e) => updateNumber("cooldownSeconds", e.target.value, 1, 3600)}
                    disabled={saveMutation.isPending || !local.lockoutEnabled}
                    aria-label="Durée du blocage en secondes"
                    data-testid="input-login-cooldown-seconds"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Une connexion réussie réinitialise immédiatement le compteur du compte.</p>
              </div>
            </div>

            {/* ── B. Login Request Rate Limiting ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limitation des requêtes de connexion</p>
              <div className="rounded-xl border border-border/50 p-3 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Activer la limitation de débit</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {local.rateLimitEnabled
                        ? "Les requêtes de connexion excessives depuis une même adresse IP sont temporairement rejetées (429)."
                        : "Désactivé : seule cette règle configurable est désactivée — la protection de base contre les abus reste active."}
                    </p>
                  </div>
                  <Switch
                    checked={local.rateLimitEnabled}
                    onCheckedChange={(checked) => updateBool("rateLimitEnabled", checked)}
                    disabled={saveMutation.isPending}
                    aria-label="Activer la limitation de débit"
                    data-testid="switch-ratelimit-enabled"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Requêtes de connexion maximum</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Nombre de requêtes autorisées, par adresse IP, pendant la fenêtre ci-dessous.</p>
                  </div>
                  <Input
                    type="number" min={1} max={1000} className="w-24"
                    value={inputs.rateLimitMaxRequests ?? ""}
                    onChange={(e) => updateNumber("rateLimitMaxRequests", e.target.value, 1, 1000)}
                    disabled={saveMutation.isPending || !local.rateLimitEnabled}
                    aria-label="Requêtes de connexion maximum"
                    data-testid="input-ratelimit-max-requests"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Fenêtre de temps (secondes)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Durée de la fenêtre glissante pendant laquelle les requêtes sont comptées.</p>
                  </div>
                  <Input
                    type="number" min={1} max={86400} className="w-24"
                    value={inputs.rateLimitWindowSeconds ?? ""}
                    onChange={(e) => updateNumber("rateLimitWindowSeconds", e.target.value, 1, 86400)}
                    disabled={saveMutation.isPending || !local.rateLimitEnabled}
                    aria-label="Fenêtre de limitation de débit en secondes"
                    data-testid="input-ratelimit-window-seconds"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Au-delà du seuil, la requête reçoit une réponse 429 générique (sans jamais révéler si le compte existe) avec un en-tête Retry-After.</p>
              </div>
            </div>

            {/* ── C1. Password policy ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Politique de mot de passe</p>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div>
                  <p className="text-sm font-medium">Longueur minimale du mot de passe</p>
                  <p className="text-xs text-muted-foreground mt-0.5">S'applique à l'inscription, la réinitialisation et le changement de mot de passe. Une majuscule, un chiffre et un symbole restent toujours requis.</p>
                </div>
                <Input
                  type="number" min={6} max={64} className="w-24"
                  value={inputs.passwordMinLength ?? ""}
                  onChange={(e) => updateNumber("passwordMinLength", e.target.value, 6, 64)}
                  disabled={saveMutation.isPending}
                  aria-label="Longueur minimale du mot de passe"
                  data-testid="input-password-min-length"
                />
              </div>
            </div>

            {/* ── C2. Session security ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sécurité de session</p>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div>
                  <p className="text-sm font-medium">Délai d'inactivité de session (secondes)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Déconnecte automatiquement après cette durée d'inactivité. Laisser vide pour désactiver (comportement actuel : la session expire à la fermeture du navigateur).</p>
                </div>
                <Input
                  type="number" min={60} max={2592000} className="w-28"
                  placeholder="Désactivé"
                  value={inputs.sessionInactivityTimeoutSeconds ?? ""}
                  onChange={(e) => updateSessionTimeout(e.target.value)}
                  disabled={saveMutation.isPending}
                  aria-label="Délai d'inactivité de session en secondes"
                  data-testid="input-session-inactivity-timeout"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              L'authentification multifacteur n'est pas disponible actuellement — aucune option n'est affichée ici tant que le flux d'authentification correspondant n'existe pas.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Hero service registry (shared by ServiceHeroCustomizationSection below) ───

// Independent of SERVICES/STATE_OPTIONS above (whole-service visibility). SHOP
// has no Fast Search/Report icons yet (it uses its own separate Flash Mode
// feature), but it stays in this registry for forward-consistency with the
// six-service naming used elsewhere — enabling its actions today has no
// visible effect on /shop until such icons exist there.
//
// The separate "Actions Hero Services" card that used to live here (Fast
// Search/Report switches, one row per service) has been retired (task: "Admin
// Services Hero Personalization Reorganization") — its exact logic now lives
// inside ServiceHeroCustomizationSection's "Actions Hero" panel, scoped to
// whichever service is selected there, on the same heroActionSettings
// table/route as before.
const HERO_SERVICES: { key: HeroService; label: string; icon: any }[] = [
  { key: "SHOP",        label: "SHOP",                  icon: ShoppingBag },
  { key: "BARISTA",     label: "BARISTAS",  icon: Users },
  { key: "ACADEMY",     label: "ACADEMY",       icon: GraduationCap },
  { key: "MAINTENANCE", label: "MAINTENANCE",           icon: Wrench },
  { key: "PRINT",       label: "PRINTING",              icon: Printer },
  { key: "MARKETING",   label: "MARKETING",             icon: Megaphone },
];

// ── Service Hero Customization (background/gradient/subtitle/height/alignment/info-row/actions) ──

// Distinct from HeroSlidesEditor/LandingConfigSection further below (the
// PRE-LOGIN landing page's own hero carousel — a separate table/feature
// entirely). This section lets an admin independently restyle each
// Coffee-Owner-facing service's own hero (SHOP/BARISTA/ACADEMY/MAINTENANCE/
// PRINT/MARKETING) — mirrors the staged-draft + explicit Save pattern already
// used elsewhere on this page (e.g. LandingConfigSection), one config per
// service via /api/admin/service-hero-config/:service. Also hosts the
// service's Fast Search/Report action switches (own table/route, own
// immediate-apply behavior — see the component's own comment below).
const HEIGHT_OPTIONS: { value: ServiceHeroConfig["height"]; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "medium", label: "Moyen (défaut)" },
  { value: "large", label: "Grand" },
];
const H_ALIGN_OPTIONS: { value: ServiceHeroConfig["horizontalAlign"]; label: string }[] = [
  { value: "left", label: "Gauche" },
  { value: "center", label: "Centre (défaut)" },
  { value: "right", label: "Droite" },
];
const V_ALIGN_OPTIONS: { value: ServiceHeroConfig["verticalAlign"]; label: string }[] = [
  { value: "top", label: "Haut" },
  { value: "center", label: "Centre (défaut)" },
  { value: "bottom", label: "Bas" },
];

// Per-service default colors/background, copied verbatim from each real hero
// page (task: "Hero Personalization UI Reorganization and Theme
// Consistency" — the preview must match the real coffee-owner hero exactly,
// not an approximated/generic palette). Dark-mode subtitle/info-row text is
// uniformly white on every real page; only the light-mode pastel accent and
// the Fast Search icon's dark-mode accent vary per service.
const SERVICE_LIGHT_TEXT: Record<HeroService, string> = {
  SHOP: "text-amber-100",
  BARISTA: "text-green-100",
  ACADEMY: "text-indigo-100",
  MAINTENANCE: "text-orange-100",
  PRINT: "text-blue-100",
  MARKETING: "text-purple-100",
};
const SERVICE_FASTSEARCH_ACCENT_DARK: Record<HeroService, string> = {
  SHOP: "text-amber-400",
  BARISTA: "text-green-400",
  ACADEMY: "text-indigo-400",
  MAINTENANCE: "text-orange-400",
  PRINT: "text-blue-400",
  MARKETING: "text-purple-400",
};

// Default background (shown only when the selected service has no custom
// image/gradient configured) — exact JSX copied from each real page's own
// default background branch, so the preview never shows a placeholder the
// real hero wouldn't actually show.
function PreviewDefaultBackground({ service, isDark }: { service: HeroService; isDark: boolean }) {
  if (service === "SHOP") {
    return isDark ? (
      <>
        <div className="absolute inset-0 bg-gray-900" />
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/25 via-gray-900 to-gray-900" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      </>
    ) : (
      <>
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600" />
        <div className="absolute inset-0 bg-black/10" />
      </>
    );
  }
  if (service === "MAINTENANCE") {
    return isDark ? (
      <>
        <div className="absolute inset-0 bg-gray-900" />
        <div className="absolute inset-0 bg-gradient-to-br from-orange-900/25 via-gray-900 to-gray-900" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
      </>
    ) : (
      <>
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600" />
        <div className="absolute inset-0 bg-black/10" />
      </>
    );
  }
  if (service === "BARISTA") {
    return (
      <>
        <div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80" style={{ backgroundImage: `url(${baristaHeroImg})` }} />
        <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-br from-gray-950/95 via-gray-900/95 to-green-950/90" : "bg-gradient-to-br from-green-600/90 via-green-700/85 to-emerald-700/90"}`} />
      </>
    );
  }
  if (service === "ACADEMY") {
    return (
      <>
        <div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80" style={{ backgroundImage: `url(${baristaHeroImg})` }} />
        <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-br from-gray-950/95 via-gray-900/95 to-indigo-950/90" : "bg-gradient-to-br from-indigo-600/90 via-indigo-700/85 to-violet-700/90"}`} />
      </>
    );
  }
  if (service === "PRINT") {
    return (
      <>
        <div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80" style={{ backgroundImage: `url('${printBannerImg}')` }} />
        <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-br from-gray-950/95 via-gray-900/95 to-blue-950/90" : "bg-gradient-to-br from-blue-600/90 via-blue-700/85 to-indigo-700/90"}`} />
      </>
    );
  }
  // MARKETING
  return (
    <>
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80" style={{ backgroundImage: `url(${marketingHeroImg})` }} />
      <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-br from-gray-950/95 via-gray-900/95 to-purple-950/90" : "bg-gradient-to-br from-purple-600/90 via-purple-700/85 to-violet-700/90"}`} />
    </>
  );
}

function ServiceHeroCustomizationSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { configs, isLoading } = useServiceHeroConfigMap();
  const [selected, setSelected] = useState<HeroService>("SHOP");
  const [draft, setDraft] = useState<ServiceHeroConfig>(configs[selected]);
  const [previewDark, setPreviewDark] = useState(true);

  useEffect(() => {
    setDraft(configs[selected]);
    // Only re-sync when switching services (or on first load) — not on every
    // background refetch — so a background realtime refresh never silently
    // discards an admin's in-progress, unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, isLoading]);

  const saved = configs[selected];
  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<ServiceHeroConfig>) =>
      apiRequest("PATCH", `/api/admin/service-hero-config/${selected}`, updates),
    onSuccess: async (response) => {
      const map: ServiceHeroConfigMap = await response.json();
      queryClient.setQueryData(["/api/service-hero-config"], map);
      setDraft(map[selected]);
      toast({ title: "Hero mis à jour", description: `Service ${selected} enregistré.` });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Échec de l'enregistrement", description: error?.message }),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/service-hero-config/${selected}`, DEFAULT_SERVICE_HERO_CONFIG),
    onSuccess: async (response) => {
      const map: ServiceHeroConfigMap = await response.json();
      queryClient.setQueryData(["/api/service-hero-config"], map);
      setDraft(map[selected]);
      toast({ title: "Hero réinitialisé", description: `Service ${selected} restauré par défaut.` });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Échec de la réinitialisation", description: error?.message }),
  });

  // Hero actions (Recherche rapide / Signaler) — consolidated into this same
  // card (task: "Admin Services Hero Personalization Reorganization") from
  // the now-retired separate "Actions Hero Services" card, but deliberately
  // kept on their OWN table/route/mutation (heroActionSettings, unrelated to
  // serviceHeroConfigs) and their OWN immediate-apply behavior — no
  // draft/Enregistrer step, exactly as before, just scoped to whichever
  // service is currently selected instead of listing all six at once.
  const { settings: heroActionsSettings } = useHeroActionSettings();
  const [localHeroActions, setLocalHeroActions] = useState<HeroActionSettingsMap | null>(null);
  useEffect(() => { setLocalHeroActions(heroActionsSettings); }, [heroActionsSettings]);
  const heroActionsValue = localHeroActions ?? heroActionsSettings;
  const heroActionsMutation = useMutation({
    mutationFn: ({ service, updates }: { service: HeroService; updates: Partial<{ fastSearchEnabled: boolean; reportEnabled: boolean; jobOffersEnabled: boolean; interventionEnabled: boolean }> }) =>
      apiRequest("PATCH", `/api/admin/hero-actions/${service}`, updates),
    onSuccess: async (response) => {
      const savedActions = await response.json();
      setLocalHeroActions(savedActions);
      queryClient.setQueryData(["/api/hero-actions"], savedActions);
      toast({ title: "Actions Hero mises à jour" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: error?.message }),
  });
  const updateHeroAction = (field: "fastSearchEnabled" | "reportEnabled" | "jobOffersEnabled" | "interventionEnabled", next: boolean) => {
    setLocalHeroActions({ ...heroActionsValue, [selected]: { ...heroActionsValue[selected], [field]: next } });
    heroActionsMutation.mutate({ service: selected, updates: { [field]: next } });
  };

  const activeMeta = HERO_SERVICES.find((s) => s.key === selected)!;
  const images = draft.backgroundImages.filter((u) => u.trim().length > 0);

  const setField = <K extends keyof ServiceHeroConfig>(field: K, value: ServiceHeroConfig[K]) => setDraft((d) => ({ ...d, [field]: value }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500/10 rounded-xl p-3"><Palette className="w-5 h-5 text-amber-600" /></div>
          <div>
            <CardTitle className="text-base">Personnalisation des Hero Services</CardTitle>
            <CardDescription className="pt-1">Arrière-plan, sous-titre, hauteur, position, ligne d'info et actions (Recherche rapide / Signaler) du hero de chaque service, indépendamment.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* B. Service selector — full width, below the heading */}
        <div className="flex flex-wrap gap-2">
          {HERO_SERVICES.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={selected === key ? "default" : "outline"}
              onClick={() => setSelected(key)}
              className={`gap-1.5 ${selected === key ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`}
              data-testid={`button-select-hero-service-${key.toLowerCase()}`}
            >
              <Icon className="w-3.5 h-3.5" />{label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <>
            {/* C. Hero preview — full width, directly below the selector, above the
                configuration panels. Visualization only: the controlsRow icons below
                are plain <div>s with no onClick, so interacting with the preview can
                never trigger a real search/report action. */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionLabel>Aperçu — {activeMeta.label}</SectionLabel>
                {/* Exact same toggle markup/classes as the real coffee-owner navbar
                    (client/src/components/cafe/marketplace-layout.tsx) — but wired to
                    this component's own local previewDark state, never the shared
                    useThemeStore, so switching it can never change the admin's own
                    theme or any coffee owner's real saved preference. */}
                <button
                  type="button"
                  onClick={() => setPreviewDark((d) => !d)}
                  aria-label="Aperçu — basculer entre thème clair et sombre"
                  title="Aperçu uniquement — n'affecte pas le thème réel"
                  data-testid="button-preview-theme-toggle"
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${previewDark ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-100 hover:bg-gray-200"}`}
                >
                  {previewDark
                    ? <Sun className="w-4 h-4 text-amber-400" />
                    : <Moon className="w-4 h-4 text-gray-500" />
                  }
                </button>
              </div>
              <div className="rounded-xl border border-border/50 overflow-hidden max-h-72">
                <ServiceHeroShell
                  config={draft}
                  defaultBackground={<PreviewDefaultBackground service={selected} isDark={previewDark} />}
                  controlsRow={
                    (heroActionsValue[selected]?.fastSearchEnabled || heroActionsValue[selected]?.reportEnabled) ? (
                      <div className="relative flex justify-end items-center gap-2 mb-4">
                        {/* Same icon/button treatment as the real hero's own controls
                            row (Ban = Signaler, red-400 dark / white light — uniform
                            across every service; Zap = Recherche rapide, accent color
                            per service in dark mode, white in light mode). Rendered as
                            plain <div>s (no onClick) so a click here can never submit a
                            real report or open a real search. */}
                        {heroActionsValue[selected]?.reportEnabled && (
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${previewDark ? "bg-gray-800 hover:bg-gray-700 text-red-400" : "bg-white/20 hover:bg-white/30 text-white"}`}
                            title="Signaler (aperçu)"
                            data-testid="preview-icon-report"
                          >
                            <Ban className="w-4 h-4" />
                          </div>
                        )}
                        {heroActionsValue[selected]?.fastSearchEnabled && (
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${previewDark ? `bg-gray-800 hover:bg-gray-700 ${SERVICE_FASTSEARCH_ACCENT_DARK[selected]}` : "bg-white/20 hover:bg-white/30 text-white"}`}
                            title="Recherche rapide (aperçu)"
                            data-testid="preview-icon-fastsearch"
                          >
                            <Zap className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    ) : undefined
                  }
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-sm ${H_ALIGN_ICON_MX[draft.horizontalAlign]} ${previewDark ? "bg-gray-800/80 border border-gray-700" : "bg-white/20"}`}>
                    <activeMeta.icon className={`w-7 h-7 ${previewDark ? "text-amber-400" : "text-white"}`} />
                  </div>
                  <h1 className="text-2xl font-extrabold text-white mb-2">BigBoss <span className={previewDark ? "text-amber-400" : "text-amber-200"}>{selected}</span></h1>
                  {draft.subtitleEnabled && (
                    <p
                      className={`text-sm mb-3 max-w-xl ${H_ALIGN_ICON_MX[draft.horizontalAlign]} ${previewDark ? "text-white" : SERVICE_LIGHT_TEXT[selected]}`}
                      style={getHeroSubtitleColorStyle(draft, previewDark)}
                    >
                      {draft.subtitle ?? "Sous-titre par défaut du service"}
                    </p>
                  )}
                  {draft.infoRowEnabled && (
                    <div className={`flex items-center gap-4 flex-wrap text-xs ${H_ALIGN_ROW_JUSTIFY[draft.horizontalAlign]} ${previewDark ? "text-white" : SERVICE_LIGHT_TEXT[selected]}`}>
                      <span>Exemple statistique</span>
                      <span>Autre info</span>
                    </div>
                  )}
                </ServiceHeroShell>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
                  disabled={!isDirty || saveMutation.isPending}
                  onClick={() => saveMutation.mutate(draft)}
                  data-testid="button-save-hero-config"
                >
                  <Save className="w-3.5 h-3.5" /> {saveMutation.isPending ? "Enregistrement…" : "Enregistrer"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={resetMutation.isPending}
                  onClick={() => resetMutation.mutate()}
                  data-testid="button-reset-hero-config"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser ce service
                </Button>
                {isDirty && <span className="text-xs text-amber-600 font-medium">Modifications non enregistrées</span>}
              </div>
            </div>

            {/* D. Configuration panels — two columns on desktop, stacked on mobile */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Left column — Background (images/rotation/overlay) and Gradient */}
              <div className="space-y-5">
                {/* Background */}
                <div className="border border-border/50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <SectionLabel>Images d'arrière-plan ({images.length})</SectionLabel>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setField("backgroundImages", [...draft.backgroundImages, ""])} data-testid="button-add-hero-bg-image">
                      <Plus className="w-3 h-3" /> Ajouter
                    </Button>
                  </div>
                  {draft.backgroundImages.map((url, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={url}
                        onChange={(e) => setField("backgroundImages", draft.backgroundImages.map((u, idx) => idx === i ? e.target.value : u))}
                        placeholder="https://..."
                        className="rounded-lg text-sm"
                        data-testid={`input-hero-bg-image-${i}`}
                      />
                      <Button size="icon" variant="outline" className="h-8 w-8 shrink-0 text-destructive" onClick={() => setField("backgroundImages", draft.backgroundImages.filter((_, idx) => idx !== i))} data-testid={`button-remove-hero-bg-image-${i}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  {images.length === 0 && (
                    <p className="text-xs text-muted-foreground">Aucune image — l'arrière-plan par défaut du service reste affiché.</p>
                  )}
                  {images.length > 1 && (
                    <div className="flex items-center gap-2 pt-1">
                      <Label className="text-xs text-muted-foreground shrink-0">Rotation (secondes)</Label>
                      <Input
                        type="number"
                        min={2}
                        max={60}
                        value={draft.rotationIntervalSeconds}
                        onChange={(e) => setField("rotationIntervalSeconds", Math.max(2, Math.min(60, parseInt(e.target.value) || 6)))}
                        className="rounded-lg text-sm h-8 w-20"
                        data-testid="input-hero-rotation-seconds"
                      />
                    </div>
                  )}
                  {images.length > 0 && (
                    <div className="border-t border-border/50 pt-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-xs font-medium">Calque transparent</Label>
                          <p className="text-xs text-muted-foreground">Superpose une teinte sur les images pour garder le texte lisible.</p>
                        </div>
                        <Switch
                          checked={draft.overlayEnabled}
                          onCheckedChange={(checked) => setField("overlayEnabled", checked)}
                          aria-label="Activer le calque transparent"
                          data-testid="switch-hero-overlay-enabled"
                        />
                      </div>
                      {draft.overlayEnabled && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Couleur du calque</Label>
                            <div className="flex items-center gap-1">
                              <input
                                type="color"
                                value={/^#[0-9a-fA-F]{6}$/.test(draft.overlayColor) ? draft.overlayColor : "#000000"}
                                onChange={(e) => setField("overlayColor", e.target.value)}
                                className="h-8 w-8 rounded border border-border/50 shrink-0"
                                aria-label="Couleur du calque — sélecteur"
                              />
                              <Input
                                value={draft.overlayColor}
                                onChange={(e) => setField("overlayColor", e.target.value)}
                                placeholder="#000000"
                                className="rounded-lg text-xs h-8"
                                data-testid="input-hero-overlay-color"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-muted-foreground">Opacité du calque</Label>
                              <span className="text-xs font-medium tabular-nums" data-testid="text-hero-overlay-opacity">{draft.overlayOpacity}%</span>
                            </div>
                            <Slider
                              value={[draft.overlayOpacity]}
                              min={0}
                              max={100}
                              step={5}
                              onValueChange={([v]) => setField("overlayOpacity", v)}
                              data-testid="slider-hero-overlay-opacity"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Gradient */}
                <div className="border border-border/50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <SectionLabel>Dégradé personnalisé</SectionLabel>
                    <Switch
                      checked={draft.gradientEnabled}
                      onCheckedChange={(checked) => setField("gradientEnabled", checked)}
                      aria-label="Activer le dégradé personnalisé"
                      data-testid="switch-hero-gradient-enabled"
                    />
                  </div>
                  {draft.gradientEnabled && (
                    <>
                      <p className="text-xs text-muted-foreground">Un dégradé activé remplace les images d'arrière-plan.</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([["gradientFrom", "Début"], ["gradientVia", "Milieu"], ["gradientTo", "Fin"]] as const).map(([field, label]) => (
                          <div key={field} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{label}</Label>
                            <div className="flex items-center gap-1">
                              <input
                                type="color"
                                value={/^#[0-9a-fA-F]{6}$/.test(draft[field]) ? draft[field] : "#111827"}
                                onChange={(e) => setField(field, e.target.value)}
                                className="h-8 w-8 rounded border border-border/50 shrink-0"
                                aria-label={`${label} — couleur`}
                              />
                              <Input value={draft[field]} onChange={(e) => setField(field, e.target.value)} placeholder="#111827" className="rounded-lg text-xs h-8" data-testid={`input-hero-${field}`} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Direction</Label>
                        <Select value={draft.gradientDirection} onValueChange={(v) => setField("gradientDirection", v)}>
                          <SelectTrigger className="rounded-lg text-sm h-8" data-testid="select-hero-gradient-direction"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="to right">Vers la droite</SelectItem>
                            <SelectItem value="to bottom right">Diagonale ↘</SelectItem>
                            <SelectItem value="to bottom">Vers le bas</SelectItem>
                            <SelectItem value="to bottom left">Diagonale ↙</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>

              </div>

              {/* Right column — Actions Hero, Hauteur & Position, Sous-titre, Ligne d'info
                  (task: "Hero Personalization UI Reorganization" — exact order requested) */}
              <div className="space-y-5">
                {/* Actions Hero — moved here from the left column (see task); own
                    table/route, own immediate-apply mutation, scoped to the selected
                    service only. Icons match the real coffee-owner hero exactly
                    (Zap = Recherche rapide, Ban = Signaler). */}
                <div className="border border-border/50 rounded-xl p-4 space-y-3">
                  <SectionLabel>Actions Hero</SectionLabel>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Recherche rapide</p>
                    </div>
                    <Switch
                      checked={heroActionsValue[selected]?.fastSearchEnabled ?? true}
                      onCheckedChange={(checked) => updateHeroAction("fastSearchEnabled", checked)}
                      disabled={heroActionsMutation.isPending}
                      aria-label={`Recherche rapide — ${activeMeta.label}`}
                      data-testid={`switch-hero-fastsearch-${selected.toLowerCase()}`}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Ban className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Signaler</p>
                    </div>
                    <Switch
                      checked={heroActionsValue[selected]?.reportEnabled ?? true}
                      onCheckedChange={(checked) => updateHeroAction("reportEnabled", checked)}
                      disabled={heroActionsMutation.isPending}
                      aria-label={`Signaler — ${activeMeta.label}`}
                      data-testid={`switch-hero-report-${selected.toLowerCase()}`}
                    />
                  </div>
                  {/* BARISTA-only: visibility of the existing "Offres d'emploi" hero icon
                      (previously always shown, unconditionally). */}
                  {selected === "BARISTA" && (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Offres d'emploi</p>
                      </div>
                      <Switch
                        checked={heroActionsValue[selected]?.jobOffersEnabled ?? true}
                        onCheckedChange={(checked) => updateHeroAction("jobOffersEnabled", checked)}
                        disabled={heroActionsMutation.isPending}
                        aria-label={`Offres d'emploi — ${activeMeta.label}`}
                        data-testid={`switch-hero-joboffers-${selected.toLowerCase()}`}
                      />
                    </div>
                  )}
                  {/* MAINTENANCE-only: visibility of the existing "Intervention" hero icon
                      (previously always shown, unconditionally). */}
                  {selected === "MAINTENANCE" && (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="w-3.5 h-3.5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Intervention</p>
                      </div>
                      <Switch
                        checked={heroActionsValue[selected]?.interventionEnabled ?? true}
                        onCheckedChange={(checked) => updateHeroAction("interventionEnabled", checked)}
                        disabled={heroActionsMutation.isPending}
                        aria-label={`Intervention — ${activeMeta.label}`}
                        data-testid={`switch-hero-intervention-${selected.toLowerCase()}`}
                      />
                    </div>
                  )}
                </div>

                {/* Height & positioning */}
                <div className="border border-border/50 rounded-xl p-4 space-y-3">
                  <SectionLabel>Hauteur &amp; Position</SectionLabel>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Hauteur</Label>
                      <Select value={draft.height} onValueChange={(v) => setField("height", v as ServiceHeroConfig["height"])}>
                        <SelectTrigger className="rounded-lg text-sm h-8" data-testid="select-hero-height"><SelectValue /></SelectTrigger>
                        <SelectContent>{HEIGHT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Horizontal</Label>
                      <Select value={draft.horizontalAlign} onValueChange={(v) => setField("horizontalAlign", v as ServiceHeroConfig["horizontalAlign"])}>
                        <SelectTrigger className="rounded-lg text-sm h-8" data-testid="select-hero-halign"><SelectValue /></SelectTrigger>
                        <SelectContent>{H_ALIGN_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Vertical</Label>
                      <Select value={draft.verticalAlign} onValueChange={(v) => setField("verticalAlign", v as ServiceHeroConfig["verticalAlign"])}>
                        <SelectTrigger className="rounded-lg text-sm h-8" data-testid="select-hero-valign"><SelectValue /></SelectTrigger>
                        <SelectContent>{V_ALIGN_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Subtitle */}
                <div className="border border-border/50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <SectionLabel>Sous-titre</SectionLabel>
                    <Switch
                      checked={draft.subtitleEnabled}
                      onCheckedChange={(checked) => setField("subtitleEnabled", checked)}
                      aria-label="Afficher le sous-titre"
                      data-testid="switch-hero-subtitle-enabled"
                    />
                  </div>
                  {draft.subtitleEnabled ? (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Texte affiché sous le titre.</p>
                        {draft.subtitle != null && (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => setField("subtitle", null)} data-testid="button-clear-hero-subtitle">
                            <X className="w-3 h-3" /> Revenir au défaut
                          </Button>
                        )}
                      </div>
                      <Textarea
                        value={draft.subtitle ?? ""}
                        onChange={(e) => setField("subtitle", e.target.value)}
                        placeholder="Laisser vide pour conserver le sous-titre par défaut du service"
                        className="rounded-lg text-sm resize-none"
                        rows={2}
                        data-testid="textarea-hero-subtitle"
                      />
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {([["subtitleColorLight", "Couleur — Mode clair"], ["subtitleColorDark", "Couleur — Mode sombre"]] as const).map(([field, label]) => (
                          <div key={field} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{label}</Label>
                            <div className="flex items-center gap-1">
                              <input
                                type="color"
                                value={/^#[0-9a-fA-F]{6}$/.test(draft[field]) ? draft[field] : "#ffffff"}
                                onChange={(e) => setField(field, e.target.value)}
                                className="h-8 w-8 rounded border border-border/50 shrink-0"
                                aria-label={`${label} — sélecteur`}
                              />
                              <Input
                                value={draft[field]}
                                onChange={(e) => setField(field, e.target.value)}
                                placeholder="Défaut du service"
                                className="rounded-lg text-xs h-8"
                                data-testid={`input-hero-${field}`}
                              />
                              {draft[field] && (
                                <Button size="icon" variant="outline" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={() => setField(field, "")} aria-label={`${label} — revenir au défaut`}>
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Le sous-titre est masqué ; le texte enregistré est conservé et réapparaît en réactivant ce réglage.</p>
                  )}
                </div>

                {/* Info row toggle */}
                <div className="border border-border/50 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <SectionLabel>Ligne d'info sous le sous-titre</SectionLabel>
                    <p className="text-xs text-muted-foreground">Ex. pour Maintenance : « techniciens disponibles / certifiés / intervention rapide » ; pour Shop : « magasins / packs / produits ». Chaque service garde son propre contenu — désactiver masque entièrement la ligne existante de ce service.</p>
                  </div>
                  <Switch
                    checked={draft.infoRowEnabled}
                    onCheckedChange={(checked) => setField("infoRowEnabled", checked)}
                    aria-label="Afficher la ligne d'info"
                    data-testid="switch-hero-info-row"
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Dark Mode (per service account navbar toggle visibility) ──────────────────

// Independent of both SERVICES (marketplace visibility) and HERO_SERVICES
// (Coffee Owner hero icons) above — this controls whether the dark/light
// toggle appears in each account's own navbar: the original 7 non-Coffee-
// Owner service accounts, plus Supplier and Admin (added once Dark Mode
// support existed for those two areas too — same mechanism, same table,
// see dashboard-layout.tsx). Deliberately does NOT include Coffee Owner
// (its dark mode already exists independently of this control, per the
// original task's own instruction not to touch it).
const DARK_MODE_ACCOUNTS: { key: DarkModeAccount; label: string; icon: any }[] = [
  { key: "BARISTA_ACADEMY",     label: "ACADEMY",     icon: GraduationCap },
  { key: "BARISTA_MARKETPLACE", label: "BARISTA", icon: Users },
  { key: "DELIVERY_COMPANY",    label: "LIVRAISON",           icon: Truck },
  { key: "DRIVER",              label: "CHAUFFEUR",           icon: Car },
  { key: "PRINTER",             label: "PRINT",          icon: Printer },
  { key: "MAINTENANCE",         label: "MAINTENANCE",         icon: Wrench },
  { key: "MARKETING",           label: "MARKETING",           icon: Megaphone },
  { key: "SUPPLIER",            label: "SUPPLIER",            icon: Store },
  { key: "ADMIN",               label: "ADMIN",                icon: ShieldCheck },
];

const THEME_MODE_OPTIONS: { value: AccountThemeMode; label: string; icon: any }[] = [
  { value: "BOTH",       label: "Sombre + Clair",     icon: SunMoon },
  { value: "DARK_ONLY",  label: "Sombre uniquement",  icon: Moon },
  { value: "LIGHT_ONLY", label: "Clair uniquement",   icon: Sun },
];

function AccountDarkModeSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useAccountDarkModeSettings();
  const [local, setLocal] = useState<AccountDarkModeSettingsMap | null>(null);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: ({ account, mode }: { account: DarkModeAccount; mode: AccountThemeMode }) =>
      apiRequest("PATCH", `/api/admin/account-dark-mode-settings/${account}`, { mode }),
    onSuccess: async (response) => {
      const saved = await response.json();
      setLocal(saved);
      queryClient.setQueryData(["/api/account-dark-mode-settings"], saved);
      toast({ title: "Mode sombre mis à jour" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: error?.message }),
  });

  const value = local ?? settings;
  const update = (account: DarkModeAccount, mode: AccountThemeMode) => {
    setLocal({ ...value, [account]: mode });
    updateMutation.mutate({ account, mode });
  };

  return (
    <Card data-testid="card-account-dark-mode">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-slate-500/10 rounded-xl p-3"><Moon className="w-5 h-5 text-slate-600" /></div>
          <div>
            <CardTitle className="text-base">Mode sombre</CardTitle>
            <CardDescription className="pt-1">Choisir le(s) mode(s) de thème autorisé(s) dans la navbar de chaque compte de service — les deux, sombre uniquement, ou clair uniquement. Quand les deux sont autorisés, le compte s'ouvre en mode sombre par défaut.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {DARK_MODE_ACCOUNTS.map(({ key, label, icon: Icon }) => {
          const currentMode = value[key] ?? "BOTH";
          const isPending = updateMutation.isPending && updateMutation.variables?.account === key;
          return (
            <div key={key} className="rounded-xl border border-border/50 p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">{label}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-1.5">
                {THEME_MODE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={currentMode === opt.value ? "default" : "outline"}
                    disabled={isPending}
                    onClick={() => update(key, opt.value)}
                    className={`justify-start gap-1.5 flex-1 text-xs ${currentMode === opt.value ? "bg-slate-700 hover:bg-slate-800 text-white" : ""}`}
                    data-testid={`button-theme-mode-${key.toLowerCase()}-${opt.value.toLowerCase()}`}
                  >
                    <opt.icon className="w-3.5 h-3.5" />{opt.label}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Landing Page Config ───────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">{children}</Label>;
}

function ImageInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <SectionLabel>{label}</SectionLabel>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "https://..."} className="rounded-xl text-sm" />
      {value && (
        <img src={value} alt={label} className="h-20 w-full object-cover rounded-xl mt-1 border border-border/30" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      )}
    </div>
  );
}

function HeroSlidesEditor({ slides, onChange }: { slides: HeroSlide[]; onChange: (s: HeroSlide[]) => void }) {
  const addSlide = () => onChange([...slides, { imageUrl: "", title: "", description: "" }]);
  const removeSlide = (i: number) => onChange(slides.filter((_, idx) => idx !== i));
  const updateSlide = (i: number, field: keyof HeroSlide, val: string) => {
    const next = slides.map((s, idx) => idx === i ? { ...s, [field]: val } : s);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Hero Slides ({slides.length})</SectionLabel>
        <Button size="sm" variant="outline" onClick={addSlide} className="h-7 text-xs gap-1">
          <Plus className="w-3 h-3" /> Ajouter
        </Button>
      </div>
      {slides.map((slide, i) => (
        <div key={i} className="border border-border/50 rounded-xl p-4 space-y-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Slide {i + 1}</span>
            <button onClick={() => removeSlide(i)} className="text-destructive hover:text-destructive/80 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            <SectionLabel>Titre</SectionLabel>
            <Input value={slide.title} onChange={(e) => updateSlide(i, "title", e.target.value)} placeholder="Titre du slide" className="rounded-xl text-sm" />
          </div>
          <div className="space-y-1.5">
            <SectionLabel>Description</SectionLabel>
            <Input value={slide.description} onChange={(e) => updateSlide(i, "description", e.target.value)} placeholder="Description du slide" className="rounded-xl text-sm" />
          </div>
          <ImageInput label="Image de fond (URL)" value={slide.imageUrl} onChange={(v) => updateSlide(i, "imageUrl", v)} />
        </div>
      ))}
      {slides.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border/50 rounded-xl">
          Aucun slide configuré — les slides par défaut seront utilisés.
        </p>
      )}
    </div>
  );
}

function LandingConfigSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Open by default — this is now the sole content of the "Landing Page" tab (the default
  // tab on entering System Management), so the Admin must see it immediately, no extra click.
  const [open, setOpen] = useState(true);

  const { data: cfg, isLoading } = useQuery<LandingConfig>({ queryKey: ["/api/landing-config"] });

  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [shopImage, setShopImage] = useState("");
  const [printImage, setPrintImage] = useState("");
  const [marketingImage, setMarketingImage] = useState("");
  const [baristaAcademyImage, setBaristaAcademyImage] = useState("");
  const [baristaMarketplaceImage, setBaristaMarketplaceImage] = useState("");
  const [maintenanceImage, setMaintenanceImage] = useState("");
  const [footerDescription, setFooterDescription] = useState("");
  const [footerEmail, setFooterEmail] = useState("");
  const [footerPhone, setFooterPhone] = useState("");
  const [footerFacebook, setFooterFacebook] = useState("");
  const [footerInstagram, setFooterInstagram] = useState("");
  const [footerTiktok, setFooterTiktok] = useState("");

  // Initialise local state from fetched config
  const [initialized, setInitialized] = useState(false);
  if (cfg && !initialized) {
    setSlides(cfg.heroSlides ?? []);
    setShopImage(cfg.shopImage ?? "");
    setPrintImage(cfg.printImage ?? "");
    setMarketingImage(cfg.marketingImage ?? "");
    setBaristaAcademyImage(cfg.baristaAcademyImage ?? "");
    setBaristaMarketplaceImage(cfg.baristaMarketplaceImage ?? "");
    setMaintenanceImage(cfg.maintenanceImage ?? "");
    setFooterDescription(cfg.footerDescription ?? "");
    setFooterEmail(cfg.footerEmail ?? "");
    setFooterPhone(cfg.footerPhone ?? "");
    setFooterFacebook(cfg.footerFacebook ?? "");
    setFooterInstagram(cfg.footerInstagram ?? "");
    setFooterTiktok(cfg.footerTiktok ?? "");
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/admin/landing-config", {
        heroSlides: slides,
        shopImage, printImage, marketingImage,
        baristaAcademyImage, baristaMarketplaceImage,
        maintenanceImage,
        footerDescription, footerEmail, footerPhone,
        footerFacebook, footerInstagram, footerTiktok,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/landing-config"] });
      toast({ title: "✅ Configuration de la Landing Page sauvegardée" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de sauvegarder la configuration." });
    },
  });

  return (
    <Card data-testid="card-landing-config">
      <CardHeader className="pb-3">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-3">
            <div className="bg-muted rounded-lg p-2.5">
              <LayoutTemplate className="w-5 h-5 text-foreground/70" />
            </div>
            <div>
              <CardTitle className="text-base">Landing Page</CardTitle>
              <CardDescription className="pt-1 text-sm">
                Hero, sections, images et contenu du pied de page.
              </CardDescription>
            </div>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="pt-0 space-y-8">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <>
              {/* ── Hero Slides ── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Image className="w-4 h-4 text-amber-500" />
                  <h3 className="font-semibold text-sm">Carousel Hero</h3>
                </div>
                <HeroSlidesEditor slides={slides} onChange={setSlides} />
              </section>

              {/* ── Section Images ── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Image className="w-4 h-4 text-blue-500" />
                  <h3 className="font-semibold text-sm">Images des sections</h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <ImageInput label="Image — Section SHOP" value={shopImage} onChange={setShopImage} />
                  <ImageInput label="Image — Section PRINT" value={printImage} onChange={setPrintImage} />
                  <ImageInput label="Image — Section MARKETING" value={marketingImage} onChange={setMarketingImage} />
                  <ImageInput label="Image — Section Academy" value={baristaAcademyImage} onChange={setBaristaAcademyImage} />
                  <ImageInput label="Image — Section Barista" value={baristaMarketplaceImage} onChange={setBaristaMarketplaceImage} />
                  <ImageInput label="Image — Section Maintenance" value={maintenanceImage} onChange={setMaintenanceImage} />
                </div>
              </section>

              {/* ── Footer ── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm">🦶</span>
                  <h3 className="font-semibold text-sm">Pied de page (Footer)</h3>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <SectionLabel>Description</SectionLabel>
                    <Textarea value={footerDescription} onChange={(e) => setFooterDescription(e.target.value)}
                      placeholder="La marketplace B2B dédiée aux professionnels du café en Tunisie."
                      className="rounded-xl text-sm resize-none" rows={2} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <SectionLabel>Email de contact</SectionLabel>
                      <Input value={footerEmail} onChange={(e) => setFooterEmail(e.target.value)} placeholder="contact@bigbosscoffee.tn" className="rounded-xl text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <SectionLabel>Téléphone</SectionLabel>
                      <Input value={footerPhone} onChange={(e) => setFooterPhone(e.target.value)} placeholder="+216 71 000 000" className="rounded-xl text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <SectionLabel>Facebook (URL)</SectionLabel>
                      <Input value={footerFacebook} onChange={(e) => setFooterFacebook(e.target.value)} placeholder="https://facebook.com/bigbosscoffee" className="rounded-xl text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <SectionLabel>Instagram (URL)</SectionLabel>
                      <Input value={footerInstagram} onChange={(e) => setFooterInstagram(e.target.value)} placeholder="https://instagram.com/bigbosscoffee" className="rounded-xl text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <SectionLabel>TikTok (URL)</SectionLabel>
                      <Input value={footerTiktok} onChange={(e) => setFooterTiktok(e.target.value)} placeholder="https://tiktok.com/@bigbosscoffee" className="rounded-xl text-sm" />
                    </div>
                  </div>
                </div>
              </section>

              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl" data-testid="button-save-landing-config">
                {saveMutation.isPending ? "Sauvegarde..." : "Sauvegarder la configuration"}
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Global Currency ───────────────────────────────────────────────────────────

const CURRENCY_OPTIONS: { symbol: string; label: string }[] = [
  { symbol: "DT",   label: "DT — Tunisian Dinar" },
  { symbol: "د.ت",  label: "د.ت — Dinar Tunisien (arabe)" },
  { symbol: "$",    label: "$ — US Dollar" },
  { symbol: "€",    label: "€ — Euro" },
  { symbol: "£",    label: "£ — British Pound" },
  { symbol: "AED",  label: "AED — UAE Dirham" },
  { symbol: "SAR",  label: "SAR — Saudi Riyal" },
  { symbol: "MAD",  label: "MAD — Moroccan Dirham" },
  { symbol: "DZD",  label: "DZD — Algerian Dinar" },
  { symbol: "¥",    label: "¥ — Japanese Yen" },
  { symbol: "₹",    label: "₹ — Indian Rupee" },
  { symbol: "CHF",  label: "CHF — Swiss Franc" },
  { symbol: "CAD",  label: "CAD — Canadian Dollar" },
  { symbol: "AUD",  label: "AUD — Australian Dollar" },
];

function GlobalCurrencySection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ symbol: string }>({ queryKey: ["/api/system-currency"] });

  const saveMutation = useMutation({
    mutationFn: (symbol: string) => apiRequest("PATCH", "/api/admin/system-currency", { symbol }),
    onSuccess: (_data, symbol) => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-currency"] });
      toast({ title: `✅ Currency updated to ${symbol}` });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to update currency", description: "Please try again." });
    },
  });

  const currentSymbol = data?.symbol ?? "DT";

  return (
    <Card data-testid="card-global-currency">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-muted rounded-lg p-2.5">
            <CircleDollarSign className="w-5 h-5 text-foreground/70" />
          </div>
          <div>
            <CardTitle className="text-base">Global Currency</CardTitle>
            <CardDescription className="pt-1 text-sm">
              Currency symbol displayed across the entire platform for all users.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="space-y-3">
            <SectionLabel>Active currency</SectionLabel>
            <Select
              value={currentSymbol}
              onValueChange={(symbol) => saveMutation.mutate(symbol)}
              disabled={saveMutation.isPending}
            >
              <SelectTrigger className="rounded-xl" data-testid="select-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.symbol} value={opt.symbol} data-testid={`option-currency-${opt.symbol}`}>
                    <span className="font-mono font-semibold mr-2">{opt.symbol}</span>
                    <span className="text-muted-foreground text-sm">{opt.label.split("—")[1]?.trim()}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {saveMutation.isPending && (
              <p className="text-xs text-muted-foreground">Saving…</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Delivery Company Visibility ──────────────────────────────────────────────
// Task: "Admin Delivery Company Visibility Control and Supplier Delivery Workflow". Same
// single auto-seeded settings row + Switch/Badge pattern as DiscountCodeSettingsSection above,
// against the new /api/delivery-company-visibility + PATCH /api/admin/delivery-company-visibility
// endpoints. Hiding this never deletes a Delivery Company account, driver, or existing
// delivery/assignment — it only gates new DELIVERY_COMPANY registrations and new Supplier
// dispatch/reassignment to an external company (enforced server-side; see auth.routes.ts and
// delivery.routes.ts's PATCH /api/deliveries/:id/dispatch). The Supplier's own driver
// ("Mes chauffeurs") workflow is never affected by this setting.
type DeliveryCompanyVisibilityAdmin = { visible: boolean };

function DeliveryCompanyVisibilitySection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<DeliveryCompanyVisibilityAdmin>({ queryKey: ["/api/delivery-company-visibility"] });
  const [local, setLocal] = useState<DeliveryCompanyVisibilityAdmin | null>(null);

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  const value = local ?? settings;

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<DeliveryCompanyVisibilityAdmin>) =>
      apiRequest("PATCH", "/api/admin/delivery-company-visibility", updates),
    onSuccess: async (response) => {
      const saved = await response.json();
      setLocal(saved);
      queryClient.setQueryData(["/api/delivery-company-visibility"], saved);
      toast({ title: "Visibilité des entreprises de livraison mise à jour" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: error?.message }),
  });

  const statusBadgeClass = (enabled: boolean) => enabled
    ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30"
    : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-500/15 dark:text-gray-400 dark:border-gray-500/30";

  const update = (field: keyof DeliveryCompanyVisibilityAdmin, next: boolean) => {
    if (!value) return;
    setLocal({ ...value, [field]: next });
    saveMutation.mutate({ [field]: next });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-green-500/10 rounded-xl p-3"><Truck className="w-5 h-5 text-green-600" /></div>
          <div>
            <CardTitle className="text-base">Visibilité des entreprises de livraison</CardTitle>
            <CardDescription className="pt-1">Contrôlez l'inscription de nouvelles entreprises de livraison et la disponibilité de leurs options de dispatch chez les fournisseurs.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!value ? <Skeleton className="h-20 w-full" /> : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
              <div>
                <p className="text-sm font-medium">Entreprises de livraison</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Visible : l'inscription Entreprise de livraison et les options de dispatch externe correspondantes chez les fournisseurs sont disponibles (sous réserve qu'une entreprise éligible avec au moins un chauffeur existe). Masqué : l'inscription et ces options de dispatch sont désactivées ; les fournisseurs continuent d'assigner leurs propres chauffeurs normalement.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline" className={`text-xs ${statusBadgeClass(value.visible)}`} data-testid="badge-delivery-company-visibility-status">
                  {value.visible ? "Visible" : "Masqué"}
                </Badge>
                <Switch
                  checked={value.visible}
                  onCheckedChange={(checked) => update("visible", checked)}
                  disabled={saveMutation.isPending}
                  aria-label="Visibilité des entreprises de livraison"
                  data-testid="switch-delivery-company-visibility"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Masquer ne supprime aucun compte, chauffeur, livraison ou historique existant ; les livraisons déjà confiées à une entreprise de livraison conservent leur statut et leur historique inchangés.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Delivery Pricing configuration ───────────────────────────────────────────
// One centralized section per task requirement ("Do not scatter configuration
// across unrelated Admin pages") — everything the fee engine in
// server/storage.ts computeDeliveryFee() reads lives here. Vehicle price/km +
// minimum fee, the active surge multiplier, and the default Coffee Owner/
// Supplier fee split. See shared/schema.ts deliveryPricingSettings.

const VEHICLE_TYPES: DeliveryVehicleType[] = ["BICYCLE", "MOTO", "CAR", "VAN", "TRUCK", "OTHER"];

function DeliveryPricingSection() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useDeliveryPricingSettings();
  const update = useUpdateDeliveryPricingSettings();
  const [local, setLocal] = useState<typeof settings | null>(null);

  useEffect(() => { if (settings) setLocal(settings); }, [settings]);

  const value = local ?? settings;
  if (isLoading || !value) {
    return <Card><CardContent className="pt-6"><Skeleton className="h-40 w-full" /></CardContent></Card>;
  }

  const saveVehicle = (type: DeliveryVehicleType, field: "pricePerKmCents" | "minFeeCents", dt: string) => {
    const cents = Math.max(0, Math.round(parseFloat(dt || "0") * 100));
    const nextPricing = { ...value.vehiclePricing, [type]: { ...value.vehiclePricing[type], [field]: cents } };
    setLocal({ ...value, vehiclePricing: nextPricing });
    update.mutate({ vehiclePricing: nextPricing }, {
      onSuccess: () => toast({ title: "Tarification mise à jour" }),
      onError: (e: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: e?.message }),
    });
  };

  // Delivery System V2 Phase 2 — optional per-vehicle capacity. Empty input = unset (no
  // capacity constraint enforced for that dimension); never defaults to 0, which would
  // silently block every assignment instead of leaving the dimension unconstrained.
  const saveVehicleCapacity = (type: DeliveryVehicleType, field: "maxWeightKg" | "maxVolumeL" | "maxPackages", raw: string) => {
    const current = { ...value.vehiclePricing[type] };
    if (raw.trim() === "") { delete (current as any)[field]; }
    else { (current as any)[field] = field === "maxPackages" ? Math.max(0, Math.round(parseFloat(raw))) : Math.max(0, parseFloat(raw)); }
    const nextPricing = { ...value.vehiclePricing, [type]: current };
    setLocal({ ...value, vehiclePricing: nextPricing });
    update.mutate({ vehiclePricing: nextPricing }, {
      onSuccess: () => toast({ title: "Capacité mise à jour" }),
      onError: (e: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: e?.message }),
    });
  };

  const saveField = (field: "defaultVehicleType" | "surgeMultiplierPermille" | "surgeLabel" | "cafeOwnerSharePercent" | "driverPayoutSharePercent"
    | "activeWeatherCondition" | "waitingFreeMinutes" | "waitingPricePerMinuteCents" | "waitingDriverCompensationPerMinuteCents" | "waitingMaxChargeCents" | "maxCombinedMultiplierPermille", val: any) => {
    setLocal({ ...value, [field]: val });
    update.mutate({ [field]: val } as any, {
      onSuccess: () => toast({ title: "Configuration mise à jour" }),
      onError: (e: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: e?.message }),
    });
  };

  // Delivery System V2 Phase 4 — WeatherPricingEngine + DeliverySafetyEngine per-condition
  // config. 'NORMAL' is never configurable (always hardcoded-neutral server-side).
  const saveWeatherConfig = (condition: string, field: "customerMultiplierPermille" | "driverIncentiveCents" | "safetyState" | "restrictedVehicleTypes", val: any) => {
    const current = { ...(value.weatherConditionConfigs?.[condition] ?? {}) };
    (current as any)[field] = val;
    const next = { ...value.weatherConditionConfigs, [condition]: current };
    setLocal({ ...value, weatherConditionConfigs: next });
    update.mutate({ weatherConditionConfigs: next } as any, {
      onSuccess: () => toast({ title: "Configuration météo mise à jour" }),
      onError: (e: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: e?.message }),
    });
  };

  // PeakHourEngine — Admin-defined windows, no hard-coded hours. Whole-array save (same
  // pattern as vehiclePricing/weatherConditionConfigs — the settings row is the single
  // source of truth, one PATCH per change).
  const savePeakHourWindows = (next: DeliveryPricingSettings["peakHourWindows"]) => {
    setLocal({ ...value, peakHourWindows: next });
    update.mutate({ peakHourWindows: next } as any, {
      onSuccess: () => toast({ title: "Heures de pointe mises à jour" }),
      onError: (e: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: e?.message }),
    });
  };
  const addPeakHourWindow = () => savePeakHourWindows([...(value.peakHourWindows ?? []), {
    id: Math.random().toString(36).slice(2), label: "", daysOfWeek: [1, 2, 3, 4, 5],
    startTime: "12:00", endTime: "14:00", customerMultiplierPermille: 1000, driverIncentiveCents: 0, isActive: true,
  }]);
  const updatePeakHourWindow = (id: string, patch: Partial<DeliveryPricingSettings["peakHourWindows"][number]>) =>
    savePeakHourWindows((value.peakHourWindows ?? []).map((w) => w.id === id ? { ...w, ...patch } : w));
  const removePeakHourWindow = (id: string) => savePeakHourWindows((value.peakHourWindows ?? []).filter((w) => w.id !== id));

  // ZonePricingEngine — governorate-match v1 (see server/storage.ts resolveZonePricing doc).
  const saveZones = (next: DeliveryPricingSettings["zones"]) => {
    setLocal({ ...value, zones: next });
    update.mutate({ zones: next } as any, {
      onSuccess: () => toast({ title: "Zones mises à jour" }),
      onError: (e: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: e?.message }),
    });
  };
  const addZone = () => saveZones([...(value.zones ?? []), {
    id: Math.random().toString(36).slice(2), name: "", governorateMatch: "", isActive: true,
  }]);
  const updateZone = (id: string, patch: Partial<DeliveryPricingSettings["zones"][number]>) =>
    saveZones((value.zones ?? []).map((z) => z.id === id ? { ...z, ...patch } : z));
  const removeZone = (id: string) => saveZones((value.zones ?? []).filter((z) => z.id !== id));

  const WEATHER_CONDITIONS: { value: string; label: string }[] = [
    { value: "NORMAL", label: "Normal" }, { value: "RAIN", label: "Pluie" },
    { value: "HEAVY_RAIN", label: "Forte pluie" }, { value: "STORM", label: "Orage" }, { value: "EXTREME", label: "Extrême" },
  ];
  const SAFETY_STATES: { value: string; label: string }[] = [
    { value: "ALLOW", label: "Autorisé" }, { value: "ALLOW_WITH_WARNING", label: "Autorisé (avertissement)" },
    { value: "RESTRICT", label: "Restreint (véhicules choisis)" }, { value: "SUSPEND", label: "Suspendu (aucune livraison)" },
  ];
  const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  return (
    <Card data-testid="card-delivery-pricing">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500/10 rounded-lg p-2.5"><Truck className="w-5 h-5 text-indigo-600" /></div>
          <div>
            <CardTitle className="text-base">Tarification des livraisons</CardTitle>
            <CardDescription className="pt-1 text-sm">
              Prix/km et frais minimum par type de véhicule, multiplicateur actif, et répartition par défaut du frais de livraison.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-5">
        <div>
          <SectionLabel>Tarification par véhicule</SectionLabel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="border-b text-left text-muted-foreground text-xs">
                  <th className="p-2">Véhicule</th>
                  <th className="p-2">Prix / km</th>
                  <th className="p-2">Frais minimum</th>
                  <th className="p-2">Poids max (kg)</th>
                  <th className="p-2">Volume max (L)</th>
                  <th className="p-2">Colis max</th>
                </tr>
              </thead>
              <tbody>
                {VEHICLE_TYPES.map((type) => (
                  <tr key={type} className="border-b last:border-0" data-testid={`row-vehicle-pricing-${type}`}>
                    <td className="p-2 font-medium">{VEHICLE_TYPE_LABELS[type]}</td>
                    <td className="p-2">
                      <Input
                        type="number" min={0} step="0.1" className="w-28 h-8"
                        defaultValue={(value.vehiclePricing[type]?.pricePerKmCents ?? 0) / 100}
                        onBlur={(e) => saveVehicle(type, "pricePerKmCents", e.target.value)}
                        data-testid={`input-price-per-km-${type}`}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" min={0} step="0.1" className="w-28 h-8"
                        defaultValue={(value.vehiclePricing[type]?.minFeeCents ?? 0) / 100}
                        onBlur={(e) => saveVehicle(type, "minFeeCents", e.target.value)}
                        data-testid={`input-min-fee-${type}`}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" min={0} step="0.1" className="w-24 h-8" placeholder="—"
                        defaultValue={value.vehiclePricing[type]?.maxWeightKg ?? ""}
                        onBlur={(e) => saveVehicleCapacity(type, "maxWeightKg", e.target.value)}
                        data-testid={`input-max-weight-${type}`}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" min={0} step="0.1" className="w-24 h-8" placeholder="—"
                        defaultValue={value.vehiclePricing[type]?.maxVolumeL ?? ""}
                        onBlur={(e) => saveVehicleCapacity(type, "maxVolumeL", e.target.value)}
                        data-testid={`input-max-volume-${type}`}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" min={0} step="1" className="w-24 h-8" placeholder="—"
                        defaultValue={value.vehiclePricing[type]?.maxPackages ?? ""}
                        onBlur={(e) => saveVehicleCapacity(type, "maxPackages", e.target.value)}
                        data-testid={`input-max-packages-${type}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Montants en DT. Enregistrement automatique en quittant le champ. Capacité (poids/volume/colis) optionnelle — laissez vide pour ne pas contraindre ce véhicule.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border/50">
          <div>
            <SectionLabel>Véhicule par défaut (avant assignation d'un chauffeur)</SectionLabel>
            <Select value={value.defaultVehicleType} onValueChange={(v) => saveField("defaultVehicleType", v)}>
              <SelectTrigger className="mt-1.5" data-testid="select-default-vehicle"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VEHICLE_TYPES.map((t) => <SelectItem key={t} value={t}>{VEHICLE_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <SectionLabel>Répartition Coffee Owner (%) — le reste est à la charge du fournisseur</SectionLabel>
            <Input
              type="number" min={0} max={100} className="mt-1.5"
              defaultValue={value.cafeOwnerSharePercent}
              onBlur={(e) => saveField("cafeOwnerSharePercent", Math.max(0, Math.min(100, Math.round(parseFloat(e.target.value || "0")))))}
              data-testid="input-cafe-owner-share"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border/50">
          <div>
            <SectionLabel><span className="inline-flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Multiplicateur actif (×)</span></SectionLabel>
            <Input
              type="number" min={0} step="0.1" className="mt-1.5"
              defaultValue={value.surgeMultiplierPermille / 1000}
              onBlur={(e) => saveField("surgeMultiplierPermille", Math.max(0, Math.round(parseFloat(e.target.value || "1") * 1000)))}
              data-testid="input-surge-multiplier"
            />
          </div>
          <div>
            <SectionLabel>Motif / étiquette (optionnel)</SectionLabel>
            <Input
              className="mt-1.5" placeholder="ex : Pluie forte, forte chaleur…"
              defaultValue={value.surgeLabel}
              onBlur={(e) => saveField("surgeLabel", e.target.value)}
              data-testid="input-surge-label"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border/50">
          <div>
            <SectionLabel>Part chauffeur / opérateur (%) — reproduit le comportement actuel par défaut (100%)</SectionLabel>
            <Input
              type="number" min={0} max={100} className="mt-1.5"
              defaultValue={value.driverPayoutSharePercent ?? 100}
              onBlur={(e) => saveField("driverPayoutSharePercent", Math.max(0, Math.min(100, Math.round(parseFloat(e.target.value || "100")))))}
              data-testid="input-driver-payout-share"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Part du frais de livraison versée au chauffeur/opérateur assigné. Le reste constitue la marge de l'entreprise de livraison (0 en mode chauffeurs du fournisseur).
            </p>
          </div>
        </div>

        {/* Delivery System V2 Phase 4 — WeatherPricingEngine + DeliverySafetyEngine */}
        <div className="pt-3 border-t border-border/50">
          <SectionLabel><span className="inline-flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Météo — condition active et impact</span></SectionLabel>
          <div className="mt-1.5">
            <Select value={value.activeWeatherCondition ?? "NORMAL"} onValueChange={(v) => saveField("activeWeatherCondition", v)}>
              <SelectTrigger className="w-56" data-testid="select-weather-condition"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEATHER_CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground text-xs">
                  <th className="p-2">Condition</th>
                  <th className="p-2">Multiplicateur client (×)</th>
                  <th className="p-2">Prime chauffeur (DT)</th>
                  <th className="p-2">Sécurité</th>
                  <th className="p-2">Véhicules restreints</th>
                </tr>
              </thead>
              <tbody>
                {WEATHER_CONDITIONS.filter((c) => c.value !== "NORMAL").map((c) => {
                  const cfg = value.weatherConditionConfigs?.[c.value] ?? {};
                  return (
                    <tr key={c.value} className="border-b last:border-0" data-testid={`row-weather-${c.value}`}>
                      <td className="p-2 font-medium">{c.label}</td>
                      <td className="p-2">
                        <Input type="number" min={0} step="0.1" className="w-24 h-8"
                          defaultValue={(cfg.customerMultiplierPermille ?? 1000) / 1000}
                          onBlur={(e) => saveWeatherConfig(c.value, "customerMultiplierPermille", Math.max(0, Math.round(parseFloat(e.target.value || "1") * 1000)))}
                          data-testid={`input-weather-multiplier-${c.value}`} />
                      </td>
                      <td className="p-2">
                        <Input type="number" min={0} step="0.1" className="w-24 h-8"
                          defaultValue={(cfg.driverIncentiveCents ?? 0) / 100}
                          onBlur={(e) => saveWeatherConfig(c.value, "driverIncentiveCents", Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)))}
                          data-testid={`input-weather-incentive-${c.value}`} />
                      </td>
                      <td className="p-2">
                        <Select value={cfg.safetyState ?? "ALLOW"} onValueChange={(v) => saveWeatherConfig(c.value, "safetyState", v)}>
                          <SelectTrigger className="w-44 h-8" data-testid={`select-weather-safety-${c.value}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SAFETY_STATES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {VEHICLE_TYPES.map((t) => {
                            const restricted = (cfg.restrictedVehicleTypes ?? []).includes(t);
                            return (
                              <button key={t} type="button"
                                className={`text-[10px] px-1.5 py-0.5 rounded border ${restricted ? "bg-red-500/10 border-red-400 text-red-600" : "border-border text-muted-foreground"}`}
                                onClick={() => {
                                  const list = cfg.restrictedVehicleTypes ?? [];
                                  const next = restricted ? list.filter((x) => x !== t) : [...list, t];
                                  saveWeatherConfig(c.value, "restrictedVehicleTypes", next);
                                }}
                                data-testid={`toggle-restrict-${c.value}-${t}`}
                              >{VEHICLE_TYPE_LABELS[t]}</button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Aucune API météo n'est intégrée — la condition active est déclarée manuellement ici. "Restreint" bloque l'assignation des véhicules sélectionnés ; "Suspendu" bloque toute nouvelle assignation.
          </p>
        </div>

        {/* Delivery System V2 Phase 4 — PeakHourEngine */}
        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center justify-between">
            <SectionLabel>Heures de pointe</SectionLabel>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addPeakHourWindow} data-testid="button-add-peak-window">
              <Plus className="w-3 h-3 mr-1" />Ajouter
            </Button>
          </div>
          <div className="space-y-2 mt-2">
            {(value.peakHourWindows ?? []).length === 0 && <p className="text-xs text-muted-foreground">Aucune période configurée — le multiplicateur actif ci-dessus reste le seul en vigueur.</p>}
            {(value.peakHourWindows ?? []).map((w) => (
              <div key={w.id} className="border border-border/50 rounded-lg p-2.5 space-y-2" data-testid={`row-peak-window-${w.id}`}>
                <div className="flex items-center gap-2">
                  <Input className="h-8 flex-1" placeholder="Nom (ex: Déjeuner)" defaultValue={w.label} onBlur={(e) => updatePeakHourWindow(w.id, { label: e.target.value })} />
                  <Switch checked={w.isActive} onCheckedChange={(v) => updatePeakHourWindow(w.id, { isActive: v })} />
                  <Button type="button" size="icon" variant="outline" className="h-8 w-8 text-red-500" onClick={() => removePeakHourWindow(w.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex gap-1">
                    {DAY_LABELS.map((d, i) => {
                      const on = w.daysOfWeek.includes(i);
                      return (
                        <button key={i} type="button"
                          className={`text-[10px] w-8 h-6 rounded border ${on ? "bg-indigo-500/10 border-indigo-400 text-indigo-600" : "border-border text-muted-foreground"}`}
                          onClick={() => updatePeakHourWindow(w.id, { daysOfWeek: on ? w.daysOfWeek.filter((x) => x !== i) : [...w.daysOfWeek, i] })}
                        >{d}</button>
                      );
                    })}
                  </div>
                  <Input type="time" className="h-8 w-28" defaultValue={w.startTime} onBlur={(e) => updatePeakHourWindow(w.id, { startTime: e.target.value })} />
                  <span className="text-xs text-muted-foreground">→</span>
                  <Input type="time" className="h-8 w-28" defaultValue={w.endTime} onBlur={(e) => updatePeakHourWindow(w.id, { endTime: e.target.value })} />
                  <Input type="number" min={0} step="0.1" className="h-8 w-24" title="Multiplicateur client (×)"
                    defaultValue={w.customerMultiplierPermille / 1000}
                    onBlur={(e) => updatePeakHourWindow(w.id, { customerMultiplierPermille: Math.max(0, Math.round(parseFloat(e.target.value || "1") * 1000)) })} />
                  <Input type="number" min={0} step="0.1" className="h-8 w-24" title="Prime chauffeur (DT)"
                    defaultValue={w.driverIncentiveCents / 100}
                    onBlur={(e) => updatePeakHourWindow(w.id, { driverIncentiveCents: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)) })} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Si plusieurs périodes actives se chevauchent, le multiplicateur le plus élevé s'applique (jamais cumulés).</p>
        </div>

        {/* Delivery System V2 Phase 4 — ZonePricingEngine */}
        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center justify-between">
            <SectionLabel>Zones de livraison</SectionLabel>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addZone} data-testid="button-add-zone">
              <Plus className="w-3 h-3 mr-1" />Ajouter
            </Button>
          </div>
          <div className="space-y-2 mt-2">
            {(value.zones ?? []).length === 0 && <p className="text-xs text-muted-foreground">Aucune zone configurée — aucun ajustement de zone n'est appliqué.</p>}
            {(value.zones ?? []).map((z) => (
              <div key={z.id} className="flex flex-wrap items-center gap-2 border border-border/50 rounded-lg p-2.5" data-testid={`row-zone-${z.id}`}>
                <Input className="h-8 w-40" placeholder="Nom (ex: Zone Nord)" defaultValue={z.name} onBlur={(e) => updateZone(z.id, { name: e.target.value })} />
                <Input className="h-8 w-40" placeholder="Gouvernorat (ex: Ariana)" defaultValue={z.governorateMatch} onBlur={(e) => updateZone(z.id, { governorateMatch: e.target.value })} />
                <Input type="number" min={0} step="0.1" className="h-8 w-24" title="Multiplicateur (×)"
                  defaultValue={z.multiplierPermille != null ? z.multiplierPermille / 1000 : ""} placeholder="×1.0"
                  onBlur={(e) => updateZone(z.id, { multiplierPermille: e.target.value.trim() === "" ? undefined : Math.max(0, Math.round(parseFloat(e.target.value) * 1000)) })} />
                <Input type="number" min={0} step="0.1" className="h-8 w-28" title="Frais minimum (DT)"
                  defaultValue={z.minFeeOverrideCents != null ? z.minFeeOverrideCents / 100 : ""} placeholder="Frais min"
                  onBlur={(e) => updateZone(z.id, { minFeeOverrideCents: e.target.value.trim() === "" ? undefined : Math.max(0, Math.round(parseFloat(e.target.value) * 100)) })} />
                <Switch checked={z.isActive} onCheckedChange={(v) => updateZone(z.id, { isActive: v })} />
                <Button type="button" size="icon" variant="outline" className="h-8 w-8 text-red-500" onClick={() => removeZone(z.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            La zone correspond au gouvernorat de destination (adresse de livraison du café). Le frais minimum de zone ne peut que relever le minimum du véhicule, jamais l'abaisser.
          </p>
        </div>

        {/* Delivery System V2 Phase 4 — WaitingTimePricingEngine */}
        <div className="pt-3 border-t border-border/50">
          <SectionLabel>Temps d'attente (chauffeur chez le fournisseur)</SectionLabel>
          <div className="grid sm:grid-cols-4 gap-3 mt-1.5">
            <div>
              <Label className="text-xs text-muted-foreground">Minutes gratuites</Label>
              <Input type="number" min={0} className="mt-1 h-8" defaultValue={value.waitingFreeMinutes ?? 0}
                onBlur={(e) => saveField("waitingFreeMinutes", Math.max(0, Math.round(parseFloat(e.target.value || "0"))))} data-testid="input-waiting-free-minutes" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Prix/min client (DT)</Label>
              <Input type="number" min={0} step="0.01" className="mt-1 h-8" defaultValue={(value.waitingPricePerMinuteCents ?? 0) / 100}
                onBlur={(e) => saveField("waitingPricePerMinuteCents", Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)))} data-testid="input-waiting-price" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Compensation/min chauffeur (DT)</Label>
              <Input type="number" min={0} step="0.01" className="mt-1 h-8" defaultValue={(value.waitingDriverCompensationPerMinuteCents ?? 0) / 100}
                onBlur={(e) => saveField("waitingDriverCompensationPerMinuteCents", Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)))} data-testid="input-waiting-compensation" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Plafond (DT, optionnel)</Label>
              <Input type="number" min={0} step="0.1" className="mt-1 h-8" placeholder="—" defaultValue={value.waitingMaxChargeCents != null ? value.waitingMaxChargeCents / 100 : ""}
                onBlur={(e) => saveField("waitingMaxChargeCents", e.target.value.trim() === "" ? null : Math.max(0, Math.round(parseFloat(e.target.value) * 100)))} data-testid="input-waiting-max" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Facturé uniquement si le chauffeur a signalé son arrivée chez le fournisseur avant la collecte. Tant que le prix/min est à 0, l'attente n'est jamais facturée.
          </p>
        </div>

        {/* Multiplier Safety (rule 8) */}
        <div className="pt-3 border-t border-border/50">
          <SectionLabel>Plafond de sécurité — multiplicateur combiné maximum (×)</SectionLabel>
          <Input type="number" min={1} step="0.1" className="mt-1.5 w-40"
            defaultValue={(value.maxCombinedMultiplierPermille ?? 100000) / 1000}
            onBlur={(e) => saveField("maxCombinedMultiplierPermille", Math.max(1000, Math.round(parseFloat(e.target.value || "100") * 1000)))}
            data-testid="input-max-combined-multiplier" />
          <p className="text-xs text-muted-foreground mt-1">
            Borne le produit météo × pointe × zone combinés (jamais chaque facteur individuellement, déjà plafonné à sa propre source). Valeur très élevée par défaut = aucune limite réelle tant qu'elle n'est pas ajustée.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Formule appliquée à chaque livraison : distance (chauffeur→fournisseur + fournisseur→café) × prix/km du véhicule × multiplicateur, avec un plancher au frais minimum du véhicule. Les livraisons déjà terminées conservent leur montant historique — un changement ici n'affecte que les nouvelles livraisons et les assignations à venir.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SystemManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Landing Page is the default/open tab (task requirement — Admin must see Landing Page
  // configuration immediately on entering System Management, no extra click).
  const [activeSection, setActiveSection] = useState<SystemManagementSection>("landing");
  const [supplierSubSection, setSupplierSubSection] = useState<SupplierSubSection>("tabs");

  const { data: states, isLoading } = useQuery<ServiceStatesMap>({ queryKey: ["/api/system-services"] });
  const { order: savedOrder } = useServiceOrder();
  const [serviceOrder, setServiceOrder] = useState<MarketplaceServiceId[]>(savedOrder);
  const [draggedService, setDraggedService] = useState<MarketplaceServiceId | null>(null);

  useEffect(() => setServiceOrder(savedOrder), [savedOrder.join("|")]);

  const updateState = useMutation({
    mutationFn: ({ service, state }: { service: ServiceKey; state: ServiceState }) =>
      apiRequest("PATCH", `/api/admin/system-services/${service}`, { state }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-services"] });
      toast({ title: "Service visibility updated" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to update service", description: "Please try again." });
    },
  });

  const updateOrder = useMutation({
    mutationFn: (order: MarketplaceServiceId[]) =>
      apiRequest("PATCH", "/api/admin/system-service-order", { order }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-service-order"] });
      toast({ title: "Service order updated" });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to update service order" }),
  });

  const orderedCards = serviceOrder.map((id) => SERVICE_ORDER_CARDS.find((card) => card.id === id)).filter(Boolean) as typeof SERVICE_ORDER_CARDS;
  const moveService = (target: MarketplaceServiceId) => {
    if (!draggedService || draggedService === target) return;
    const next = [...serviceOrder];
    const from = next.indexOf(draggedService);
    const to = next.indexOf(target);
    next.splice(from, 1);
    next.splice(to, 0, draggedService);
    setServiceOrder(next);
    updateOrder.mutate(next);
    setDraggedService(null);
  };

  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title={<span className="flex items-center gap-2" data-testid="text-page-title"><Sliders className="w-6 h-6 text-amber-600" />System Management</span>}
        subtitle="Control the global visibility of each marketplace service and configure the Landing Page."
        gradientClass="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20"
      />

      {/* ── Horizontal section switcher — scrolls on mobile instead of wrapping ── */}
      <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 w-max min-w-full sm:w-fit">
          {SYSTEM_MANAGEMENT_SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${activeSection === id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`tab-system-management-${id}`}
            >
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Landing Page ── */}
      {activeSection === "landing" && (
        <LandingConfigSection />
      )}

      {/* ── Delivery (pricing + Delivery Company visibility — the admin financial management
          modules that used to render here were removed; see task "Simplify Admin Delivery
          Configuration — Remove Financial Management Modules") ── */}
      {activeSection === "delivery" && (
        <div className="space-y-6">
          <DeliveryCompanyVisibilitySection />
          <DeliveryPricingSection />
        </div>
      )}

      {/* ── Services (whole-service visibility + Hero Actions per service) ── */}
      {activeSection === "services" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {isLoading
              ? Array.from({ length: SERVICE_ORDER_CARDS.length }).map((_, i) => (
                  <Card key={i}><CardContent className="p-6"><Skeleton className="h-6 w-32 mb-3" /><Skeleton className="h-4 w-full mb-1" /><Skeleton className="h-4 w-2/3 mb-4" /><Skeleton className="h-9 w-full" /></CardContent></Card>
                ))
              : orderedCards.map((svc) => {
                  const serviceKey = svc.key;
                  const currentState: ServiceState = serviceKey ? (states?.[serviceKey] ?? "VISIBLE") : "VISIBLE";
                  const currentOption = STATE_OPTIONS.find((o) => o.value === currentState)!;
                  const isPending = !!serviceKey && updateState.isPending && updateState.variables?.service === serviceKey;
                  return (
                    <Card key={svc.id} draggable onDragStart={() => setDraggedService(svc.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => moveService(svc.id)} data-testid={`card-service-${svc.id.toLowerCase()}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" aria-label="Drag to reorder" />
                            <div className="bg-muted rounded-lg p-2.5"><svc.icon className="w-5 h-5 text-foreground/70" /></div>
                            <CardTitle className="text-base">{svc.label}</CardTitle>
                          </div>
                          <Badge variant="outline" className={`text-xs ${currentOption.badgeClass}`} data-testid={`badge-status-${(serviceKey ?? svc.id).toLowerCase()}`}>
                            {currentOption.label}
                          </Badge>
                        </div>
                        <CardDescription className="pt-2 text-sm">{svc.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex flex-col gap-2">
                          {serviceKey && STATE_OPTIONS.map((opt) => (
                            <Button key={opt.value} type="button" size="sm" variant={currentState === opt.value ? "default" : "outline"}
                              disabled={isPending} onClick={() => updateState.mutate({ service: serviceKey, state: opt.value })}
                              className={`justify-start gap-2 w-full ${currentState === opt.value ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`}
                              data-testid={`button-set-${serviceKey.toLowerCase()}-${opt.value.toLowerCase()}`}>
                              <opt.icon className="w-4 h-4" />{opt.label}
                            </Button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
          </div>

          <ServiceHeroCustomizationSection />
        </>
      )}

      {/* ── Messages System ── */}
      {activeSection === "messages" && (
        <MessagesSystemSection />
      )}

      {/* ── Global Settings (currency + dark mode) ── */}
      {activeSection === "global" && (
        <>
          <GlobalCurrencySection />
          <AccountDarkModeSection />
          <AuthProviderSection />
          <AuthSecuritySettingsSection />
        </>
      )}

      {/* ── Supplier (Promotion + Codes promotionnels — internal switcher, Part 2) ── */}
      {activeSection === "supplier" && (
        <>
          <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
            <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 w-max min-w-full sm:w-fit">
              {SUPPLIER_SUB_SECTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSupplierSubSection(id)}
                  className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${supplierSubSection === id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  data-testid={`tab-supplier-sub-${id}`}
                >
                  <Icon className="w-4 h-4" />{label}
                </button>
              ))}
            </div>
          </div>

          {/* Existing Promotion settings — unchanged, only relocated under this sub-tab */}
          {supplierSubSection === "promotion" && (
            <PromotionSettingsSection />
          )}

          {supplierSubSection === "discount-codes" && (
            <DiscountCodeSettingsSection />
          )}

          {supplierSubSection === "tabs" && (
            <SupplierTabVisibilitySection />
          )}

          {supplierSubSection === "store" && (
            <StoreSettingsSection />
          )}

          {supplierSubSection === "categories" && (
            <CategoriesTabVisibilitySection />
          )}

          {supplierSubSection === "products" && (
            <ProductsTabVisibilitySection />
          )}
        </>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useThemeStore } from "@/store/theme-store";
import { useCart, type CartItem, type PrintCartItem } from "@/hooks/use-cart";
import { usePackQuickView } from "@/hooks/use-pack-quick-view";
import { useQuickView } from "@/hooks/use-quick-view";
import { useCreateOrder } from "@/hooks/use-orders";
import { useAuth } from "@/hooks/use-auth";
import { usePromotionEvaluation } from "@/hooks/use-promotion-evaluation";
import { usePackAvailability, isPackFrozen, PACK_AVAILABILITY_KEY } from "@/hooks/use-pack-availability";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Trash2, Plus, Minus, ShoppingBag, Store, ArrowRight, Printer,
  Clock, Package, MapPin, CheckCircle, Layers, Tag, Gift, Truck, Sun, Moon,
  CreditCard, Banknote, Smartphone, Landmark, Pencil, AlertTriangle
} from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import type { CreateOrderRequest, GeoLocation } from "@shared/schema";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";
import { userToAccountAddress, pickedToGeoLocation } from "@/store/search-location-store";
import OrderConfirmationModal, { type ConfirmOrderOpts } from "@/components/cafe/order-confirmation-modal";
import { useAccountOpenStore } from "@/store/account-open-store";
import { groupPackIncludedProducts } from "@/lib/pack-grouping";
import { groupCartProducts } from "@/lib/cart-grouping";

// apiRequest throws `Error("<status>: <raw response text>")` (see throwIfResNotOk
// in @/lib/queryClient) rather than parsing the JSON body — this recovers the
// server's actual { message } (e.g. "Minimum quantity for this service is X.")
// so it can be shown verbatim instead of the raw "400: {...}" string.
function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const raw = error.message.replace(/^\d+:\s*/, "");
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.message === "string") return parsed.message;
    } catch {
      // not JSON — fall through to the raw text
    }
    return raw || fallback;
  }
  return fallback;
}

export default function CartPage() {
  const {
    items, updateQuantity, removeItem, clearCart, getItemsBySupplier,
    printItems, removePrintItem, clearPrintItems, getPrintTotal,
    packItems, removePackItem,
  } = useCart();
  const { user } = useAuth();
  const openPackForEdit = usePackQuickView((s) => s.openForEdit);
  const armPackReplace = usePackQuickView((s) => s.armReplace);
  const openProductForReplace = useQuickView((s) => s.openForReplace);
  const createOrder = useCreateOrder();
  const createPrintOrders = useMutation({
    // One PRINT cart line = one real order (the backend has no "multi-item"
    // print order concept — see POST /api/print/orders). Fires one POST per
    // line and waits for all of them; Promise.all's all-or-nothing semantics
    // mean a single failing line (e.g. below minimum quantity, or the service
    // was deactivated meanwhile) fails the whole batch, so nothing is cleared
    // from the cart and the Coffee Owner keeps every line to retry.
    mutationFn: async (items: PrintCartItem[]) => {
      return Promise.all(items.map(async (item) => {
        const res = await apiRequest("POST", "/api/print/orders", {
          catalogItemId: item.catalogItemId,
          quantity: item.quantity,
          notes: item.notes || undefined,
        });
        return res.json();
      }));
    },
  });
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const openAccountWithOrder = useAccountOpenStore((s) => s.openWithOrder);
  const queryClient = useQueryClient();

  // "Choisir un autre fournisseur" — a product line the supplier cancelled reopens the
  // existing product modal (every supplier's listing for the same product, since that's
  // exactly what the modal already shows without a fixed supplierId), pre-armed to
  // replace this exact line instead of adding a new one. No navigation needed: the
  // modal is already mounted globally by MarketplaceLayout, which wraps this page.
  const handleReplaceItem = (item: CartItem) => {
    openProductForReplace(item.productId, {
      listingId: item.listingId,
      flavorId: item.flavorId,
      sizeId: item.sizeId,
      flavorName: item.flavorName,
      sizeName: item.sizeName,
      quantity: item.quantity,
    });
  };

  // Packs are supplier-exclusive — there is no "same Pack, another supplier" the way
  // there is for a product's multiple listings, so a replacement is necessarily a
  // different Pack found by browsing. Arms the replacement, then sends the Coffee Owner
  // to the marketplace to pick one; the next Pack they add there replaces this line.
  const handleReplacePack = (packId: number, packName: string) => {
    armPackReplace(packId);
    toast({ title: "Choisissez un Pack de remplacement", description: `Le prochain Pack ajouté remplacera « ${packName} ».` });
    setLocation("/products");
  };

  // Revalidates every Pack currently in the cart against its live backend state.
  // A Pack the supplier has made unavailable stays visible (frozen) but must never
  // be orderable/counted — see freezing logic below and orderablePackItems.
  const { data: packAvailability = {} } = usePackAvailability(packItems.map((p) => p.packId));
  // Two independent reasons a Pack line can be excluded from checkout: the Pack itself
  // became unavailable (existing availability-freeze feature), or its supplier cancelled
  // the order it was part of (cancelledBySupplier — this task). Either one keeps it out.
  const orderablePackItems = packItems.filter((p) => !isPackFrozen(packAvailability[p.packId]) && !p.cancelledBySupplier);
  // Same rule for regular items — a cancelled line stays visible in the cart but must
  // never reach checkout/totals/the order payload until the Coffee Owner replaces it.
  const orderableItems = items.filter((i) => !i.cancelledBySupplier);
  // The confirmed live Pack detail — null while the check is still loading, still
  // "unknown" (a failed/errored check, which must never be treated as stale data
  // to display), or genuinely confirmed unavailable with no detail returned.
  const liveDetailOf = (packId: number) => {
    const result = packAvailability[packId];
    return result && result.status !== "unknown" ? result.detail : null;
  };

  const savedAccountAddress = userToAccountAddress(user as any);

  const [useSavedAddress, setUseSavedAddress] = useState(true);
  const [customDeliveryAddress, setCustomDeliveryAddress] = useState<GeoLocation | null>(null);
  const [courierInstructions, setCourierInstructions] = useState("");
  const [deliveryPickerOpen, setDeliveryPickerOpen] = useState(false);
  const isDark = useThemeStore((s) => s.isDark);
  const toggle = useThemeStore((s) => s.toggle);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPreparingOrder, setIsPreparingOrder] = useState(false);
  const fmt = useFormatCurrency();

  // ── Theme tokens ─────────────────────────────────────────────────────────────
  const dk          = isDark;
  const pageBg      = dk ? "bg-gray-900"                    : "bg-gray-50";
  const cardBg      = dk ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100";
  const cardHdr     = dk ? "bg-gray-800/70 border-gray-700/50" : "bg-gray-50 border-gray-100";
  const textPrimary = dk ? "text-white"                     : "text-gray-900";
  const textMuted   = dk ? "text-gray-400"                  : "text-gray-500";
  const divideClr   = dk ? "divide-gray-700/40"             : "divide-gray-100";
  const borderClr   = dk ? "border-gray-700/60"             : "border-gray-100";
  const imgBg       = dk ? "bg-gray-700"                    : "bg-gray-100";
  const addrBtn     = (active: boolean) => active
    ? (dk ? "border-amber-500/60 bg-amber-500/10" : "border-primary bg-primary/5")
    : (dk ? "border-gray-700 hover:border-gray-600 bg-gray-800/60" : "border-gray-200 hover:border-primary/30");
  const inputCls    = dk
    ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 rounded-xl text-sm"
    : "border-gray-200 rounded-xl text-sm";
  const labelCls    = dk ? "text-sm font-semibold text-gray-300" : "text-sm font-semibold";
  const toggleBtn   = dk
    ? "bg-gray-800 hover:bg-gray-700 text-amber-400"
    : "bg-gray-100 hover:bg-gray-200 text-gray-600";
  const backBtn     = dk
    ? "border-gray-700 text-gray-300 hover:bg-gray-800"
    : "border-gray-200 text-gray-700 hover:bg-gray-50";

  useEffect(() => {
    if (savedAccountAddress) {
      setUseSavedAddress(true);
    } else {
      setUseSavedAddress(false);
    }
  }, [savedAccountAddress?.address]);

  const activeDeliveryAddress = useSavedAddress
    ? savedAccountAddress
    : customDeliveryAddress;

  const { evaluation: promoEval } = usePromotionEvaluation(orderableItems);

  // Frozen/cancelled lines are visible in the cart but must never contribute to a total
  // the Coffee Owner could act on — sum only the orderable ones (see orderableItems).
  const totalShop = orderableItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const totalPrint = getPrintTotal();
  // Frozen (currently unavailable) Packs are visible in the cart but must never
  // contribute to a total the Coffee Owner could act on — sum only the orderable
  // ones, at their current live price when known (see Scenario E: price refresh).
  const totalPack = orderablePackItems.reduce((s, p) => s + (liveDetailOf(p.packId)?.price ?? p.unitPrice) * p.quantity, 0);
  const hasShop = items.length > 0 || packItems.length > 0;
  // Distinct from hasShop: a cart holding only a frozen/cancelled line still "has SHOP
  // content" (must stay visible), but there is nothing left to actually order.
  const hasOrderableShop = orderableItems.length > 0 || orderablePackItems.length > 0;
  const hasPrint = printItems.length > 0;
  const grandTotal = totalShop + totalPack + totalPrint - promoEval.totalDiscount;

  const handleDeliveryConfirm = (loc: PickedLocation) => {
    setCustomDeliveryAddress(pickedToGeoLocation(loc));
    setUseSavedAddress(false);
    setDeliveryPickerOpen(false);
  };

  // Open the confirmation modal (with address validation)
  const handleOpenConfirm = () => {
    if (!hasShop) return;
    if (!hasOrderableShop) {
      toast({
        title: "Aucun article disponible",
        description: "Votre panier ne contient aucun article disponible à commander pour le moment.",
        variant: "destructive",
      });
      return;
    }
    setConfirmOpen(true);
  };

  // Called when user clicks "Confirmer" inside the modal
  const handleConfirmOrder = async (opts: ConfirmOrderOpts) => {
    if (opts.deliveryMethod === "DELIVERY_SERVICE" && !activeDeliveryAddress) {
      toast({
        title: "Adresse de livraison requise",
        description: savedAccountAddress
          ? "Choisissez une adresse de livraison ou ajoutez-en une dans votre profil."
          : "Ajoutez une adresse de livraison avant de valider la commande.",
        variant: "destructive",
      });
      return;
    }

    if (createOrder.isPending || isPreparingOrder) return;

    // Cart state is persisted locally. Entries created before the richer Pack
    // snapshot fields were introduced can still be present, so hydrate only
    // incomplete Pack rows from the authoritative marketplace detail endpoint
    // before sending the strictly validated order payload.
    setIsPreparingOrder(true);
    let normalizedPackItems = opts.modifiedPackItems;
    try {
      normalizedPackItems = await Promise.all(opts.modifiedPackItems.map(async (pack) => {
        const includedProducts = Array.isArray(pack.includedProducts) ? pack.includedProducts : [];
        const isComplete = includedProducts.every((product) =>
          Number.isInteger(product.productId) &&
          product.productId > 0 &&
          typeof product.productName === "string" &&
          product.productImageUrl !== undefined &&
          product.brandName !== undefined &&
          product.categoryName !== undefined &&
          product.subCategoryName !== undefined &&
          product.flavorName !== undefined &&
          product.sizeName !== undefined &&
          Number.isInteger(product.quantity) &&
          product.quantity > 0
        );
        if (isComplete || includedProducts.length === 0) {
          return { ...pack, includedProducts };
        }

        const response = await fetch(`/api/marketplace/packs/${pack.packId}`, { credentials: "include" });
        if (!response.ok) throw new Error(`Impossible de synchroniser le Pack « ${pack.packName} »`);
        const detail = await response.json() as {
          items?: Array<{
            productId: number;
            productName: string;
            productImageUrl: string | null;
            brandName?: string | null;
            categoryName?: string | null;
            subCategoryName?: string | null;
            flavorName: string | null;
            sizeName: string | null;
            listingVariants?: Array<{
              flavorName: string | null;
              sizeName: string | null;
            }>;
          }>;
        };
        const detailItems = detail.items ?? [];
        const hydrated = includedProducts.map((product) => {
          // A pack can contain the same product more than once. Match the
          // product identity first, then the exact selected flavor/size pair;
          // matching by name alone can replace a persisted variant with the
          // first row returned by the live pack detail.
          const sameProduct = detailItems.filter((item) =>
            Number.isInteger(product.productId) && product.productId > 0
              ? item.productId === product.productId
              : item.productName === product.productName
          );
          const hasRecordedVariant = product.flavorName !== undefined || product.sizeName !== undefined;
          const selectedFlavor = product.flavorName ?? null;
          const selectedSize = product.sizeName ?? null;
          const getVariants = (item: typeof detailItems[number]) => [
            { flavorName: item.flavorName, sizeName: item.sizeName },
            ...(item.listingVariants ?? []),
          ];
          const source = sameProduct.find((item) =>
            getVariants(item).some((variant) =>
              (variant.flavorName ?? null) === selectedFlavor &&
              (variant.sizeName ?? null) === selectedSize
            )
          ) ?? (!hasRecordedVariant ? sameProduct[0] : undefined);
          if (!source) {
            throw new Error(
              `La variante « ${product.productName }${product.flavorName ? ` · ${product.flavorName}` : ""}${product.sizeName ? ` · ${product.sizeName}` : ""} » du Pack n'est plus disponible`
            );
          }
          const selectedVariant = getVariants(source).find((variant) =>
            (variant.flavorName ?? null) === selectedFlavor &&
            (variant.sizeName ?? null) === selectedSize
          );
          return {
            productId: source.productId,
            productName: source.productName,
            productImageUrl: source.productImageUrl ?? null,
            brandName: source.brandName ?? null,
            categoryName: source.categoryName ?? null,
            subCategoryName: source.subCategoryName ?? null,
            flavorName: selectedVariant?.flavorName ?? product.flavorName ?? source.flavorName ?? null,
            sizeName: selectedVariant?.sizeName ?? product.sizeName ?? source.sizeName ?? null,
            quantity: product.quantity,
          };
        });
        return { ...pack, includedProducts: hydrated };
      }));
    } catch (error: any) {
      setIsPreparingOrder(false);
      toast({
        title: "Synchronisation du panier impossible",
        description: error?.message ?? "Actualisez le Pack puis réessayez.",
        variant: "destructive",
      });
      return;
    }
    setIsPreparingOrder(false);

    const request: CreateOrderRequest = {
      items: opts.modifiedItems.map((i) => ({
        listingId: i.listingId,
        productId: i.productId,
        supplierId: i.supplierId,
        supplierName: i.supplierName,
        flavorId: i.flavorId,
        sizeId: i.sizeId,
        flavorName: i.flavorName,
        sizeName: i.sizeName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
       packItems: normalizedPackItems.map((p) => ({
        packId: p.packId,
        supplierId: p.supplierId,
        quantity: p.quantity,
          // Pack cart lines already store the exact current distribution for the
          // selected number of packs.
          includedProducts: p.includedProducts,
      })),
      deliveryAddress: opts.deliveryMethod === "DELIVERY_SERVICE" ? activeDeliveryAddress! : undefined,
      deliveryMethod: opts.deliveryMethod,
      paymentMethod: opts.paymentMethod,
      courierInstructions: courierInstructions.trim() || undefined,
      priority: opts.priority,
      scheduledAt: opts.scheduledAt,
    };
    createOrder.mutate(request, {
      onSuccess: (newOrder: any) => {
        toast({ title: "Commande envoyée !", description: "Vos commandes ont été transmises aux fournisseurs." });
        // The order is created from an independent draft (see
        // OrderConfirmationModal), which may itself be a subset of the Cart —
        // the Coffee Owner can remove items from the draft before confirming,
        // and those stay in the Cart untouched. Only once the backend has
        // confirmed the order do we remove exactly the items that were
        // actually submitted (opts.modifiedItems / opts.modifiedPackItems)
        // from the real, persisted Cart — never the whole cart, and never
        // before this onSuccess callback runs.
        for (const item of opts.modifiedItems) {
          removeItem(item.listingId, item.flavorId, item.sizeId);
        }
        for (const pack of opts.modifiedPackItems) {
          removePackItem(pack.packId);
        }
        setCourierInstructions("");
        setCustomDeliveryAddress(null);
        setConfirmOpen(false);
        // Open My Account → Orders tab and auto-show the new order
        if (newOrder?.id) {
          openAccountWithOrder(newOrder.id);
          setLocation("/products");
        } else {
          setLocation("/products");
        }
      },
      onError: (error) => {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        // The backend re-validates every Pack's availability at order creation (see
        // resolvePackOrderItems) — if this failed because a Pack raced into
        // unavailability between cart load and confirmation, refetch so the cart
        // immediately shows it frozen instead of leaving stale "available" data on screen.
        queryClient.invalidateQueries({ queryKey: [PACK_AVAILABILITY_KEY] });
      },
    });
  };

  const handlePrintCheckout = () => {
    if (createPrintOrders.isPending || printItems.length === 0) return;
    createPrintOrders.mutate(printItems, {
      onSuccess: () => {
        toast({ title: "Commande PRINT envoyée !", description: "Vos demandes d'impression ont été transmises." });
        clearPrintItems();
        queryClient.invalidateQueries({ queryKey: ["/api/print/orders"] });
      },
      onError: (error) => {
        toast({
          title: "Erreur",
          description: extractApiErrorMessage(error, "Impossible d'envoyer une ou plusieurs demandes d'impression."),
          variant: "destructive",
        });
      },
    });
  };

  const bySupplier = getItemsBySupplier();
  const supplierEntries = Array.from(bySupplier.entries());
  // Separate, orderable-only grouping for the checkout preview panel below (which must
  // match what "Passer commande" will actually submit) — the main cart display above
  // keeps using the unfiltered supplierEntries, since cancelled items must stay visible
  // there exactly as they are today.
  const orderableBySupplier = new Map<number, { supplierName: string; items: CartItem[] }>();
  for (const item of orderableItems) {
    if (!orderableBySupplier.has(item.supplierId)) {
      orderableBySupplier.set(item.supplierId, { supplierName: item.supplierName, items: [] });
    }
    orderableBySupplier.get(item.supplierId)!.items.push(item);
  }
  const orderableSupplierEntries = Array.from(orderableBySupplier.entries());

  if (!hasShop && !hasPrint) {
    return (
      <div className={`flex flex-col items-center justify-center py-32 text-center min-h-screen transition-colors duration-200 ${pageBg}`}>
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${dk ? "bg-amber-500/10" : "bg-primary/10"}`}>
          <ShoppingBag className="w-12 h-12 text-amber-500" />
        </div>
        <h2 className={`text-3xl font-bold ${textPrimary}`}>Votre panier est vide</h2>
        <p className={`mt-3 max-w-md text-lg ${textMuted}`}>Parcourez la marketplace ou les services PRINT.</p>
        <div className="flex gap-3 mt-8">
          <Link href="/products">
            <button className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm shadow-lg shadow-amber-500/20 transition-all hover:-translate-y-0.5">
              Marketplace SHOP
            </button>
          </Link>
          <Link href="/print">
            <button className={`px-5 py-2.5 rounded-2xl border font-semibold text-sm transition-all hover:-translate-y-0.5 ${dk ? "border-blue-500/40 text-blue-400 hover:bg-blue-500/10" : "border-blue-200 text-blue-600 hover:bg-blue-50"}`}>
              Services PRINT
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen overflow-x-hidden transition-colors duration-200 ${pageBg}`}>
      <div className="w-full max-w-5xl mx-auto space-y-4 sm:space-y-6 p-4 sm:p-6">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className={`text-xl sm:text-2xl font-bold tracking-tight ${textPrimary}`}>Votre panier</h1>
            <p className={`mt-1 text-sm ${textMuted}`}>
              {items.length + packItems.length + printItems.length} article{items.length + packItems.length + printItems.length !== 1 ? "s" : ""}
              {hasShop && hasPrint ? " · SHOP + PRINT" : hasShop ? " · SHOP" : " · PRINT"}
            </p>
          </div>
          {/* Dark/light toggle */}
          <button
            onClick={() => toggle()}
            aria-label="Toggle theme"
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0 ${toggleBtn}`}
          >
            {dk ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 w-full">
          <div className="lg:col-span-2 space-y-4 min-w-0">

            {/* ── SHOP Items ── */}
            {hasShop && (
              <div className="space-y-4">
                {hasShop && hasPrint && (
                  <div className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wide ${dk ? "text-amber-500" : "text-amber-500"}`}>
                    <ShoppingBag className="w-4 h-4" /> Commandes SHOP
                  </div>
                )}
                {supplierEntries.map(([supplierId, group]) => {
                  const supplierTotal = group.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
                  return (
                    <div key={supplierId} className={`border rounded-2xl overflow-hidden shadow-sm ${cardBg}`}>
                      <div className={`px-3 sm:px-4 py-3 border-b flex items-center justify-between gap-2 ${cardHdr}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Store className="w-4 h-4 text-amber-500 shrink-0" />
                          <span className={`font-semibold text-sm truncate ${textPrimary}`}>{group.supplierName}</span>
                        </div>
                        <span className={`text-sm font-medium shrink-0 ${textPrimary}`}>{fmt(supplierTotal)}</span>
                      </div>
                      <div className={`divide-y ${divideClr}`}>
                         {groupCartProducts(group.items).map(({ product, variants }) => (
                           <div key={`product-${product.productId}`} className="flex gap-3 p-3 sm:p-4" data-testid={`cart-product-${product.productId}`}>
                             <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden shrink-0 ${imgBg}`}>
                               {product.productImageUrl ? (
                                 <img src={product.productImageUrl} className="w-full h-full object-cover" alt="" />
                               ) : (
                                 <div className={`w-full h-full flex items-center justify-center text-xs ${textMuted}`}>—</div>
                               )}
                             </div>
                             <div className="flex-1 min-w-0">
                               <p className={`font-medium text-sm truncate ${textPrimary}`}>{product.productName}</p>
                               <div className={`flex flex-wrap gap-x-2 gap-y-0.5 text-xs mt-0.5 ${textMuted}`}>
                                 {product.brandName && <span>Brand: {product.brandName}</span>}
                                 {product.categoryName && <span>Category: {product.categoryName}</span>}
                                 {product.subCategoryName && <span>SubCategory: {product.subCategoryName}</span>}
                               </div>
                               <div className="mt-2 space-y-2">
                                 {variants.map((item) => {
                                   const variantLabel = [item.flavorName, item.sizeName].filter(Boolean).join(" · ");
                                   const cancelled = !!item.cancelledBySupplier;
                                   return (
                                     <div key={`${item.listingId}-${item.flavorId ?? 0}-${item.sizeId ?? 0}`} className={cancelled ? "opacity-60" : ""}>
                                       <div className="flex items-center gap-2 min-w-0">
                                         <div className="flex-1 min-w-0">
                                           {variantLabel && <p className={`text-xs truncate ${textMuted}`}>Variant: {variantLabel}</p>}
                                           <p className={`text-xs ${textMuted}`}>{fmt(item.unitPrice)} chacun</p>
                                         </div>
                                         <div className={`flex items-center border rounded-xl overflow-hidden shrink-0 ${borderClr}`}>
                                           <button disabled={cancelled} className={`px-2 py-1 transition-colors disabled:cursor-not-allowed ${dk ? "hover:bg-gray-700" : "hover:bg-gray-100"}`} onClick={() => updateQuantity(item.listingId, item.flavorId, item.sizeId, Math.max(1, item.quantity - 1))} data-testid={`button-decrease-${item.listingId}`}><Minus className={`w-3 h-3 ${textMuted}`} /></button>
                                           <span className={`px-2 sm:px-3 text-sm font-medium w-7 sm:w-8 text-center ${textPrimary}`}>{item.quantity}</span>
                                           <button disabled={cancelled} className={`px-2 py-1 transition-colors disabled:cursor-not-allowed ${dk ? "hover:bg-gray-700" : "hover:bg-gray-100"}`} onClick={() => updateQuantity(item.listingId, item.flavorId, item.sizeId, item.quantity + 1)} data-testid={`button-increase-${item.listingId}`}><Plus className={`w-3 h-3 ${textMuted}`} /></button>
                                         </div>
                                         <span className={`font-bold text-xs min-w-[52px] text-right ${textPrimary}`}>{fmt(item.unitPrice * item.quantity)}</span>
                                         <button className={`transition-colors ${textMuted} hover:text-red-500 shrink-0`} onClick={() => removeItem(item.listingId, item.flavorId, item.sizeId)} data-testid={`button-remove-${item.listingId}`}><Trash2 className="w-4 h-4" /></button>
                                       </div>
                                       {item.cancelledBySupplier && (
                                         <div className={`mt-1.5 flex flex-wrap items-center gap-2 rounded-xl border px-2.5 py-2 ${dk ? "bg-red-500/10 border-red-500/30" : "bg-red-50 border-red-200"}`}>
                                           <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${dk ? "text-red-400" : "text-red-600"}`} />
                                           <span className={`text-xs flex-1 min-w-0 ${dk ? "text-red-300" : "text-red-700"}`}>
                                             Commande annulée par le fournisseur{item.cancelledBySupplier.supplierName ? ` (${item.cancelledBySupplier.supplierName})` : ""}
                                           </span>
                                           <button
                                             className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors shrink-0 ${dk ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10" : "border-amber-300 text-amber-700 hover:bg-amber-50"}`}
                                             onClick={() => handleReplaceItem(item)}
                                             data-testid={`button-replace-item-${item.listingId}-${item.flavorId ?? 0}-${item.sizeId ?? 0}`}
                                           >
                                             Choisir un autre fournisseur
                                           </button>
                                         </div>
                                       )}
                                     </div>
                                   );
                                 })}
                               </div>
                             </div>
                           </div>
                         ))}
                      </div>
                    </div>
                  );
                })}

                {packItems.map((pack) => {
                  const frozen = isPackFrozen(packAvailability[pack.packId]);
                  const cancelled = !!pack.cancelledBySupplier;
                  // Either reason keeps the Pack out of checkout and its controls disabled —
                  // "Pack indisponible" (frozen) and "Commande annulée" (cancelled) are still
                  // shown as two distinct messages (see the badge/banner below), but both
                  // dim the card and hide Edit the same way.
                  const notEditable = frozen || cancelled;
                  const liveDetail = liveDetailOf(pack.packId);
                  // Only ever refresh display fields from a CONFIRMED live Pack — a frozen
                  // Pack keeps showing its last-known info, and so does one whose check
                  // simply failed/errored (liveDetail is null there too; see isPackFrozen).
                  const displayName = !frozen && liveDetail ? liveDetail.name : pack.packName;
                  const displayImage = !frozen && liveDetail ? liveDetail.imageUrl : pack.packImageUrl;
                  const displayUnitPrice = !frozen && liveDetail ? liveDetail.price : pack.unitPrice;
                  return (
                  <div
                    key={`pack-${pack.packId}`}
                    className={`border rounded-2xl overflow-hidden shadow-sm transition-opacity ${
                      notEditable
                        ? `opacity-60 ${dk ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`
                        : (dk ? "bg-gray-800 border-amber-500/25" : "bg-white border-amber-100")
                    }`}
                    data-testid={`cart-pack-${pack.packId}`}
                  >
                    <div className={`px-3 sm:px-4 py-3 border-b flex items-center justify-between gap-2 ${
                      notEditable
                        ? (dk ? "bg-gray-700/40 border-gray-700" : "bg-gray-100 border-gray-200")
                        : (dk ? "bg-amber-500/10 border-amber-500/25" : "bg-amber-50 border-amber-100")
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Layers className={`w-4 h-4 shrink-0 ${notEditable ? textMuted : "text-amber-500"}`} />
                        <span className={`font-semibold text-sm truncate ${notEditable ? textMuted : (dk ? "text-amber-400" : "text-amber-700")}`}>{pack.supplierName} · Pack</span>
                      </div>
                      {frozen ? (
                        <Badge variant="outline" className={`shrink-0 gap-1 text-xs ${dk ? "border-gray-600 text-gray-300 bg-gray-800" : "border-gray-300 text-gray-600 bg-gray-50"}`} data-testid={`badge-pack-unavailable-${pack.packId}`}>
                          <AlertTriangle className="w-3 h-3" /> Pack indisponible
                        </Badge>
                      ) : (
                        <span className={`text-sm font-medium shrink-0 ${dk ? "text-amber-400" : "text-amber-700"}`}>{fmt(displayUnitPrice * pack.quantity)}</span>
                      )}
                    </div>
                    <div className="p-3 sm:p-4">
                      <div className="flex gap-3">
                        <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden shrink-0 ${imgBg} ${notEditable ? "grayscale" : ""}`}>
                          {displayImage ? (
                            <img src={displayImage} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center text-xs ${textMuted}`}>—</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm truncate ${textPrimary}`}>{displayName}</p>
                           <p className={`text-xs ${textMuted}`}>{pack.supplierName} · {fmt(displayUnitPrice)} le pack</p>
                          {frozen && (
                            <p className={`text-xs mt-1 ${dk ? "text-gray-400" : "text-gray-500"}`}>
                              Ce Pack n'est plus disponible chez le fournisseur et ne sera pas inclus dans la commande.
                            </p>
                          )}
                          {pack.includedProducts.length > 0 && (
                             <div className={`mt-3 space-y-2.5 border-t pt-2 ${dk ? "border-amber-500/20" : "border-amber-100"}`}>
                                {groupPackIncludedProducts(pack.includedProducts).map((group) => (
                                 <div key={group.productId} className="flex items-start gap-2">
                                   <div className={`w-9 h-9 rounded-lg overflow-hidden shrink-0 ${imgBg}`}>
                                     {group.productImageUrl
                                       ? <img src={group.productImageUrl} alt="" className="w-full h-full object-cover" />
                                       : <Package className={`w-4 h-4 m-2 ${textMuted}`} />}
                                   </div>
                                   <div className="min-w-0 flex-1">
                                     <p className={`text-xs font-semibold ${textPrimary}`}>{group.productName}</p>
                                     {(group.brandName || group.categoryName || group.subCategoryName) && (
                                       <p className={`text-[10px] leading-4 ${textMuted}`}>
                                         {[group.brandName, group.categoryName, group.subCategoryName].filter(Boolean).join(" · ")}
                                       </p>
                                     )}
                                     <div className="mt-0.5 space-y-0.5">
                                       {group.distributions.map((d, i) => (
                                         <p key={i} className={`text-[10px] leading-4 ${textMuted}`}>
                                           {d.quantity}× {[d.flavorName, d.sizeName].filter(Boolean).join(" · ")}
                                         </p>
                                       ))}
                                     </div>
                                   </div>
                                 </div>
                               ))}
                             </div>
                          )}
                          {!notEditable && (
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${dk ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10" : "border-amber-200 text-amber-700 hover:bg-amber-50"}`}
                                onClick={() => openPackForEdit(pack)}
                                data-testid={`button-edit-pack-${pack.packId}`}
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                            </div>
                          )}
                          {pack.cancelledBySupplier && (
                            <div className={`mt-2 flex flex-wrap items-center gap-2 rounded-xl border px-2.5 py-2 ${dk ? "bg-red-500/10 border-red-500/30" : "bg-red-50 border-red-200"}`}>
                              <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${dk ? "text-red-400" : "text-red-600"}`} />
                              <span className={`text-xs flex-1 min-w-0 ${dk ? "text-red-300" : "text-red-700"}`}>
                                Commande annulée par le fournisseur{pack.cancelledBySupplier.supplierName ? ` (${pack.cancelledBySupplier.supplierName})` : ""}
                              </span>
                              <button
                                className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors shrink-0 ${dk ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10" : "border-amber-300 text-amber-700 hover:bg-amber-50"}`}
                                onClick={() => handleReplacePack(pack.packId, pack.packName)}
                                data-testid={`button-replace-pack-${pack.packId}`}
                              >
                                Choisir un autre fournisseur
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0 min-w-[52px]">
                          <p className={`font-bold text-sm ${notEditable ? textMuted : textPrimary}`}>{fmt(displayUnitPrice * pack.quantity)}</p>
                          <button className={`transition-colors ${textMuted} hover:text-red-500`} onClick={() => removePackItem(pack.packId)} data-testid={`button-remove-pack-${pack.packId}`}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* ── PRINT Items ── */}
            {hasPrint && (
              <div className="space-y-4">
                {hasShop && hasPrint && (
                  <div className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wide mt-6 ${dk ? "text-blue-400" : "text-blue-500"}`}>
                    <Printer className="w-4 h-4" /> Commandes PRINT
                  </div>
                )}
                {printItems.map((item) => {
                  const isPdf = item.uploadedFileName?.toLowerCase().endsWith(".pdf");
                  return (
                    <div key={item.id} className={`border rounded-2xl overflow-hidden shadow-sm ${dk ? "bg-gray-800 border-blue-500/25" : "bg-white border-blue-100"}`} data-testid={`cart-print-item-${item.id}`}>
                      <div className={`px-3 sm:px-4 py-3 border-b flex items-center justify-between gap-2 ${dk ? "bg-blue-500/10 border-blue-500/25" : "bg-blue-50 border-blue-100"}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Printer className={`w-4 h-4 shrink-0 ${dk ? "text-blue-400" : "text-blue-600"}`} />
                          <span className={`font-semibold text-sm truncate ${dk ? "text-blue-400" : "text-blue-700"}`}>{item.printerName}</span>
                        </div>
                        <span className={`text-sm font-medium shrink-0 ${dk ? "text-blue-400" : "text-blue-700"}`}>{fmt(item.unitPriceInCents * item.quantity)}</span>
                      </div>
                      <div className="p-3 sm:p-4">
                        <div className="flex gap-3">
                          <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden shrink-0 border ${dk ? "bg-gray-700 border-gray-700" : "bg-white border-gray-100"}`}>
                            {item.uploadedFileDataUrl && !isPdf ? (
                              <img src={item.uploadedFileDataUrl} className="w-full h-full object-cover" alt="Design" />
                            ) : item.imageUrl ? (
                              <img src={item.imageUrl} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <div className={`w-full h-full flex items-center justify-center ${dk ? "bg-gray-700" : "bg-blue-50"}`}>
                                <Package className={`w-6 h-6 ${dk ? "text-blue-400/40" : "text-blue-300"}`} />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className={`font-semibold text-sm truncate ${textPrimary}`}>{item.name}</p>
                            {item.uploadedFileName && (
                              <p className={`text-xs truncate ${dk ? "text-blue-400" : "text-blue-600"}`}>📎 {item.uploadedFileName}</p>
                            )}
                            {item.material && (
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-xl border ${dk ? "bg-gray-700 border-gray-600 text-gray-300" : "bg-gray-100 border-gray-200 text-gray-600"}`}>
                                  {item.material}
                                </span>
                              </div>
                            )}
                            <div className={`flex items-center gap-2 flex-wrap text-xs mt-1 ${textMuted}`}>
                              <span>{item.quantity} {item.unit}(s)</span>
                              <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{item.productionTimeDays}j</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0 min-w-[52px]">
                            <p className={`font-bold text-sm ${textPrimary}`}>{fmt(item.unitPriceInCents * item.quantity)}</p>
                            <button className={`transition-colors ${textMuted} hover:text-red-500`} onClick={() => removePrintItem(item.id)} data-testid={`button-remove-print-${item.id}`}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {item.notes && (
                          <div className={`mt-3 p-2 rounded-xl text-xs border ${dk ? "bg-gray-700/60 border-gray-600 text-gray-300" : "bg-gray-50 border-gray-100 text-gray-600"}`}>
                            <span className="font-semibold">Notes : </span>{item.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Order Summary ── */}
          <div className="lg:col-span-1 space-y-4 min-w-0">
            {hasShop && (
              <div className={`border rounded-2xl shadow-sm lg:sticky lg:top-24 ${cardBg}`}>
                <div className="p-4 sm:p-5 space-y-4">
                  <h3 className={`font-bold text-lg flex items-center gap-2 ${textPrimary}`}>
                    <ShoppingBag className="w-4 h-4 text-amber-500" /> Commande SHOP
                  </h3>

                  {/* Delivery address */}
                  <div className={`space-y-3 border-t pt-4 ${borderClr}`}>
                    <h4 className={`text-sm font-semibold flex items-center gap-2 ${textPrimary}`}>
                      <MapPin className="w-4 h-4 text-amber-500" /> Adresse de livraison
                    </h4>

                    {savedAccountAddress && (
                      <button
                        type="button"
                        onClick={() => setUseSavedAddress(true)}
                        className={`w-full text-left p-3 rounded-2xl border transition-colors ${addrBtn(useSavedAddress)}`}
                        data-testid="button-use-saved-address"
                      >
                        <div className="flex items-start gap-2">
                          {useSavedAddress && <CheckCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />}
                          <div className="min-w-0">
                            <p className={`text-xs font-medium ${textMuted}`}>Adresse enregistrée (profil)</p>
                            <p className={`text-sm font-medium truncate ${textPrimary}`}>{savedAccountAddress.address}</p>
                          </div>
                        </div>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setDeliveryPickerOpen(true)}
                      className={`w-full text-left p-3 rounded-2xl border transition-colors ${addrBtn(!useSavedAddress && !!customDeliveryAddress)}`}
                      data-testid="button-other-delivery-address"
                    >
                      <div className="flex items-start gap-2">
                        {!useSavedAddress && customDeliveryAddress && <CheckCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />}
                        <div className="min-w-0">
                          <p className={`text-xs font-medium ${textMuted}`}>Choisir une autre adresse</p>
                          <p className={`text-sm font-medium truncate ${textPrimary}`}>
                            {customDeliveryAddress?.address ?? "Ouvrir la carte pour sélectionner"}
                          </p>
                        </div>
                      </div>
                    </button>

                    {!savedAccountAddress && !customDeliveryAddress && (
                      <p className="text-xs text-amber-500">Aucune adresse enregistrée — choisissez une adresse de livraison.</p>
                    )}
                  </div>

                  <div className={`space-y-2 border-t pt-4 ${borderClr}`}>
                    <label htmlFor="courier-instructions" className={labelCls}>Instructions pour le coursier</label>
                    <Textarea
                      id="courier-instructions"
                      value={courierInstructions}
                      onChange={(e) => setCourierInstructions(e.target.value)}
                      placeholder="Ex: Sonner à l'interphone, laisser à l'accueil, 3e étage…"
                      className={`min-h-[72px] resize-none ${inputCls}`}
                      data-testid="input-courier-instructions"
                    />
                    <p className={`text-xs ${textMuted}`}>Ces instructions s'appliquent uniquement à cette commande.</p>
                  </div>

                  <div className={`space-y-2 text-sm border-t pt-4 ${borderClr}`}>
                    {orderableSupplierEntries.map(([sid, group]) => {
                      const supTotal = group.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
                      const promoResult = promoEval.bySupplier.find(r => r.supplierId === Number(sid));
                      return (
                        <div key={sid}>
                          <div className={`flex justify-between ${textMuted}`}>
                            <span className="truncate mr-2">{group.supplierName}</span>
                            <span>{fmt(supTotal)}</span>
                          </div>
                          {promoResult && promoResult.discountAmount > 0 && (
                            <div className="flex justify-between text-green-500 text-xs mt-0.5">
                              <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{promoResult.promotionName ?? 'Promotion'}</span>
                              <span>−{fmt(promoResult.discountAmount)}</span>
                            </div>
                          )}
                          {promoResult?.freeShipping && (
                            <div className="flex items-center gap-1 text-green-500 text-xs mt-0.5">
                              <Truck className="w-3 h-3" /> Free shipping applied
                            </div>
                          )}
                          {promoResult?.giftInfo && (
                            <div className="flex items-center gap-1 text-purple-400 text-xs mt-0.5">
                              <Gift className="w-3 h-3" /> {(promoResult.giftInfo as any).description ?? 'Free gift'} included
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {orderablePackItems.length > 0 && (
                      <div className={`flex justify-between ${textMuted}`}>
                        <span>Packs</span>
                        <span>{fmt(totalPack)}</span>
                      </div>
                    )}
                    {promoEval.totalDiscount > 0 && (
                      <div className={`flex justify-between text-green-500 font-medium border-t pt-2 ${dk ? "border-green-500/20" : "border-green-100"}`}>
                        <span>Promotion savings</span>
                        <span>−{fmt(promoEval.totalDiscount)}</span>
                      </div>
                    )}
                    <div className={`border-t pt-3 flex justify-between items-center font-bold ${borderClr}`}>
                      <span className={textPrimary}>Total SHOP</span>
                      <span className="text-xl text-amber-500">{fmt(Math.max(0, totalShop + totalPack - promoEval.totalDiscount))}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenConfirm}
                    disabled={createOrder.isPending || !hasOrderableShop}
                    className="w-full rounded-2xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-3.5 font-semibold text-sm transition-all shadow-lg shadow-amber-500/20"
                    data-testid="button-place-order"
                  >
                    {createOrder.isPending ? "Traitement…" : <span className="flex items-center justify-center gap-2">Passer commande <ArrowRight className="w-4 h-4" /></span>}
                  </button>
                  <button className={`w-full text-xs text-center transition-colors ${textMuted} hover:text-red-500`} onClick={clearCart}>
                    Vider le panier SHOP
                  </button>
                </div>
              </div>
            )}

            {hasPrint && (
              <div className={`border rounded-2xl shadow-sm ${dk ? "bg-gray-800 border-blue-500/25" : "bg-white border-blue-100"}`}>
                <div className="p-4 sm:p-5 space-y-4">
                  <h3 className={`font-bold text-lg flex items-center gap-2 ${dk ? "text-blue-400" : "text-blue-700"}`}>
                    <Printer className="w-4 h-4" /> Commande PRINT
                  </h3>
                  <div className="space-y-2 text-sm">
                    {printItems.map((item) => (
                      <div key={item.id} className={`flex justify-between ${textMuted}`}>
                        <span className="truncate mr-2">{item.name}</span>
                        <span>{fmt(item.unitPriceInCents * item.quantity)}</span>
                      </div>
                    ))}
                    <div className={`border-t pt-3 flex justify-between items-center font-bold ${dk ? "border-blue-500/20" : "border-blue-100"}`}>
                      <span className={textPrimary}>Total PRINT</span>
                      <span className={`text-xl ${dk ? "text-blue-400" : "text-blue-600"}`}>{fmt(totalPrint)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handlePrintCheckout}
                    disabled={createPrintOrders.isPending || printItems.length === 0}
                    className={`w-full rounded-2xl py-3.5 font-semibold text-sm transition-all shadow-lg text-white disabled:opacity-50 ${dk ? "bg-blue-600 hover:bg-blue-500 shadow-blue-500/20" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"}`}
                    data-testid="button-place-print-order"
                  >
                    {createPrintOrders.isPending ? "Traitement…" : <span className="flex items-center justify-center gap-2">Confirmer PRINT <ArrowRight className="w-4 h-4" /></span>}
                  </button>
                  <button className={`w-full text-xs text-center transition-colors ${textMuted} hover:text-red-500`} onClick={clearPrintItems}>
                    Vider PRINT
                  </button>
                  <Link href="/print/orders">
                    <button className={`w-full text-xs text-center transition-colors ${dk ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-700"}`} data-testid="link-print-orders">
                      Voir mes commandes PRINT
                    </button>
                  </Link>
                </div>
              </div>
            )}

            {hasShop && hasPrint && (
              <div className={`border rounded-2xl shadow-sm ${cardBg}`}>
                <div className="p-5">
                  <div className="flex justify-between items-center">
                    <span className={`font-bold ${textMuted}`}>Total général</span>
                    <span className={`text-2xl font-bold ${textPrimary}`}>{fmt(grandTotal)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Link href="/products" className="flex-1">
                <button className={`w-full text-xs rounded-2xl border py-2.5 font-medium transition-colors ${backBtn}`}>← SHOP</button>
              </Link>
              <Link href="/print" className="flex-1">
                <button className={`w-full text-xs rounded-2xl border py-2.5 font-medium transition-colors ${dk ? "border-blue-500/40 text-blue-400 hover:bg-blue-500/10" : "border-blue-200 text-blue-600 hover:bg-blue-50"}`}>← PRINT</button>
              </Link>
            </div>
          </div>
        </div>

        <LocationPickerModal
          open={deliveryPickerOpen}
          mode="delivery"
          title="Adresse de livraison"
          onClose={() => setDeliveryPickerOpen(false)}
          onConfirm={handleDeliveryConfirm}
          initialAddress={customDeliveryAddress?.address ?? savedAccountAddress?.address}
          initialDetails={customDeliveryAddress?.details ?? savedAccountAddress?.details}
        />
      </div>

      {/* ── Order Confirmation Modal ──────────────────────────────────────────── */}
      <OrderConfirmationModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        items={orderableItems}
        packItems={orderablePackItems}
        deliveryAddress={activeDeliveryAddress}
        courierInstructions={courierInstructions}
        promoEval={promoEval}
        isSubmitting={createOrder.isPending || isPreparingOrder}
        onConfirm={handleConfirmOrder}
      />
    </div>
  );
}

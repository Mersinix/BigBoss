import { useState, useEffect } from "react";
import { useCart } from "@/hooks/use-cart";
import { useCreateOrder } from "@/hooks/use-orders";
import { useAuth } from "@/hooks/use-auth";
import { usePromotionEvaluation } from "@/hooks/use-promotion-evaluation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Trash2, Plus, Minus, ShoppingBag, Store, ArrowRight, Printer,
  Clock, Package, MapPin, CheckCircle, Layers, Tag, Gift, Truck, Sun, Moon
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import type { CreateOrderRequest, GeoLocation } from "@shared/schema";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";
import { userToAccountAddress, pickedToGeoLocation } from "@/store/search-location-store";

export default function CartPage() {
  const {
    items, updateQuantity, removeItem, clearCart, getTotal, getItemsBySupplier,
    printItems, removePrintItem, clearPrintItems, getPrintTotal,
    packItems, updatePackQuantity, removePackItem, clearPackItems, getPackTotal,
  } = useCart();
  const { user } = useAuth();
  const createOrder = useCreateOrder();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const savedAccountAddress = userToAccountAddress(user as any);

  const [useSavedAddress, setUseSavedAddress] = useState(true);
  const [customDeliveryAddress, setCustomDeliveryAddress] = useState<GeoLocation | null>(null);
  const [courierInstructions, setCourierInstructions] = useState("");
  const [deliveryPickerOpen, setDeliveryPickerOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);

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

  const { evaluation: promoEval } = usePromotionEvaluation();

  const totalShop = getTotal();
  const totalPrint = getPrintTotal();
  const totalPack = getPackTotal();
  const hasShop = items.length > 0 || packItems.length > 0;
  const hasPrint = printItems.length > 0;
  const grandTotal = totalShop + totalPack + totalPrint - promoEval.totalDiscount;

  const handleDeliveryConfirm = (loc: PickedLocation) => {
    setCustomDeliveryAddress(pickedToGeoLocation(loc));
    setUseSavedAddress(false);
    setDeliveryPickerOpen(false);
  };

  const handleCheckout = () => {
    if (!hasShop) return;
    if (!activeDeliveryAddress) {
      toast({
        title: "Adresse de livraison requise",
        description: savedAccountAddress
          ? "Choisissez une adresse de livraison ou ajoutez-en une dans votre profil."
          : "Ajoutez une adresse de livraison avant de valider la commande.",
        variant: "destructive",
      });
      return;
    }
    const request: CreateOrderRequest = {
      items: items.map((i) => ({
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
      packItems: packItems.map((p) => ({
        packId: p.packId,
        supplierId: p.supplierId,
        quantity: p.quantity,
      })),
      deliveryAddress: activeDeliveryAddress,
      courierInstructions: courierInstructions.trim() || undefined,
    };
    createOrder.mutate(request, {
      onSuccess: () => {
        toast({ title: "Commande envoyée !", description: "Vos commandes ont été transmises aux fournisseurs." });
        clearCart();
        clearPackItems();
        setCourierInstructions("");
        setCustomDeliveryAddress(null);
        setLocation("/orders");
      },
      onError: (error) => {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      },
    });
  };

  const handlePrintCheckout = () => {
    toast({ title: "Commande PRINT envoyée !", description: "Vos demandes d'impression ont été transmises." });
    clearPrintItems();
  };

  const bySupplier = getItemsBySupplier();
  const supplierEntries = Array.from(bySupplier.entries());

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
    <div className={`min-h-screen transition-colors duration-200 ${pageBg}`}>
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6 p-4 sm:p-6">

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
            onClick={() => setIsDark((d) => !d)}
            aria-label="Toggle theme"
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0 ${toggleBtn}`}
          >
            {dk ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4">

            {/* ── SHOP Items ── */}
            {hasShop && (
              <div className="space-y-4">
                {hasShop && hasPrint && (
                  <div className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wide ${textMuted}`}>
                    <ShoppingBag className="w-4 h-4" /> Commandes SHOP
                  </div>
                )}
                {supplierEntries.map(([supplierId, group]) => {
                  const supplierTotal = group.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
                  return (
                    <div key={supplierId} className={`border rounded-2xl overflow-hidden shadow-sm ${cardBg}`}>
                      <div className={`px-4 py-3 border-b flex items-center justify-between ${cardHdr}`}>
                        <div className="flex items-center gap-2">
                          <Store className="w-4 h-4 text-amber-500" />
                          <span className={`font-semibold text-sm ${textPrimary}`}>{group.supplierName}</span>
                        </div>
                        <span className={`text-sm font-medium ${textPrimary}`}>{formatCurrency(supplierTotal)}</span>
                      </div>
                      <div className={`divide-y ${divideClr}`}>
                        {group.items.map((item) => {
                          const variantLabel = [item.flavorName, item.sizeName].filter(Boolean).join(" · ");
                          return (
                            <div key={`${item.listingId}-${item.flavorId ?? 0}-${item.sizeId ?? 0}`} className="flex gap-3 p-3 sm:p-4" data-testid={`cart-item-${item.listingId}`}>
                              <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden shrink-0 ${imgBg}`}>
                                {item.productImageUrl ? (
                                  <img src={item.productImageUrl} className="w-full h-full object-cover" alt="" />
                                ) : (
                                  <div className={`w-full h-full flex items-center justify-center text-xs ${textMuted}`}>—</div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`font-medium text-sm truncate ${textPrimary}`}>{item.productName}</p>
                                {variantLabel && <p className={`text-xs truncate ${textMuted}`}>{variantLabel}</p>}
                                <p className={`text-xs ${textMuted}`}>{formatCurrency(item.unitPrice)} chacun</p>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <div className={`flex items-center border rounded-xl overflow-hidden ${borderClr}`}>
                                    <button className={`px-2 py-1 transition-colors ${dk ? "hover:bg-gray-700" : "hover:bg-gray-100"}`} onClick={() => updateQuantity(item.listingId, item.flavorId, item.sizeId, Math.max(1, item.quantity - 1))} data-testid={`button-decrease-${item.listingId}`}><Minus className={`w-3 h-3 ${textMuted}`} /></button>
                                    <span className={`px-2 sm:px-3 text-sm font-medium w-7 sm:w-8 text-center ${textPrimary}`}>{item.quantity}</span>
                                    <button className={`px-2 py-1 transition-colors ${dk ? "hover:bg-gray-700" : "hover:bg-gray-100"}`} onClick={() => updateQuantity(item.listingId, item.flavorId, item.sizeId, item.quantity + 1)} data-testid={`button-increase-${item.listingId}`}><Plus className={`w-3 h-3 ${textMuted}`} /></button>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-2 shrink-0 min-w-[52px]">
                                <p className={`font-bold text-sm ${textPrimary}`}>{formatCurrency(item.unitPrice * item.quantity)}</p>
                                <button className={`transition-colors ${textMuted} hover:text-red-500`} onClick={() => removeItem(item.listingId, item.flavorId, item.sizeId)} data-testid={`button-remove-${item.listingId}`}><Trash2 className="w-4 h-4" /></button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {packItems.map((pack) => (
                  <div key={`pack-${pack.packId}`} className={`border rounded-2xl overflow-hidden shadow-sm ${dk ? "bg-gray-800 border-amber-500/25" : "bg-white border-amber-100"}`} data-testid={`cart-pack-${pack.packId}`}>
                    <div className={`px-3 sm:px-4 py-3 border-b flex items-center justify-between gap-2 ${dk ? "bg-amber-500/10 border-amber-500/25" : "bg-amber-50 border-amber-100"}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Layers className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className={`font-semibold text-sm truncate ${dk ? "text-amber-400" : "text-amber-700"}`}>{pack.supplierName} · Pack</span>
                      </div>
                      <span className={`text-sm font-medium shrink-0 ${dk ? "text-amber-400" : "text-amber-700"}`}>{formatCurrency(pack.unitPrice * pack.quantity)}</span>
                    </div>
                    <div className="p-3 sm:p-4">
                      <div className="flex gap-3">
                        <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden shrink-0 ${imgBg}`}>
                          {pack.packImageUrl ? (
                            <img src={pack.packImageUrl} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center text-xs ${textMuted}`}>—</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm truncate ${textPrimary}`}>{pack.packName}</p>
                          <p className={`text-xs ${textMuted}`}>{formatCurrency(pack.unitPrice)} le pack</p>
                          {pack.includedProducts.length > 0 && (
                            <p className={`text-xs mt-0.5 line-clamp-1 ${textMuted}`}>
                              {pack.includedProducts.map((ip) => `${ip.quantity}× ${ip.productName}`).join(", ")}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <div className={`flex items-center border rounded-xl overflow-hidden ${borderClr}`}>
                              <button className={`px-2 py-1 transition-colors ${dk ? "hover:bg-gray-700" : "hover:bg-gray-100"}`} onClick={() => updatePackQuantity(pack.packId, Math.max(1, pack.quantity - 1))} data-testid={`button-decrease-pack-${pack.packId}`}><Minus className={`w-3 h-3 ${textMuted}`} /></button>
                              <span className={`px-2 sm:px-3 text-sm font-medium w-7 sm:w-8 text-center ${textPrimary}`}>{pack.quantity}</span>
                              <button className={`px-2 py-1 transition-colors ${dk ? "hover:bg-gray-700" : "hover:bg-gray-100"}`} onClick={() => updatePackQuantity(pack.packId, pack.quantity + 1)} data-testid={`button-increase-pack-${pack.packId}`}><Plus className={`w-3 h-3 ${textMuted}`} /></button>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0 min-w-[52px]">
                          <p className={`font-bold text-sm ${textPrimary}`}>{formatCurrency(pack.unitPrice * pack.quantity)}</p>
                          <button className={`transition-colors ${textMuted} hover:text-red-500`} onClick={() => removePackItem(pack.packId)} data-testid={`button-remove-pack-${pack.packId}`}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
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
                  const sizeEntries = Object.entries(item.sizeMatrix).filter(([, qty]) => qty > 0);
                  return (
                    <div key={item.id} className={`border rounded-2xl overflow-hidden shadow-sm ${dk ? "bg-gray-800 border-blue-500/25" : "bg-white border-blue-100"}`} data-testid={`cart-print-item-${item.id}`}>
                      <div className={`px-3 sm:px-4 py-3 border-b flex items-center justify-between gap-2 ${dk ? "bg-blue-500/10 border-blue-500/25" : "bg-blue-50 border-blue-100"}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Printer className={`w-4 h-4 shrink-0 ${dk ? "text-blue-400" : "text-blue-600"}`} />
                          <span className={`font-semibold text-sm truncate ${dk ? "text-blue-400" : "text-blue-700"}`}>{item.brandName}</span>
                        </div>
                        <span className={`text-sm font-medium shrink-0 ${dk ? "text-blue-400" : "text-blue-700"}`}>{formatCurrency(item.unitPrice * item.totalQuantity)}</span>
                      </div>
                      <div className="p-3 sm:p-4">
                        <div className="flex gap-3">
                          <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden shrink-0 border ${dk ? "bg-gray-700 border-gray-700" : "bg-white border-gray-100"}`}>
                            {item.uploadedFileDataUrl && !isPdf ? (
                              <img src={item.uploadedFileDataUrl} className="w-full h-full object-cover" alt="Design" />
                            ) : item.printProductImage ? (
                              <img src={item.printProductImage} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <div className={`w-full h-full flex items-center justify-center ${dk ? "bg-gray-700" : "bg-blue-50"}`}>
                                <Package className={`w-6 h-6 ${dk ? "text-blue-400/40" : "text-blue-300"}`} />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className={`font-semibold text-sm truncate ${textPrimary}`}>{item.printProductName}</p>
                            {item.uploadedFileName && (
                              <p className={`text-xs truncate ${dk ? "text-blue-400" : "text-blue-600"}`}>📎 {item.uploadedFileName}</p>
                            )}
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {item.primaryColor && (
                                <div className={`flex items-center gap-1 text-xs ${textMuted}`}>
                                  <div className="w-3 h-3 rounded-full border border-gray-400/30 shrink-0" style={{ backgroundColor: item.primaryColor }} />
                                  <span>C1</span>
                                </div>
                              )}
                              {item.secondaryColor && (
                                <div className={`flex items-center gap-1 text-xs ${textMuted}`}>
                                  <div className="w-3 h-3 rounded-full border border-gray-400/30 shrink-0" style={{ backgroundColor: item.secondaryColor }} />
                                  <span>C2</span>
                                </div>
                              )}
                              {item.material && (
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-xl border ${dk ? "bg-gray-700 border-gray-600 text-gray-300" : "bg-gray-100 border-gray-200 text-gray-600"}`}>
                                  {item.material}
                                </span>
                              )}
                            </div>
                            {item.hasSizes && sizeEntries.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {sizeEntries.map(([size, qty]) => (
                                  <span key={size} className={`text-[10px] font-semibold px-2 py-0.5 rounded-xl border ${dk ? "border-gray-600 text-gray-300" : "border-gray-200 text-gray-600"}`}>
                                    {size}: {qty}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className={`flex items-center gap-2 flex-wrap text-xs mt-1 ${textMuted}`}>
                              <span>{item.totalQuantity} {item.priceUnit}(s)</span>
                              <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{item.deliveryTime}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0 min-w-[52px]">
                            <p className={`font-bold text-sm ${textPrimary}`}>{formatCurrency(item.unitPrice * item.totalQuantity)}</p>
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
          <div className="lg:col-span-1 space-y-4">
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
                    {supplierEntries.map(([sid, group]) => {
                      const supTotal = group.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
                      const promoResult = promoEval.bySupplier.find(r => r.supplierId === Number(sid));
                      return (
                        <div key={sid}>
                          <div className={`flex justify-between ${textMuted}`}>
                            <span className="truncate mr-2">{group.supplierName}</span>
                            <span>{formatCurrency(supTotal)}</span>
                          </div>
                          {promoResult && promoResult.discountAmount > 0 && (
                            <div className="flex justify-between text-green-500 text-xs mt-0.5">
                              <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{promoResult.promotionName ?? 'Promotion'}</span>
                              <span>−{formatCurrency(promoResult.discountAmount)}</span>
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
                    {packItems.length > 0 && (
                      <div className={`flex justify-between ${textMuted}`}>
                        <span>Packs</span>
                        <span>{formatCurrency(totalPack)}</span>
                      </div>
                    )}
                    {promoEval.totalDiscount > 0 && (
                      <div className={`flex justify-between text-green-500 font-medium border-t pt-2 ${dk ? "border-green-500/20" : "border-green-100"}`}>
                        <span>Promotion savings</span>
                        <span>−{formatCurrency(promoEval.totalDiscount)}</span>
                      </div>
                    )}
                    <div className={`border-t pt-3 flex justify-between items-center font-bold ${borderClr}`}>
                      <span className={textPrimary}>Total SHOP</span>
                      <span className="text-xl text-amber-500">{formatCurrency(Math.max(0, totalShop + totalPack - promoEval.totalDiscount))}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCheckout}
                    disabled={createOrder.isPending}
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
                <div className="p-5 space-y-4">
                  <h3 className={`font-bold text-lg flex items-center gap-2 ${dk ? "text-blue-400" : "text-blue-700"}`}>
                    <Printer className="w-4 h-4" /> Commande PRINT
                  </h3>
                  <div className="space-y-2 text-sm">
                    {printItems.map((item) => (
                      <div key={item.id} className={`flex justify-between ${textMuted}`}>
                        <span className="truncate mr-2">{item.printProductName}</span>
                        <span>{formatCurrency(item.unitPrice * item.totalQuantity)}</span>
                      </div>
                    ))}
                    <div className={`border-t pt-3 flex justify-between items-center font-bold ${dk ? "border-blue-500/20" : "border-blue-100"}`}>
                      <span className={textPrimary}>Total PRINT</span>
                      <span className={`text-xl ${dk ? "text-blue-400" : "text-blue-600"}`}>{formatCurrency(totalPrint)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handlePrintCheckout}
                    className={`w-full rounded-2xl py-3.5 font-semibold text-sm transition-all shadow-lg text-white ${dk ? "bg-blue-600 hover:bg-blue-500 shadow-blue-500/20" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"}`}
                    data-testid="button-place-print-order"
                  >
                    <span className="flex items-center justify-center gap-2">Confirmer PRINT <ArrowRight className="w-4 h-4" /></span>
                  </button>
                  <button className={`w-full text-xs text-center transition-colors ${textMuted} hover:text-red-500`} onClick={clearPrintItems}>
                    Vider PRINT
                  </button>
                </div>
              </div>
            )}

            {hasShop && hasPrint && (
              <div className={`border rounded-2xl shadow-sm ${cardBg}`}>
                <div className="p-5">
                  <div className="flex justify-between items-center">
                    <span className={`font-bold ${textMuted}`}>Total général</span>
                    <span className={`text-2xl font-bold ${textPrimary}`}>{formatCurrency(grandTotal)}</span>
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
    </div>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Store, User, MapPin, ArrowRight, Package, Truck, Building2, Phone, Layers, Weight, Boxes, AlertTriangle } from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-currency";
import { formatDate } from "@/lib/format";
import { useThemeStore } from "@/store/theme-store";
import DeliveryRouteMap from "@/components/delivery/delivery-route-map";
import { groupOrderItemsByProduct } from "@/lib/order-item-grouping";
import { PackCompositionView, type PackCompositionTheme } from "@/components/order/pack-composition-view";
import { VEHICLE_TYPE_LABELS } from "@/hooks/use-delivery-ecosystem";
import type { DeliveryWithDetails } from "@shared/schema";

export const DELIVERY_STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "En attente de dispatch", cls: "bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-400" },
  AVAILABLE: { label: "Disponible", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  ACCEPTED: { label: "Acceptée", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400" },
  ASSIGNED: { label: "Assignée", cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400" },
  PICKED_UP: { label: "Collectée", cls: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400" },
  IN_TRANSIT: { label: "En transit", cls: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400" },
  DELIVERED: { label: "Livrée", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" },
  CANCELLED: { label: "Annulée", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
};

export const DELIVERY_MODE_LABEL: Record<string, string> = {
  DELIVERY_COMPANY: "Entreprise de livraison",
  SUPPLIER: "Chauffeurs du fournisseur",
};

type ViewerRole = "SUPPLIER" | "DELIVERY_COMPANY" | "DRIVER" | "ADMIN" | "SUPER_ADMIN";

type Props = {
  delivery: DeliveryWithDetails;
  viewerRole: ViewerRole;
  /** Driver view only: shows the two-stage navigation map. */
  showNavigation?: boolean;
  driverLocation?: { lat: string; lng: string } | null;
  /** Action buttons slot (accept / assign / dispatch / status update) — owned by the caller. */
  actions?: React.ReactNode;
};

/**
 * Single Delivery Details view reused by Supplier, Delivery Company, Driver, and Admin —
 * role-based visibility is minimal by design (everyone already gets the full picture; the
 * spec's role split is mostly "which actions are available", handled by the `actions` slot
 * the parent page supplies), so one component serves all four rather than four near-identical
 * copies. See SHOP_DELIVERY_V2 implementation notes.
 */
export default function DeliveryDetails({ delivery: d, viewerRole, showNavigation, driverLocation, actions }: Props) {
  const fmt = useFormatCurrency();
  const isDark = useThemeStore((s) => s.isDark);
  const statusMeta = DELIVERY_STATUS_META[d.status] ?? { label: d.status, cls: "bg-gray-100 text-gray-700" };
  const stage = d.status === "PICKED_UP" || d.status === "IN_TRANSIT" || d.status === "DELIVERED" ? "TO_DESTINATION" : "TO_PICKUP";
  // PackCompositionView is shared with the Coffee Owner/Supplier order-details modals —
  // this page has no manual light/dark toggle of its own, so bridge the current theme store
  // into the same minimal structural theme those modals pass it.
  const packTheme: PackCompositionTheme = {
    dk: isDark,
    innerCard: isDark ? "bg-gray-800/60 border-gray-700/40" : "bg-muted/50 border-border",
    textSubtle: "text-muted-foreground",
    textPrimary: "text-foreground",
    textMuted: "text-muted-foreground",
  };

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {/* Header: status + mode */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">Commande #{d.orderId}</span>
          <Badge variant="secondary" className={statusMeta.cls}>{statusMeta.label}</Badge>
        </div>
        {d.deliveryMode && (
          <Badge variant="outline" className="text-xs gap-1">
            <Truck className="w-3 h-3" /> {DELIVERY_MODE_LABEL[d.deliveryMode] ?? d.deliveryMode}
          </Badge>
        )}
      </div>

      {/* Navigation — Driver only */}
      {showNavigation && (
        <DeliveryRouteMap
          stage={stage}
          pickup={d.pickupAddress}
          destination={d.destinationAddress}
          driverLocation={driverLocation}
        />
      )}

      {/* Order info */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Commande</p>
          <div className="grid grid-cols-2 gap-2 text-sm [&>*]:min-w-0">
            <div><span className="text-muted-foreground">N° :</span> #{d.order.id}</div>
            <div><span className="text-muted-foreground">Statut :</span> {d.order.status}</div>
            <div><span className="text-muted-foreground">Total :</span> {fmt(d.order.totalAmount)}</div>
            <div><span className="text-muted-foreground">Articles :</span> {d.order.itemCount}</div>
            {d.order.createdAt && <div className="col-span-2"><span className="text-muted-foreground">Créée le :</span> {formatDate(d.order.createdAt as any)}</div>}
          </div>
        </CardContent>
      </Card>

      {/* Cafe / Coffee Owner */}
      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-blue-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Café</p>
            <p className="font-medium text-sm">{d.cafe.name}</p>
            {d.cafe.phone && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" /> {d.cafe.phone}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Supplier */}
      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <Store className="w-4 h-4 text-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Fournisseur</p>
            <p className="font-medium text-sm">{d.supplier.name}</p>
            {d.supplier.phone && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" /> {d.supplier.phone}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Products */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" /> Produits
          </p>
          <div className="divide-y divide-border/50">
            {groupOrderItemsByProduct(d.items ?? []).map((group) => (
              <div key={`product-${group.productId}`} className="py-2">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shrink-0 bg-muted">
                    {group.productImageUrl
                      ? <img src={group.productImageUrl} alt="" className="w-full h-full object-cover" />
                      : <Package className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{group.productName}</p>
                    {(group.brandName || group.categoryName || group.subCategoryName) && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {[group.brandName, group.categoryName, group.subCategoryName].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <div className="mt-1 space-y-0.5">
                      {group.variants.map((variant) => {
                        const cancelled = variant.status === "CANCELLED";
                        return (
                          <div key={variant.key} className="flex items-center justify-between gap-2 text-xs">
                            <span className={cancelled ? "line-through text-muted-foreground/60" : "text-muted-foreground"}>
                              {[variant.flavorName, variant.sizeName].filter(Boolean).join(" · ") || "—"}
                              <span className="ml-1.5">×{variant.quantity}</span>
                            </span>
                            <span className={`font-semibold shrink-0 ${cancelled ? "line-through text-muted-foreground/60" : ""}`}>
                              {fmt(variant.totalPrice)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {(d.items ?? []).filter((item: any) => !!item.packId).map((item: any, idx: number) => {
              const snapshot = item.snapshot as any;
              const packSnapshot = snapshot?.kind === "PACK" ? snapshot : null;
              const itemName = packSnapshot?.packName ?? item.packName ?? "Pack";
              const itemImage = packSnapshot?.packImageUrl;
              const cancelled = item.status === "CANCELLED";
              return (
                <div key={`pack-${item.id ?? idx}`} className="py-2">
                  <div className="flex items-start gap-2.5">
                    <div className={`w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shrink-0 ${cancelled ? "bg-muted" : "bg-amber-500/15"}`}>
                      {itemImage
                        ? <img src={itemImage} alt="" className={`w-full h-full object-cover ${cancelled ? "opacity-40 grayscale" : ""}`} />
                        : <Layers className={`w-4 h-4 ${cancelled ? "text-muted-foreground" : "text-amber-500"}`} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium text-sm truncate ${cancelled ? "line-through text-muted-foreground/60" : ""}`}>{itemName}</p>
                      {!cancelled && (
                        <PackCompositionView packId={item.packId} quantity={item.quantity} snapshot={packSnapshot} t={packTheme} />
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs text-muted-foreground block">×{item.quantity}</span>
                      <span className={`font-semibold text-sm ${cancelled ? "line-through text-muted-foreground/60" : ""}`}>
                        {fmt((item.unitPrice ?? 0) * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {(!d.items || d.items.length === 0) && <p className="text-xs text-muted-foreground py-2">Aucun article</p>}
          </div>
          <div className="flex justify-between items-center pt-2 mt-1 border-t border-border/50">
            <span className="text-xs font-medium text-muted-foreground">Sous-total</span>
            <span className="font-bold text-sm">{fmt(d.subOrder.subtotal)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Transport requirements (Delivery System V2) — supplier-declared, informational +
          vehicle-compatibility gating only (see storage.isVehicleCompatible). Shown to every
          role that sees this component (Supplier/Delivery Company/Driver/Admin all need to
          know what the mission requires); the Coffee Owner never sees this component at all. */}
      {(d.subOrder.requiredVehicleType || d.subOrder.totalWeightKg || d.subOrder.totalVolumeL || d.subOrder.numberOfPackages != null || d.subOrder.numberOfItems != null || d.subOrder.isFragile || d.subOrder.specialHandling) && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5" /> Transport requirements
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs [&>*]:min-w-0">
              {d.subOrder.requiredVehicleType && (
                <div className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-muted-foreground" /> {VEHICLE_TYPE_LABELS[d.subOrder.requiredVehicleType] ?? d.subOrder.requiredVehicleType}</div>
              )}
              {d.subOrder.totalWeightKg && (
                <div className="flex items-center gap-1.5"><Weight className="w-3.5 h-3.5 text-muted-foreground" /> {d.subOrder.totalWeightKg} kg</div>
              )}
              {d.subOrder.totalVolumeL && (
                <div className="flex items-center gap-1.5"><Boxes className="w-3.5 h-3.5 text-muted-foreground" /> {d.subOrder.totalVolumeL} L</div>
              )}
              {d.subOrder.numberOfPackages != null && (
                <div><span className="text-muted-foreground">Colis :</span> {d.subOrder.numberOfPackages}</div>
              )}
              {d.subOrder.numberOfItems != null && (
                <div><span className="text-muted-foreground">Articles :</span> {d.subOrder.numberOfItems}</div>
              )}
              {d.subOrder.isFragile && (
                <div className="flex items-center gap-1.5 text-amber-600"><AlertTriangle className="w-3.5 h-3.5" /> Fragile</div>
              )}
            </div>
            {d.subOrder.specialHandling && (
              <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">{d.subOrder.specialHandling}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delivery */}
      <Card>
        <CardContent className="p-4 space-y-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Livraison</p>
          <div className="flex items-start gap-2 text-xs">
            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
            <span><span className="text-muted-foreground">Collecte : </span>{d.pickupAddress?.address || "—"}</span>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-500" />
            <span><span className="text-muted-foreground">Destination : </span>{d.destinationAddress?.address || "—"}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm pt-1 [&>*]:min-w-0">
            {d.deliveryCompany && (
              <div className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-muted-foreground" /> {d.deliveryCompany.name}</div>
            )}
            {d.driver && (
              <div className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-muted-foreground" /> {d.driver.name}</div>
            )}
            {d.vehicleType && (
              <div><span className="text-muted-foreground">Véhicule :</span> {VEHICLE_TYPE_LABELS[d.vehicleType] ?? d.vehicleType}</div>
            )}
            {d.distanceKm && (
              <div><span className="text-muted-foreground">Distance :</span> {d.distanceKm} km</div>
            )}
            {/* Delivery System V2 Phase 3 — customer delivery fee and driver payout are
                separate concepts (see server/storage.ts computeDeliveryPayout doc); a Driver
                must never see the customer-facing fee labeled as if it were their own
                earnings. totalDriverPayoutCents (Phase 4) folds in any later waiting
                compensation on top of the frozen base payout — null for deliveries created
                before Phase 3 or not yet assigned — falls back to the generic fee line then. */}
            {viewerRole === "DRIVER" ? (
              d.totalDriverPayoutCents != null ? (
                <div><span className="text-muted-foreground">Votre rémunération :</span> {fmt(d.totalDriverPayoutCents)}</div>
              ) : d.deliveryFee > 0 && <div><span className="text-muted-foreground">Frais :</span> {fmt(d.deliveryFee)}</div>
            ) : (
              d.deliveryFee > 0 && <div><span className="text-muted-foreground">Frais :</span> {fmt(d.deliveryFee)}</div>
            )}
            {d.weatherConditionUsed && d.weatherConditionUsed !== "NORMAL" && (
              <div><span className="text-muted-foreground">Météo :</span> {d.weatherConditionUsed}</div>
            )}
            {d.zoneNameUsed && (
              <div><span className="text-muted-foreground">Zone :</span> {d.zoneNameUsed}</div>
            )}
            {d.peakHourLabelUsed && (
              <div><span className="text-muted-foreground">Période :</span> {d.peakHourLabelUsed}</div>
            )}
            <div><span className="text-muted-foreground">Créée :</span> {formatDate(d.createdAt as any)}</div>
          </div>
          {/* Assigned ≠ confirmed (task: "Delivery Company redispatch before driver
              confirmation") — ASSIGNED is the only state where the driver has been offered the
              delivery but has not yet progressed to PICKED_UP, i.e. has not yet confirmed it
              (see storage.reassignDriver's own doc, the same source of truth used to gate the
              Redispatcher action). Shown to the Delivery Company only — the Supplier already
              has its own equivalent redispatch entry point (DispatchDialog) and does not need a
              duplicate label. */}
          {viewerRole === "DELIVERY_COMPANY" && d.status === "ASSIGNED" && (
            <p className="text-xs text-amber-600 pt-1">Chauffeur assigné — en attente de confirmation.</p>
          )}
          {/* Admin-only payout/subsidy/budget monitoring (Delivery System V2 Phase 3-4) —
              driverPayoutCents/companyPayoutCents/supplierSubsidyCents/bigBossSubsidyCents/
              budgetResultUsed are all REAL, server-computed, persisted values (see
              server/storage.ts computeDeliveryPayout/computeDeliveryBudget), frozen at
              assignment exactly like the fee itself — never recomputed client-side (rule 31
              of the Phase 4 spec: "financial calculations must remain server-side"). Falls
              back to the pre-Phase-3 assumption (driver = full fee) only for historical
              deliveries that never computed a payout. */}
          {(viewerRole === "ADMIN" || viewerRole === "SUPER_ADMIN") && d.deliveryFee > 0 && (
            <div className="grid grid-cols-2 gap-2 text-xs pt-2 mt-1 border-t border-border/50 [&>*]:min-w-0">
              <div><span className="text-muted-foreground">Café :</span> {fmt(d.cafeOwnerFeeShareCents ?? 0)}</div>
              <div><span className="text-muted-foreground">Fournisseur :</span> {fmt(d.supplierFeeShareCents ?? 0)}</div>
              {(d as any).pickupLegFeeCents != null && (
                <div><span className="text-muted-foreground">Fournisseur (collecte) :</span> {fmt((d as any).pickupLegFeeCents)}</div>
              )}
              <div><span className="text-muted-foreground">Chauffeur payout :</span> {fmt(d.totalDriverPayoutCents ?? d.driverPayoutCents ?? d.deliveryFee)}</div>
              {d.deliveryMode === "DELIVERY_COMPANY" && (
                <div><span className="text-muted-foreground">Entreprise payout :</span> {fmt(d.companyPayoutCents ?? 0)}</div>
              )}
              {!!d.supplierSubsidyCents && (
                <div><span className="text-muted-foreground">Subvention fournisseur :</span> {fmt(d.supplierSubsidyCents)}</div>
              )}
              {!!d.bigBossSubsidyCents && (
                <div><span className="text-muted-foreground">Subvention BigBoss :</span> {fmt(d.bigBossSubsidyCents)}</div>
              )}
              <div><span className="text-muted-foreground">Statut payout :</span> {d.payoutStatus === "EARNED" ? "Acquis" : d.payoutStatus === "VOID" ? "Annulé" : "En attente"}</div>
              {d.budgetResultUsed && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Budget :</span>{" "}
                  {d.budgetResultUsed === "DEFICIT" ? `Déficit de ${fmt(d.budgetDeficitCentsUsed ?? 0)}` : d.budgetResultUsed === "FUNDED" ? "Financé (marge positive)" : "Équilibré"}
                </div>
              )}
            </div>
          )}
          {/* Delivery System V2 Phase 5B — Supplier/Delivery-Company financial visibility.
              Every field read here is ALREADY correctly redacted server-side by
              storage.redactDeliveryCodes (e.g. a Supplier viewing a DELIVERY_COMPANY-mode
              delivery already receives driverPayoutCents=null) — this block never duplicates
              that authorization logic, it only conditionally renders fields that are already
              either present or null for this viewer. See
              docs/bigboss-delivery-financial-visibility.md §"Financial detail per delivery". */}
          {viewerRole === "SUPPLIER" && d.deliveryFee > 0 && (
            <div className="grid grid-cols-2 gap-2 text-xs pt-2 mt-1 border-t border-border/50 [&>*]:min-w-0">
              <div><span className="text-muted-foreground">Café :</span> {fmt(d.cafeOwnerFeeShareCents ?? 0)}</div>
              <div><span className="text-muted-foreground">Ma contribution :</span> {fmt(d.supplierFeeShareCents ?? 0)}</div>
              {(d as any).pickupLegFeeCents != null && (
                <div><span className="text-muted-foreground">Ma collecte (chauffeur → moi) :</span> {fmt((d as any).pickupLegFeeCents)}</div>
              )}
              {d.driverPayoutCents != null && (
                <div><span className="text-muted-foreground">Mon chauffeur :</span> {fmt(d.totalDriverPayoutCents ?? d.driverPayoutCents)}</div>
              )}
              {!!d.supplierSubsidyCents && (
                <div><span className="text-muted-foreground">Ma subvention livraison :</span> {fmt(d.supplierSubsidyCents)}</div>
              )}
              {!!d.waitingDriverCompensationCentsUsed && (
                <div><span className="text-muted-foreground">Compensation d'attente :</span> {fmt(d.waitingDriverCompensationCentsUsed)}</div>
              )}
            </div>
          )}
          {viewerRole === "DELIVERY_COMPANY" && d.deliveryFee > 0 && (
            <div className="grid grid-cols-2 gap-2 text-xs pt-2 mt-1 border-t border-border/50 [&>*]:min-w-0">
              <div><span className="text-muted-foreground">Frais de livraison :</span> {fmt(d.deliveryFee)}</div>
              {(d as any).pickupLegFeeCents != null && (
                <div><span className="text-muted-foreground">Collecte (à charge du fournisseur) :</span> {fmt((d as any).pickupLegFeeCents)}</div>
              )}
              {d.driverPayoutCents != null && (
                <div><span className="text-muted-foreground">Payout chauffeur :</span> {fmt(d.totalDriverPayoutCents ?? d.driverPayoutCents)}</div>
              )}
              {d.companyPayoutCents != null && (
                <div><span className="text-muted-foreground">Montant conservé :</span> {fmt(d.companyPayoutCents)}</div>
              )}
              {!!d.waitingDriverCompensationCentsUsed && (
                <div><span className="text-muted-foreground">Compensation d'attente :</span> {fmt(d.waitingDriverCompensationCentsUsed)}</div>
              )}
            </div>
          )}
          {/* Backend redacts pickupCode to every role except SUPPLIER/ADMIN — this only ever
              renders for the operating supplier, who reads it aloud to the driver at pickup. */}
          {viewerRole === "SUPPLIER" && (d as any).pickupCode && d.status === "ASSIGNED" && (
            <p className="text-xs pt-1">
              <span className="text-muted-foreground">Code de collecte pour le chauffeur : </span>
              <span className="font-mono font-bold tracking-widest">{(d as any).pickupCode}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {actions && <div className="pt-1">{actions}</div>}
    </div>
  );
}

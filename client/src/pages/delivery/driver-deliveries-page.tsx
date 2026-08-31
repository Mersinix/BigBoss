import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useDeliveries, useUpdateDeliveryStatus } from "@/hooks/use-deliveries";
import { useFormatCurrency } from "@/hooks/use-currency";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Menu, Info, MessageCircle, Package2, MapPin, Navigation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DeliveryDetails, { DELIVERY_STATUS_META } from "@/components/delivery/delivery-details";
import DeliveryRouteMap from "@/components/delivery/delivery-route-map";
import type { DeliveryStatus, DeliveryWithDetails } from "@shared/schema";

// PICKED_UP and DELIVERED are the two physical handoffs (supplier -> driver,
// driver -> cafe owner) and require the other party's confirmation code —
// see shared/schema.ts deliveries.pickupCode/dropoffCode. IN_TRANSIT is a
// driver-only step with no handoff, so it needs no code.
const NEXT_STEP: Partial<Record<DeliveryStatus, { next: DeliveryStatus; label: string; requiresCode: boolean }>> = {
  ASSIGNED: { next: "PICKED_UP", label: "Marquer collectée", requiresCode: true },
  PICKED_UP: { next: "IN_TRANSIT", label: "Démarrer le transit", requiresCode: false },
  IN_TRANSIT: { next: "DELIVERED", label: "Marquer livrée", requiresCode: true },
};

// The map is now the Driver's main operational workspace (task Part 2) — the deliveries
// list, delivery details, and messaging all live in floating overlays over it (Part 3/4)
// instead of a stacked page. Reuses DeliveryRouteMap/DeliveryDetails/useDeliveries/
// useUpdateDeliveryStatus exactly as before — no duplicate delivery workflow, only the
// surrounding chrome changed.
export default function DriverDeliveriesPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { data: deliveries = [], isLoading } = useDeliveries();
  const updateStatus = useUpdateDeliveryStatus();
  const fmt = useFormatCurrency();
  const { toast } = useToast();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [listTab, setListTab] = useState<"active" | "completed">("active");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [codePrompt, setCodePrompt] = useState<{ deliveryId: number; next: DeliveryStatus; label: string } | null>(null);
  const [codeInput, setCodeInput] = useState("");

  const active = deliveries.filter((d) => !["DELIVERED", "CANCELLED"].includes(d.status));
  const completed = deliveries.filter((d) => ["DELIVERED", "CANCELLED"].includes(d.status));

  // ?focus=<deliveryId> — the Planification tab's GO button (task Part 1) lands here and
  // selects that exact delivery, opening the map on it immediately.
  useEffect(() => {
    const params = new URLSearchParams(search);
    const focus = params.get("focus");
    if (focus) setSelectedId(Number(focus));
  }, [search]);

  const current: DeliveryWithDetails | undefined =
    (selectedId ? active.find((d) => d.id === selectedId) : undefined)
    ?? active.find((d) => d.status === "PICKED_UP" || d.status === "IN_TRANSIT")
    ?? active[0];

  const driverLocation = user?.locationLat && user?.locationLng ? { lat: user.locationLat, lng: user.locationLng } : null;
  const stage = current && (current.status === "PICKED_UP" || current.status === "IN_TRANSIT") ? "TO_DESTINATION" : "TO_PICKUP";

  const handleAdvance = (deliveryId: number, next: DeliveryStatus, code?: string) => {
    updateStatus.mutate({ deliveryId, status: next, code }, {
      onSuccess: () => { toast({ title: "Statut mis à jour" }); setCodePrompt(null); setCodeInput(""); },
      onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };
  const handleStepClick = (deliveryId: number, step: { next: DeliveryStatus; label: string; requiresCode: boolean }) => {
    if (step.requiresCode) { setCodeInput(""); setCodePrompt({ deliveryId, next: step.next, label: step.label }); }
    else handleAdvance(deliveryId, step.next);
  };

  const selectDelivery = (id: number) => { setSelectedId(id); setListOpen(false); };

  // Message button — opens the Driver ↔ Supplier conversation while heading to pickup, or
  // Driver ↔ Coffee Owner once collected, for THIS delivery only (task Part 4). Reuses the
  // exact same conversations system as every other service (POST /api/messages/conversations,
  // service="SHOP") — no new messaging engine.
  const openDeliveryChat = async () => {
    if (!current) return;
    const targetUserId = stage === "TO_PICKUP" ? current.supplier.id : current.cafe.id;
    setMessaging(true);
    try {
      const res = await apiRequest("POST", "/api/messages/conversations", { targetUserId, service: "SHOP" });
      const data = await res.json();
      navigate(`/driver/messages?conversationId=${data.conversation.id}&returnTo=deliveries`);
    } catch (err: any) {
      toast({ title: "Impossible d'ouvrir la conversation", description: err.message, variant: "destructive" });
    } finally {
      setMessaging(false);
    }
  };

  const step = current ? NEXT_STEP[current.status] : undefined;

  return (
    <div className="-mx-4 -my-6 sm:mx-0 sm:my-0 relative">
      {isLoading ? (
        <div className="p-6"><Skeleton className="h-[70vh] w-full rounded-2xl" /></div>
      ) : !current ? (
        <div className="p-6">
          <Card><CardContent className="py-16 text-center">
            <Package2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">Aucune livraison active</p>
            <p className="text-sm text-muted-foreground mt-1">Vos livraisons assignées apparaîtront ici.</p>
          </CardContent></Card>
          {completed.length > 0 && (
            <Button variant="outline" className="mt-4 w-full" onClick={() => setListOpen(true)} data-testid="button-open-completed">
              Voir l'historique ({completed.length})
            </Button>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* ── Map workspace ── */}
          <div className="relative">
            <DeliveryRouteMap stage={stage} pickup={current.pickupAddress} destination={current.destinationAddress} driverLocation={driverLocation} />

            {/* ── Floating overlay controls ── */}
            <div className="absolute top-3 right-3 flex flex-col gap-2 z-10">
              <Button size="icon" variant="secondary" className="h-10 w-10 rounded-full shadow-lg" onClick={() => setListOpen(true)} aria-label="Mes livraisons" data-testid="button-open-delivery-list">
                <Menu className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="secondary" className="h-10 w-10 rounded-full shadow-lg" onClick={() => setDetailsOpen(true)} aria-label="Détails" data-testid="button-open-delivery-details">
                <Info className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="secondary" className="h-10 w-10 rounded-full shadow-lg" onClick={openDeliveryChat} disabled={messaging} aria-label="Message" data-testid="button-open-delivery-chat">
                <MessageCircle className="w-4 h-4" />
              </Button>
            </div>

            <div className="absolute top-3 left-3 z-10 flex items-center gap-2 max-w-[60%]">
              <Badge variant="secondary" className={`${DELIVERY_STATUS_META[current.status]?.cls ?? ""} shadow`}>{DELIVERY_STATUS_META[current.status]?.label ?? current.status}</Badge>
              <Badge variant="outline" className="bg-background/90 shadow truncate">#{current.orderId} · {current.supplier.name}</Badge>
            </div>
          </div>

          {/* ── Bottom action bar ── */}
          <div className="p-4 space-y-2 border-t border-border/50 bg-background">
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
              <span className="truncate">{stage === "TO_PICKUP" ? current.pickupAddress?.address : current.destinationAddress?.address ?? "—"}</span>
              <span className="ml-auto font-semibold text-foreground shrink-0">{fmt(current.deliveryFee ?? 0)}</span>
            </div>
            {step && (
              <Button className="w-full gap-2" onClick={() => handleStepClick(current.id, step)} disabled={updateStatus.isPending} data-testid="button-advance-delivery">
                <Navigation className="w-4 h-4" />{step.label}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Sandwich panel — En cours / Terminées, switch delivery without leaving the map ── */}
      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Mes livraisons</DialogTitle></DialogHeader>
          <Tabs value={listTab} onValueChange={(v) => setListTab(v as "active" | "completed")}>
            <TabsList>
              <TabsTrigger value="active" data-testid="tab-deliveries-active">En cours ({active.length})</TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-deliveries-completed">Terminées ({completed.length})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="space-y-3 pt-2">
            {(listTab === "active" ? active : completed).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Aucune livraison ici.</p>
            ) : (listTab === "active" ? active : completed).map((d) => {
              const meta = DELIVERY_STATUS_META[d.status] ?? { label: d.status, cls: "bg-gray-100 text-gray-700" };
              const dStep = NEXT_STEP[d.status];
              return (
                <Card key={d.id} className={d.id === current?.id ? "border-primary" : ""} data-testid={`card-delivery-list-${d.id}`}>
                  <CardContent className="p-4 flex items-center justify-between gap-3 cursor-pointer" onClick={() => selectDelivery(d.id)}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">#{d.orderId}</span>
                        <Badge variant="secondary" className={meta.cls}>{meta.label}</Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(d.createdAt as any)}</span>
                      </div>
                      <p className="text-sm font-medium">{d.supplier.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{d.pickupAddress?.address || "—"} → {d.destinationAddress?.address || "—"}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-sm font-semibold">{fmt(d.deliveryFee ?? 0)}</span>
                      {dStep && listTab === "active" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); selectDelivery(d.id); handleStepClick(d.id, dStep); }} disabled={updateStatus.isPending}>
                          {dStep.label}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Details modal — reuses the existing full delivery-detail view as-is ── */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Détails de la livraison</DialogTitle></DialogHeader>
          {current && (
            <DeliveryDetails
              delivery={current}
              viewerRole="DRIVER"
              showNavigation={false}
              actions={
                step ? (
                  <Button className="w-full" onClick={() => { setDetailsOpen(false); handleStepClick(current.id, step); }} disabled={updateStatus.isPending}>
                    {step.label}
                  </Button>
                ) : undefined
              }
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation-code prompt for PICKED_UP (supplier's code) / DELIVERED (cafe owner's
          code). The driver types in what was told to them — this component never displays
          the code itself, it only submits an attempt for the backend to validate. */}
      <Dialog open={!!codePrompt} onOpenChange={(v) => { if (!v) { setCodePrompt(null); setCodeInput(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{codePrompt?.label}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delivery-confirmation-code">
              {codePrompt?.next === "PICKED_UP" ? "Code fourni par le fournisseur" : "Code fourni par le café"}
            </Label>
            <Input
              id="delivery-confirmation-code"
              inputMode="numeric"
              autoFocus
              placeholder="Code à 6 chiffres"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && codePrompt && codeInput.trim()) handleAdvance(codePrompt.deliveryId, codePrompt.next, codeInput.trim()); }}
              data-testid="input-delivery-confirmation-code"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCodePrompt(null); setCodeInput(""); }}>Annuler</Button>
            <Button
              onClick={() => codePrompt && handleAdvance(codePrompt.deliveryId, codePrompt.next, codeInput.trim())}
              disabled={!codeInput.trim() || updateStatus.isPending}
              data-testid="button-confirm-delivery-code"
            >
              {updateStatus.isPending ? "Vérification…" : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

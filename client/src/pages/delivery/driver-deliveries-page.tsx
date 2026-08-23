import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDeliveries, useUpdateDeliveryStatus } from "@/hooks/use-deliveries";
import { useFormatCurrency } from "@/hooks/use-currency";
import { formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DeliveryDetails, { DELIVERY_STATUS_META } from "@/components/delivery/delivery-details";
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

export default function DriverDeliveriesPage() {
  const { user } = useAuth();
  const { data: deliveries = [], isLoading } = useDeliveries();
  const updateStatus = useUpdateDeliveryStatus();
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const [view, setView] = useState<"active" | "completed">("active");
  const [viewTarget, setViewTarget] = useState<DeliveryWithDetails | null>(null);
  // Code-entry prompt for the two handoff transitions (PICKED_UP, DELIVERED). The driver
  // never sees the code itself — it's read from the delivery.pickupCode/dropoffCode fields
  // that the backend already redacts away from this role; they only get told it verbally by
  // the supplier/cafe owner and type it in here.
  const [codePrompt, setCodePrompt] = useState<{ deliveryId: number; next: DeliveryStatus; label: string } | null>(null);
  const [codeInput, setCodeInput] = useState("");

  // GET /api/deliveries already scopes DRIVER to only this driver's own rows.
  const active = deliveries.filter((d) => !["DELIVERED", "CANCELLED"].includes(d.status));
  const completed = deliveries.filter((d) => ["DELIVERED", "CANCELLED"].includes(d.status));
  const list = view === "active" ? active : completed;
  const current = active.find((d) => d.status === "PICKED_UP" || d.status === "IN_TRANSIT") ?? active[0];

  const driverLocation = user?.locationLat && user?.locationLng ? { lat: user.locationLat, lng: user.locationLng } : null;

  const handleAdvance = (deliveryId: number, next: DeliveryStatus, code?: string) => {
    updateStatus.mutate({ deliveryId, status: next, code }, {
      onSuccess: () => {
        toast({ title: "Statut mis à jour" });
        setCodePrompt(null);
        setCodeInput("");
      },
      onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  const handleStepClick = (deliveryId: number, step: { next: DeliveryStatus; label: string; requiresCode: boolean }) => {
    if (step.requiresCode) {
      setCodeInput("");
      setCodePrompt({ deliveryId, next: step.next, label: step.label });
    } else {
      handleAdvance(deliveryId, step.next);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mes livraisons</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Vos livraisons assignées, dans l'ordre.</p>
      </div>

      {current && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-3">Livraison en cours</p>
            <DeliveryDetails
              delivery={current}
              viewerRole="DRIVER"
              showNavigation
              driverLocation={driverLocation}
              actions={
                NEXT_STEP[current.status] ? (
                  <Button className="w-full" onClick={() => handleStepClick(current.id, NEXT_STEP[current.status]!)} disabled={updateStatus.isPending}>
                    {NEXT_STEP[current.status]!.label}
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 w-fit">
        {(["active", "completed"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${view === v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {v === "active" ? `En cours (${active.length})` : `Terminées (${completed.length})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">Aucune livraison ici</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((d) => {
            const meta = DELIVERY_STATUS_META[d.status] ?? { label: d.status, cls: "bg-gray-100 text-gray-700" };
            const step = NEXT_STEP[d.status];
            return (
              <Card key={d.id}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">#{d.orderId}</span>
                      <Badge variant="secondary" className={meta.cls}>{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(d.createdAt as any)}</span>
                    </div>
                    <p className="text-sm font-medium">{d.supplier.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{d.pickupAddress?.address || "—"} → {d.destinationAddress?.address || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold">{fmt(d.deliveryFee ?? 0)}</span>
                    <Button size="sm" variant="ghost" onClick={() => setViewTarget(d)}>Détails</Button>
                    {step && view === "active" && d.id !== current?.id && (
                      <Button size="sm" variant="outline" onClick={() => handleStepClick(d.id, step)} disabled={updateStatus.isPending}>
                        {step.label}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!viewTarget} onOpenChange={(v) => { if (!v) setViewTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Détails de la livraison</DialogTitle></DialogHeader>
          {viewTarget && <DeliveryDetails delivery={viewTarget} viewerRole="DRIVER" showNavigation driverLocation={driverLocation} />}
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

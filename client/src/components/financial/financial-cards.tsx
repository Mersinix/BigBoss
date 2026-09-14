import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Coffee, Store, Receipt, Calendar, DollarSign, Percent, Wallet, Eye,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import { useFormatCurrency } from "@/hooks/use-currency";
import {
  PAYOUT_STATUS_META, PAYMENT_COLLECTION_META, invoiceNumber, payoutReference, type FinancialRow,
} from "@/lib/financial-rows";

// Mapped-card presentation for Invoices/Payments — visually inspired by Admin → Delivery's
// DeliveryCard (same InfoTile grid + header badge + footer action approach), reused by both
// Admin and Supplier Invoices/Payments pages instead of four duplicated card layouts. Every
// value comes straight from the same real FinancialRow (see lib/financial-rows.ts) already
// driving the tables these replace — no new/derived financial logic here.

export function InfoTile({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

export function InvoiceCard({ row, showSupplier = true, onView }: { row: FinancialRow; showSupplier?: boolean; onView: () => void }) {
  const fmt = useFormatCurrency();
  const meta = PAYMENT_COLLECTION_META[row.paymentCollectionStatus];

  return (
    <Card data-testid={`card-invoice-${row.subOrderId}`}>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold">{invoiceNumber(row.subOrderId)}</span>
          <Badge variant="secondary" className={meta.className}>{meta.label}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <InfoTile icon={Coffee} label="Café" value={row.cafeName} />
          {showSupplier && <InfoTile icon={Store} label="Fournisseur" value={row.supplierName} />}
          <InfoTile icon={Receipt} label="Commande" value={`#${String(row.orderId).padStart(6, "0")}`} />
          <InfoTile icon={Calendar} label="Date" value={row.createdAt ? formatDate(row.createdAt as any) : "—"} />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <InfoTile icon={DollarSign} label="Montant" value={<span className="text-foreground font-semibold">{fmt(row.subtotal)}</span>} />
          <Badge variant="outline" className="text-[10px] shrink-0">{row.subOrderStatus}</Badge>
        </div>

        <div className="flex items-center justify-end">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onView} data-testid={`button-view-invoice-${row.subOrderId}`}>
            <Eye className="w-3.5 h-3.5" /> Voir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PaymentCard({ row, showSupplier = true, onView }: { row: FinancialRow; showSupplier?: boolean; onView: () => void }) {
  const fmt = useFormatCurrency();
  const collectionMeta = PAYMENT_COLLECTION_META[row.paymentCollectionStatus];
  const payoutMeta = PAYOUT_STATUS_META[row.payoutStatus];

  return (
    <Card data-testid={`card-payment-${row.subOrderId}`}>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold">{payoutReference(row.subOrderId)}</span>
          <Badge variant="secondary" className={payoutMeta.className}>{payoutMeta.label}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <InfoTile icon={Coffee} label="Café" value={row.cafeName} />
          {showSupplier && <InfoTile icon={Store} label="Fournisseur" value={row.supplierName} />}
          <InfoTile icon={Receipt} label="Commande" value={`#${String(row.orderId).padStart(6, "0")}`} />
          <InfoTile icon={Calendar} label="Date" value={row.createdAt ? formatDate(row.createdAt as any) : "—"} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-2.5 pt-2 border-t border-border/50">
          <InfoTile icon={DollarSign} label="Brut" value={fmt(row.subtotal)} />
          <InfoTile icon={Percent} label="Commission" value={fmt(row.commission)} />
          <InfoTile icon={Wallet} label="Net" value={<span className="text-green-600 font-semibold">{fmt(row.netAmount)}</span>} />
        </div>

        <div className="flex items-center justify-between">
          <Badge variant="secondary" className={`text-[10px] ${collectionMeta.className}`}>{collectionMeta.label}</Badge>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onView} data-testid={`button-view-payment-${row.subOrderId}`}>
            <Eye className="w-3.5 h-3.5" /> Détails
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

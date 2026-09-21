import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Ticket, Copy, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency, useCurrency } from "@/hooks/use-currency";
import {
  useDiscountCodes, useDiscountCodeStats, useCreateDiscountCode, useUpdateDiscountCode,
  type DiscountCodeFormInput,
} from "@/hooks/use-discount-codes";
import type { DiscountCode } from "@shared/schema";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

type EffectiveStatus = "Active" | "Inactive" | "Expired" | "Limit Reached";

function getEffectiveStatus(c: DiscountCode): EffectiveStatus {
  if (!c.isActive) return "Inactive";
  if (c.expiresAt && new Date(c.expiresAt) < new Date()) return "Expired";
  if (c.maxUses != null && c.usageCount >= c.maxUses) return "Limit Reached";
  return "Active";
}

const statusStyle: Record<EffectiveStatus, string> = {
  Active: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  Inactive: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
  Expired: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
  "Limit Reached": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
};

function discountLabel(c: DiscountCode, fmt: (n: number) => string): string {
  return c.discountType === "PERCENTAGE" ? `${c.discountValue / 100}%` : fmt(c.discountValue);
}

const EMPTY_FORM: DiscountCodeFormInput = {
  code: "",
  discountType: "PERCENTAGE",
  discountValue: 0,
  maxUses: null,
  minimumOrderAmount: null,
  expiresAt: null,
  isActive: true,
};

function codeToForm(c: DiscountCode): DiscountCodeFormInput & { discountValueInput: string; minimumOrderAmountInput: string; expiresAtInput: string } {
  return {
    code: c.code,
    discountType: c.discountType,
    discountValue: c.discountValue,
    maxUses: c.maxUses,
    minimumOrderAmount: c.minimumOrderAmount,
    expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString() : null,
    isActive: c.isActive,
    discountValueInput: c.discountType === "PERCENTAGE" ? String(c.discountValue / 100) : (c.discountValue / 1000).toFixed(3),
    minimumOrderAmountInput: c.minimumOrderAmount != null ? (c.minimumOrderAmount / 1000).toFixed(3) : "",
    expiresAtInput: c.expiresAt ? new Date(c.expiresAt).toISOString().slice(0, 16) : "",
  };
}

export default function DiscountCodesPage() {
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const symbol = useCurrency();

  const { data: codes = [], isLoading } = useDiscountCodes();
  const { data: stats } = useDiscountCodeStats();
  const createMut = useCreateDiscountCode();
  const updateMut = useUpdateDiscountCode();

  const [formOpen, setFormOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<DiscountCode | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">("PERCENTAGE");
  const [discountValueInput, setDiscountValueInput] = useState("");
  const [maxUsesInput, setMaxUsesInput] = useState("");
  const [minimumOrderAmountInput, setMinimumOrderAmountInput] = useState("");
  const [expiresAtInput, setExpiresAtInput] = useState("");
  const [isActive, setIsActive] = useState(true);

  const copy = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    toast({ title: "Copié !", description: `Code ${code} copié dans le presse-papiers.` });
  };

  const openCreate = () => {
    setEditingCode(null);
    setCodeInput("");
    setDiscountType("PERCENTAGE");
    setDiscountValueInput("");
    setMaxUsesInput("");
    setMinimumOrderAmountInput("");
    setExpiresAtInput("");
    setIsActive(true);
    setFormOpen(true);
  };

  const openEdit = (c: DiscountCode) => {
    const f = codeToForm(c);
    setEditingCode(c);
    setCodeInput(f.code);
    setDiscountType(f.discountType);
    setDiscountValueInput(f.discountValueInput);
    setMaxUsesInput(f.maxUses != null ? String(f.maxUses) : "");
    setMinimumOrderAmountInput(f.minimumOrderAmountInput);
    setExpiresAtInput(f.expiresAtInput);
    setIsActive(f.isActive);
    setFormOpen(true);
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  const handleSave = () => {
    if (!codeInput.trim()) { toast({ title: "Le code est requis", variant: "destructive" }); return; }
    const value = parseFloat(discountValueInput || "0");
    if (!value || value <= 0) { toast({ title: "La valeur de la réduction doit être positive", variant: "destructive" }); return; }
    const payload: DiscountCodeFormInput = {
      code: codeInput.trim().toUpperCase(),
      discountType,
      discountValue: discountType === "PERCENTAGE" ? Math.round(value * 100) : Math.round(value * 1000),
      maxUses: maxUsesInput ? Number(maxUsesInput) : null,
      minimumOrderAmount: minimumOrderAmountInput ? Math.round(parseFloat(minimumOrderAmountInput) * 1000) : null,
      expiresAt: expiresAtInput ? new Date(expiresAtInput).toISOString() : null,
      isActive,
    };
    const onSuccess = () => { setFormOpen(false); toast({ title: editingCode ? "Code mis à jour" : "Code créé" }); };
    const onError = (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" });
    if (editingCode) updateMut.mutate({ id: editingCode.id, data: payload }, { onSuccess, onError });
    else createMut.mutate(payload, { onSuccess, onError });
  };

  const activeCount = stats?.active ?? codes.filter(c => getEffectiveStatus(c) === "Active").length;
  const totalRedemptions = stats?.totalRedemptions ?? codes.reduce((s, c) => s + c.usageCount, 0);
  const expiredCount = (stats?.expired ?? codes.filter(c => getEffectiveStatus(c) === "Expired").length)
    + (stats?.usageLimitReached ?? codes.filter(c => getEffectiveStatus(c) === "Limit Reached").length);

  return (
    <div className="flex flex-col gap-6 p-6">
      <DashboardHero
        title="Discount Codes"
        subtitle="Create and manage promo codes for your café customers."
        action={<Button size="sm" onClick={openCreate} data-testid="button-add-code"><Plus className="w-4 h-4 mr-1" /> New Code</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Active Codes", value: activeCount },
          { label: "Total Redemptions", value: totalRedemptions },
          { label: "Expired Codes", value: expiredCount },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-primary/10 rounded-xl p-3"><Ticket className="w-5 h-5 text-primary" /></div>
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">All Codes</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-lg bg-secondary/40 animate-pulse" />)}
            </div>
          ) : codes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Ticket className="w-10 h-10 text-muted-foreground mb-3 opacity-40" />
              <p className="font-semibold">No discount codes yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">Create your first code to let café customers redeem a discount at checkout.</p>
              <Button className="mt-5" size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> New Code</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((c) => {
                  const status = getEffectiveStatus(c);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono font-bold">{c.code}</code>
                          <button onClick={() => copy(c.code)} data-testid={`button-copy-${c.code}`}>
                            <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-amber-500">{discountLabel(c, fmt)}</TableCell>
                      <TableCell className="text-muted-foreground">{c.usageCount}{c.maxUses != null ? ` / ${c.maxUses}` : ""}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "—"}</TableCell>
                      <TableCell><Badge variant="secondary" className={statusStyle[status]}>{status}</Badge></TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(c)} data-testid={`button-edit-code-${c.code}`}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog — same visual language as the rest of the Supplier account
          (Dialog/Label/Input/Select, matching e.g. the Promotions page's own form dialog). */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCode ? "Edit Discount Code" : "Create Discount Code"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Code *</Label>
              <Input
                value={codeInput}
                onChange={e => setCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. SPRING15"
                className="font-mono"
                data-testid="input-discount-code"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Discount Type *</Label>
                <Select value={discountType} onValueChange={v => setDiscountType(v as "PERCENTAGE" | "FIXED_AMOUNT")}>
                  <SelectTrigger data-testid="select-discount-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">% Discount</SelectItem>
                    <SelectItem value="FIXED_AMOUNT">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{discountType === "PERCENTAGE" ? "Discount %" : `Discount (${symbol})`} *</Label>
                <Input
                  type="number" min="0" step={discountType === "PERCENTAGE" ? "0.1" : "0.001"}
                  value={discountValueInput}
                  onChange={e => setDiscountValueInput(e.target.value)}
                  placeholder={discountType === "PERCENTAGE" ? "e.g. 15" : "e.g. 10.000"}
                  data-testid="input-discount-value"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Usage Limit</Label>
                <Input type="number" min="1" value={maxUsesInput} onChange={e => setMaxUsesInput(e.target.value)} placeholder="Unlimited" data-testid="input-max-uses" />
              </div>
              <div className="space-y-1.5">
                <Label>Min Order ({symbol})</Label>
                <Input type="number" min="0" step="0.001" value={minimumOrderAmountInput} onChange={e => setMinimumOrderAmountInput(e.target.value)} placeholder="No minimum" data-testid="input-min-order" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Expiration Date</Label>
              <Input type="datetime-local" value={expiresAtInput} onChange={e => setExpiresAtInput(e.target.value)} data-testid="input-expires-at" />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-4">
              <div>
                <p className="font-medium text-sm">Active</p>
                <p className="text-xs text-muted-foreground">Customers can redeem this code while active.</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-code-active" />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-code">
              {isSaving ? "Saving…" : editingCode ? "Save Changes" : "Create Code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

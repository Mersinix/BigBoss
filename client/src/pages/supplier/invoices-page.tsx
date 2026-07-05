import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Download, Eye } from "lucide-react";

const fakeInvoices = [
  { id: "INV-0042", cafe: "Ariana Lounge", amount: 487, tax: 88, total: 575, issued: "Apr 9, 2026", due: "Apr 23, 2026", status: "Paid" },
  { id: "INV-0041", cafe: "Cafe des Nattes", amount: 217, tax: 39, total: 256, issued: "Apr 8, 2026", due: "Apr 22, 2026", status: "Unpaid" },
  { id: "INV-0040", cafe: "Saffron Lounge", amount: 820, tax: 148, total: 968, issued: "Apr 1, 2026", due: "Apr 15, 2026", status: "Paid" },
  { id: "INV-0039", cafe: "The Brew Lab", amount: 145, tax: 26, total: 171, issued: "Mar 28, 2026", due: "Apr 11, 2026", status: "Overdue" },
  { id: "INV-0038", cafe: "Central Perk", amount: 420, tax: 76, total: 496, issued: "Mar 20, 2026", due: "Apr 3, 2026", status: "Paid" },
];

const statusStyle: Record<string, string> = {
  Paid: "bg-green-100 text-green-700",
  Unpaid: "bg-amber-400 text-amber-700",
  Overdue: "bg-red-100 text-red-700",
};

export default function InvoicesPage() {
  const totalPaid = fakeInvoices.filter((i) => i.status === "Paid").reduce((s, i) => s + i.total, 0);
  const totalUnpaid = fakeInvoices.filter((i) => i.status !== "Paid").reduce((s, i) => s + i.total, 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage and track all your invoices.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Total Invoices", value: fakeInvoices.length, suffix: "" },
          { label: "Collected", value: totalPaid, suffix: "TND " },
          { label: "Outstanding", value: totalUnpaid, suffix: "TND " },
        ].map(({ label, value, suffix }) => (
          <Card key={label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-primary/10 rounded-xl p-3"><FileText className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{suffix}{typeof value === "number" && value > 10 ? value.toLocaleString() : value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Invoice List</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Cafe</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Tax (19%)</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fakeInvoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{inv.id}</TableCell>
                  <TableCell className="font-medium">{inv.cafe}</TableCell>
                  <TableCell>TND {inv.amount}</TableCell>
                  <TableCell className="text-muted-foreground">TND {inv.tax}</TableCell>
                  <TableCell className="font-semibold">TND {inv.total}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{inv.issued}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{inv.due}</TableCell>
                  <TableCell><Badge variant="secondary" className={statusStyle[inv.status]}>{inv.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-view-${inv.id}`}><Eye className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-download-${inv.id}`}><Download className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

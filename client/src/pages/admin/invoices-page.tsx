import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";

export default function InvoicesPage() {
  const { data: orders = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/orders"] });
  const invoiceOrders = orders.filter((o) => ["DELIVERED", "IN_DELIVERY", "CONFIRMED"].includes(o.status));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
        <p className="text-muted-foreground text-sm mt-1">View and export order invoices.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Invoices</p>
              <p className="text-2xl font-bold">{invoiceOrders.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3">
              <Download className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Invoiced Amount</p>
              <p className="text-2xl font-bold text-green-600">
                ${(invoiceOrders.reduce((s, o) => s + (o.totalAmount || 0), 0) / 100).toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Invoice List</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Cafe</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoiceOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">INV-{String(o.id).padStart(4, "0")}</TableCell>
                    <TableCell>{o.cafe?.name}</TableCell>
                    <TableCell>{o.supplier?.name}</TableCell>
                    <TableCell>${((o.totalAmount || 0) / 100).toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={o.status === "DELIVERED" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}
                      >
                        {o.status === "DELIVERED" ? "Paid" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground">
                        <Download className="w-3 h-3" /> Export
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {invoiceOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">No invoices yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

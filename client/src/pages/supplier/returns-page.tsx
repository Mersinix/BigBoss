import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RotateCcw, CheckCircle, Clock } from "lucide-react";

const fakeReturns = [
  { id: "RET-001", cafe: "Ariana Lounge", product: "Decaf House Blend 500g", qty: 2, reason: "Wrong item delivered", date: "Apr 7, 2026", status: "Under Review" },
  { id: "RET-002", cafe: "Cafe des Nattes", product: "Vanilla Syrup 1L", qty: 1, reason: "Damaged packaging", date: "Apr 5, 2026", status: "Approved" },
  { id: "RET-003", cafe: "Saffron Lounge", product: "Cold Brew Concentrate 5L", qty: 1, reason: "Quality issue", date: "Apr 3, 2026", status: "Resolved" },
  { id: "RET-004", cafe: "The Brew Lab", product: "Bamboo Cups x50", qty: 3, reason: "Not as described", date: "Mar 28, 2026", status: "Resolved" },
];

const statusStyle: Record<string, string> = {
  "Under Review": "bg-amber-100 text-amber-700",
  "Approved": "bg-blue-100 text-blue-700",
  "Resolved": "bg-green-100 text-green-700",
};

export default function ReturnsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Returns</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage product returns and refund requests.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Under Review", value: 1, icon: Clock, cls: "bg-amber-500/10 text-amber-600" },
          { label: "Approved", value: 1, icon: CheckCircle, cls: "bg-blue-500/10 text-blue-600" },
          { label: "Resolved", value: 2, icon: RotateCcw, cls: "bg-green-500/10 text-green-600" },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`rounded-xl p-3 ${cls.split(" ")[0]}`}><Icon className={`w-5 h-5 ${cls.split(" ")[1]}`} /></div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Return Requests</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Cafe</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fakeReturns.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.id}</TableCell>
                  <TableCell className="font-medium">{r.cafe}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.product}</TableCell>
                  <TableCell>{r.qty}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[160px] truncate">{r.reason}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.date}</TableCell>
                  <TableCell><Badge variant="secondary" className={statusStyle[r.status]}>{r.status}</Badge></TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-view-return-${r.id}`}>Review</Button>
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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, CreditCard, Clock } from "lucide-react";

const fakePayouts = [
  { id: "PAY-001", period: "Mar 2026", amount: 2680, fee: 134, net: 2546, status: "Paid", date: "Apr 5, 2026", method: "Bank Transfer" },
  { id: "PAY-002", period: "Feb 2026", amount: 1960, fee: 98, net: 1862, status: "Paid", date: "Mar 5, 2026", method: "Bank Transfer" },
  { id: "PAY-003", period: "Jan 2026", amount: 2340, fee: 117, net: 2223, status: "Paid", date: "Feb 5, 2026", method: "Bank Transfer" },
  { id: "PAY-004", period: "Apr 2026", amount: 3100, fee: 155, net: 2945, status: "Pending", date: "May 5, 2026", method: "Bank Transfer" },
];

const statusStyle: Record<string, string> = {
  Paid: "bg-green-100 text-green-700",
  Pending: "bg-amber-100 text-amber-700",
};

export default function PayoutsPage() {
  const totalPaid = fakePayouts.filter((p) => p.status === "Paid").reduce((s, p) => s + p.net, 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Payouts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track your earnings and payout history.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><DollarSign className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">Total Paid Out</p><p className="text-2xl font-bold text-green-600">TND {totalPaid.toLocaleString()}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div><p className="text-xs text-muted-foreground">Pending Payout</p><p className="text-2xl font-bold text-amber-600">TND 2,945</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><CreditCard className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Next Payout Date</p><p className="text-xl font-bold">May 5, 2026</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Payout History</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Gross</TableHead>
                <TableHead>Platform Fee (5%)</TableHead>
                <TableHead>Net</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fakePayouts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.id}</TableCell>
                  <TableCell className="font-medium">{p.period}</TableCell>
                  <TableCell>TND {p.amount.toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground">TND {p.fee}</TableCell>
                  <TableCell className="font-semibold text-green-600">TND {p.net.toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground">{p.method}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{p.date}</TableCell>
                  <TableCell><Badge variant="secondary" className={statusStyle[p.status]}>{p.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

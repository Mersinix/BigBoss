import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Clock } from "lucide-react";

const fakeRequests = [
  { id: "REQ-001", cafe: "Ariana Lounge", product: "Espresso Roast 1kg", qty: 5, total: 125, date: "Apr 9, 2026", status: "Pending" },
  { id: "REQ-002", cafe: "Cafe des Nattes", product: "Oat Milk 1L x 6", qty: 3, total: 54, date: "Apr 8, 2026", status: "Pending" },
  { id: "REQ-003", cafe: "Saffron Lounge", product: "Vanilla Syrup 1L", qty: 8, total: 96, date: "Apr 7, 2026", status: "Approved" },
  { id: "REQ-004", cafe: "The Brew Lab", product: "Arabica Blend 500g", qty: 10, total: 145, date: "Apr 6, 2026", status: "Rejected" },
  { id: "REQ-005", cafe: "Central Perk", product: "Cold Brew Concentrate 5L", qty: 2, total: 84, date: "Apr 5, 2026", status: "Approved" },
];

const statusColors: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-700",
  Approved: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
};

export default function OrderRequestsPage() {
  const [requests, setRequests] = useState(fakeRequests);

  const approve = (id: string) => setRequests(prev => prev.map(r => r.id === id ? { ...r, status: "Approved" } : r));
  const reject = (id: string) => setRequests(prev => prev.map(r => r.id === id ? { ...r, status: "Rejected" } : r));

  const pending = requests.filter((r) => r.status === "Pending").length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Order Requests</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Review and respond to incoming order requests.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Pending", value: pending, icon: Clock, color: "text-amber-500 bg-amber-500/10" },
          { label: "Approved", value: requests.filter(r => r.status === "Approved").length, icon: CheckCircle, color: "text-green-600 bg-green-500/10" },
          { label: "Rejected", value: requests.filter(r => r.status === "Rejected").length, icon: XCircle, color: "text-red-600 bg-red-500/10" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`rounded-xl p-3 ${color.split(" ")[1]}`}><Icon className={`w-5 h-5 ${color.split(" ")[0]}`} /></div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Incoming Requests</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Cafe</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.id}</TableCell>
                  <TableCell className="font-medium">{r.cafe}</TableCell>
                  <TableCell className="text-muted-foreground">{r.product}</TableCell>
                  <TableCell>{r.qty}</TableCell>
                  <TableCell className="font-semibold">TND {r.total}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.date}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[r.status]}>{r.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {r.status === "Pending" && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-green-600" onClick={() => approve(r.id)} data-testid={`button-approve-${r.id}`}><CheckCircle className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="outline" className="h-7 text-red-600" onClick={() => reject(r.id)} data-testid={`button-reject-${r.id}`}><XCircle className="w-3.5 h-3.5" /></Button>
                      </div>
                    )}
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

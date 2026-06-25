import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Ticket, Copy, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const fakeCodes = [
  { code: "SPRING15", discount: "15%", uses: 18, maxUses: 50, expires: "Apr 30, 2026", status: "Active" },
  { code: "NEWCAFE10", discount: "10%", uses: 5, maxUses: 100, expires: "Jun 30, 2026", status: "Active" },
  { code: "BULK20", discount: "20%", uses: 22, maxUses: 30, expires: "Mar 31, 2026", status: "Expired" },
  { code: "RAMADAN12", discount: "12%", uses: 31, maxUses: 40, expires: "Mar 30, 2026", status: "Expired" },
  { code: "VIP25", discount: "25%", uses: 2, maxUses: 10, expires: "Dec 31, 2026", status: "Active" },
];

const statusStyle: Record<string, string> = {
  Active: "bg-green-100 text-green-700",
  Expired: "bg-gray-100 text-gray-600",
};

export default function DiscountCodesPage() {
  const { toast } = useToast();
  const [codes] = useState(fakeCodes);

  const copy = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    toast({ title: "Copied!", description: `Code ${code} copied to clipboard.` });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Discount Codes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create and manage promo codes for your café customers.</p>
        </div>
        <Button size="sm" data-testid="button-add-code"><Plus className="w-4 h-4 mr-1" /> New Code</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Active Codes", value: codes.filter(c => c.status === "Active").length },
          { label: "Total Redemptions", value: codes.reduce((s, c) => s + c.uses, 0) },
          { label: "Expired Codes", value: codes.filter(c => c.status === "Expired").length },
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
              {codes.map((c) => (
                <TableRow key={c.code}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono font-bold">{c.code}</code>
                      <button onClick={() => copy(c.code)} data-testid={`button-copy-${c.code}`}>
                        <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold text-amber-500">{c.discount}</TableCell>
                  <TableCell className="text-muted-foreground">{c.uses} / {c.maxUses}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{c.expires}</TableCell>
                  <TableCell><Badge variant="secondary" className={statusStyle[c.status]}>{c.status}</Badge></TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-edit-code-${c.code}`}>Edit</Button>
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

import { useState } from "react";
import { useDeliveries } from "@/hooks/use-deliveries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Truck, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAvatarUrl } from "@/lib/avatar";
import type { User } from "@shared/schema";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

type CreateDriverInput = { name: string; email: string; password: string; phone?: string | null };

type Props = {
  title?: string;
  subtitle?: string;
  useDrivers: () => UseQueryResult<User[]>;
  useCreateDriver: () => UseMutationResult<any, any, CreateDriverInput>;
};

/**
 * Driver roster UI shared by the Delivery Company "Drivers" page and the Supplier "Drivers"
 * tab — same experience, different data source (a Driver belongs to exactly one operator;
 * see users.deliveryCompanyId / users.supplierId). Avoids maintaining two near-identical
 * pages for what is, underneath, the same Driver model.
 */
export default function DriverRosterView({ title = "Chauffeurs", subtitle = "Gérez vos chauffeurs.", useDrivers, useCreateDriver }: Props) {
  const { data: drivers = [], isLoading } = useDrivers();
  const { data: deliveries = [] } = useDeliveries();
  const createDriver = useCreateDriver();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });

  const activeDeliveriesByDriver = new Map<number, number>();
  for (const d of deliveries) {
    if (d.driverId && ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(d.status)) {
      activeDeliveriesByDriver.set(d.driverId, (activeDeliveriesByDriver.get(d.driverId) ?? 0) + 1);
    }
  }
  const completedByDriver = new Map<number, number>();
  for (const d of deliveries) {
    if (d.driverId && d.status === "DELIVERED") {
      completedByDriver.set(d.driverId, (completedByDriver.get(d.driverId) ?? 0) + 1);
    }
  }

  const handleCreate = () => {
    createDriver.mutate(
      { name: form.name, email: form.email, password: form.password, phone: form.phone || null },
      {
        onSuccess: () => {
          toast({ title: "Chauffeur ajouté" });
          setOpen(false);
          setForm({ name: "", email: "", password: "", phone: "" });
        },
        onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Ajouter un chauffeur</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><Truck className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Chauffeurs</p><p className="text-2xl font-bold">{drivers.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-indigo-500/10 rounded-xl p-3"><Truck className="w-5 h-5 text-indigo-600" /></div>
            <div><p className="text-xs text-muted-foreground">En livraison actuellement</p><p className="text-2xl font-bold">{activeDeliveriesByDriver.size}</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Liste des chauffeurs</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
          ) : drivers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Aucun chauffeur pour le moment. Ajoutez-en un pour commencer à assigner des livraisons.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chauffeur</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>En cours</TableHead>
                  <TableHead>Livrées</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={getAvatarUrl(d)} alt={d.name} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{d.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <p className="font-medium text-sm">{d.name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{d.phone || "—"}</TableCell>
                    <TableCell>{activeDeliveriesByDriver.get(d.id) ?? 0}</TableCell>
                    <TableCell>{completedByDriver.get(d.id) ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un chauffeur</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nom complet" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <Input placeholder="Mot de passe (min. 6 caractères)" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            <Input placeholder="Téléphone (optionnel)" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button
              onClick={handleCreate}
              disabled={!form.name || !form.email || form.password.length < 6 || createDriver.isPending}
            >
              {createDriver.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

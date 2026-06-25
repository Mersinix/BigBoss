import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, UserCheck, ShieldCheck, Plus, CheckCircle, XCircle, Clock,
  Filter, MapPin, Globe, Building2, Printer, Megaphone, GraduationCap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";

const roleColors: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  ADMIN: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  SUPPLIER: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  CAFE_OWNER: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  DELIVERY_COMPANY: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  DRIVER: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  PRINTER: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MARKETING: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  BARISTA_ACADEMY: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  BARISTA_MARKETPLACE: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
};

const statusConfig: Record<string, { label: string; className: string; icon: any }> = {
  approved: { label: "Approuvé", className: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle },
  pending: { label: "En attente", className: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  rejected: { label: "Rejeté", className: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
};

const ALL_ROLES = [
  "SUPER_ADMIN", "ADMIN", "SUPPLIER", "CAFE_OWNER", "DELIVERY_COMPANY",
  "DRIVER", "PRINTER", "MARKETING", "BARISTA_ACADEMY", "BARISTA_MARKETPLACE"
];

// Roles that require admin approval
const APPROVABLE_ROLES = ["CAFE_OWNER", "SUPPLIER", "DELIVERY_COMPANY", "PRINTER", "MARKETING", "BARISTA_ACADEMY", "BARISTA_MARKETPLACE"];

// ── User Detail Dialog ─────────────────────────────────────────────────────────

function UserDetailDialog({ user, open, onClose }: { user: User | null; open: boolean; onClose: () => void }) {
  if (!user) return null;
  const u = user as any;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Détails — {user.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Email</span><p className="font-medium">{user.email}</p></div>
            <div><span className="text-muted-foreground">Téléphone</span><p className="font-medium">{u.phone ?? "—"}</p></div>
            <div><span className="text-muted-foreground">Rôle</span><p className="font-medium">{user.role.replace(/_/g, " ")}</p></div>
            <div><span className="text-muted-foreground">Statut</span><p className="font-medium capitalize">{user.status}</p></div>
          </div>
          {u.locationAddress && (
            <div>
              <span className="text-muted-foreground flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Localisation</span>
              <p className="font-medium">{u.locationAddress}</p>
            </div>
          )}
          {u.governorates?.length > 0 && (
            <div>
              <span className="text-muted-foreground flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Gouvernorats</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {u.governorates.map((g: string) => <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>)}
              </div>
            </div>
          )}
          {u.printCategories?.length > 0 && (
            <div>
              <span className="text-muted-foreground flex items-center gap-1"><Printer className="w-3.5 h-3.5" /> Catégories impression</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {u.printCategories.map((c: string) => <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>)}
              </div>
            </div>
          )}
          {u.marketingCategories?.length > 0 && (
            <div>
              <span className="text-muted-foreground flex items-center gap-1"><Megaphone className="w-3.5 h-3.5" /> Services marketing</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {u.marketingCategories.map((c: string) => <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>)}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add User Modal ─────────────────────────────────────────────────────────────

function AddUserModal({ onRefresh }: { onRefresh: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "CAFE_OWNER" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim() || !form.email.includes("@")) e.email = "Valid email is required";
    if (!form.password || form.password.length < 6) e.password = "Password must be at least 6 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Error", description: err.message, variant: "destructive" });
        return;
      }
      toast({ title: "User created", description: `${form.name} has been added.` });
      setForm({ name: "", email: "", password: "", role: "CAFE_OWNER" });
      setErrors({});
      setOpen(false);
      onRefresh();
    } catch {
      toast({ title: "Error", description: "Failed to create user.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-add-user" className="gap-2">
          <Plus className="w-4 h-4" /> Add User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Full Name</Label>
            <Input data-testid="input-user-name" placeholder="e.g. Ariana Lounge" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Email Address</Label>
            <Input data-testid="input-user-email" type="email" placeholder="user@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input data-testid="input-user-password" type="password" placeholder="Min. 6 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger data-testid="select-user-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={submit} data-testid="button-submit-user">Create User</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/admin/users/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: status === "approved" ? "Compte approuvé" : status === "rejected" ? "Compte rejeté" : "Statut mis à jour" });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de mettre à jour.", variant: "destructive" });
    },
  });

  const filtered = users.filter((u) => {
    const matchStatus = statusFilter === "all" || (u as any).status === statusFilter;
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchStatus && matchRole;
  });

  const pendingCount = users.filter((u) => (u as any).status === "pending").length;
  const totalNonAdmin = users.filter((u) => !["ADMIN", "SUPER_ADMIN"].includes(u.role)).length;
  const adminCount = users.filter((u) => ["ADMIN", "SUPER_ADMIN"].includes(u.role)).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Utilisateurs</h1>
          <p className="text-muted-foreground text-sm mt-1">Gérez les utilisateurs et approuvez les comptes en attente.</p>
        </div>
        <AddUserModal onRefresh={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] })} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><Users className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">Total utilisateurs</p><p className="text-2xl font-bold">{users.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><UserCheck className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">Membres actifs</p><p className="text-2xl font-bold">{totalNonAdmin}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-yellow-500/10 rounded-xl p-3"><Clock className="w-5 h-5 text-yellow-600" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">En attente</p><p className="text-2xl font-bold text-yellow-600">{pendingCount}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-purple-500/10 rounded-xl p-3"><ShieldCheck className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">Admins</p><p className="text-2xl font-bold">{adminCount}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* User Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold">Tous les utilisateurs</CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Tous les rôles" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les rôles</SelectItem>
                  {ALL_ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Tous statuts" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="approved">Approuvé</SelectItem>
                  <SelectItem value="rejected">Rejeté</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Inscription</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const userStatus = (u as any).status ?? "approved";
                  const sc = statusConfig[userStatus] ?? statusConfig.approved;
                  const Icon = sc.icon;
                  const canApprove = APPROVABLE_ROLES.includes(u.role);

                  return (
                    <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                      <TableCell>
                        <button
                          className="font-medium hover:text-primary transition-colors text-left"
                          onClick={() => setSelectedUser(u)}
                          data-testid={`button-user-detail-${u.id}`}
                        >
                          {u.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={roleColors[u.role] || ""}>
                          {u.role.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${sc.className} border text-xs gap-1`}>
                          <Icon className="w-3 h-3" />{sc.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString("fr-FR") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canApprove && (
                          <div className="flex items-center justify-end gap-1.5">
                            {userStatus !== "approved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-green-200 text-green-700 hover:bg-green-50 hover:border-green-400 gap-1"
                                onClick={() => statusMutation.mutate({ id: u.id, status: "approved" })}
                                disabled={statusMutation.isPending}
                                data-testid={`button-approve-${u.id}`}
                              >
                                <CheckCircle className="w-3 h-3" /> Approuver
                              </Button>
                            )}
                            {userStatus !== "rejected" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400 gap-1"
                                onClick={() => statusMutation.mutate({ id: u.id, status: "rejected" })}
                                disabled={statusMutation.isPending}
                                data-testid={`button-reject-${u.id}`}
                              >
                                <XCircle className="w-3 h-3" /> Rejeter
                              </Button>
                            )}
                            {userStatus !== "pending" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => statusMutation.mutate({ id: u.id, status: "pending" })}
                                disabled={statusMutation.isPending}
                                data-testid={`button-pending-${u.id}`}
                              >
                                <Clock className="w-3 h-3" /> Mettre en attente
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      Aucun utilisateur ne correspond aux filtres.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <UserDetailDialog user={selectedUser} open={!!selectedUser} onClose={() => setSelectedUser(null)} />
    </div>
  );
}

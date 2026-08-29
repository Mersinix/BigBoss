import { useMemo, useState } from "react";
import {
  useMyAcademySessions, useMyAcademyCourses, useCreateAcademySession, useUpdateAcademySession, useDeleteAcademySession,
  type AcademySessionStatus,
} from "@/hooks/use-barista-academy";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Plus, Users, Trash2 } from "lucide-react";

const STATUS_LABELS: Record<AcademySessionStatus, string> = { UPCOMING: "À venir", ACTIVE: "En cours", COMPLETED: "Terminée", CANCELLED: "Annulée" };
const STATUS_COLORS: Record<AcademySessionStatus, string> = {
  UPCOMING: "bg-blue-100 text-blue-700", ACTIVE: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700", CANCELLED: "bg-gray-100 text-gray-600",
};

function NewSessionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data: courses = [] } = useMyAcademyCourses();
  const create = useCreateAcademySession();
  const [courseId, setCourseId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [capacity, setCapacity] = useState("");

  if (!open) return null;

  const save = () => {
    if (!courseId || !startDate) { toast({ title: "Formation et date de début requises", variant: "destructive" }); return; }
    create.mutate(
      { courseId: Number(courseId), startDate, endDate: endDate || null, capacity: capacity ? Math.max(1, parseInt(capacity, 10)) : null },
      {
        onSuccess: () => { toast({ title: "Session créée" }); setCourseId(""); setStartDate(""); setEndDate(""); setCapacity(""); onClose(); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nouvelle session</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Formation</label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger data-testid="select-session-course"><SelectValue placeholder="Choisir une formation" /></SelectTrigger>
              <SelectContent>{courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}</SelectContent>
            </Select>
            {courses.length === 0 && <p className="text-xs text-muted-foreground mt-1">Créez d'abord une formation dans l'onglet Formations.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date de début</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-session-start" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date de fin (optionnel)</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-session-end" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Capacité (optionnel)</label>
            <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Illimitée si vide — sinon la capacité de la formation" data-testid="input-session-capacity" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={create.isPending || courses.length === 0} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="button-save-session">
            {create.isPending ? "Création…" : "Créer la session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AcademyCalendarPage() {
  const { toast } = useToast();
  const { data: sessions = [], isLoading } = useMyAcademySessions();
  const update = useUpdateAcademySession();
  const remove = useDeleteAcademySession();
  const [newOpen, setNewOpen] = useState(false);

  const grouped = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => (a.startDate > b.startDate ? 1 : -1));
    return {
      upcoming: sorted.filter((s) => s.status === "UPCOMING" || s.status === "ACTIVE"),
      past: sorted.filter((s) => s.status === "COMPLETED" || s.status === "CANCELLED"),
    };
  }, [sessions]);

  const setStatus = (id: number, status: AcademySessionStatus) => {
    update.mutate({ id, status }, {
      onSuccess: () => toast({ title: "Session mise à jour" }),
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    if (!window.confirm("Supprimer cette session ?")) return;
    remove.mutate(id, { onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }) });
  };

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Calendrier</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Sessions planifiées pour vos formations.</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="button-new-session">
          <Plus className="w-4 h-4 mr-1.5" />Nouvelle session
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">Aucune session planifiée</p>
            <p className="text-sm text-muted-foreground mt-1">Créez une session pour permettre aux Coffee Owners de s'inscrire à une date précise.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {grouped.upcoming.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">À venir</h2>
              {grouped.upcoming.map((s) => (
                <Card key={s.id} data-testid={`card-session-${s.id}`}>
                  <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-medium text-sm">{s.courseTitle}</p>
                      <p className="text-xs text-muted-foreground">{s.startDate}{s.endDate ? ` → ${s.endDate}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="w-3.5 h-3.5" />{s.registeredCount}{s.capacity ? `/${s.capacity}` : ""}</span>
                      <Badge variant="secondary" className={STATUS_COLORS[s.status]}>{STATUS_LABELS[s.status]}</Badge>
                      {s.status === "UPCOMING" && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(s.id, "ACTIVE")} disabled={update.isPending} data-testid={`button-start-session-${s.id}`}>Démarrer</Button>
                      )}
                      {s.status === "ACTIVE" && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setStatus(s.id, "COMPLETED")} disabled={update.isPending} data-testid={`button-complete-session-${s.id}`}>Terminer</Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => (s.registeredCount > 0 ? setStatus(s.id, "CANCELLED") : handleDelete(s.id))} data-testid={`button-cancel-session-${s.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {grouped.past.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Passées</h2>
              {grouped.past.map((s) => (
                <Card key={s.id} className="opacity-75" data-testid={`card-session-${s.id}`}>
                  <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-medium text-sm">{s.courseTitle}</p>
                      <p className="text-xs text-muted-foreground">{s.startDate}{s.endDate ? ` → ${s.endDate}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="w-3.5 h-3.5" />{s.registeredCount}{s.capacity ? `/${s.capacity}` : ""}</span>
                      <Badge variant="secondary" className={STATUS_COLORS[s.status]}>{STATUS_LABELS[s.status]}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <NewSessionDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

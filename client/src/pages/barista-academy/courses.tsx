import { useEffect, useState } from "react";
import {
  useMyAcademyCourses, useCreateAcademyCourse, useUpdateAcademyCourse, useDeleteAcademyCourse,
  type AcademyCourse, type AcademyCourseLevel,
} from "@/hooks/use-barista-academy";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Plus, Pencil, Trash2, Award, Clock, MapPin, Eye, EyeOff } from "lucide-react";

const LEVEL_LABELS: Record<AcademyCourseLevel, string> = { BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert" };
const LEVEL_COLORS: Record<AcademyCourseLevel, string> = {
  BEGINNER: "bg-green-100 text-green-700", ADVANCED: "bg-blue-100 text-blue-700", EXPERT: "bg-purple-100 text-purple-700",
};

type CourseFormState = {
  title: string; description: string; level: AcademyCourseLevel; price: string; duration: string;
  hasCertification: boolean; category: string; location: string; trainingMode: string; capacity: string; imageUrl: string;
};

const EMPTY_FORM: CourseFormState = {
  title: "", description: "", level: "BEGINNER", price: "", duration: "", hasCertification: false,
  category: "", location: "", trainingMode: "Présentiel", capacity: "", imageUrl: "",
};

function CourseFormDialog({ course, onClose }: { course: AcademyCourse | null | "new"; onClose: () => void }) {
  const { toast } = useToast();
  const create = useCreateAcademyCourse();
  const update = useUpdateAcademyCourse();
  const [form, setForm] = useState<CourseFormState>(EMPTY_FORM);

  useEffect(() => {
    if (course && course !== "new") {
      setForm({
        title: course.title, description: course.description, level: course.level,
        price: String(course.priceInCents / 100), duration: course.duration,
        hasCertification: course.hasCertification, category: course.category, location: course.location,
        trainingMode: course.trainingMode, capacity: course.capacity != null ? String(course.capacity) : "",
        imageUrl: course.imageUrl ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [course]);

  if (!course) return null;
  const isNew = course === "new";

  const save = () => {
    if (!form.title.trim()) { toast({ title: "Le titre est requis", variant: "destructive" }); return; }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      level: form.level,
      priceInCents: Math.round(parseFloat(form.price || "0") * 100),
      duration: form.duration.trim(),
      hasCertification: form.hasCertification,
      category: form.category.trim(),
      location: form.location.trim(),
      trainingMode: form.trainingMode.trim() || "Présentiel",
      capacity: form.capacity.trim() ? Math.max(1, parseInt(form.capacity, 10)) : null,
      imageUrl: form.imageUrl.trim() || null,
    };
    const onSettled = {
      onSuccess: () => { toast({ title: isNew ? "Formation créée" : "Formation mise à jour" }); onClose(); },
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    };
    if (isNew) {
      create.mutate(payload as any, onSettled);
    } else {
      update.mutate({ id: (course as AcademyCourse).id, ...payload } as any, onSettled);
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isNew ? "Nouvelle formation" : "Modifier la formation"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Titre</label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Espresso Fundamentals" data-testid="input-course-title" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} data-testid="input-course-description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Niveau</label>
              <Select value={form.level} onValueChange={(v) => setForm((f) => ({ ...f, level: v as AcademyCourseLevel }))}>
                <SelectTrigger data-testid="select-course-level"><SelectValue /></SelectTrigger>
                <SelectContent>{(["BEGINNER", "ADVANCED", "EXPERT"] as const).map((l) => <SelectItem key={l} value={l}>{LEVEL_LABELS[l]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Catégorie</label>
              <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Espresso, Management…" data-testid="input-course-category" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Prix</label>
              <Input type="number" min={0} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} data-testid="input-course-price" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Durée</label>
              <Input value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))} placeholder="3 jours" data-testid="input-course-duration" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Lieu</label>
              <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Tunis" data-testid="input-course-location" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Mode</label>
              <Select value={form.trainingMode} onValueChange={(v) => setForm((f) => ({ ...f, trainingMode: v }))}>
                <SelectTrigger data-testid="select-course-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Présentiel">Présentiel</SelectItem>
                  <SelectItem value="En ligne">En ligne</SelectItem>
                  <SelectItem value="Hybride">Hybride</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Capacité (optionnel)</label>
            <Input type="number" min={1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} placeholder="Illimitée si vide" data-testid="input-course-capacity" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Image (URL, optionnel)</label>
            <Input value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" data-testid="input-course-image" />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div>
              <p className="text-sm font-medium">Certification incluse</p>
              <p className="text-xs text-muted-foreground">Affiché avec un badge "Certifié" sur /academy.</p>
            </div>
            <Switch checked={form.hasCertification} onCheckedChange={(v) => setForm((f) => ({ ...f, hasCertification: v }))} data-testid="switch-course-certification" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="button-save-course">
            {isPending ? "Enregistrement…" : isNew ? "Créer" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AcademyCoursesPage() {
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const { data: courses = [], isLoading } = useMyAcademyCourses();
  const update = useUpdateAcademyCourse();
  const remove = useDeleteAcademyCourse();
  const [editing, setEditing] = useState<AcademyCourse | "new" | null>(null);

  const togglePublish = (course: AcademyCourse) => {
    update.mutate({ id: course.id, isPublished: !course.isPublished } as any, {
      onSuccess: () => toast({ title: course.isPublished ? "Formation dépubliée" : "Formation publiée" }),
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  const handleDelete = (course: AcademyCourse) => {
    if (!window.confirm(`Supprimer "${course.title}" ? Cette action est irréversible.`)) return;
    remove.mutate(course.id, {
      onSuccess: () => toast({ title: "Formation supprimée" }),
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Formations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gérez les formations affichées sur la marketplace Academy.</p>
        </div>
        <Button onClick={() => setEditing("new")} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="button-new-course">
          <Plus className="w-4 h-4 mr-1.5" />Nouvelle formation
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">Aucune formation pour le moment</p>
            <p className="text-sm text-muted-foreground mt-1">Créez votre première formation pour qu'elle apparaisse sur /academy.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.map((course) => (
            <Card key={course.id} data-testid={`card-course-${course.id}`}>
              <CardContent className="p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm truncate">{course.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{course.description || "Aucune description"}</p>
                  </div>
                  <Badge className={`text-[10px] shrink-0 border-0 px-1.5 ${LEVEL_COLORS[course.level]}`}>{LEVEL_LABELS[course.level]}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {course.duration && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{course.duration}</span>}
                  {course.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{course.location}</span>}
                  {course.hasCertification && <span className="flex items-center gap-1 text-amber-600"><Award className="w-3 h-3" />Certifiante</span>}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Prix</p>
                    <p className="font-bold text-sm text-indigo-600">{fmt(course.priceInCents)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={course.isPublished ? "default" : "secondary"} className={course.isPublished ? "bg-green-600 hover:bg-green-600" : ""}>
                      {course.isPublished ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
                      {course.isPublished ? "Publiée" : "Brouillon"}
                    </Badge>
                    <Switch checked={course.isPublished} onCheckedChange={() => togglePublish(course)} disabled={update.isPending} data-testid={`switch-publish-${course.id}`} />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => setEditing(course)} data-testid={`button-edit-course-${course.id}`}>
                    <Pencil className="w-3.5 h-3.5 mr-1" />Modifier
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDelete(course)} data-testid={`button-delete-course-${course.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CourseFormDialog course={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

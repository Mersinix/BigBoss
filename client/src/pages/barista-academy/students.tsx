import { useMemo, useState } from "react";
import { useAcademyRegistrations, type AcademyRegistrationStatus } from "@/hooks/use-barista-academy";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Search, GraduationCap, CalendarDays, Clock } from "lucide-react";

const STATUS_LABELS: Record<AcademyRegistrationStatus, string> = {
  PENDING: "En attente", CONFIRMED: "Confirmée", CANCELLED: "Annulée", COMPLETED: "Terminée",
};
const STATUS_COLORS: Record<AcademyRegistrationStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300", CONFIRMED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300", COMPLETED: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
};

// The business model treats the Coffee Owner as the registration holder while
// possibly multiple employees attend (registration.participants, free-text
// names entered at registration time) — this page flattens that relationship
// into one row per registration (participant group), which is the real,
// synchronized unit of data; there is no separate "student" record to fake.
export default function AcademyStudentsPage() {
  const { data: registrations = [], isLoading } = useAcademyRegistrations();
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...registrations]
      .filter((r) => r.status !== "CANCELLED")
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
      .filter((r) => {
        if (!query) return true;
        const haystack = [r.cafeOwnerName, r.courseTitle, ...r.participants].join(" ").toLowerCase();
        return haystack.includes(query);
      });
  }, [registrations, search]);

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Étudiants</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Les participants inscrits à vos formations, par inscription.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un étudiant, une formation…" className="pl-9" data-testid="input-search-students" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
      ) : rows.length === 0 ? (
        <Card className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
          <CardContent className="py-16 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">Aucun étudiant pour le moment</p>
            <p className="text-sm text-muted-foreground mt-1">Les étudiants apparaîtront ici dès qu'un Coffee Owner ou un Barista s'inscrit.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} data-testid={`card-student-${r.id}`} className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
              <CardContent className="p-4 flex flex-col gap-2.5">
                <div className="flex items-center gap-2 flex-wrap justify-between">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="font-semibold text-sm truncate">{r.cafeOwnerName}</span>
                    <Badge variant="outline" className="text-[10px] font-normal shrink-0">{r.participantType === "BARISTA_MARKETPLACE" ? "Barista" : "Coffee Owner"}</Badge>
                  </div>
                  <Badge variant="secondary" className={`shrink-0 ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</Badge>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <GraduationCap className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{r.courseTitle}</span>
                </div>
                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3 shrink-0" />
                    {r.participants.length > 0 ? r.participants.join(", ") : `${r.participantCount} participant${r.participantCount > 1 ? "s" : ""}`}
                  </span>
                  <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3 shrink-0" />Session : {r.sessionStartDate ?? "—"}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3 shrink-0" />Inscrit le {new Date(r.createdAt).toLocaleDateString("fr-FR")}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

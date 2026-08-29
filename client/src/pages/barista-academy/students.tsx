import { useMemo, useState } from "react";
import { useAcademyRegistrations, type AcademyRegistrationStatus } from "@/hooks/use-barista-academy";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Search } from "lucide-react";

const STATUS_LABELS: Record<AcademyRegistrationStatus, string> = {
  PENDING: "En attente", CONFIRMED: "Confirmée", CANCELLED: "Annulée", COMPLETED: "Terminée",
};
const STATUS_COLORS: Record<AcademyRegistrationStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700", CONFIRMED: "bg-indigo-100 text-indigo-700",
  CANCELLED: "bg-gray-100 text-gray-600", COMPLETED: "bg-green-100 text-green-700",
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
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">Aucun étudiant pour le moment</p>
            <p className="text-sm text-muted-foreground mt-1">Les étudiants apparaîtront ici dès qu'un Coffee Owner ou un Barista s'inscrit.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3">Inscrit par</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Participants</th>
                  <th className="p-3">Formation</th>
                  <th className="p-3">Session</th>
                  <th className="p-3">Inscrit le</th>
                  <th className="p-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0" data-testid={`row-student-${r.id}`}>
                    <td className="p-3 font-medium">{r.cafeOwnerName}</td>
                    <td className="p-3"><Badge variant="outline" className="text-[10px] font-normal">{r.participantType === "BARISTA_MARKETPLACE" ? "Barista" : "Coffee Owner"}</Badge></td>
                    <td className="p-3">
                      {r.participants.length > 0 ? r.participants.join(", ") : `${r.participantCount} participant${r.participantCount > 1 ? "s" : ""}`}
                    </td>
                    <td className="p-3">{r.courseTitle}</td>
                    <td className="p-3 text-muted-foreground">{r.sessionStartDate ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("fr-FR")}</td>
                    <td className="p-3"><Badge variant="secondary" className={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

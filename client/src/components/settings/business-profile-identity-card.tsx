import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { SectionCard } from "@/components/dashboard/dashboard-kit";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { User, Pencil, MapPin } from "lucide-react";

// Read-only "Informations personnelles / Informations de l'entreprise" card for
// every Business → Profil page (cross-account Settings/Business-Profil
// separation task) — the single place identity fields (name/phone/email/logo/
// cover) are ever EDITED is Settings → Compte (AccountIdentityCard, same
// PATCH /api/auth/me/profile); this card only ever displays the current
// `users` row via useAuth(), so it's automatically synchronized (same
// /api/auth/me query, already invalidated realtime on every identity edit —
// no second data source, no second editing system). "Modifier" navigates to
// the account's own Settings route instead of opening a second editor here.
export function BusinessProfileIdentityCard({
  title = "Informations personnelles",
  nameLabel = "Nom",
  settingsPath,
  testIdPrefix = "business-profile",
}: {
  // "Informations personnelles" for individual professionals (Barista, Maintenance,
  // Driver, Academy), "Informations de l'entreprise" for companies/agencies
  // (Marketing, Print, Delivery Company) — same card, wording adapted per account.
  title?: string;
  nameLabel?: string;
  settingsPath: string;
  testIdPrefix?: string;
}) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const coverImageUrl = (user as any)?.coverImageUrl as string | null | undefined;

  return (
    <SectionCard
      title={title}
      icon={User}
      right={
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(settingsPath)} data-testid={`button-${testIdPrefix}-modifier`}>
          <Pencil className="w-3.5 h-3.5" /> Modifier
        </Button>
      }
    >
      <div className="space-y-4">
        {coverImageUrl && (
          <div className="h-24 sm:h-32 w-full rounded-xl overflow-hidden bg-muted">
            <img src={coverImageUrl} alt="Cover" className="w-full h-full object-cover" data-testid={`img-${testIdPrefix}-cover`} />
          </div>
        )}
        <div className="flex items-center gap-4">
          <Avatar className="w-16 h-16 shrink-0">
            <AvatarImage src={getAvatarUrl(user as any)} alt={user?.name ?? ""} data-testid={`img-${testIdPrefix}-logo`} />
            <AvatarFallback className="font-bold text-xl">{(user?.name ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 flex-1">
            <div>
              <p className="text-[11px] text-muted-foreground">{nameLabel}</p>
              <p className="text-sm font-medium text-foreground truncate">{user?.name || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Téléphone</p>
              <p className="text-sm font-medium text-foreground truncate">{user?.phone || "—"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[11px] text-muted-foreground">Email</p>
              <p className="text-sm font-medium text-foreground truncate">{user?.email || "—"}</p>
            </div>
          </div>
        </div>
        {/* Localisation — same synchronized address every marketplace card/Details
            Modal/Admin already reads (users.locationAddress), edited exclusively
            from Settings → Localisation (Part 12). */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border/50">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{(user as any)?.locationAddress || "Aucune localisation renseignée"}</span>
        </div>
      </div>
    </SectionCard>
  );
}

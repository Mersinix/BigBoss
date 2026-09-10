import { SectionCard } from "@/components/dashboard/dashboard-kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, Calendar, Zap } from "lucide-react";
import { WEEKLY_DAY_DEFS } from "@/lib/weekly-hours";
import type { OpeningHoursMap } from "@shared/schema";

// Unified "Disponibilité" section (Part 10) — controlled component, same
// weekly-hours + vacation-mode editor/summary already built independently on
// Barista Marketplace/Maintenance/Delivery Company/Driver's own Business →
// Profil pages, extracted here so Settings gets the identical experience.
// Each caller wires `weeklyHours`/`isOnVacation`/`onSave` to its own
// already-existing availability mutation (useUpdateBaristaAvailability,
// useUpdateMarketingAvailability, the Maintenance/Delivery/Driver profile
// PATCH routes) — no new availability system. Only shown for accounts whose
// real data model actually has a weekly schedule (Academy and Print
// deliberately omit this section — see their settings.tsx comments).
export function AccountAvailabilityCard({
  weeklyHours,
  onChangeDay,
  isOnVacation,
  onChangeVacation,
  onSave,
  saving,
  vacationTitle = "Mode Congé / Absence",
  vacationDescription,
  accentClassName = "",
  testIdPrefix = "settings",
  className,
}: {
  weeklyHours: OpeningHoursMap;
  onChangeDay: (key: keyof OpeningHoursMap, patch: Partial<OpeningHoursMap[keyof OpeningHoursMap]>) => void;
  isOnVacation: boolean;
  onChangeVacation: (value: boolean) => void;
  onSave: () => void;
  saving: boolean;
  vacationTitle?: string;
  vacationDescription: string;
  accentClassName?: string;
  testIdPrefix?: string;
  // Optional visual override for the outer SectionCard — omitted by every
  // caller except each account's own card-styling unification pass, so
  // other accounts keep their exact current look.
  className?: string;
}) {
  return (
    <SectionCard title="Disponibilité" icon={Calendar} className={className}>
      <div className="space-y-4">
        <div className="flex items-center justify-between pt-0.5">
          <div>
            <p className="text-sm font-medium">{vacationTitle}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{vacationDescription}</p>
          </div>
          <Switch checked={isOnVacation} onCheckedChange={onChangeVacation} data-testid={`switch-${testIdPrefix}-vacation`} />
        </div>
        {isOnVacation && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Votre profil est masqué. Désactivez le mode congé pour redevenir disponible.
          </div>
        )}

        <div className="space-y-2">
          {WEEKLY_DAY_DEFS.map((d) => {
            const day = weeklyHours[d.key];
            return (
              <div key={d.key} className="flex items-center gap-3 rounded-xl border border-border/50 p-2.5">
                <button
                  type="button"
                  onClick={() => onChangeDay(d.key, { closed: !day.closed })}
                  className={`w-16 shrink-0 h-9 rounded-xl text-xs font-semibold transition-all ${!day.closed ? `${accentClassName} shadow-sm` : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                  data-testid={`button-toggle-day-${d.key}`}
                >
                  {d.short}
                </button>
                {day.closed ? (
                  <span className="text-xs font-medium text-muted-foreground flex-1">Fermé</span>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <Input type="time" value={day.open} onChange={(e) => onChangeDay(d.key, { open: e.target.value })} className="h-9 text-xs" data-testid={`input-day-open-${d.key}`} />
                    <span className="text-muted-foreground text-xs">–</span>
                    <Input type="time" value={day.close} onChange={(e) => onChangeDay(d.key, { close: e.target.value })} className="h-9 text-xs" data-testid={`input-day-close-${d.key}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-xl bg-muted/40 p-3">
          <p className="font-semibold text-xs mb-2 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Résumé de disponibilité</p>
          <div className="text-xs text-muted-foreground space-y-0.5">
            {WEEKLY_DAY_DEFS.map((d) => {
              const day = weeklyHours[d.key];
              return <p key={d.key}><strong className="text-foreground">{d.label} :</strong> {day.closed ? "Fermé" : `${day.open} – ${day.close}`}</p>;
            })}
            <p className="pt-1"><strong className="text-foreground">Statut :</strong> {isOnVacation ? "🔴 En congé" : "🟢 Disponible"}</p>
          </div>
        </div>

        <Button onClick={onSave} disabled={saving} className={`w-full sm:w-fit ${accentClassName}`} data-testid={`button-save-${testIdPrefix}-availability`}>
          {saving ? "Enregistrement…" : "Sauvegarder les disponibilités"}
        </Button>
      </div>
    </SectionCard>
  );
}

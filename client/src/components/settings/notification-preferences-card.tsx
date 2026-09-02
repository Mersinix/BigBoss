import { Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/dashboard/dashboard-kit";
import { useNotificationPreferences, useUpdateNotificationPreferences } from "@/hooks/use-notification-preferences";
import { NOTIFICATION_PREF_DEFS, ROLE_NOTIFICATION_PREF_KEYS, type NotificationPrefKey } from "@shared/notification-preferences";
import type { User } from "@shared/schema";

/**
 * Single reusable "Notifications" settings section — built on the same
 * SectionCard + shadcn Switch primitives every Settings page in this app
 * already uses (dashboard-kit.tsx is explicitly CSS-variable/dark-mode-safe,
 * never a literal color), so dropping this into Admin/Supplier/Driver/
 * Printer/Academy/Maintenance/Delivery-Company settings requires no new
 * styling. Coffee Owner's Settings tab uses a different (isDark-ternary)
 * convention and renders its own version inline instead of this component.
 *
 * Which toggles appear is entirely driven by the user's role (see
 * shared/notification-preferences.ts) — never a fixed list — so an
 * irrelevant category never shows up for a role it doesn't concern.
 */
export function NotificationPreferencesCard({ role }: { role: User["role"] }) {
  const keys = ROLE_NOTIFICATION_PREF_KEYS[role] ?? [];
  const { isEnabled } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  if (keys.length === 0) return null;

  const groups = new Map<string, NotificationPrefKey[]>();
  for (const key of keys) {
    const group = NOTIFICATION_PREF_DEFS[key].group;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(key);
  }

  const setAll = (value: boolean) => {
    const patch: Partial<Record<NotificationPrefKey, boolean>> = {};
    for (const key of keys) patch[key] = value;
    update.mutate(patch);
  };

  return (
    <SectionCard
      title="Notifications"
      icon={Bell}
      right={
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-auto py-1 px-2 text-xs" onClick={() => setAll(true)} data-testid="button-notif-prefs-enable-all">
            Tout activer
          </Button>
          <Button variant="ghost" size="sm" className="h-auto py-1 px-2 text-xs" onClick={() => setAll(false)} data-testid="button-notif-prefs-disable-all">
            Tout désactiver
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {Array.from(groups.entries()).map(([group, groupKeys]) => (
          <div key={group} className="space-y-2.5">
            {groups.size > 1 && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group}</p>}
            <div className="space-y-3">
              {groupKeys.map((key) => {
                const def = NOTIFICATION_PREF_DEFS[key];
                return (
                  <div key={key} className="flex items-center justify-between gap-3 py-0.5">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{def.label}</p>
                      {def.description && <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>}
                    </div>
                    <Switch
                      checked={isEnabled(key)}
                      onCheckedChange={(v) => update.mutate({ [key]: v })}
                      data-testid={`switch-notif-pref-${key}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

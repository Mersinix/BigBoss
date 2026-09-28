import { useRef, useState } from "react";
import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";
import { AccountIdentityCard } from "@/components/settings/account-identity-card";
import { AccountAddressCard } from "@/components/settings/account-address-card";
import { AccountSecurityCard } from "@/components/settings/account-security-card";
import type { SettingsCardHandle } from "@/components/settings/settings-card-handle";
import { useEffectiveAccountDarkMode } from "@/hooks/use-account-dark-mode";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

const ACCENT = "bg-green-600 hover:bg-green-700 text-white";
const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

// Settings = account management ONLY (Settings/Business-Profil separation
// task): Compte / Localisation / Notifications / Sécurité. Every
// business/profile-facing field (portfolio, compétences, availability,
// visibility) now lives exclusively in Business → Profil
// (barista-marketplace/profile.tsx) — the single source of truth for that
// data, no longer duplicated here.
//
// One unified Save button drives Compte/Localisation/Sécurité together via
// each card's imperative ref (see settings-card-handle.ts) — Notifications
// keeps auto-saving per toggle, unchanged, since it never had its own button.
export default function BaristaSettingsPage() {
  const isDark = useEffectiveAccountDarkMode("BARISTA_MARKETPLACE");
  const { toast } = useToast();
  const identityRef = useRef<SettingsCardHandle>(null);
  const addressRef = useRef<SettingsCardHandle>(null);
  const securityRef = useRef<SettingsCardHandle>(null);
  const [saving, setSaving] = useState(false);

  const handleSaveAll = async () => {
    setSaving(true);
    const results = await Promise.allSettled([
      identityRef.current?.save(),
      addressRef.current?.save(),
      securityRef.current?.save(),
    ]);
    setSaving(false);
    const errors = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    if (errors.length === 0) {
      toast({ title: "Paramètres enregistrés" });
    } else {
      toast({
        title: "Certaines modifications n'ont pas pu être enregistrées",
        description: errors.map((e) => e.reason?.message).filter(Boolean).join(" · ") || undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Paramètres"
        subtitle="Gérez votre compte et votre localisation."
        icon={SettingsIcon}
        gradientClass="bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent border-green-500/20"
        iconBgClass="bg-green-500/15"
        iconTextClass="text-green-600 dark:text-green-400"
        action={<Button className={ACCENT} onClick={handleSaveAll} disabled={saving} data-testid="button-save-all-settings">{saving ? "Enregistrement…" : "Enregistrer"}</Button>}
      />

      <AccountIdentityCard ref={identityRef} testIdPrefix="barista" className={CARD_CLASS} />

      <AccountAddressCard ref={addressRef} isDark={isDark} className={CARD_CLASS} />

      <NotificationPreferencesCard role="BARISTA_MARKETPLACE" className={CARD_CLASS} />

      <AccountSecurityCard ref={securityRef} testIdPrefix="barista" className={CARD_CLASS} />
    </div>
  );
}

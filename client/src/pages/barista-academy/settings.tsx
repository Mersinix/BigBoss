import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";
import { AccountIdentityCard } from "@/components/settings/account-identity-card";
import { AccountAddressCard } from "@/components/settings/account-address-card";
import { AccountSecurityCard } from "@/components/settings/account-security-card";
import { useEffectiveAccountDarkMode } from "@/hooks/use-account-dark-mode";

const ACCENT = "bg-indigo-600 hover:bg-indigo-700 text-white";

// Settings = account management ONLY (Settings/Business-Profil separation
// task): Compte / Localisation / Notifications / Sécurité. Every
// business/profile-facing field (description, formations summary,
// availability, visibility) now lives exclusively in Business → Profil
// (barista-academy/profile.tsx) — the single source of truth for that data,
// no longer duplicated here.
export default function AcademySettingsPage() {
  const isDark = useEffectiveAccountDarkMode("BARISTA_ACADEMY");
  return (
    <div className="flex flex-col gap-5 p-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez votre compte et vos préférences.</p>
      </div>

      <AccountIdentityCard nameLabel="Nom de l'académie" accentClassName={ACCENT} testIdPrefix="academy" />

      <AccountAddressCard accentClassName={ACCENT} isDark={isDark} />

      <NotificationPreferencesCard role="BARISTA_ACADEMY" />

      <AccountSecurityCard testIdPrefix="academy" />
    </div>
  );
}

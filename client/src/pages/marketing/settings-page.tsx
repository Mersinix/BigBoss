import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";
import { AccountIdentityCard } from "@/components/settings/account-identity-card";
import { AccountAddressCard } from "@/components/settings/account-address-card";
import { AccountSecurityCard } from "@/components/settings/account-security-card";
import { useEffectiveAccountDarkMode } from "@/hooks/use-account-dark-mode";

const ACCENT = "bg-fuchsia-600 hover:bg-fuchsia-700 text-white";

// Settings = account management ONLY (Settings/Business-Profil separation
// task): Compte / Localisation / Notifications / Sécurité. Every
// business/profile-facing field (description, website, portfolio, services,
// availability, visibility) now lives exclusively in Business → Profil
// (marketing/profile.tsx) — the single source of truth for that data, no
// longer duplicated here.
export default function MarketingSettingsPage() {
  const isDark = useEffectiveAccountDarkMode("MARKETING");
  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez votre compte et vos préférences.</p>
      </div>

      <AccountIdentityCard nameLabel="Nom de l'agence" accentClassName={ACCENT} testIdPrefix="marketing" />

      <AccountAddressCard accentClassName={ACCENT} isDark={isDark} />

      <NotificationPreferencesCard role="MARKETING" />

      <AccountSecurityCard testIdPrefix="marketing" />
    </div>
  );
}

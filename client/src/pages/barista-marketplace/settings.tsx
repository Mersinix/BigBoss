import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";
import { AccountIdentityCard } from "@/components/settings/account-identity-card";
import { AccountAddressCard } from "@/components/settings/account-address-card";
import { AccountSecurityCard } from "@/components/settings/account-security-card";
import { useEffectiveAccountDarkMode } from "@/hooks/use-account-dark-mode";

const ACCENT = "bg-green-600 hover:bg-green-700 text-white";
const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

// Settings = account management ONLY (Settings/Business-Profil separation
// task): Compte / Localisation / Notifications / Sécurité. Every
// business/profile-facing field (portfolio, compétences, availability,
// visibility) now lives exclusively in Business → Profil
// (barista-marketplace/profile.tsx) — the single source of truth for that
// data, no longer duplicated here.
export default function BaristaSettingsPage() {
  const isDark = useEffectiveAccountDarkMode("BARISTA_MARKETPLACE");
  return (
    <div className="flex flex-col gap-5 p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez votre compte et votre localisation.</p>
      </div>

      <AccountIdentityCard accentClassName={ACCENT} testIdPrefix="barista" className={CARD_CLASS} />

      <AccountAddressCard accentClassName={ACCENT} isDark={isDark} className={CARD_CLASS} />

      <NotificationPreferencesCard role="BARISTA_MARKETPLACE" className={CARD_CLASS} />

      <AccountSecurityCard testIdPrefix="barista" className={CARD_CLASS} />
    </div>
  );
}

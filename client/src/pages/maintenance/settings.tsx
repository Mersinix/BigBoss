import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";
import { AccountIdentityCard } from "@/components/settings/account-identity-card";
import { AccountAddressCard } from "@/components/settings/account-address-card";
import { AccountSecurityCard } from "@/components/settings/account-security-card";
import { useEffectiveAccountDarkMode } from "@/hooks/use-account-dark-mode";
import { Settings as SettingsIcon } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

const ACCENT = "bg-orange-600 hover:bg-orange-700 text-white";
const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

// Settings = account management ONLY (Settings/Business-Profil separation
// task): Compte / Localisation / Notifications / Sécurité. Every
// business/profile-facing field (portfolio, categories/skills, availability,
// visibility) now lives exclusively in Business → Profil
// (maintenance/profile.tsx) — the single source of truth for that data, no
// longer duplicated here.
export default function Settings() {
  const isDark = useEffectiveAccountDarkMode("MAINTENANCE");
  return (
    <div className="space-y-4">
      <DashboardHero
        title="Paramètres"
        subtitle="Gérez votre compte et vos préférences."
        icon={SettingsIcon}
        gradientClass="bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent border-orange-500/20"
        iconBgClass="bg-orange-500/15"
        iconTextClass="text-orange-600 dark:text-orange-400"
      />
      <AccountIdentityCard nameLabel="Nom / Structure" accentClassName={ACCENT} testIdPrefix="maintenance" className={CARD_CLASS} />

      <AccountAddressCard accentClassName={ACCENT} isDark={isDark} className={CARD_CLASS} />

      <NotificationPreferencesCard role="MAINTENANCE" className={CARD_CLASS} />

      <AccountSecurityCard testIdPrefix="maintenance" className={CARD_CLASS} />
    </div>
  );
}

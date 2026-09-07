import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";
import { AccountIdentityCard } from "@/components/settings/account-identity-card";
import { AccountAddressCard } from "@/components/settings/account-address-card";
import { AccountSecurityCard } from "@/components/settings/account-security-card";

const ACCENT = "bg-orange-600 hover:bg-orange-700 text-white";

// Settings = account management ONLY (Settings/Business-Profil separation
// task): Compte / Localisation / Notifications / Sécurité. Every
// business/profile-facing field (portfolio, categories/skills, availability,
// visibility) now lives exclusively in Business → Profil
// (maintenance/profile.tsx) — the single source of truth for that data, no
// longer duplicated here.
export default function Settings() {
  return (
    <div className="space-y-4">
      <AccountIdentityCard nameLabel="Nom / Structure" accentClassName={ACCENT} testIdPrefix="maintenance" />

      <AccountAddressCard accentClassName={ACCENT} />

      <NotificationPreferencesCard role="MAINTENANCE" />

      <AccountSecurityCard testIdPrefix="maintenance" />
    </div>
  );
}

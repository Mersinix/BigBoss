import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";
import { AccountIdentityCard } from "@/components/settings/account-identity-card";
import { AccountAddressCard } from "@/components/settings/account-address-card";
import { AccountSecurityCard } from "@/components/settings/account-security-card";

const ACCENT = "bg-blue-600 hover:bg-blue-700 text-white";

// Settings = account management ONLY (Settings/Business-Profil separation
// task): Compte / Localisation / Notifications / Sécurité. Every
// business/profile-facing field (description, website, services, categories,
// visibility, availability) now lives exclusively in Business → Profil
// (printer/profile.tsx) — the single source of truth for that data, no
// longer duplicated here.
export default function PrinterSettings() {
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez votre compte et vos préférences.</p>
      </div>

      <AccountIdentityCard nameLabel="Nom de l'imprimerie" accentClassName={ACCENT} testIdPrefix="printer" />

      <AccountAddressCard accentClassName={ACCENT} />

      <NotificationPreferencesCard role="PRINTER" />

      <AccountSecurityCard testIdPrefix="printer" />
    </div>
  );
}

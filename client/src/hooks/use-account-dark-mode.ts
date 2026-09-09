import { useQuery } from "@tanstack/react-query";
import { useAccountThemeStore } from "@/store/account-theme-store";

// Admin-controlled theme POLICY for each of the 7 non-Coffee-Owner service
// accounts' navbar — mirrors use-hero-actions.ts exactly (same query/default
// pattern). Three states, not a boolean: BOTH (owner picks, toggle visible),
// DARK_ONLY (forced dark, no toggle), LIGHT_ONLY (forced light, no toggle).
// Defaults to BOTH for every account so a load failure never restricts a
// mode that should be available.
export type DarkModeAccount = "BARISTA_ACADEMY" | "BARISTA_MARKETPLACE" | "DELIVERY_COMPANY" | "DRIVER" | "PRINTER" | "MAINTENANCE" | "MARKETING";
export type AccountThemeMode = "BOTH" | "DARK_ONLY" | "LIGHT_ONLY";
export type AccountDarkModeSettingsMap = Record<DarkModeAccount, AccountThemeMode>;

const DEFAULT_ACCOUNT_DARK_MODE: AccountDarkModeSettingsMap = {
  BARISTA_ACADEMY: "BOTH",
  BARISTA_MARKETPLACE: "BOTH",
  DELIVERY_COMPANY: "BOTH",
  DRIVER: "BOTH",
  PRINTER: "BOTH",
  MAINTENANCE: "BOTH",
  MARKETING: "BOTH",
};

export function useAccountDarkModeSettings() {
  const { data, isLoading } = useQuery<AccountDarkModeSettingsMap>({
    queryKey: ["/api/account-dark-mode-settings"],
  });
  return { settings: data ?? DEFAULT_ACCOUNT_DARK_MODE, isLoading };
}

// Resolves an account's actual current rendering theme: the admin policy
// wins whenever it forces a single mode (DARK_ONLY/LIGHT_ONLY); only under
// BOTH does the owner's own stored preference (useAccountThemeStore, default
// dark) apply. Any component below ProfessionalAccountShell that needs the
// effective isDark (e.g. to pass into AddressDetailsFields, which uses
// literal Tailwind colors rather than the dark: variant) should use this
// instead of reading useAccountThemeStore directly, so it can never render
// out of step with an admin-forced mode.
export function useEffectiveAccountDarkMode(accountKey: DarkModeAccount): boolean {
  const { settings } = useAccountDarkModeSettings();
  const isDark = useAccountThemeStore((s) => s.isDark);
  const mode = settings[accountKey] ?? "BOTH";
  if (mode === "DARK_ONLY") return true;
  if (mode === "LIGHT_ONLY") return false;
  return isDark;
}

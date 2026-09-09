import { useQuery } from "@tanstack/react-query";
import { useAccountThemeStore } from "@/store/account-theme-store";

// Admin-controlled visibility of the dark/light mode toggle inside each of
// the 7 non-Coffee-Owner service accounts' navbar — mirrors use-hero-actions.ts
// exactly (same query/default pattern). Defaults to enabled for every account
// so a load failure never hides a toggle that should be there.
export type DarkModeAccount = "BARISTA_ACADEMY" | "BARISTA_MARKETPLACE" | "DELIVERY_COMPANY" | "DRIVER" | "PRINTER" | "MAINTENANCE" | "MARKETING";
export type AccountDarkModeSettingsMap = Record<DarkModeAccount, boolean>;

const DEFAULT_ACCOUNT_DARK_MODE: AccountDarkModeSettingsMap = {
  BARISTA_ACADEMY: true,
  BARISTA_MARKETPLACE: true,
  DELIVERY_COMPANY: true,
  DRIVER: true,
  PRINTER: true,
  MAINTENANCE: true,
  MARKETING: true,
};

export function useAccountDarkModeSettings() {
  const { data, isLoading } = useQuery<AccountDarkModeSettingsMap>({
    queryKey: ["/api/account-dark-mode-settings"],
  });
  return { settings: data ?? DEFAULT_ACCOUNT_DARK_MODE, isLoading };
}

// Convenience for any component below ProfessionalAccountShell that needs
// the account's actual current dark/light state (e.g. to pass isDark into
// AddressDetailsFields, which uses literal Tailwind colors rather than the
// dark: variant): same "admin allowed AND user toggled on" gate the shell
// itself uses for the "dark" class, so a component never renders dark when
// admin has hidden the toggle for this account (even if the store's raw
// isDark happens to be true).
export function useEffectiveAccountDarkMode(accountKey: DarkModeAccount): boolean {
  const { settings } = useAccountDarkModeSettings();
  const isDark = useAccountThemeStore((s) => s.isDark);
  return (settings[accountKey] ?? true) && isDark;
}

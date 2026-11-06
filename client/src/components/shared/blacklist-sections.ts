import type { PublishedReportRowKeys } from "@/components/published-reports-list";

// Declarative per-section config for the six Coffee Owner "blacklist" (public
// published-reports) modals — hoisted here instead of duplicated in each
// section's own wrapper (task: "Safely Consolidate the Six Blacklist Modal
// Components into One Shared Component" — see
// BLACKLIST_MODAL_REFACTOR_AUDIT.md §2.2/§6/§7). Pure data: title/subtitle/
// accent colors/raw-field-names copied verbatim from each section's previous
// standalone implementation — no behavior here, no API calls.
export type BlacklistSectionId = "SHOP" | "ACADEMY" | "BARISTA" | "MAINTENANCE" | "MARKETING" | "PRINT";

export interface BlacklistSectionConfig extends PublishedReportRowKeys {
  title: string;
  subtitle: string;
  // Resolved against `isDark` by the caller, same convention every section
  // already used inline (`isDark ? "...400" : "...600"`).
  accentClassName: { dark: string; light: string };
}

export const BLACKLIST_SECTIONS: Record<BlacklistSectionId, BlacklistSectionConfig> = {
  SHOP: {
    title: "Fournisseurs signalés",
    subtitle: "Signalements publiés par l'équipe Admin.",
    accentClassName: { dark: "text-amber-400", light: "text-amber-600" },
    idKey: "supplierId",
    nameKey: "supplierName",
    imageKey: "supplierProfileImageUrl",
  },
  ACADEMY: {
    title: "Académies signalées",
    subtitle: "Signalements publiés par l'équipe Admin.",
    accentClassName: { dark: "text-indigo-400", light: "text-indigo-600" },
    idKey: "academyUserId",
    nameKey: "academyName",
    imageKey: "academyProfileImageUrl",
  },
  BARISTA: {
    title: "Baristas signalés",
    subtitle: "Signalements publiés par l'équipe Admin.",
    accentClassName: { dark: "text-emerald-400", light: "text-green-600" },
    idKey: "baristaUserId",
    nameKey: "baristaName",
    imageKey: "baristaProfileImageUrl",
  },
  MAINTENANCE: {
    title: "Professionnels signalés",
    subtitle: "Signalements publiés par l'équipe Admin.",
    accentClassName: { dark: "text-amber-400", light: "text-orange-500" },
    idKey: "maintenanceUserId",
    nameKey: "maintenanceName",
    imageKey: "maintenanceProfileImageUrl",
  },
  MARKETING: {
    title: "Prestataires signalés",
    subtitle: "Signalements publiés par l'équipe Admin.",
    accentClassName: { dark: "text-purple-400", light: "text-purple-600" },
    idKey: "marketingUserId",
    nameKey: "marketingName",
    imageKey: "marketingProfileImageUrl",
  },
  PRINT: {
    title: "Imprimeurs signalés",
    subtitle: "Signalements publiés par l'équipe Admin.",
    accentClassName: { dark: "text-blue-400", light: "text-blue-600" },
    idKey: "printerId",
    nameKey: "printerName",
    imageKey: "printerProfileImageUrl",
  },
};

export function resolveAccentClassName(config: BlacklistSectionConfig, isDark: boolean): string {
  return isDark ? config.accentClassName.dark : config.accentClassName.light;
}

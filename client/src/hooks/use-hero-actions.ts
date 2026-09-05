import { useQuery } from "@tanstack/react-query";

// Admin-controlled visibility of the Coffee Owner hero "Fast Search"/"Report"
// icons, per service — mirrors use-service-states.ts exactly (same query/
// default pattern), but a separate concept/key set (see shared/schema.ts's
// heroActionSettings note): this never hides a whole service, only the two
// hero icons. Defaults to enabled for every service so a load failure never
// hides icons that already work today.
export type HeroService = "SHOP" | "BARISTA" | "ACADEMY" | "MAINTENANCE" | "PRINT" | "MARKETING";
export type HeroActionSettingsMap = Record<HeroService, { fastSearchEnabled: boolean; reportEnabled: boolean }>;

const DEFAULT_HERO_ACTIONS: HeroActionSettingsMap = {
  SHOP: { fastSearchEnabled: true, reportEnabled: true },
  BARISTA: { fastSearchEnabled: true, reportEnabled: true },
  ACADEMY: { fastSearchEnabled: true, reportEnabled: true },
  MAINTENANCE: { fastSearchEnabled: true, reportEnabled: true },
  PRINT: { fastSearchEnabled: true, reportEnabled: true },
  MARKETING: { fastSearchEnabled: true, reportEnabled: true },
};

export function useHeroActionSettings() {
  const { data, isLoading } = useQuery<HeroActionSettingsMap>({
    queryKey: ["/api/hero-actions"],
  });
  return { settings: data ?? DEFAULT_HERO_ACTIONS, isLoading };
}

import { useQuery } from "@tanstack/react-query";
import type { HeroService } from "@/hooks/use-hero-actions";

// Admin-controlled visual customization of each Coffee-Owner-facing service
// hero (background image rotation/gradient, subtitle override, height,
// content alignment, info-row toggle) — mirrors use-hero-actions.ts exactly
// (same query/default pattern), but a separate concept/table (see
// shared/schema.ts's serviceHeroConfigs note). Defaults preserve each
// service's current look (no custom background, default subtitle, info row
// shown) so a load failure never changes an existing hero's appearance.
export type ServiceHeroHeight = "compact" | "medium" | "large";
export type ServiceHeroHAlign = "left" | "center" | "right";
export type ServiceHeroVAlign = "top" | "center" | "bottom";

export type ServiceHeroConfig = {
  backgroundImages: string[];
  rotationIntervalSeconds: number;
  gradientEnabled: boolean;
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
  gradientDirection: string;
  subtitle: string | null;
  height: ServiceHeroHeight;
  horizontalAlign: ServiceHeroHAlign;
  verticalAlign: ServiceHeroVAlign;
  infoRowEnabled: boolean;
};

export type ServiceHeroConfigMap = Record<HeroService, ServiceHeroConfig>;

export const DEFAULT_SERVICE_HERO_CONFIG: ServiceHeroConfig = {
  backgroundImages: [],
  rotationIntervalSeconds: 6,
  gradientEnabled: false,
  gradientFrom: "",
  gradientVia: "",
  gradientTo: "",
  gradientDirection: "to bottom right",
  subtitle: null,
  height: "medium",
  horizontalAlign: "center",
  verticalAlign: "center",
  infoRowEnabled: true,
};

const ALL_SERVICES: HeroService[] = ["SHOP", "BARISTA", "ACADEMY", "MAINTENANCE", "PRINT", "MARKETING"];

const DEFAULT_SERVICE_HERO_CONFIG_MAP: ServiceHeroConfigMap = Object.fromEntries(
  ALL_SERVICES.map((s) => [s, DEFAULT_SERVICE_HERO_CONFIG]),
) as ServiceHeroConfigMap;

export function useServiceHeroConfigMap() {
  const { data, isLoading } = useQuery<ServiceHeroConfigMap>({
    queryKey: ["/api/service-hero-config"],
  });
  return { configs: data ?? DEFAULT_SERVICE_HERO_CONFIG_MAP, isLoading };
}

export function useServiceHeroConfig(service: HeroService) {
  const { configs, isLoading } = useServiceHeroConfigMap();
  return { config: configs[service] ?? DEFAULT_SERVICE_HERO_CONFIG, isLoading };
}

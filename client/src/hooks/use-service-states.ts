import { useQuery } from "@tanstack/react-query";

// BARISTA_ACADEMY/BARISTA_MARKETPLACE are additive alongside the pre-existing
// combined "BARISTA" key — see the note on serviceKeyEnum in shared/schema.ts.
export type ServiceKey = "PRINTING" | "MARKETING" | "BARISTA" | "BARISTA_ACADEMY" | "BARISTA_MARKETPLACE" | "MAINTENANCE";
export type ServiceState = "VISIBLE" | "HIDDEN" | "COMING_SOON";
export type ServiceStatesMap = Record<ServiceKey, ServiceState>;

const DEFAULT_STATES: ServiceStatesMap = {
  PRINTING: "VISIBLE",
  MARKETING: "VISIBLE",
  BARISTA: "VISIBLE",
  BARISTA_ACADEMY: "VISIBLE",
  BARISTA_MARKETPLACE: "VISIBLE",
  MAINTENANCE: "VISIBLE",
};

export function useServiceStates() {
  const { data, isLoading } = useQuery<ServiceStatesMap>({
    queryKey: ["/api/system-services"],
  });
  return { states: data ?? DEFAULT_STATES, isLoading };
}

export const ROLE_TO_SERVICE: Record<string, ServiceKey> = {
  PRINTER: "PRINTING",
  MARKETING: "MARKETING",
  BARISTA_ACADEMY: "BARISTA",
  BARISTA_MARKETPLACE: "BARISTA",
  MAINTENANCE: "MAINTENANCE",
};

import { useQuery } from "@tanstack/react-query";

export type ServiceKey = "PRINTING" | "MARKETING" | "BARISTA";
export type ServiceState = "VISIBLE" | "HIDDEN" | "COMING_SOON";
export type ServiceStatesMap = Record<ServiceKey, ServiceState>;

const DEFAULT_STATES: ServiceStatesMap = {
  PRINTING: "VISIBLE",
  MARKETING: "VISIBLE",
  BARISTA: "VISIBLE",
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
};

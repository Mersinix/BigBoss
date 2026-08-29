import { useQuery } from "@tanstack/react-query";

// The combined "BARISTA" key is retired — the customer-facing Barista
// discovery page it used to gate as one page has been split into two
// independent pages (/barista → Marketplace Baristas, /academy → Barista
// Academy), each with its own key below. Never re-add "BARISTA" here — see
// the note on serviceKeyEnum in shared/schema.ts for why the underlying
// Postgres enum value is kept but unused at the application level.
export type ServiceKey = "PRINTING" | "MARKETING" | "BARISTA_ACADEMY" | "BARISTA_MARKETPLACE" | "MAINTENANCE";
export type ServiceState = "VISIBLE" | "HIDDEN" | "COMING_SOON";
export type ServiceStatesMap = Record<ServiceKey, ServiceState>;

const DEFAULT_STATES: ServiceStatesMap = {
  PRINTING: "VISIBLE",
  MARKETING: "VISIBLE",
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
  BARISTA_ACADEMY: "BARISTA_ACADEMY",
  BARISTA_MARKETPLACE: "BARISTA_MARKETPLACE",
  MAINTENANCE: "MAINTENANCE",
};

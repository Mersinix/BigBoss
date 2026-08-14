import { useQuery } from "@tanstack/react-query";

export type MessagingSettings = {
  globalVisible: boolean;
  supplierMessagingEnabled: boolean;
  maintenanceMessagingEnabled: boolean;
  broadcastsEnabled: boolean;
  gracePeriodMinutes: number;
};

export const DEFAULT_MESSAGING_SETTINGS: MessagingSettings = {
  globalVisible: true,
  supplierMessagingEnabled: true,
  maintenanceMessagingEnabled: true,
  broadcastsEnabled: true,
  gracePeriodMinutes: 30,
};

export function useMessagingSettings() {
  const { data, isLoading } = useQuery<MessagingSettings>({
    queryKey: ["/api/messages/settings"],
  });
  return { settings: data ?? DEFAULT_MESSAGING_SETTINGS, isLoading };
}
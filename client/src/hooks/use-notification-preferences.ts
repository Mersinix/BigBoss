import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { isNotificationCategoryEnabled, type NotificationPrefKey } from "@shared/notification-preferences";

async function mutate<T>(method: string, url: string, body?: any): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ message: "Request failed" }))).message ?? "Request failed");
  return res.json();
}

/**
 * Preferences live on the user's own row (users.notificationPreferences), already
 * returned by /api/auth/me — no separate fetch needed. Reading this hook is just
 * a thin, typed view over useAuth()'s existing user object.
 */
export function useNotificationPreferences() {
  const { user } = useAuth();
  const prefs = (user as User | undefined)?.notificationPreferences ?? null;
  return {
    preferences: prefs,
    isEnabled: (key: NotificationPrefKey) => isNotificationCategoryEnabled(prefs, key),
  };
}

/**
 * PATCH /api/notification-preferences. The server broadcasts user_profile_updated
 * on success (same event a profile edit already fires), which every account shell
 * already listens for to invalidate /api/auth/me — so this syncs across every open
 * tab/device for free, with no bespoke realtime wiring here.
 */
export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Record<NotificationPrefKey, boolean>>) =>
      mutate<{ preferences: Record<string, boolean> }>("PATCH", "/api/notification-preferences", patch),
    onMutate: async (patch) => {
      const key = [api.auth.me.path];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<User>(key);
      if (previous) {
        qc.setQueryData<User>(key, {
          ...previous,
          notificationPreferences: { ...(previous.notificationPreferences ?? {}), ...patch },
        });
      }
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) qc.setQueryData([api.auth.me.path], context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [api.auth.me.path] });
    },
  });
}

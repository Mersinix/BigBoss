import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Notification, NotificationService } from "@shared/schema";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ message: "Request failed" }))).message ?? "Request failed");
  return res.json();
}

async function mutate<T>(method: string, url: string, body?: any): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ message: "Request failed" }))).message ?? "Request failed");
  return res.json();
}

// Single reusable data layer for the whole notification system — every account
// surface (Coffee Owner modal, Admin/Supplier pages, provider account tabs)
// consumes these same hooks rather than re-fetching /api/notifications itself,
// so read-state/unread-count stay consistent everywhere.

export function useNotifications(service?: NotificationService, opts?: { unreadOnly?: boolean; limit?: number }) {
  const params = new URLSearchParams();
  if (service) params.set("service", service);
  if (opts?.unreadOnly) params.set("unreadOnly", "true");
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return useQuery<Notification[]>({
    queryKey: ["/api/notifications", { service: service ?? null, unreadOnly: opts?.unreadOnly ?? false, limit: opts?.limit ?? null }],
    queryFn: () => getJson(`/api/notifications${qs ? `?${qs}` : ""}`),
  });
}

export function useUnreadNotificationCount(service?: NotificationService) {
  const qs = service ? `?service=${service}` : "";
  return useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count", { service: service ?? null }],
    queryFn: () => getJson(`/api/notifications/unread-count${qs}`),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/notifications" });
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/notifications/unread-count" });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (service?: NotificationService) => mutate("PATCH", "/api/notifications/read-all", service ? { service } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/notifications" });
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/notifications/unread-count" });
    },
  });
}

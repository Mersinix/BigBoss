import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Shared "entity-level report" API hooks (task: "Redesign Maintenance Reports
// Using the Avis Modal Pattern and Add Admin Moderation", Phase 5) —
// maintenanceReports/baristaReports/marketingReports (and, going forward,
// printReports/academyReports/the Shop's own equivalent) all mirror the exact
// same table shape and route convention on purpose (see each table's own
// schema comment: "mirrors maintenanceReports exactly"). One parametrized
// factory over the service's route prefix covers all of them instead of
// duplicating the same 4 request functions per module. Only Maintenance is
// instantiated today (use-maintenance-reports.ts); other modules adopt this
// the same way when they get their own redesign.

export type EntityReportStatus = "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED";

export interface PublishedEntityReport {
  id: number;
  rating: number | null;
  reason: string;
  createdAt: string;
  resolvedAt: string | null; // doubles as "published at" when status = PUBLISHED
  [targetNameKey: string]: unknown;
}

export interface AdminEntityReport {
  id: number;
  cafeOwnerId: number;
  rating: number | null;
  reason: string;
  status: EntityReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  cafeOwnerName: string;
  [targetNameKey: string]: unknown;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ message: "Request failed" }))).message ?? "Request failed");
  return res.json();
}

async function mutate<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ message: "Request failed" }))).message ?? "Request failed");
  return res.json();
}

export function createEntityReportHooks(service: string) {
  const base = `/api/${service}`;
  const adminBase = `/api/admin/${service}`;

  function useSubmitReport() {
    return useMutation({
      mutationFn: ({ targetUserId, reason, rating }: { targetUserId: number; reason: string; rating: number }) =>
        mutate("POST", `${base}/${targetUserId}/report`, { reason, rating }),
    });
  }

  function usePublishedReports(page: number, limit = 10) {
    return useQuery<{ reports: PublishedEntityReport[]; total: number; page: number; limit: number }>({
      queryKey: [`${base}/reports/published`, page, limit],
      queryFn: () => getJson(`${base}/reports/published?page=${page}&limit=${limit}`),
    });
  }

  function useAdminReports(status?: EntityReportStatus) {
    return useQuery<AdminEntityReport[]>({
      queryKey: [`${adminBase}/reports`, status ?? "ALL"],
      queryFn: () => getJson(`${adminBase}/reports${status ? `?status=${status}` : ""}`),
    });
  }

  function useModerateReport() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ id, status, resolutionNote }: { id: number; status: EntityReportStatus; resolutionNote?: string }) =>
        mutate("PATCH", `${adminBase}/reports/${id}/resolve`, { status, resolutionNote }),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [`${adminBase}/reports`] });
        qc.invalidateQueries({ queryKey: [`${base}/reports/published`] });
      },
    });
  }

  return { useSubmitReport, usePublishedReports, useAdminReports, useModerateReport };
}

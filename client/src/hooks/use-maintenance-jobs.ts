import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  MaintenanceJobPost, MaintenanceJobPostWithStats, MaintenanceJobTarget,
  MaintenanceJobApplication, MaintenanceJobApplicationWithParties,
} from "@shared/schema";

export type { MaintenanceJobPost, MaintenanceJobPostWithStats, MaintenanceJobTarget, MaintenanceJobApplication, MaintenanceJobApplicationWithParties };
export type MaintenanceJobPublicationMode = "AUTOMATIC" | "MANUAL";
export type MaintenanceJobStatus = "DRAFT" | "PUBLISHED" | "CLOSED";
export type MaintenanceJobApplicationStatus = "PENDING" | "ACCEPTED" | "REJECTED";
export type MaintenanceDiscoverableJob = MaintenanceJobPost & { isTargeted: boolean; hasApplied: boolean };

// Mirrors use-barista-marketplace.ts's job-posting section exactly — see
// docs/maintenance_interventions_implementation_audit.md Section 5.

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

export type MaintenanceJobPostInput = Partial<{
  title: string; establishment: string; locationAddress: string;
  categories: string[]; urgency: string; scheduledDate: string | null; scheduledTime: string | null;
  contactPhone: string; description: string; requirements: string; expiresAt: string | null;
  publicationMode: MaintenanceJobPublicationMode; status: MaintenanceJobStatus;
}>;

function invalidateMaintenanceJobs(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["/api/maintenance/jobs"] });
  qc.invalidateQueries({ queryKey: ["/api/maintenance/applications/mine"] });
}

export function useCreateMaintenanceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MaintenanceJobPostInput) => mutate<MaintenanceJobPost>("POST", "/api/maintenance/jobs", data),
    onSuccess: () => invalidateMaintenanceJobs(qc),
  });
}

export function useMyMaintenanceJobs() {
  return useQuery<MaintenanceJobPostWithStats[]>({
    queryKey: ["/api/maintenance/jobs/mine"],
    queryFn: () => getJson("/api/maintenance/jobs/mine"),
  });
}

export function useMaintenanceJobDetail(id: number | null) {
  return useQuery<{ job: MaintenanceJobPostWithStats | MaintenanceJobPost; targets?: MaintenanceJobTarget[]; hasApplied?: boolean }>({
    queryKey: ["/api/maintenance/jobs", id],
    queryFn: () => getJson(`/api/maintenance/jobs/${id}`),
    enabled: id != null,
  });
}

export function useUpdateMaintenanceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: MaintenanceJobPostInput & { id: number }) =>
      mutate<MaintenanceJobPost>("PATCH", `/api/maintenance/jobs/${id}`, data),
    onSuccess: () => invalidateMaintenanceJobs(qc),
  });
}

// Manual targeting — called from MaintenanceJobTargetButton (Fast Search +
// provider Details modal) to associate the provider currently shown with a
// MANUAL intervention post.
export function useAddMaintenanceJobTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, maintenanceUserId }: { jobId: number; maintenanceUserId: number }) =>
      mutate<MaintenanceJobTarget>("POST", `/api/maintenance/jobs/${jobId}/targets`, { maintenanceUserId }),
    onSuccess: () => invalidateMaintenanceJobs(qc),
  });
}

export type MaintenanceJobTargetWithParty = MaintenanceJobTarget & { maintenanceName: string; maintenanceProfileImageUrl: string | null };

export function useMaintenanceJobTargets(jobId: number | null) {
  return useQuery<MaintenanceJobTargetWithParty[]>({
    queryKey: ["/api/maintenance/jobs", jobId, "targets"],
    queryFn: () => getJson(`/api/maintenance/jobs/${jobId}/targets`),
    enabled: jobId != null,
  });
}

// ── Maintenance-provider-side discovery & applications ──

export function useDiscoverMaintenanceJobs() {
  return useQuery<MaintenanceDiscoverableJob[]>({
    queryKey: ["/api/maintenance/jobs/discover"],
    queryFn: () => getJson("/api/maintenance/jobs/discover"),
  });
}

export function useMyMaintenanceJobApplications() {
  return useQuery<MaintenanceJobApplicationWithParties[]>({
    queryKey: ["/api/maintenance/applications/mine"],
    queryFn: () => getJson("/api/maintenance/applications/mine"),
  });
}

export function useApplyToMaintenanceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, message }: { jobId: number; message?: string }) =>
      mutate<MaintenanceJobApplication>("POST", `/api/maintenance/jobs/${jobId}/apply`, { message }),
    onSuccess: () => invalidateMaintenanceJobs(qc),
  });
}

// ── Coffee Owner candidate/response management ──

export function useMaintenanceJobApplicationsForJob(jobId: number | null) {
  return useQuery<MaintenanceJobApplicationWithParties[]>({
    queryKey: ["/api/maintenance/jobs", jobId, "applications"],
    queryFn: () => getJson(`/api/maintenance/jobs/${jobId}/applications`),
    enabled: jobId != null,
  });
}

export function useUpdateMaintenanceJobApplicationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "ACCEPTED" | "REJECTED" }) =>
      mutate<MaintenanceJobApplication>("PATCH", `/api/maintenance/applications/${id}/status`, { status }),
    onSuccess: () => {
      invalidateMaintenanceJobs(qc);
      qc.invalidateQueries({ queryKey: ["/api/maintenance/reservations"] });
    },
  });
}

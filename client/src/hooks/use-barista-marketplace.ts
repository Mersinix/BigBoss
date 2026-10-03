import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { OpeningHoursMap } from "@shared/schema";

// ── Types (kept local — no dedicated Barista types file existed before this) ──

export type BaristaLevel = "BEGINNER" | "ADVANCED" | "EXPERT";
export type BaristaRequestStatus = "PENDING" | "DISCUSSION" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "COMPLETED";
export type BaristaMissionStatus = "UPCOMING" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export type BaristaSkill = { id: number; name: string; isActive: boolean; isFrozen: boolean };
export type BaristaEducationLevel = { id: number; name: string; isActive: boolean; isFrozen: boolean };
export type BaristaLanguage = { id: number; name: string; isActive: boolean; isFrozen: boolean };

export type BaristaWorkHistory = {
  id: number;
  baristaUserId: number;
  cafeName: string;
  role: string;
  startPeriod: string;
  endPeriod: string | null;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type BaristaMarketplaceCard = {
  id: number;
  userId: number;
  name: string;
  phone: string | null;
  profileImageUrl: string | null;
  coverImageUrl?: string | null;
  // Settings → Compte "Flash (URL)" — opened by the Flash icon on the details modal.
  flashImageUrl?: string | null;
  level: BaristaLevel;
  bio: string;
  skills: string[];
  certifications: string[];
  experienceYears: number | null;
  portfolioUrls: string[];
  dailyRateInCents: number;
  city: string;
  // Niveau d'étude (single) / Langue (multi) — names from the Admin-managed
  // taxonomies (Admin > Compétences), same storage convention as `skills`.
  educationLevel?: string | null;
  languages: string[];
  location: string;
  initials: string;
  availableDays: string[];
  // Per-day schedule (Barista availability update) — same shape as
  // MaintenanceMarketplaceCard.weeklyHours; null until the Barista saves one.
  weeklyHours: OpeningHoursMap | null;
  isAvailable: boolean;
  isOnVacation: boolean;
  marketplaceVisible: boolean;
  available: boolean;
  rating: number; // x10, e.g. 47 = 4.7
  reviewCount: number;
  workHistory: BaristaWorkHistory[];
  distanceKm?: number | null;
  updatedAt: string;
};

export type BaristaRequest = {
  id: number;
  cafeOwnerId: number;
  baristaUserId: number;
  missionType: string;
  message: string;
  proposedRateInCents: number | null;
  startDate: string;
  endDate: string | null;
  status: BaristaRequestStatus;
  cancelReason: string | null;
  createdAt: string;
  respondedAt: string | null;
  updatedAt: string;
  cafeOwnerName: string;
  cafeOwnerPhone: string | null;
  baristaName: string;
  baristaPhone: string | null;
};

export type BaristaMission = {
  id: number;
  requestId: number;
  cafeOwnerId: number;
  baristaUserId: number;
  missionType: string;
  rateInCents: number;
  startDate: string;
  endDate: string | null;
  status: BaristaMissionStatus;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cafeOwnerName: string;
  baristaName: string;
};

export type BaristaReview = {
  id: number;
  baristaMarketplaceUserId: number;
  baristaMissionId: number;
  cafeId: number;
  rating: number;
  comment: string | null;
  cafeName: string;
  cafeOwnerName: string;
  createdAt: string;
};

// ── Job posting system ──

export type BaristaJobPublicationMode = "AUTOMATIC" | "MANUAL";
export type BaristaJobStatus = "DRAFT" | "PUBLISHED" | "CLOSED";
export type BaristaJobApplicationStatus = "PENDING" | "PRESELECTED" | "INTERVIEW_SCHEDULED" | "ACCEPTED" | "REJECTED";
export type BaristaJobMeetingStatus = "PROPOSED" | "CONFIRMED" | "CANCELLED";

export type BaristaJobPost = {
  id: number;
  cafeOwnerId: number;
  title: string;
  establishment: string;
  locationAddress: string;
  openPositions: number;
  employmentTypes: string[];
  experienceRequired: string;
  educationLevels: string[];
  languages: string[];
  remuneration: string;
  description: string;
  requirements: string;
  expiresAt: string | null;
  publicationMode: BaristaJobPublicationMode;
  status: BaristaJobStatus;
  createdAt: string;
  updatedAt: string;
};

export type BaristaJobPostWithStats = BaristaJobPost & {
  totalApplications: number;
  pendingApplications: number;
  preselectedApplications: number;
  rejectedApplications: number;
  processedApplications: number;
  targetCount: number;
};

export type BaristaJobMeeting = {
  id: number;
  applicationId: number;
  scheduledAt: string;
  notes: string | null;
  status: BaristaJobMeetingStatus;
  createdAt: string;
  updatedAt: string;
};

export type BaristaJobApplication = {
  id: number;
  jobPostId: number;
  baristaUserId: number;
  message: string | null;
  status: BaristaJobApplicationStatus;
  createdAt: string;
  updatedAt: string;
  baristaName: string;
  baristaProfileImageUrl: string | null;
  jobTitle: string;
  establishment: string;
  meeting: BaristaJobMeeting | null;
};

export type BaristaJobTarget = {
  id: number;
  jobPostId: number;
  baristaUserId: number;
  createdAt: string;
  baristaName: string;
  baristaProfileImageUrl: string | null;
};

export type BaristaDiscoverableJob = BaristaJobPost & { isTargeted: boolean; hasApplied: boolean };

export type BaristaRevenueSummary = {
  totalEarnedCents: number;
  completedMissions: number;
  currentMonthCents: number;
  currentMonthMissions: number;
  history: { month: string; totalCents: number; missions: number }[];
};

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

// ── Public ──

export function useBaristaSkills() {
  return useQuery<BaristaSkill[]>({
    queryKey: [api.barista.skills.path],
    queryFn: () => getJson(api.barista.skills.path),
  });
}

// Niveau d'étude / Langue — Admin-managed taxonomies, same read shape as
// useBaristaSkills (active, non-frozen options only).
export function useBaristaEducationLevels() {
  return useQuery<BaristaEducationLevel[]>({
    queryKey: ["/api/barista/education-levels"],
    queryFn: () => getJson("/api/barista/education-levels"),
  });
}

export function useBaristaLanguages() {
  return useQuery<BaristaLanguage[]>({
    queryKey: ["/api/barista/languages"],
    queryFn: () => getJson("/api/barista/languages"),
  });
}

export function useBaristaProfiles(filters?: { search?: string; level?: string; skill?: string; city?: string; available?: string }) {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.level) params.set("level", filters.level);
  if (filters?.skill) params.set("skill", filters.skill);
  if (filters?.city) params.set("city", filters.city);
  if (filters?.available) params.set("available", filters.available);
  const qs = params.toString();
  return useQuery<BaristaMarketplaceCard[]>({
    queryKey: [api.barista.profiles.path, qs],
    queryFn: () => getJson(`${api.barista.profiles.path}${qs ? `?${qs}` : ""}`),
  });
}

// ── Entity-level report (Coffee Owner → Barista account, distinct from review-reporting) ──

export function useReportBarista() {
  return useMutation({
    mutationFn: ({ baristaUserId, reason }: { baristaUserId: number; reason: string }) =>
      mutate("POST", `/api/barista/${baristaUserId}/report`, { reason }),
  });
}

export type BaristaReport = {
  id: number;
  cafeOwnerId: number;
  baristaUserId: number;
  reason: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  cafeOwnerName: string;
  baristaName: string;
};

// Coffee Owner's own "Blacklist" (Part 18-21) — reports they personally submitted.
export type MyBaristaReport = {
  id: number;
  cafeOwnerId: number;
  baristaUserId: number;
  reason: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  baristaName: string;
  baristaProfileImageUrl: string | null;
  baristaLocation: string | null;
};

export function useMyBaristaReports() {
  return useQuery<MyBaristaReport[]>({
    queryKey: ["/api/barista/reports/mine"],
    queryFn: () => getJson("/api/barista/reports/mine"),
  });
}

export function useAdminBaristaReports(status?: string) {
  return useQuery<BaristaReport[]>({
    queryKey: ["/api/admin/barista/reports", status ?? "ALL"],
    queryFn: () => getJson(`/api/admin/barista/reports${status ? `?status=${status}` : ""}`),
  });
}

export function useResolveBaristaReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, resolutionNote }: { id: number; status: "RESOLVED" | "DISMISSED"; resolutionNote?: string }) =>
      mutate("PATCH", `/api/admin/barista/reports/${id}/resolve`, { status, resolutionNote }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/barista/reports"] }),
  });
}

// Coffee-Owner-facing detail read for ANY Barista (not just self) — same route as
// useMyBaristaProfile; the server sanitizes the payload down to the public `card`
// for non-self/non-admin viewers (see GET /api/barista/profile/:userId).
export function useBaristaProfileDetail(userId: number | null) {
  return useQuery<{ card?: BaristaMarketplaceCard; user?: any; profile?: any }>({
    queryKey: ["/api/barista/profile", userId],
    queryFn: () => getJson(`/api/barista/profile/${userId}`),
    enabled: userId != null,
  });
}

export function useBaristaReviews(baristaUserId: number | null) {
  return useQuery<BaristaReview[]>({
    queryKey: [api.barista.reviews.list.path, baristaUserId],
    queryFn: () => getJson(buildUrl(api.barista.reviews.list.path, { baristaUserId: baristaUserId! })),
    enabled: baristaUserId != null,
  });
}

// ── Barista self-service ──

export function useMyBaristaProfile(userId: number | null) {
  return useQuery<{ user: any; profile: any; card: BaristaMarketplaceCard }>({
    queryKey: ["/api/barista/profile", userId],
    queryFn: () => getJson(`/api/barista/profile/${userId}`),
    enabled: userId != null,
  });
}

export function useUpdateBaristaProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      level?: BaristaLevel; bio?: string; skills?: string[]; dailyRateInCents?: number; city?: string; marketplaceVisible?: boolean;
      certifications?: string[]; experienceYears?: number | null; portfolioUrls?: string[];
      educationLevel?: string | null; languages?: string[];
    }) => mutate("PATCH", api.barista.profile.path, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/barista/profile"] });
      qc.invalidateQueries({ queryKey: [api.barista.profiles.path] });
    },
  });
}

// ── Work history ("Cafés précédents") ──

export function useCreateBaristaWorkHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { cafeName: string; role?: string; startPeriod?: string; endPeriod?: string | null; description?: string }) =>
      mutate("POST", api.barista.workHistory.create.path, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/barista/profile"] });
      qc.invalidateQueries({ queryKey: [api.barista.profiles.path] });
    },
  });
}

export function useUpdateBaristaWorkHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; cafeName?: string; role?: string; startPeriod?: string; endPeriod?: string | null; description?: string }) =>
      mutate("PATCH", buildUrl(api.barista.workHistory.update.path, { id }), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/barista/profile"] });
      qc.invalidateQueries({ queryKey: [api.barista.profiles.path] });
    },
  });
}

export function useDeleteBaristaWorkHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("DELETE", buildUrl(api.barista.workHistory.delete.path, { id })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/barista/profile"] });
      qc.invalidateQueries({ queryKey: [api.barista.profiles.path] });
    },
  });
}

export function useUpdateBaristaAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { availableDays: string[]; isAvailable?: boolean; isOnVacation: boolean; weeklyHours?: OpeningHoursMap }) =>
      mutate("PATCH", api.barista.availability.path, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/barista/profile"] });
      qc.invalidateQueries({ queryKey: [api.barista.profiles.path] });
    },
  });
}

export function useBaristaRevenue() {
  return useQuery<BaristaRevenueSummary>({
    queryKey: [api.barista.revenue.path],
    queryFn: () => getJson(api.barista.revenue.path),
  });
}

// ── Requests ──

export function useBaristaRequests() {
  return useQuery<BaristaRequest[]>({
    queryKey: [api.barista.requests.list.path],
    queryFn: () => getJson(api.barista.requests.list.path),
  });
}

export function useCreateBaristaRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { baristaUserId: number; missionType: string; message?: string; proposedRateInCents?: number | null; startDate: string; endDate?: string | null }) =>
      mutate("POST", api.barista.requests.create.path, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [api.barista.requests.list.path] }),
  });
}

export function useUpdateBaristaRequestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, cancelReason }: { id: number; status: "DISCUSSION" | "ACCEPTED" | "REJECTED" | "CANCELLED"; cancelReason?: string }) =>
      mutate("PATCH", buildUrl(api.barista.requests.updateStatus.path, { id }), { status, cancelReason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.barista.requests.list.path] });
      qc.invalidateQueries({ queryKey: [api.barista.missions.list.path] });
    },
  });
}

// ── Missions ──

export function useBaristaMissions() {
  return useQuery<BaristaMission[]>({
    queryKey: [api.barista.missions.list.path],
    queryFn: () => getJson(api.barista.missions.list.path),
  });
}

export function useUpdateBaristaMissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "ACTIVE" | "COMPLETED" | "CANCELLED" }) =>
      mutate("PATCH", buildUrl(api.barista.missions.updateStatus.path, { id }), { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.barista.missions.list.path] });
      qc.invalidateQueries({ queryKey: [api.barista.requests.list.path] });
      qc.invalidateQueries({ queryKey: [api.barista.revenue.path] });
      qc.invalidateQueries({ queryKey: [api.barista.profiles.path] });
    },
  });
}

// ── Reviews ──

export function useCreateBaristaReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { baristaUserId: number; missionId: number; rating: number; comment?: string }) =>
      mutate("POST", api.barista.reviews.create.path, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [api.barista.reviews.list.path, vars.baristaUserId] });
      qc.invalidateQueries({ queryKey: [api.barista.profiles.path] });
      qc.invalidateQueries({ queryKey: [api.barista.missions.list.path] });
    },
  });
}

export function useBaristaReviewForMission(missionId: number | null) {
  return useQuery<BaristaReview | null>({
    queryKey: ["/api/barista/reviews/mission", missionId],
    queryFn: () => getJson(`/api/barista/reviews/mission/${missionId}`),
    enabled: missionId != null,
  });
}

// ── Admin skills taxonomy ──

export function useAdminBaristaSkills() {
  return useQuery<BaristaSkill[]>({
    queryKey: ["/api/admin/barista/skills"],
    queryFn: () => getJson("/api/admin/barista/skills"),
  });
}

export function useCreateAdminBaristaSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => mutate("POST", "/api/admin/barista/skills", { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/barista/skills"] });
      qc.invalidateQueries({ queryKey: [api.barista.skills.path] });
    },
  });
}

export function useUpdateAdminBaristaSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; isActive?: boolean; isFrozen?: boolean }) =>
      mutate("PATCH", `/api/admin/barista/skills/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/barista/skills"] });
      qc.invalidateQueries({ queryKey: [api.barista.skills.path] });
    },
  });
}

export function useDeleteAdminBaristaSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("DELETE", `/api/admin/barista/skills/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/barista/skills"] });
      qc.invalidateQueries({ queryKey: [api.barista.skills.path] });
    },
  });
}

// ── Admin Niveau d'étude taxonomy — same CRUD shape as admin skills above ──

export function useAdminBaristaEducationLevels() {
  return useQuery<BaristaEducationLevel[]>({
    queryKey: ["/api/admin/barista/education-levels"],
    queryFn: () => getJson("/api/admin/barista/education-levels"),
  });
}

export function useCreateAdminBaristaEducationLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => mutate("POST", "/api/admin/barista/education-levels", { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/barista/education-levels"] });
      qc.invalidateQueries({ queryKey: ["/api/barista/education-levels"] });
    },
  });
}

export function useUpdateAdminBaristaEducationLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; isActive?: boolean; isFrozen?: boolean }) =>
      mutate("PATCH", `/api/admin/barista/education-levels/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/barista/education-levels"] });
      qc.invalidateQueries({ queryKey: ["/api/barista/education-levels"] });
    },
  });
}

export function useDeleteAdminBaristaEducationLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("DELETE", `/api/admin/barista/education-levels/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/barista/education-levels"] });
      qc.invalidateQueries({ queryKey: ["/api/barista/education-levels"] });
    },
  });
}

// ── Admin Langue taxonomy — same CRUD shape as admin skills above ──

export function useAdminBaristaLanguages() {
  return useQuery<BaristaLanguage[]>({
    queryKey: ["/api/admin/barista/languages"],
    queryFn: () => getJson("/api/admin/barista/languages"),
  });
}

export function useCreateAdminBaristaLanguage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => mutate("POST", "/api/admin/barista/languages", { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/barista/languages"] });
      qc.invalidateQueries({ queryKey: ["/api/barista/languages"] });
    },
  });
}

export function useUpdateAdminBaristaLanguage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; isActive?: boolean; isFrozen?: boolean }) =>
      mutate("PATCH", `/api/admin/barista/languages/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/barista/languages"] });
      qc.invalidateQueries({ queryKey: ["/api/barista/languages"] });
    },
  });
}

export function useDeleteAdminBaristaLanguage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("DELETE", `/api/admin/barista/languages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/barista/languages"] });
      qc.invalidateQueries({ queryKey: ["/api/barista/languages"] });
    },
  });
}

// ── Job posting system ──────────────────────────────────────────────────────
// Coffee Owner job posts + Barista-side discovery/applications/meetings. See
// shared/schema.ts baristaJobPosts for the full rationale. All mutations
// invalidate "/api/barista/jobs" broadly (query-key prefix match) so every
// list/detail view (owner's "mine", barista's "discover", applications,
// meetings) stays in sync without each needing its own bespoke invalidation.

export type BaristaJobPostInput = Partial<{
  title: string; establishment: string; locationAddress: string; openPositions: number;
  employmentTypes: string[]; experienceRequired: string; educationLevels: string[]; languages: string[];
  remuneration: string; description: string; requirements: string; expiresAt: string | null;
  publicationMode: BaristaJobPublicationMode; status: BaristaJobStatus;
}>;

function invalidateBaristaJobs(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["/api/barista/jobs"] });
  qc.invalidateQueries({ queryKey: ["/api/barista/applications/mine"] });
}

export function useCreateBaristaJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BaristaJobPostInput) => mutate<BaristaJobPost>("POST", "/api/barista/jobs", data),
    onSuccess: () => invalidateBaristaJobs(qc),
  });
}

export function useMyBaristaJobs() {
  return useQuery<BaristaJobPostWithStats[]>({
    queryKey: ["/api/barista/jobs/mine"],
    queryFn: () => getJson("/api/barista/jobs/mine"),
  });
}

export function useBaristaJobDetail(id: number | null) {
  return useQuery<{ job: BaristaJobPostWithStats | BaristaJobPost; targets?: BaristaJobTarget[]; hasApplied?: boolean }>({
    queryKey: ["/api/barista/jobs", id],
    queryFn: () => getJson(`/api/barista/jobs/${id}`),
    enabled: id != null,
  });
}

export function useUpdateBaristaJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: BaristaJobPostInput & { id: number }) =>
      mutate<BaristaJobPost>("PATCH", `/api/barista/jobs/${id}`, data),
    onSuccess: () => invalidateBaristaJobs(qc),
  });
}

// Manual targeting — called from the Coffee Owner's Fast Search ("Flash")
// component to associate the barista currently shown with a MANUAL job post.
export function useAddBaristaJobTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, baristaUserId }: { jobId: number; baristaUserId: number }) =>
      mutate<BaristaJobTarget>("POST", `/api/barista/jobs/${jobId}/targets`, { baristaUserId }),
    onSuccess: () => invalidateBaristaJobs(qc),
  });
}

export function useBaristaJobTargets(jobId: number | null) {
  return useQuery<BaristaJobTarget[]>({
    queryKey: ["/api/barista/jobs", jobId, "targets"],
    queryFn: () => getJson(`/api/barista/jobs/${jobId}/targets`),
    enabled: jobId != null,
  });
}

// ── Barista-side discovery & applications ──

export function useDiscoverBaristaJobs() {
  return useQuery<BaristaDiscoverableJob[]>({
    queryKey: ["/api/barista/jobs/discover"],
    queryFn: () => getJson("/api/barista/jobs/discover"),
  });
}

export function useMyBaristaJobApplications() {
  return useQuery<BaristaJobApplication[]>({
    queryKey: ["/api/barista/applications/mine"],
    queryFn: () => getJson("/api/barista/applications/mine"),
  });
}

export function useApplyToBaristaJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, message }: { jobId: number; message?: string }) =>
      mutate<BaristaJobApplication>("POST", `/api/barista/jobs/${jobId}/apply`, { message }),
    onSuccess: () => invalidateBaristaJobs(qc),
  });
}

// ── Coffee Owner candidate management ──

export function useBaristaJobApplicationsForJob(jobId: number | null) {
  return useQuery<BaristaJobApplication[]>({
    queryKey: ["/api/barista/jobs", jobId, "applications"],
    queryFn: () => getJson(`/api/barista/jobs/${jobId}/applications`),
    enabled: jobId != null,
  });
}

export function useUpdateBaristaJobApplicationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: BaristaJobApplicationStatus }) =>
      mutate<BaristaJobApplication>("PATCH", `/api/barista/applications/${id}/status`, { status }),
    onSuccess: () => invalidateBaristaJobs(qc),
  });
}

// ── Meetings ──

export function useProposeBaristaJobMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, scheduledAt, notes }: { applicationId: number; scheduledAt: string; notes?: string | null }) =>
      mutate<BaristaJobMeeting>("POST", `/api/barista/applications/${applicationId}/meeting`, { scheduledAt, notes }),
    onSuccess: () => invalidateBaristaJobs(qc),
  });
}

export function useUpdateBaristaJobMeetingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "CONFIRMED" | "CANCELLED" }) =>
      mutate<BaristaJobMeeting>("PATCH", `/api/barista/meetings/${id}`, { status }),
    onSuccess: () => invalidateBaristaJobs(qc),
  });
}

// ── Chat handoff — reuses the existing generic messaging system exactly like
// maintenance-page.tsx's contact() helper. No new messaging infra. ──

export async function startBaristaConversation(targetUserId: number): Promise<{ conversation: { id: number } }> {
  return mutate("POST", "/api/messages/conversations", { targetUserId, service: "BARISTA" });
}

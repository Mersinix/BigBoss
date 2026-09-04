import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Mirrors use-barista-marketplace.ts exactly, adapted to Academy semantics:
// a public course ("formation") catalog each academy manages itself, sessions
// (dates) per course, and a registration ("inscription") lifecycle instead of
// Barista's request→mission two-step. See shared/schema.ts's Barista Academy
// section for the full architecture note.

export type AcademyCourseLevel = "BEGINNER" | "ADVANCED" | "EXPERT";
export type AcademyRegistrationStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
export type AcademySessionStatus = "UPCOMING" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export type AcademyCourse = {
  id: number;
  academyUserId: number;
  title: string;
  description: string;
  level: AcademyCourseLevel;
  priceInCents: number;
  duration: string;
  hasCertification: boolean;
  category: string;
  location: string;
  trainingMode: string;
  capacity: number | null;
  imageUrl: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AcademyCourseCard = AcademyCourse & {
  academyName: string;
  academyLocation: string;
  academyProfileImageUrl: string | null;
  academyDescription: string;
  academyPhone: string | null;
  rating: number; // x10, e.g. 47 = 4.7
  reviewCount: number;
};

export type AcademyCourseSession = {
  id: number;
  courseId: number;
  academyUserId: number;
  startDate: string;
  endDate: string | null;
  capacity: number | null;
  status: AcademySessionStatus;
  createdAt: string;
  updatedAt: string;
};

export type AcademyCourseSessionWithCourse = AcademyCourseSession & {
  courseTitle: string;
  registeredCount: number;
};

export type AcademyRegistrationParticipantType = "CAFE_OWNER" | "BARISTA_MARKETPLACE";

export type AcademyRegistration = {
  id: number;
  courseId: number;
  sessionId: number | null;
  academyUserId: number;
  cafeOwnerId: number; // the registrant's user id, regardless of participantType — see shared/schema.ts
  participantType: AcademyRegistrationParticipantType;
  participantCount: number;
  participants: string[];
  priceInCents: number;
  status: AcademyRegistrationStatus;
  notes: string;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type AcademyRegistrationWithParties = AcademyRegistration & {
  cafeOwnerName: string;
  academyName: string;
  courseTitle: string;
  sessionStartDate: string | null;
  sessionEndDate: string | null;
};

export type AcademyReview = {
  id: number;
  academyUserId: number;
  academyRegistrationId: number;
  cafeId: number;
  rating: number;
  comment: string | null;
  cafeName: string;
  cafeOwnerName: string;
  createdAt: string;
};

export type AcademyRevenueSummary = {
  totalEarnedCents: number;
  completedRegistrations: number;
  currentMonthCents: number;
  currentMonthRegistrations: number;
  pendingCents: number;
  pendingRegistrations: number;
  history: { month: string; totalCents: number; registrations: number }[];
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

// ── Public /academy marketplace ──

export function useAcademyCourses(filters?: { search?: string; level?: string; certification?: string }) {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.level) params.set("level", filters.level);
  if (filters?.certification) params.set("certification", filters.certification);
  const qs = params.toString();
  return useQuery<AcademyCourseCard[]>({
    queryKey: ["/api/academy/courses", qs],
    queryFn: () => getJson(`/api/academy/courses${qs ? `?${qs}` : ""}`),
  });
}

// Single published course detail — real-data source for the Coffee Owner
// details modal (Part 6/8). Same shape as the list cards (AcademyCourseCard),
// just resolved for one id via GET /api/academy/courses/:id.
export function useAcademyCourseDetail(courseId: number | null) {
  return useQuery<AcademyCourseCard>({
    queryKey: ["/api/academy/courses", courseId],
    queryFn: () => getJson(`/api/academy/courses/${courseId}`),
    enabled: courseId != null,
  });
}

export function useAcademyCourseSessions(courseId: number | null) {
  return useQuery<AcademyCourseSession[]>({
    queryKey: ["/api/academy/courses", courseId, "sessions"],
    queryFn: () => getJson(`/api/academy/courses/${courseId}/sessions`),
    enabled: courseId != null,
  });
}

export function useAcademyReviews(academyUserId: number | null) {
  return useQuery<AcademyReview[]>({
    queryKey: ["/api/academy/reviews", academyUserId],
    queryFn: () => getJson(`/api/academy/reviews/${academyUserId}`),
    enabled: academyUserId != null,
  });
}

// ── Coffee Owner registration flow ──

export function useAcademyRegistrations() {
  return useQuery<AcademyRegistrationWithParties[]>({
    queryKey: ["/api/academy/registrations"],
    queryFn: () => getJson("/api/academy/registrations"),
  });
}

export function useCreateAcademyRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { courseId: number; sessionId?: number | null; participantCount?: number; participants?: string[]; notes?: string }) =>
      mutate("POST", "/api/academy/registrations", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/academy/registrations"] }),
  });
}

export function useUpdateAcademyRegistrationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "CONFIRMED" | "COMPLETED" | "CANCELLED" }) =>
      mutate("PATCH", `/api/academy/registrations/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/academy/registrations"] });
      qc.invalidateQueries({ queryKey: ["/api/academy/sessions"] });
      qc.invalidateQueries({ queryKey: ["/api/academy/revenue"] });
    },
  });
}

export function useAcademyReviewForRegistration(registrationId: number | null) {
  return useQuery<AcademyReview | null>({
    queryKey: ["/api/academy/reviews/registration", registrationId],
    queryFn: () => getJson(`/api/academy/reviews/registration/${registrationId}`),
    enabled: registrationId != null,
  });
}

export function useCreateAcademyReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { academyUserId: number; registrationId: number; rating: number; comment?: string }) =>
      mutate("POST", "/api/academy/reviews", data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/academy/reviews", vars.academyUserId] });
      qc.invalidateQueries({ queryKey: ["/api/academy/reviews/registration", vars.registrationId] });
      qc.invalidateQueries({ queryKey: ["/api/academy/courses"] });
      qc.invalidateQueries({ queryKey: ["/api/academy/registrations"] });
    },
  });
}

// Entity-level report ("Blacklist") — a Coffee Owner flagging an Academy
// account itself, mirrors useReportMarketingProvider/useMyMarketingReports.
export function useReportAcademy() {
  return useMutation({
    mutationFn: ({ academyUserId, reason }: { academyUserId: number; reason: string }) =>
      mutate("POST", `/api/academy/${academyUserId}/report`, { reason }),
  });
}

export type MyAcademyReport = {
  id: number;
  cafeOwnerId: number;
  academyUserId: number;
  reason: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  academyName: string;
  academyProfileImageUrl: string | null;
  academyLocation: string | null;
};

export function useMyAcademyReports() {
  return useQuery<MyAcademyReport[]>({
    queryKey: ["/api/academy/reports/mine"],
    queryFn: () => getJson("/api/academy/reports/mine"),
  });
}

// ── Academy self-service ──

export function useMyAcademyProfile(userId: number | null) {
  return useQuery<{ user: any; profile: any }>({
    queryKey: ["/api/academy/profile", userId],
    queryFn: () => getJson(`/api/academy/profile/${userId}`),
    enabled: userId != null,
  });
}

export function useUpdateAcademyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { description?: string; marketplaceVisible?: boolean }) =>
      mutate("PATCH", "/api/academy/profile", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/academy/profile"] });
      qc.invalidateQueries({ queryKey: ["/api/academy/courses"] });
    },
  });
}

export function useMyAcademyCourses() {
  return useQuery<AcademyCourse[]>({
    queryKey: ["/api/academy/my/courses"],
    queryFn: () => getJson("/api/academy/my/courses"),
  });
}

export type AcademyCourseInput = {
  title: string;
  description?: string;
  level?: AcademyCourseLevel;
  priceInCents?: number;
  duration?: string;
  hasCertification?: boolean;
  category?: string;
  location?: string;
  trainingMode?: string;
  capacity?: number | null;
  imageUrl?: string | null;
};

export function useCreateAcademyCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AcademyCourseInput) => mutate("POST", "/api/academy/courses", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/academy/my/courses"] });
      qc.invalidateQueries({ queryKey: ["/api/academy/courses"] });
    },
  });
}

export function useUpdateAcademyCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<AcademyCourseInput> & { isPublished?: boolean }) =>
      mutate("PATCH", `/api/academy/courses/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/academy/my/courses"] });
      qc.invalidateQueries({ queryKey: ["/api/academy/courses"] });
    },
  });
}

export function useDeleteAcademyCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("DELETE", `/api/academy/courses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/academy/my/courses"] });
      qc.invalidateQueries({ queryKey: ["/api/academy/courses"] });
    },
  });
}

export function useMyAcademySessions() {
  return useQuery<AcademyCourseSessionWithCourse[]>({
    queryKey: ["/api/academy/sessions"],
    queryFn: () => getJson("/api/academy/sessions"),
  });
}

export function useCreateAcademySession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { courseId: number; startDate: string; endDate?: string | null; capacity?: number | null }) =>
      mutate("POST", "/api/academy/sessions", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/academy/sessions"] });
      qc.invalidateQueries({ queryKey: ["/api/academy/courses"] });
    },
  });
}

export function useUpdateAcademySession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; startDate?: string; endDate?: string | null; capacity?: number | null; status?: AcademySessionStatus }) =>
      mutate("PATCH", `/api/academy/sessions/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/academy/sessions"] }),
  });
}

export function useDeleteAcademySession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("DELETE", `/api/academy/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/academy/sessions"] }),
  });
}

export function useAcademyRevenue() {
  return useQuery<AcademyRevenueSummary>({
    queryKey: ["/api/academy/revenue"],
    queryFn: () => getJson("/api/academy/revenue"),
  });
}

// ── Chat handoff — reuses the existing generic messaging system exactly like
// use-barista-marketplace.ts's startBaristaConversation. No new messaging infra. ──

export async function startAcademyConversation(targetUserId: number): Promise<{ conversation: { id: number } }> {
  return mutate("POST", "/api/messages/conversations", { targetUserId, service: "ACADEMY" });
}

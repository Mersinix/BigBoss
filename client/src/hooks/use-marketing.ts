import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { OpeningHoursMap } from "@shared/schema";

// Mirrors use-barista-academy.ts / use-barista-marketplace.ts exactly, adapted
// to Marketing semantics: a public provider profile (like Maintenance/Barista,
// a flat "starting price" rather than Print's catalog-of-items) and one
// marketingProjects lifecycle table covering request → quote ("devis") →
// active project → completion. Devis & Factures / Clients / Analytics are all
// derived views over useMarketingProjects() client-side — not separate models —
// matching the project's own "no duplicate financial systems" convention.

export type MarketingProjectStatus = "PENDING" | "QUOTED" | "ACCEPTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "REJECTED";

export type MarketingProfile = {
  id: number;
  userId: number;
  profileType: string;
  categories: string[];
  responseTime: string;
  startingPriceInCents: number;
  description: string;
  portfolioImages: string[]; // max 10, enforced server-side
  websiteUrl: string | null;
  weeklyHours: OpeningHoursMap | null;
  isAvailable: boolean;
  isOnVacation: boolean;
  marketplaceVisible: boolean;
  isFrozen: boolean;
  rating: number; // x10, e.g. 47 = 4.7
  reviewCount: number;
  updatedAt: string;
};

export type MarketingMarketplaceCard = MarketingProfile & {
  name: string;
  phone: string | null;
  profileImageUrl: string | null;
  location: string;
  initials: string;
  distanceKm?: number | null;
};

export type MarketingProject = {
  id: number;
  marketingUserId: number;
  cafeOwnerId: number;
  service: string;
  title: string;
  description: string;
  status: MarketingProjectStatus;
  quoteAmountInCents: number | null;
  finalAmountInCents: number | null;
  progress: number;
  startDate: string | null;
  deadline: string | null;
  isFrozen: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MarketingProjectWithParties = MarketingProject & {
  cafeOwner?: string;
  ownerPhone?: string | null;
  marketingName?: string;
};

export type MarketingCategory = { id: number; name: string; icon: string | null; isActive: boolean; isFrozen: boolean };

export type MarketingReview = {
  id: number;
  marketingUserId: number;
  marketingProjectId: number | null;
  cafeId: number;
  rating: number;
  comment: string | null;
  cafeName: string;
  cafeOwnerName: string;
  createdAt: string;
  reportedAt?: string | null;
};

export type MarketingRevenueSummary = {
  totalEarnedCents: number;
  completedProjects: number;
  currentMonthCents: number;
  currentMonthProjects: number;
  history: { month: string; totalCents: number; projects: number }[];
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

// ── Public /marketing marketplace (Coffee Owner) ──

export function useMarketingProfiles(filters?: { search?: string; category?: string; profileType?: string; location?: string }) {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.profileType) params.set("profileType", filters.profileType);
  if (filters?.location) params.set("location", filters.location);
  const qs = params.toString();
  return useQuery<MarketingMarketplaceCard[]>({
    queryKey: ["/api/marketing/profiles", qs],
    queryFn: () => getJson(`/api/marketing/profiles${qs ? `?${qs}` : ""}`),
  });
}

export function useMarketingCategories() {
  return useQuery<string[]>({
    queryKey: ["/api/marketing/categories"],
    queryFn: () => getJson("/api/marketing/categories"),
  });
}

export function useMarketingTaxonomy() {
  return useQuery<MarketingCategory[]>({
    queryKey: ["/api/marketing/taxonomy"],
    queryFn: () => getJson("/api/marketing/taxonomy"),
  });
}

export function useMarketingProfileDetail(userId: number | null) {
  return useQuery<{ card?: MarketingMarketplaceCard; user?: any; profile?: any }>({
    queryKey: ["/api/marketing/profile", userId],
    queryFn: () => getJson(`/api/marketing/profile/${userId}`),
    enabled: userId != null,
  });
}

export function useMarketingReviews(marketingUserId: number | null) {
  return useQuery<MarketingReview[]>({
    queryKey: ["/api/marketing/reviews", marketingUserId],
    queryFn: () => getJson(`/api/marketing/reviews/${marketingUserId}`),
    enabled: marketingUserId != null,
  });
}

// ── Coffee Owner request/quote flow ──

export function useMarketingProjects() {
  return useQuery<MarketingProjectWithParties[]>({
    queryKey: ["/api/marketing/projects"],
    queryFn: () => getJson("/api/marketing/projects"),
  });
}

export function useCreateMarketingProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { marketingUserId: number; service: string; title?: string; description?: string }) =>
      mutate("POST", "/api/marketing/projects", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/marketing/projects"] }),
  });
}

export function useRespondToMarketingQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accepted }: { id: number; accepted: boolean }) =>
      mutate("PATCH", `/api/marketing/projects/${id}/quote-response`, { accepted }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/marketing/projects"] }),
  });
}

export function useCancelMarketingProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("PATCH", `/api/marketing/projects/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/marketing/projects"] }),
  });
}

export function useMarketingReviewForProject(projectId: number | null) {
  return useQuery<MarketingReview | null>({
    queryKey: ["/api/marketing/reviews/project", projectId],
    queryFn: () => getJson(`/api/marketing/reviews/project/${projectId}`),
    enabled: projectId != null,
  });
}

export function useCreateMarketingReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { marketingUserId: number; projectId: number; rating: number; comment?: string }) =>
      mutate("POST", "/api/marketing/reviews", data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/marketing/reviews", vars.marketingUserId] });
      qc.invalidateQueries({ queryKey: ["/api/marketing/reviews/project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["/api/marketing/profiles"] });
      qc.invalidateQueries({ queryKey: ["/api/marketing/projects"] });
    },
  });
}

// Entity-level report ("Blacklist") — a Coffee Owner flagging a Marketing account.
export function useReportMarketingProvider() {
  return useMutation({
    mutationFn: ({ marketingUserId, reason }: { marketingUserId: number; reason: string }) =>
      mutate("POST", `/api/marketing/${marketingUserId}/report`, { reason }),
  });
}

export type MyMarketingReport = {
  id: number;
  cafeOwnerId: number;
  marketingUserId: number;
  reason: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  marketingName: string;
  marketingProfileImageUrl: string | null;
  marketingLocation: string | null;
};

export function useMyMarketingReports() {
  return useQuery<MyMarketingReport[]>({
    queryKey: ["/api/marketing/reports/mine"],
    queryFn: () => getJson("/api/marketing/reports/mine"),
  });
}

// ── Marketing provider self-service ──

export function useMyMarketingProfile(userId: number | null) {
  return useQuery<{ user: any; profile: MarketingProfile; card: MarketingMarketplaceCard }>({
    queryKey: ["/api/marketing/profile", userId],
    queryFn: () => getJson(`/api/marketing/profile/${userId}`),
    enabled: userId != null,
  });
}

export function useUpdateMarketingProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<{
      profileType: string; categories: string[]; responseTime: string; startingPriceInCents: number;
      description: string; portfolioImages: string[]; websiteUrl: string; marketplaceVisible: boolean;
    }>) => mutate("PATCH", "/api/marketing/profile", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/marketing/profile"] });
      qc.invalidateQueries({ queryKey: ["/api/marketing/profiles"] });
    },
  });
}

export function useUpdateMarketingAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { isAvailable?: boolean; isOnVacation: boolean; weeklyHours?: OpeningHoursMap }) =>
      mutate("PATCH", "/api/marketing/availability", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/marketing/profile"] });
      qc.invalidateQueries({ queryKey: ["/api/marketing/profiles"] });
    },
  });
}

export function useUpdateMarketingProjectStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: number; status?: "QUOTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
      quoteAmountInCents?: number; finalAmountInCents?: number; progress?: number; startDate?: string; deadline?: string;
    }) => mutate("PATCH", `/api/marketing/projects/${id}/status`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/marketing/projects"] });
      qc.invalidateQueries({ queryKey: ["/api/marketing/revenue"] });
    },
  });
}

export function useMarketingRevenue() {
  return useQuery<MarketingRevenueSummary>({
    queryKey: ["/api/marketing/revenue"],
    queryFn: () => getJson("/api/marketing/revenue"),
  });
}

// ── Chat handoff — reuses the existing generic messaging system, exactly like
// use-barista-academy.ts's startAcademyConversation. No new messaging infra. ──

export async function startMarketingConversation(targetUserId: number): Promise<{ conversation: { id: number } }> {
  return mutate("POST", "/api/messages/conversations", { targetUserId, service: "MARKETING" });
}

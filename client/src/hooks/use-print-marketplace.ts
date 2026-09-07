import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrintCompanyCard, PrinterProfile, PrintCatalogCard, SupplierProductReview, OpeningHoursMap } from "@shared/schema";

// Small, focused hooks for the PRINT report/blacklist feature only — the rest
// of Coffee Owner /print (catalog, categories, orders) already reads directly
// via plain useQuery calls in print-page.tsx; this mirrors that same minimal
// style rather than introducing a bigger hooks abstraction just for these two
// mutations (see use-marketing.ts's useReportMarketingProvider/
// useMyMarketingReports for the pattern this mirrors).

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

// Entity-level report ("Blacklist") — a Coffee Owner flagging a Printer account.
export function useReportPrinter() {
  return useMutation({
    mutationFn: ({ printerId, reason }: { printerId: number; reason: string }) =>
      mutate("POST", `/api/print/${printerId}/report`, { reason }),
  });
}

export type MyPrintReport = {
  id: number;
  cafeOwnerId: number;
  printerId: number;
  reason: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  printerName: string;
  printerProfileImageUrl: string | null;
  printerLocation: string | null;
};

export function useMyPrintReports() {
  return useQuery<MyPrintReport[]>({
    queryKey: ["/api/print/reports/mine"],
    queryFn: () => getJson("/api/print/reports/mine"),
  });
}

// ── Printer (company-level) profile — Espace Imprimerie's Business → Profil,
// the Coffee Owner's Service modal "Imprimerie" section, and Admin PRINT's
// company view all read this same GET /api/print/company/:userId (self/admin
// get the full row, everyone else the sanitized public `card`). ──

export type PrintCompanyDetail = { user?: any; profile?: PrinterProfile; card: PrintCompanyCard };

export function usePrintCompanyDetail(userId: number | null) {
  return useQuery<PrintCompanyDetail>({
    queryKey: ["/api/print/company", userId],
    queryFn: () => getJson(`/api/print/company/${userId}`),
    enabled: userId != null,
  });
}

export function useUpdatePrinterProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { description?: string; websiteUrl?: string | null; marketplaceVisible?: boolean; isOnVacation?: boolean; weeklyHours?: OpeningHoursMap }) =>
      mutate("PATCH", "/api/print/profile", data),
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/print/company" });
    },
  });
}

// ── Single-service detail — reuses the exact same route/cache the Coffee
// Owner's existing full-page item detail already uses (query key kept
// identical so both surfaces share one cache entry, never a duplicate fetch). ──

export function usePrintServiceDetail(id: number | null) {
  return useQuery<PrintCatalogCard>({
    // Query key kept as a string (matching print-detail-page.tsx's useParams-derived
    // key exactly) so both surfaces share one cache entry instead of double-fetching.
    queryKey: ["/api/print/marketplace", id != null ? String(id) : id],
    queryFn: () => getJson(`/api/print/marketplace/${id}`),
    enabled: id != null,
  });
}

// ── Reviews — order-based (one review per DELIVERED printOrder), mirrors
// use-marketing.ts's useMarketingReviews/useCreateMarketingReview, adapted to
// PRINT's real eligibility rule (a completed print order, not a project). ──

export function usePrintReviews(printerId: number | null) {
  return useQuery<SupplierProductReview[]>({
    queryKey: ["/api/print/reviews", printerId],
    queryFn: () => getJson(`/api/print/reviews/${printerId}`),
    enabled: printerId != null,
  });
}

export function useCreatePrintReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { printerId: number; printOrderId: number; rating: number; comment?: string }) =>
      mutate("POST", "/api/print/reviews", data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/print/reviews", variables.printerId] });
      qc.invalidateQueries({ queryKey: ["/api/print/marketplace"] });
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/print/company" });
    },
  });
}

// ── Chat handoff — reuses the existing generic messaging system exactly like
// use-barista-academy.ts's startAcademyConversation. No new messaging infra. ──

export async function startPrintConversation(targetUserId: number): Promise<{ conversation: { id: number } }> {
  return mutate("POST", "/api/messages/conversations", { targetUserId, service: "PRINT" });
}

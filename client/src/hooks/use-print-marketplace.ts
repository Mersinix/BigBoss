import { useMutation, useQuery } from "@tanstack/react-query";

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

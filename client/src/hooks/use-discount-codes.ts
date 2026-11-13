/**
 * Discount Codes — a Supplier-owned, customer-entered code mechanism, completely
 * separate from the Promotions system (see shared/schema.ts's discountCodes table
 * note and server/routes.ts's "Discount Codes" section for the full explanation).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { DiscountCode, DiscountCodeUsage, DiscountCodeValidationResult } from "@shared/schema";

const BASE = "/api/discount-codes";

async function fetchJSON(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) { const err = await res.json().catch(() => ({ message: "Error" })); throw new Error(err.message); }
  return res.json();
}

export type DiscountCodeStats = {
  active: number;
  inactive: number;
  expired: number;
  usageLimitReached: number;
  totalRedemptions: number;
  totalDiscount: number;
};

export type DiscountCodeFormInput = {
  code: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  maxUses: number | null;
  minimumOrderAmount: number | null;
  expiresAt: string | null; // ISO datetime
  isActive: boolean;
};

// ── Supplier: list / stats / usage ──────────────────────────────────────────

// `enabled` (default true) lets the Supplier Discount Codes page skip the fetch
// entirely while its own tab is hidden by Admin → System Management → Supplier →
// Codes promotionnels (same optional-enabled convention promotions-page.tsx uses
// for usePromotionSettings().globalVisible) instead of firing a request that the
// backend's requireDiscountCodesEnabled would reject with 403 anyway.
export function useDiscountCodes(enabled = true) {
  return useQuery<DiscountCode[]>({
    queryKey: [BASE],
    queryFn: () => fetchJSON(BASE),
    enabled,
  });
}

export function useDiscountCodeStats(enabled = true) {
  return useQuery<DiscountCodeStats>({
    queryKey: [`${BASE}/stats`],
    queryFn: () => fetchJSON(`${BASE}/stats`),
    enabled,
  });
}

export function useDiscountCodeUsage(id: number | null) {
  return useQuery<DiscountCodeUsage[]>({
    queryKey: [`${BASE}/${id}/usage`],
    queryFn: () => fetchJSON(`${BASE}/${id}/usage`),
    enabled: id != null,
  });
}

// ── Supplier: create / update / toggle ──────────────────────────────────────

export function useCreateDiscountCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DiscountCodeFormInput) => apiRequest("POST", BASE, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [BASE] });
      qc.invalidateQueries({ queryKey: [`${BASE}/stats`] });
    },
  });
}

export function useUpdateDiscountCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DiscountCodeFormInput> }) =>
      apiRequest("PUT", `${BASE}/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [BASE] });
      qc.invalidateQueries({ queryKey: [`${BASE}/stats`] });
    },
  });
}

export function useSetDiscountCodeActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `${BASE}/${id}/status`, { isActive }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [BASE] });
      qc.invalidateQueries({ queryKey: [`${BASE}/stats`] });
    },
  });
}

// Soft-delete (see isRemoved column comment, shared/schema.ts) — the code
// and its full redemption history are preserved server-side; this just
// removes it from the supplier's active list and makes it unredeemable.
export function useDeleteDiscountCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `${BASE}/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [BASE] });
      qc.invalidateQueries({ queryKey: [`${BASE}/stats`] });
    },
  });
}

// ── Cafe / Checkout: validate ────────────────────────────────────────────────

type ValidateItem = { supplierId: number; quantity: number; unitPrice: number };

export function useValidateDiscountCode() {
  return useMutation({
    mutationFn: ({ code, items }: { code: string; items: ValidateItem[] }) =>
      apiRequest("POST", `${BASE}/validate`, { code, items })
        .then(r => r.json()) as Promise<DiscountCodeValidationResult>,
  });
}

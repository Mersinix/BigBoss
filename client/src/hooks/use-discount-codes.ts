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

export function useDiscountCodes() {
  return useQuery<DiscountCode[]>({
    queryKey: [BASE],
    queryFn: () => fetchJSON(BASE),
  });
}

export function useDiscountCodeStats() {
  return useQuery<DiscountCodeStats>({
    queryKey: [`${BASE}/stats`],
    queryFn: () => fetchJSON(`${BASE}/stats`),
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

// ── Cafe / Checkout: validate ────────────────────────────────────────────────

type ValidateItem = { supplierId: number; quantity: number; unitPrice: number };

export function useValidateDiscountCode() {
  return useMutation({
    mutationFn: ({ code, items }: { code: string; items: ValidateItem[] }) =>
      apiRequest("POST", `${BASE}/validate`, { code, items })
        .then(r => r.json()) as Promise<DiscountCodeValidationResult>,
  });
}

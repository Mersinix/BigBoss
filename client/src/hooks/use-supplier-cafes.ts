import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export type SupplierCafe = User & {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  referred: boolean;
};

const CAFES_KEY = ["/api/supplier/cafes"];

// Cafés "associated" with the current Supplier — real CAFE_OWNER accounts, derived from
// actual orders placed with this supplier plus any explicitly added via "Add Café" (see
// server/storage.ts getSupplierCafes). Never mock data.
export function useSupplierCafes() {
  return useQuery<SupplierCafe[]>({
    queryKey: CAFES_KEY,
    queryFn: async () => {
      const res = await fetch("/api/supplier/cafes", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch cafes");
      return res.json();
    },
  });
}

export function useCreateSupplierCafe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; email: string; password: string; phone?: string | null; isWhatsapp?: boolean; profileImageUrl?: string | null }) => {
      const res = await fetch("/api/supplier/cafes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create cafe" }));
        throw new Error(err.message ?? "Failed to create cafe");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CAFES_KEY }),
  });
}

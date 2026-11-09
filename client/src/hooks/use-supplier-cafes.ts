import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User, SupplierCafeRegistration } from "@shared/schema";

export type SupplierCafe = User & {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  referred: boolean;
};

const CAFES_KEY = ["/api/supplier/cafes"];

// Cafés "associated" with the current Supplier — real CAFE_OWNER accounts, derived from
// actual orders placed with this supplier plus any approved through the registration
// workflow below (see server/storage.ts getSupplierCafes). Never mock data.
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

const REGISTRATIONS_KEY = ["/api/supplier/cafe-registrations"];

// Café registration requests submitted by the current Supplier via "Inscriptions" — not
// real accounts yet, just requests awaiting Admin review (see shared/schema.ts
// supplierCafeRegistrations). Replaces the old useCreateSupplierCafe instant-approval flow.
export function useSupplierCafeRegistrations() {
  return useQuery<SupplierCafeRegistration[]>({
    queryKey: REGISTRATIONS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/supplier/cafe-registrations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch registrations");
      return res.json();
    },
  });
}

export function useCreateSupplierCafeRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { cafeName: string; contactName: string; email: string; address?: string | null; phone?: string | null }) => {
      const res = await fetch("/api/supplier/cafe-registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create registration" }));
        throw new Error(err.message ?? "Failed to create registration");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REGISTRATIONS_KEY }),
  });
}

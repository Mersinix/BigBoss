import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AcademyBaristaRegistration } from "@shared/schema";

const REGISTRATIONS_KEY = ["/api/academy/barista-registrations"];

// Barista registration requests submitted by the current Academy via Business → Barista —
// not real accounts yet, just requests awaiting Admin review (see shared/schema.ts
// academyBaristaRegistrations). Same architecture as use-supplier-cafes.ts's
// useSupplierCafeRegistrations.
export function useAcademyBaristaRegistrations() {
  return useQuery<AcademyBaristaRegistration[]>({
    queryKey: REGISTRATIONS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/academy/barista-registrations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch registrations");
      return res.json();
    },
  });
}

export function useCreateAcademyBaristaRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { baristaName: string; contactName: string; email: string; address?: string | null; phone?: string | null }) => {
      const res = await fetch("/api/academy/barista-registrations", {
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

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Vehicles, delivery pricing config, driver reviews, and Delivery Company
// opportunities — additive to use-deliveries.ts (kept separate rather than
// growing that file further), all built on the SAME deliveries/users model
// use-deliveries.ts already reads. No duplicate delivery/driver system.

export type DeliveryVehicleType = "BICYCLE" | "MOTO" | "CAR" | "VAN" | "TRUCK" | "OTHER";
export const VEHICLE_TYPE_LABELS: Record<DeliveryVehicleType, string> = {
  BICYCLE: "Vélo", MOTO: "Moto", CAR: "Voiture", VAN: "Camionnette", TRUCK: "Camion", OTHER: "Autre",
};

export type Vehicle = {
  id: number;
  ownerType: "DELIVERY_COMPANY" | "SUPPLIER";
  ownerId: number;
  /** Who provides this vehicle — resolved server-side from ownerType/ownerId (GET/POST/PATCH
   * /api/driver/vehicle only). A vehicle is always created under the driver's own operator
   * account, so this is always the Supplier or Delivery Company the driver belongs to. */
  ownerName?: string | null;
  type: DeliveryVehicleType;
  brand: string;
  model: string;
  plateNumber: string;
  hasAirConditioning: boolean;
  isActive: boolean;
  assignedDriverId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type VehicleInput = {
  type?: DeliveryVehicleType;
  brand?: string;
  model?: string;
  plateNumber?: string;
  hasAirConditioning?: boolean;
  isActive?: boolean;
};

export type DeliveryPricingSettings = {
  // maxWeightKg/maxVolumeL/maxPackages (Delivery System V2 Phase 2) — optional, per vehicle
  // type. Undefined = no capacity constraint enforced for that dimension (see
  // server/storage.ts checkDeliveryVehicleCompatibility).
  vehiclePricing: Record<DeliveryVehicleType, { pricePerKmCents: number; minFeeCents: number; maxWeightKg?: number; maxVolumeL?: number; maxPackages?: number }>;
  defaultVehicleType: DeliveryVehicleType;
  surgeMultiplierPermille: number;
  surgeLabel: string;
  cafeOwnerSharePercent: number;
  // Delivery System V2 Phase 3 — DriverPayoutEngine config. Defaults to 100 (reproduces the
  // exact pre-Phase-3 behavior — see server/storage.ts computeDeliveryPayout doc).
  driverPayoutSharePercent: number;
  // Delivery System V2 Phase 4 — see server/storage.ts resolveWeatherPricing/
  // resolvePeakHourPricing/resolveZonePricing/computeWaitingFee for the exact semantics.
  activeWeatherCondition: "NORMAL" | "RAIN" | "HEAVY_RAIN" | "STORM" | "EXTREME";
  weatherConditionConfigs: Record<string, {
    customerMultiplierPermille?: number; driverIncentiveCents?: number;
    safetyState?: "ALLOW" | "ALLOW_WITH_WARNING" | "RESTRICT" | "SUSPEND";
    restrictedVehicleTypes?: DeliveryVehicleType[];
  }>;
  peakHourWindows: Array<{
    id: string; label: string; daysOfWeek: number[]; startTime: string; endTime: string;
    customerMultiplierPermille: number; driverIncentiveCents: number; isActive: boolean;
  }>;
  zones: Array<{
    id: string; name: string; governorateMatch: string;
    multiplierPermille?: number; minFeeOverrideCents?: number; isActive: boolean;
  }>;
  waitingFreeMinutes: number;
  waitingPricePerMinuteCents: number;
  waitingDriverCompensationPerMinuteCents: number;
  waitingMaxChargeCents: number | null;
  maxCombinedMultiplierPermille: number;
};

export type DriverReview = {
  id: number;
  driverId: number;
  deliveryId: number;
  cafeId: number;
  rating: number;
  comment: string | null;
  cafeName: string;
  cafeOwnerName: string;
  createdAt: string;
};

export type DeliveryOpportunity = {
  id: number;
  deliveryCompanyId: number;
  title: string;
  description: string;
  area: string;
  vehicleTypeRequired: DeliveryVehicleType | null;
  startAt: string | null;
  durationHours: number | null;
  compensationCents: number | null;
  status: "OPEN" | "FILLED" | "CLOSED" | "CANCELLED";
  filledByDriverId: number | null;
  filledAt: string | null;
  createdAt: string;
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

// ── Vehicles — Delivery Company / Supplier fleet ──

function vehicleOwnerPath(ownerType: "DELIVERY_COMPANY" | "SUPPLIER") {
  return ownerType === "DELIVERY_COMPANY" ? "/api/delivery-company/vehicles" : "/api/supplier/vehicles";
}

export function useVehicles(ownerType: "DELIVERY_COMPANY" | "SUPPLIER", enabled: boolean = true) {
  const path = vehicleOwnerPath(ownerType);
  return useQuery<Vehicle[]>({ queryKey: [path], queryFn: () => getJson(path), enabled });
}
export function useCreateVehicle(ownerType: "DELIVERY_COMPANY" | "SUPPLIER") {
  const path = vehicleOwnerPath(ownerType);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: VehicleInput) => mutate("POST", path, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [path] }),
  });
}
export function useUpdateVehicle(ownerType: "DELIVERY_COMPANY" | "SUPPLIER") {
  const path = vehicleOwnerPath(ownerType);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: VehicleInput & { id: number }) => mutate("PATCH", `${path}/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [path] }),
  });
}
export function useDeleteVehicle(ownerType: "DELIVERY_COMPANY" | "SUPPLIER") {
  const path = vehicleOwnerPath(ownerType);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("DELETE", `${path}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [path] }),
  });
}
export function useAssignVehicle(ownerType: "DELIVERY_COMPANY" | "SUPPLIER") {
  const path = vehicleOwnerPath(ownerType);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, driverId }: { vehicleId: number; driverId: number | null }) => mutate("PATCH", `${path}/${vehicleId}/assign`, { driverId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [path] }),
  });
}

// ── Driver's own vehicle (Espace Chauffeur → Paramètres) ──

export function useMyVehicle() {
  return useQuery<Vehicle | null>({ queryKey: ["/api/driver/vehicle"], queryFn: () => getJson("/api/driver/vehicle") });
}
export function useCreateMyVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: VehicleInput) => mutate("POST", "/api/driver/vehicle", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/driver/vehicle"] }),
  });
}
export function useUpdateMyVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: VehicleInput) => mutate("PATCH", "/api/driver/vehicle", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/driver/vehicle"] }),
  });
}

// ── Admin delivery pricing config ──

export function useDeliveryPricingSettings() {
  return useQuery<DeliveryPricingSettings>({ queryKey: ["/api/admin/delivery-pricing"], queryFn: () => getJson("/api/admin/delivery-pricing") });
}
export function useUpdateDeliveryPricingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<DeliveryPricingSettings>) => mutate("PATCH", "/api/admin/delivery-pricing", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/delivery-pricing"] }),
  });
}

// ── Delivery System V2 Phase 5A — Financial Ledger (Admin-only) ──
// See docs/bigboss-delivery-financial-ledger.md. Every entry is a CALCULATED economic fact —
// never evidence that money physically moved (no settlement/payment system exists yet).

export type FinancialLedgerEntry = {
  id: number;
  orderId: number;
  subOrderId: number;
  deliveryId: number;
  entryType: string;
  actorRole: string;
  actorUserId: number | null;
  counterpartyRole: string | null;
  counterpartyUserId: number | null;
  amountCents: number;
  currency: string;
  direction: "CREDIT" | "DEBIT";
  status: string;
  description: string | null;
  sourceEvent: string;
  sourceReference: string;
  effectiveAt: string;
  createdAt: string;
};

export type FinancialLedgerFilters = {
  deliveryId?: number; orderId?: number; subOrderId?: number;
  entryType?: string; actorRole?: string; actorUserId?: number; status?: string;
  fromDate?: string; toDate?: string; page?: number; limit?: number;
};

// Delivery System V2 Phase 5B — paginated (rule 22 of the Phase 5B task: "must be
// paginated... do not return thousands of rows in one request").
export type PaginatedLedgerResult = { entries: FinancialLedgerEntry[]; total: number; page: number; limit: number };

export function useFinancialLedgerEntries(filters: FinancialLedgerFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== "") params.set(k, String(v)); });
  const qs = params.toString();
  return useQuery<PaginatedLedgerResult>({
    queryKey: ["/api/admin/delivery-financial-ledger", filters],
    queryFn: () => getJson(`/api/admin/delivery-financial-ledger${qs ? `?${qs}` : ""}`),
  });
}

// Delivery System V2 Phase 5B — self-service financial history (own role/id only, resolved
// server-side from the session — see server/storage.ts getActorFinancialHistory doc).
export function useMyFinancialHistory(filters: Omit<FinancialLedgerFilters, "deliveryId" | "orderId" | "subOrderId" | "actorRole" | "actorUserId">) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== "") params.set(k, String(v)); });
  const qs = params.toString();
  return useQuery<PaginatedLedgerResult>({
    queryKey: ["/api/me/financial-history", filters],
    queryFn: () => getJson(`/api/me/financial-history${qs ? `?${qs}` : ""}`),
  });
}

export type DeliveryFinancialSummary = {
  deliveryId: number; status: string; payoutStatus: "PENDING" | "EARNED" | "VOID";
  deliveryFee: number | null; cafeOwnerContribution: number | null; supplierContribution: number | null;
  freeDeliveryApplied: boolean | null;
  driverPayout: number | null; companyPayout: number | null;
  weatherIncentive: number | null; peakIncentive: number | null; waitingCompensation: number | null;
  supplierSubsidy: number | null; bigBossSubsidy: number | null; budgetResult: string | null; budgetDeficit: number | null;
};

// Delivery System V2 Phase 5B — role-scoped summary for ONE delivery (server-authorized via
// the existing canUserAccessDelivery + redactDeliveryCodes — see storage.ts doc).
export function useDeliveryFinancialSummary(deliveryId: number | null) {
  return useQuery<DeliveryFinancialSummary>({
    queryKey: ["/api/deliveries", deliveryId, "financial-summary"],
    queryFn: () => getJson(`/api/deliveries/${deliveryId}/financial-summary`),
    enabled: deliveryId != null,
  });
}

// ── Delivery System V2 Phase 5C.1 — Settlement Foundation (FINANCIAL LEDGER → SETTLEMENT
// only; no payment layer exists yet — see docs/bigboss-delivery-settlement-architecture.md).
// A settlement is an OBLIGATION, not evidence of a payment — status is PENDING/APPROVED/VOID
// only, never "Paid".

export type Settlement = {
  id: number;
  deliveryId: number;
  orderId: number;
  subOrderId: number;
  actorRole: string;
  actorUserId: number;
  counterpartyRole: string | null;
  counterpartyUserId: number | null;
  amountCents: number;
  currency: string;
  status: "PENDING" | "APPROVED" | "PARTIALLY_PAID" | "PAID" | "VOID";
  budgetResultAtCalculation: string | null;
  budgetDeficitCentsAtCalculation: number | null;
  sourceReference: string;
  calculatedAt: string;
  approvedAt: string | null;
  approvedByUserId: number | null;
  voidedAt: string | null;
  createdAt: string;
};

export type SettlementItem = {
  id: number;
  settlementId: number;
  ledgerEntryId: number;
  amountCents: number;
  entryType: string;
  createdAt: string;
};

export type PaginatedSettlementResult = { settlements: Settlement[]; total: number; page: number; limit: number };

// Role-scoped: Admin sees all of a delivery's settlements; every other role sees only
// settlements where they are the actor (own payout) or counterparty (own driver's payout) —
// server-enforced in storage.getDeliverySettlements, never trust this on the client alone.
export function useDeliverySettlements(deliveryId: number | null) {
  return useQuery<Settlement[]>({
    queryKey: ["/api/deliveries", deliveryId, "settlements"],
    queryFn: () => getJson(`/api/deliveries/${deliveryId}/settlements`),
    enabled: deliveryId != null,
  });
}

export function useMySettlementHistory(filters: { status?: string; page?: number; limit?: number }) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== "") params.set(k, String(v)); });
  const qs = params.toString();
  return useQuery<PaginatedSettlementResult>({
    queryKey: ["/api/me/settlement-history", filters],
    queryFn: () => getJson(`/api/me/settlement-history${qs ? `?${qs}` : ""}`),
  });
}

export type SettlementFilters = {
  deliveryId?: number; orderId?: number; actorRole?: string; actorUserId?: number; status?: string;
  page?: number; limit?: number;
};

export function useAdminSettlements(filters: SettlementFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== "") params.set(k, String(v)); });
  const qs = params.toString();
  return useQuery<PaginatedSettlementResult>({
    queryKey: ["/api/admin/settlements", filters],
    queryFn: () => getJson(`/api/admin/settlements${qs ? `?${qs}` : ""}`),
  });
}

export function useSettlementItems(settlementId: number | null) {
  return useQuery<SettlementItem[]>({
    queryKey: ["/api/admin/settlements", settlementId, "items"],
    queryFn: () => getJson(`/api/admin/settlements/${settlementId}/items`),
    enabled: settlementId != null,
  });
}

export function useApproveSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("POST", `/api/admin/settlements/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/settlements"] }),
  });
}

export function useVoidSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("POST", `/api/admin/settlements/${id}/void`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/settlements"] }),
  });
}

// ── Delivery System V2 Phase 5C.2 — Payment Layer, COD, Refunds, Adjustments, Financial
// Summary. SETTLEMENT → PAYMENT step + satellites. Internal record-keeping only — no
// external payment provider. See docs/bigboss-delivery-financial-strategy.md.

export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD" | "WALLET" | "OTHER";
export type Payment = {
  id: number;
  settlementId: number;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  provider: string | null;
  providerReference: string | null;
  status: "INITIATED" | "PENDING" | "CONFIRMED" | "FAILED" | "REVERSED";
  initiatedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  createdByUserId: number;
  createdAt: string;
};
export type PaginatedPaymentResult = { payments: Payment[]; total: number; page: number; limit: number };

export function useAdminPayments(filters: { settlementId?: number; status?: string; method?: string; page?: number; limit?: number }) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== "") params.set(k, String(v)); });
  const qs = params.toString();
  return useQuery<PaginatedPaymentResult>({
    queryKey: ["/api/admin/payments", filters],
    queryFn: () => getJson(`/api/admin/payments${qs ? `?${qs}` : ""}`),
  });
}
export function useSettlementPayments(settlementId: number | null) {
  return useQuery<Payment[]>({
    queryKey: ["/api/admin/settlements", settlementId, "payments"],
    queryFn: () => getJson(`/api/admin/settlements/${settlementId}/payments`),
    enabled: settlementId != null,
  });
}
export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ settlementId, ...data }: { settlementId: number; amountCents: number; method: PaymentMethod; provider?: string | null; providerReference?: string | null; idempotencyKey: string }) =>
      mutate("POST", `/api/admin/settlements/${settlementId}/payments`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/payments"] }); qc.invalidateQueries({ queryKey: ["/api/admin/settlements"] }); },
  });
}
export function useConfirmPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("POST", `/api/admin/payments/${id}/confirm`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/payments"] }); qc.invalidateQueries({ queryKey: ["/api/admin/settlements"] }); },
  });
}
export function useFailPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("POST", `/api/admin/payments/${id}/fail`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/payments"] }),
  });
}
export function useReversePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("POST", `/api/admin/payments/${id}/reverse`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/payments"] }); qc.invalidateQueries({ queryKey: ["/api/admin/settlements"] }); },
  });
}

// ── COD Reconciliation ──

export type CodReconciliation = {
  id: number;
  deliveryId: number;
  orderId: number;
  expectedAmountCents: number;
  collectedAmountCents: number | null;
  remittedAmountCents: number | null;
  status: "EXPECTED" | "COLLECTED" | "REMITTED" | "RECONCILED" | "DISCREPANCY" | "CANCELLED";
  collectedAt: string | null;
  collectedByUserId: number | null;
  remittedAt: string | null;
  remittedByUserId: number | null;
  reconciledAt: string | null;
  reconciledByUserId: number | null;
  discrepancyCents: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
};
export type PaginatedCodResult = { reconciliations: CodReconciliation[]; total: number; page: number; limit: number };

export function useDeliveryCod(deliveryId: number | null) {
  return useQuery<CodReconciliation>({
    queryKey: ["/api/deliveries", deliveryId, "cod"],
    queryFn: () => getJson(`/api/deliveries/${deliveryId}/cod`),
    enabled: deliveryId != null,
    retry: false,
  });
}
export function useAdminCodReconciliations(filters: { status?: string; deliveryId?: number; page?: number; limit?: number }) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== "") params.set(k, String(v)); });
  const qs = params.toString();
  return useQuery<PaginatedCodResult>({
    queryKey: ["/api/admin/cod-reconciliations", filters],
    queryFn: () => getJson(`/api/admin/cod-reconciliations${qs ? `?${qs}` : ""}`),
  });
}
export function useRecordCashCollected() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deliveryId, collectedAmountCents }: { deliveryId: number; collectedAmountCents: number }) =>
      mutate("POST", `/api/deliveries/${deliveryId}/cod/collect`, { collectedAmountCents }),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["/api/deliveries", vars.deliveryId, "cod"] }),
  });
}
export function useRecordCashRemitted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deliveryId, remittedAmountCents }: { deliveryId: number; remittedAmountCents: number }) =>
      mutate("POST", `/api/deliveries/${deliveryId}/cod/remit`, { remittedAmountCents }),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["/api/deliveries", vars.deliveryId, "cod"] }),
  });
}
export function useReconcileCod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deliveryId, notes }: { deliveryId: number; notes?: string }) => mutate("POST", `/api/admin/deliveries/${deliveryId}/cod/reconcile`, { notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/cod-reconciliations"] }),
  });
}

// ── Refunds (Admin-only) ──

export type Refund = {
  id: number;
  paymentId: number | null;
  settlementId: number | null;
  amountCents: number;
  reason: string;
  status: "REQUESTED" | "CONFIRMED" | "FAILED" | "CANCELLED";
  initiatedByUserId: number;
  initiatedAt: string;
  completedAt: string | null;
  createdAt: string;
};
export type PaginatedRefundResult = { refunds: Refund[]; total: number; page: number; limit: number };

export function useAdminRefunds(filters: { paymentId?: number; settlementId?: number; status?: string; page?: number; limit?: number }) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== "") params.set(k, String(v)); });
  const qs = params.toString();
  return useQuery<PaginatedRefundResult>({
    queryKey: ["/api/admin/refunds", filters],
    queryFn: () => getJson(`/api/admin/refunds${qs ? `?${qs}` : ""}`),
  });
}
export function useRequestRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { paymentId?: number | null; settlementId?: number | null; amountCents: number; reason: string }) => mutate("POST", "/api/admin/refunds", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/refunds"] }),
  });
}
export function useConfirmRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("POST", `/api/admin/refunds/${id}/confirm`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/refunds"] }),
  });
}
export function useFailRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("POST", `/api/admin/refunds/${id}/fail`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/refunds"] }),
  });
}
export function useCancelRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("POST", `/api/admin/refunds/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/refunds"] }),
  });
}

// ── Adjustments (Admin-only) ──

export type Adjustment = {
  id: number;
  ledgerEntryId: number | null;
  settlementId: number | null;
  amountCents: number;
  direction: "CREDIT" | "DEBIT";
  reason: string;
  createdByUserId: number;
  createdAt: string;
};
export type PaginatedAdjustmentResult = { adjustments: Adjustment[]; total: number; page: number; limit: number };

export function useAdminAdjustments(filters: { ledgerEntryId?: number; settlementId?: number; page?: number; limit?: number }) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)); });
  const qs = params.toString();
  return useQuery<PaginatedAdjustmentResult>({
    queryKey: ["/api/admin/adjustments", filters],
    queryFn: () => getJson(`/api/admin/adjustments${qs ? `?${qs}` : ""}`),
  });
}
export function useCreateAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { ledgerEntryId?: number | null; settlementId?: number | null; amountCents: number; direction: "CREDIT" | "DEBIT"; reason: string }) => mutate("POST", "/api/admin/adjustments", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/adjustments"] }),
  });
}

// ── Financial Summary ──

export type AdminFinancialSummary = {
  economic: { totalDeliveryFeeCents: number; totalDriverPayoutCents: number; totalCompanyPayoutCents: number; totalSupplierContributionCents: number; totalSupplierSubsidyCents: number; totalDeficitCents: number; deliveryCount: number };
  settlement: Record<string, { count: number; amountCents: number }>;
  payment: Record<string, { count: number; amountCents: number }>;
  cod: Record<string, { count: number; expectedCents: number }>;
  refunds: { confirmedCount: number; confirmedAmountCents: number };
  adjustments: { creditAmountCents: number; debitAmountCents: number; count: number };
};
export function useAdminFinancialSummary(filters: { fromDate?: string; toDate?: string; actorUserId?: number }) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== "") params.set(k, String(v)); });
  const qs = params.toString();
  return useQuery<AdminFinancialSummary>({
    queryKey: ["/api/admin/financial-summary", filters],
    queryFn: () => getJson(`/api/admin/financial-summary${qs ? `?${qs}` : ""}`),
  });
}

export type ActorFinancialSummary = { owedCents: number; approvedCents: number; paidCents: number; outstandingCents: number };
export function useMyFinancialSummary() {
  return useQuery<ActorFinancialSummary>({
    queryKey: ["/api/me/financial-summary"],
    queryFn: () => getJson("/api/me/financial-summary"),
  });
}

// ── Driver reviews ──

export function useDriverReviews(driverId: number | null) {
  return useQuery<DriverReview[]>({
    queryKey: ["/api/driver/reviews", driverId],
    queryFn: () => getJson(`/api/driver/reviews/${driverId}`),
    enabled: driverId != null,
  });
}
export function useDriverReviewForDelivery(deliveryId: number | null) {
  return useQuery<DriverReview | null>({
    queryKey: ["/api/driver/reviews/delivery", deliveryId],
    queryFn: () => getJson(`/api/driver/reviews/delivery/${deliveryId}`),
    enabled: deliveryId != null,
  });
}
export function useCreateDriverReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { driverId: number; deliveryId: number; rating: number; comment?: string }) => mutate("POST", "/api/driver/reviews", data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/driver/reviews", vars.driverId] });
      qc.invalidateQueries({ queryKey: ["/api/driver/reviews/delivery", vars.deliveryId] });
      qc.invalidateQueries({ queryKey: ["/api/deliveries"] });
    },
  });
}

// ── Delivery Company opportunities ──

export function useCompanyOpportunities() {
  return useQuery<DeliveryOpportunity[]>({ queryKey: ["/api/delivery-company/opportunities"], queryFn: () => getJson("/api/delivery-company/opportunities") });
}
export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; description?: string; area?: string; vehicleTypeRequired?: DeliveryVehicleType | null; startAt?: string | null; durationHours?: number | null; compensationCents?: number | null }) =>
      mutate("POST", "/api/delivery-company/opportunities", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/delivery-company/opportunities"] }),
  });
}
export function useCloseOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "CLOSED" | "CANCELLED" }) => mutate("PATCH", `/api/delivery-company/opportunities/${id}/close`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/delivery-company/opportunities"] }),
  });
}

// ── Driver opportunities ──

export function useDriverOpportunities() {
  return useQuery<DeliveryOpportunity[]>({ queryKey: ["/api/driver/opportunities"], queryFn: () => getJson("/api/driver/opportunities") });
}
export function useAcceptOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mutate("PATCH", `/api/driver/opportunities/${id}/accept`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/driver/opportunities"] }),
  });
}

// ── Delivery reassignment (before pickup) ──

export function useReassignDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deliveryId, driverId }: { deliveryId: number; driverId: number }) => mutate("PATCH", `/api/deliveries/${deliveryId}/reassign`, { driverId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/deliveries"] }),
  });
}

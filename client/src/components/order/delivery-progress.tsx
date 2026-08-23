import type { DeliveryStatus } from "@shared/schema";

// Shared by the Coffee Owner (order-details-modal.tsx) and Supplier
// (supplier-order-details-modal.tsx) order detail views so both render the
// exact same per-supplier delivery progress from the exact same persisted
// delivery status — one implementation, not two independently-drawn copies.

export type DeliveryProgressTheme = {
  dk: boolean;
  textPrimary: string;
  textMuted: string;
};

const STAGES = [
  { key: "PENDING", label: "En attente" },
  { key: "COLLECTED", label: "Collectée" },
  { key: "IN_TRANSIT", label: "En transit" },
  { key: "DELIVERED", label: "Livrée" },
] as const;

function stageIndex(status: DeliveryStatus): number {
  if (status === "PICKED_UP") return 1;
  if (status === "IN_TRANSIT") return 2;
  if (status === "DELIVERED") return 3;
  if (status === "CANCELLED") return -1;
  return 0; // PENDING | AVAILABLE | ACCEPTED | ASSIGNED — not yet collected
}

export function DeliveryProgress({
  status, pickupCode, dropoffCode, t,
}: {
  status: DeliveryStatus;
  /** Only ever populated for the operating supplier — hand this to the driver at pickup. */
  pickupCode?: string | null;
  /** Only ever populated for the cafe owner — hand this to the driver at drop-off. */
  dropoffCode?: string | null;
  t: DeliveryProgressTheme;
}) {
  if (status === "CANCELLED") {
    return (
      <p className={`text-[11px] mt-2 ${t.dk ? "text-red-400" : "text-red-600"}`}>Livraison annulée</p>
    );
  }

  const idx = stageIndex(status);

  return (
    <div className="mt-2 w-full">
      <div className="flex items-start">
        {STAGES.map((stage, i) => {
          const complete = idx >= i;
          const current = idx === i;
          return (
            <div key={stage.key} className="flex items-start min-w-[60px] flex-1">
              <div className="flex flex-col items-center min-w-[52px]">
                <span
                  className={`w-2.5 h-2.5 rounded-full border-2 transition-colors ${
                    complete
                      ? (current ? "bg-amber-500 border-amber-400 ring-2 ring-amber-500/25" : "bg-amber-500 border-amber-500")
                      : (t.dk ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-300")
                  }`}
                />
                <span className={`text-[9px] text-center leading-tight mt-1 ${current ? "font-bold text-amber-500" : t.textMuted}`}>
                  {stage.label}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div className={`h-0.5 flex-1 mt-[5px] min-w-[8px] ${idx > i ? "bg-amber-500" : (t.dk ? "bg-gray-700" : "bg-gray-200")}`} />
              )}
            </div>
          );
        })}
      </div>
      {pickupCode && (
        <p className={`text-[11px] mt-2 ${t.textMuted}`}>
          Code de collecte pour le chauffeur : <span className={`font-mono font-bold tracking-widest ${t.textPrimary}`}>{pickupCode}</span>
        </p>
      )}
      {dropoffCode && (
        <p className={`text-[11px] mt-2 ${t.textMuted}`}>
          Code de confirmation pour le chauffeur : <span className={`font-mono font-bold tracking-widest ${t.textPrimary}`}>{dropoffCode}</span>
        </p>
      )}
    </div>
  );
}

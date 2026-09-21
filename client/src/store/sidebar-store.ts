import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarOpenState {
  open: boolean;
  setOpen: (v: boolean) => void;
}

// Admin + Supplier's desktop sidebar open/collapsed state, lifted out of
// SidebarProvider's own internal useState. Every route wraps itself in its own
// <DashboardLayout> (see App.tsx), so wouter's <Switch> unmounts/remounts
// DashboardLayout — and therefore SidebarProvider — on every navigation; its
// internal state would reset to defaultOpen (true) each time, which is exactly
// why clicking any nav item appeared to "re-open" a collapsed sidebar. This
// store lives outside that lifecycle so the open/collapsed choice survives
// navigation (and, via persist, a real page refresh too — restoring the intent
// of the primitive's own now-unused sidebar_state cookie, appropriate for a
// pure SPA with no server to read that cookie back). SidebarProvider is handed
// this as its `open`/`onOpenChange` controlled props (see dashboard-layout.tsx)
// — its own toggleSidebar()/setOpen() already route through onOpenChange when
// supplied, so nothing else (the logo's onClick, mobile's separate openMobile
// state) needs to change.
export const useSidebarOpenStore = create<SidebarOpenState>()(
  persist(
    (set) => ({
      open: true,
      setOpen: (v) => set({ open: v }),
    }),
    { name: "bbc-sidebar-open" },
  ),
);

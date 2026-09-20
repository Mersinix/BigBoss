import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { ShoppingBag, Sun, Moon } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { Link } from "wouter";
import { useRealtime } from "@/hooks/use-realtime";
import { NotificationBellDropdown } from "@/components/notifications/notification-bell-dropdown";
import { useThemeStore } from "@/store/theme-store";
import { useAccountDarkModeSettings, type DarkModeAccount } from "@/hooks/use-account-dark-mode";

const NOTIFICATIONS_PAGE_BY_ROLE: Record<string, string> = {
  ADMIN: "/admin/notifications",
  SUPER_ADMIN: "/admin/notifications",
  SUPPLIER: "/supplier/notifications",
};

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { items } = useCart();
  useRealtime(user?.id);
  const isDark = useThemeStore((s) => s.isDark);
  const toggleDark = useThemeStore((s) => s.toggle);
  const setIsDark = useThemeStore((s) => s.setIsDark);

  // Admin + Supplier Dark Mode, gated by the same System Management → Mode sombre policy
  // already governing the 7 service accounts (see use-account-dark-mode.ts / ProfessionalAccountShell)
  // — reused as-is, not a second theme-permission system. accountKey is null for every other role
  // (e.g. Coffee Owner, which never uses this layout's header for theming — it has its own
  // independent toggle elsewhere and is untouched by this policy).
  const accountKey: DarkModeAccount | null =
    user?.role === "SUPPLIER" ? "SUPPLIER" : (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") ? "ADMIN" : null;
  const { settings: darkModeSettings } = useAccountDarkModeSettings();
  const themeMode = accountKey ? (darkModeSettings[accountKey] ?? "BOTH") : "BOTH";
  const toggleAllowed = themeMode === "BOTH";
  // Admin's forced mode always wins; the account's own stored preference (isDark) only applies
  // under BOTH — identical rule to ProfessionalAccountShell's effectiveDark.
  const effectiveDark = themeMode === "DARK_ONLY" ? true : themeMode === "LIGHT_ONLY" ? false : isDark;

  // Scoped strictly to Admin/Supplier sessions: this activates the real Tailwind `dark:` variant
  // (and every shadcn component already built on its CSS-variable tokens — Card, Button, Input,
  // Dialog, Badge, etc., see index.css's own `.dark` block) for as long as one of these two roles
  // is viewing this layout, and is removed the instant that's no longer true (role change,
  // navigation away, unmount) — mirrors ProfessionalAccountShell's identical mount-scoped `.dark`
  // toggle exactly, so it can never leak into Coffee Owner's own session, which relies on its own
  // separate isDark-ternary styling and never expects a global `.dark` class. useThemeStore is
  // reused as-is (not a new store) so the several shared components Admin/Supplier already render
  // (SupplierOrderDetailsModal, DeliveryDetails, the financial modals) — which already read this
  // exact store — stay in sync automatically.
  useEffect(() => {
    if (!accountKey) return;
    document.documentElement.classList.toggle("dark", effectiveDark);
    return () => { document.documentElement.classList.remove("dark"); };
  }, [accountKey, effectiveDark]);

  // Several shared modals used inside Admin/Supplier (SupplierOrderDetailsModal,
  // DeliveryDetails, the financial modals, self-preview provider modals, etc.) read
  // useThemeStore's `isDark` directly via the ternary/ t.dk pattern rather than the `dark:`
  // variant — mirroring effectiveDark back into that same store keeps them correct under a
  // forced DARK_ONLY/LIGHT_ONLY policy too, not just the raw unforced preference. Identical
  // bridge to ProfessionalAccountShell's own (there mirroring INTO this store from its
  // separate account store; here effectiveDark is already derived FROM this store, so this
  // is a safe idempotent no-op under BOTH and a one-way correction under a forced mode).
  useEffect(() => {
    if (!accountKey) return;
    setIsDark(effectiveDark);
  }, [accountKey, effectiveDark, setIsDark]);

  if (!user) return <>{children}</>;

  const cartItemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background/50">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
          {/* Subtle background decoration */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl -z-10 pointer-events-none transform translate-x-1/3 -translate-y-1/3" />
          
          <header className="flex items-center justify-between h-16 px-6 border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-40">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
            </div>
            
            <div className="flex items-center gap-4">
              <NotificationBellDropdown notificationsHref={NOTIFICATIONS_PAGE_BY_ROLE[user.role]} />
              {accountKey && toggleAllowed && (
                <button
                  onClick={() => toggleDark()}
                  aria-label="Changer de thème"
                  title={effectiveDark ? "Mode clair" : "Mode sombre"}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                  data-testid={`button-${accountKey.toLowerCase()}-theme-toggle`}
                >
                  {effectiveDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              )}
              {user.role === 'CAFE_OWNER' && (
                <Link 
                  href="/cart" 
                  className="relative p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  <ShoppingBag className="w-5 h-5" />
                  {cartItemCount > 0 && (
                    <span className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-primary rounded-full ring-2 ring-background">
                      {cartItemCount}
                    </span>
                  )}
                </Link>
              )}
            </div>
          </header>
          
        <main className="flex-1 overflow-y-auto px-6 -mt-6 pb-6 lg:px-8 lg:pb-8">      
        <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { Link } from "wouter";
import { useRealtime } from "@/hooks/use-realtime";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { items } = useCart();
  useRealtime();

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
          
          <main className="flex-1 overflow-y-auto p-6 lg:p-8">
            <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

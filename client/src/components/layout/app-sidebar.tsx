import type { ComponentType } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  Store, Package, ShoppingCart, LayoutDashboard,
  ClipboardList, Truck, Users, LogOut, Coffee,
  ShieldCheck, DollarSign, FileText, BarChart2,
  Bell, TrendingUp, Star, MessageCircle, Settings,
  Folder, Warehouse, ClipboardCheck, RotateCcw,
  MapPin, Wallet, Tag, Ticket, HelpCircle,
  Printer, Megaphone, GraduationCap, Image, Briefcase,
  BookOpen, UserCheck, Sliders
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavGroup = {
  label: string;
  items: { title: string; url: string; icon: ComponentType<{ className?: string }> }[];
};

function NavLink({ item }: { item: { title: string; url: string; icon: ComponentType<{ className?: string }> } }) {
  const [location] = useLocation();
  const search = useSearch();
  const fullPath = `${location}${search}`;
  const isActive = item.url.includes("?")
    ? fullPath === item.url
    : location === item.url && !search.includes("section=category-requests") && !search.includes("section=supplier-cats");
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        className={`rounded-lg transition-all duration-150 py-4 ${
          isActive
            ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/70"
        }`}
      >
        <Link href={item.url} className="flex items-center gap-3">
          <item.icon className="w-4 h-4" />
          <span className="font-medium text-sm">{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const getNavGroups = (): NavGroup[] => {
    if (isAdmin) {
      return [
        {
          label: "MAIN",
          items: [
            { title: "Dashboard", url: "/", icon: LayoutDashboard },
            { title: "Categories", url: "/admin/categories", icon: Folder },
            { title: "Products", url: "/admin/products", icon: Package },
            { title: "Orders", url: "/orders", icon: ClipboardList },
           
          ],
        },
        {
          label: "USERS & PERMISSIONS",
          items: [
            { title: "Users", url: "/admin/users", icon: Users },
            { title: "Suppliers", url: "/admin/suppliers", icon: Store },
            { title: "Roles & Permissions", url: "/admin/roles", icon: ShieldCheck },
          ],
        },
        {
          label: "MANAGEMENT",
          items: [
            { title: "Delivery", url: "/admin/delivery", icon: Truck },
            { title: "Payments", url: "/admin/payments", icon: DollarSign },
            { title: "Invoices", url: "/admin/invoices", icon: FileText },
            { title: "System Management", url: "/admin/system-management", icon: Sliders },
          ],
        },
        {
          label: "ACCOUNT",
          items: [
            { title: "Analytics", url: "/admin/analytics", icon: BarChart2 },
            { title: "Notifications", url: "/admin/notifications", icon: Bell },
            { title: "Earnings", url: "/admin/earnings", icon: TrendingUp },
          ],
        },
      ];
    }

    if (user.role === "CAFE_OWNER") {
      return [
        {
          label: "MAIN",
          items: [
            { title: "Dashboard", url: "/", icon: LayoutDashboard },
          ],
        },
        {
          label: "MARKETPLACE",
          items: [
            { title: "Browse Products", url: "/products", icon: Store },
            { title: "Cart", url: "/cart", icon: ShoppingCart },
            { title: "Suppliers", url: "/cafe/suppliers", icon: Package },
          ],
        },
        {
          label: "ORDERS",
          items: [
            { title: "My Orders", url: "/cafe/orders", icon: ClipboardList },
          ],
        },
        {
          label: "ENGAGEMENT",
          items: [
            { title: "Favorites", url: "/cafe/favorites", icon: Star },
            { title: "Messages", url: "/cafe/messages", icon: MessageCircle },
          ],
        },
        {
          label: "INSIGHTS",
          items: [
            { title: "Analytics", url: "/cafe/analytics", icon: BarChart2 },
          ],
        },
        {
          label: "ACCOUNT",
          items: [
            { title: "Settings", url: "/cafe/settings", icon: Settings },
          ],
        },
      ];
    }

    if (user.role === "SUPPLIER") {
      return [
        {
          label: "MAIN",
          items: [
            { title: "Dashboard", url: "/", icon: LayoutDashboard },
            { title: "Categories", url: "/supplier/categories", icon: Folder },
            { title: "Products", url: "/supplier/products", icon: Package },
            { title: "Inventory", url: "/supplier/inventory", icon: Warehouse },
          ],
        },
        {
          label: "ORDERS",
          items: [
            { title: "Orders", url: "/orders", icon: ClipboardList },
            { title: "Order Requests", url: "/supplier/order-requests", icon: ClipboardCheck },
            { title: "Returns", url: "/supplier/returns", icon: RotateCcw },
          ],
        },
        {
          label: "DELIVERY",
          items: [
            { title: "Drivers", url: "/supplier/drivers", icon: Truck },
            { title: "Delivery Status", url: "/supplier/delivery-status", icon: MapPin },
          ],
        },
        {
          label: "FINANCE",
          items: [
            { title: "Analytics", url: "/supplier/analytics", icon: BarChart2 },
            { title: "Payouts", url: "/supplier/payouts", icon: Wallet },
            { title: "Invoices", url: "/supplier/invoices", icon: FileText },
          ],
        },
        {
          label: "CUSTOMERS",
          items: [
            { title: "Cafes", url: "/supplier/cafes", icon: Coffee },
            { title: "Reviews", url: "/supplier/reviews", icon: Star },
          ],
        },
        {
          label: "MARKETING",
          items: [
            { title: "Notifications", url: "/supplier/notifications", icon: Bell },
            { title: "Promotions", url: "/supplier/promotions", icon: Tag },
            { title: "Discount Codes", url: "/supplier/discount-codes", icon: Ticket },
          ],
        },
        {
          label: "ACCOUNT",
          items: [
            { title: "Settings", url: "/supplier/settings", icon: Settings },
          ],
        },
        {
          label: "SUPPORT",
          items: [
            { title: "Help Center", url: "/supplier/help", icon: HelpCircle },
          ],
        },
      ];
    }

    if (user.role === "DELIVERY_COMPANY" || user.role === "DRIVER") {
      return [
        {
          label: "MAIN",
          items: [
            { title: "Dashboard", url: "/", icon: LayoutDashboard },
            { title: "Active Deliveries", url: "/orders", icon: Truck },
          ],
        },
      ];
    }

    if (user.role === "PRINTER") {
      return [
        {
          label: "MAIN",
          items: [
            { title: "Dashboard", url: "/", icon: LayoutDashboard },
          ],
        },
        {
          label: "BUSINESS",
          items: [
            { title: "Services", url: "/printer/services", icon: Printer },
            { title: "Commandes", url: "/printer/orders", icon: ClipboardList },
            { title: "Catalogue", url: "/printer/catalog", icon: Package },
          ],
        },
        {
          label: "FINANCE",
          items: [
            { title: "Facturation", url: "/printer/invoices", icon: FileText },
            { title: "Analytics", url: "/printer/analytics", icon: BarChart2 },
          ],
        },
        {
          label: "ACCOUNT",
          items: [
            { title: "Settings", url: "/printer/settings", icon: Settings },
          ],
        },
      ];
    }

    if (user.role === "MARKETING") {
      return [
        {
          label: "MAIN",
          items: [
            { title: "Dashboard", url: "/", icon: LayoutDashboard },
          ],
        },
        {
          label: "BUSINESS",
          items: [
            { title: "Services", url: "/marketing-panel/services", icon: Megaphone },
            { title: "Projets", url: "/marketing-panel/projects", icon: Briefcase },
            { title: "Clients", url: "/marketing-panel/clients", icon: Users },
          ],
        },
        {
          label: "FINANCE",
          items: [
            { title: "Devis & Factures", url: "/marketing-panel/invoices", icon: FileText },
            { title: "Analytics", url: "/marketing-panel/analytics", icon: BarChart2 },
          ],
        },
        {
          label: "ACCOUNT",
          items: [
            { title: "Settings", url: "/marketing-panel/settings", icon: Settings },
          ],
        },
      ];
    }

    if (user.role === "BARISTA_ACADEMY") {
      return [
        {
          label: "MAIN",
          items: [
            { title: "Dashboard", url: "/", icon: LayoutDashboard },
          ],
        },
        {
          label: "ACADÉMIE",
          items: [
            { title: "Formations", url: "/barista-academy/courses", icon: BookOpen },
            { title: "Étudiants", url: "/barista-academy/students", icon: Users },
            { title: "Calendrier", url: "/barista-academy/schedule", icon: ClipboardList },
          ],
        },
        {
          label: "FINANCE",
          items: [
            { title: "Revenus", url: "/barista-academy/revenue", icon: DollarSign },
            { title: "Analytics", url: "/barista-academy/analytics", icon: BarChart2 },
          ],
        },
        {
          label: "ACCOUNT",
          items: [
            { title: "Settings", url: "/barista-academy/settings", icon: Settings },
          ],
        },
      ];
    }

    if (user.role === "BARISTA_MARKETPLACE") {
      return [
        {
          label: "MAIN",
          items: [
            { title: "Dashboard", url: "/", icon: LayoutDashboard },
          ],
        },
        {
          label: "MON PROFIL",
          items: [
            { title: "Profil public", url: "/barista-marketplace/profile", icon: UserCheck },
            { title: "Demandes", url: "/barista-marketplace/requests", icon: Briefcase },
            { title: "Missions", url: "/barista-marketplace/missions", icon: ClipboardList },
          ],
        },
        {
          label: "FINANCE",
          items: [
            { title: "Revenus", url: "/barista-marketplace/revenue", icon: DollarSign },
          ],
        },
        {
          label: "ACCOUNT",
          items: [
            { title: "Settings", url: "/barista-marketplace/settings", icon: Settings },
          ],
        },
      ];
    }

    return [];
  };

  const navGroups = getNavGroups();

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="p-4 pb-2">
        <div className="flex items-center gap-2.5 px-1 py-1">
          <div className="bg-primary/10 p-1.5 rounded-lg">
            <Coffee className="w-5 h-5 text-primary" />
          </div>
          <span className="font-bold text-base tracking-tight text-sidebar-foreground">
            BigBoss Coffee
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 pt-2 pb-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label} className="mb-1">
            <SidebarGroupLabel className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-2 mb-1">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.title} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3 px-1">
          <Avatar className="w-8 h-8 border border-sidebar-border">
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col overflow-hidden flex-1">
            <span className="font-semibold text-sm truncate text-sidebar-foreground">{user.name}</span>
            <span className="text-xs text-muted-foreground truncate">
              {user.role.replace(/_/g, " ")}
            </span>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="rounded-lg text-muted-foreground py-4"
            >
              <button onClick={() => logout()} className="w-full flex items-center gap-3">
                <LogOut className="w-4 h-4" />
                <span className="font-medium text-sm">Sign Out</span>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

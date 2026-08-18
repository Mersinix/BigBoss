import type { ComponentType } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useMessagingSettings } from "@/hooks/use-messaging-settings";
import {
  Store, Package, ShoppingCart, LayoutDashboard,
  ClipboardList, Truck, Users, LogOut, Coffee,
  ShieldCheck, DollarSign, FileText, BarChart2,
  Bell, TrendingUp, Star, MessageCircle, Settings,
  Folder, Warehouse, ClipboardCheck, RotateCcw,
  MapPin, Wallet, Tag, Ticket, HelpCircle,
  Printer, Megaphone, GraduationCap, Image, Briefcase,
   BookOpen, UserCheck, Sliders, Target, Wrench
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

type NavItem = { title: string; url: string; icon: ComponentType<{ className?: string }> };
type NavGroup = {
  label: string;
  items: NavItem[];
};

function NavLink({ item, badge }: { item: NavItem; badge?: number }) {
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
          <span className="font-medium text-sm flex-1">{item.title}</span>
          {badge != null && badge > 0 && (
            <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

const MESSAGES_URLS = new Set(["/admin/messages", "/cafe/messages", "/supplier/messages", "/delivery/messages"]);

export function AppSidebar() {
  const { user, logout } = useAuth();
  const isAdmin = !!user && (user.role === "ADMIN" || user.role === "SUPER_ADMIN");
  const { settings: messagingSettings } = useMessagingSettings();

  const hasMessages = user && MESSAGES_URLS.has(
    user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? "/admin/messages"
    : user.role === "CAFE_OWNER" ? "/cafe/messages"
    : user.role === "SUPPLIER" ? "/supplier/messages"
    : (user.role === "DELIVERY_COMPANY" || user.role === "DRIVER") ? "/delivery/messages"
    : ""
  ) && (isAdmin || messagingSettings.globalVisible);

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    queryFn: async () => {
      const r = await fetch("/api/messages/unread-count", { credentials: "include" });
      if (!r.ok) return { count: 0 };
      return r.json();
    },
    enabled: !!hasMessages,
    refetchInterval: 60000,
  });

  const unreadCount = unreadData?.count ?? 0;

  if (!user) return null;

  const getNavGroups = (): NavGroup[] => {
    if (isAdmin) {
      return [
         {
          label: "MANAGEMENT",
          items: [
            { title: "Prospecting ⭐", url: "/admin/prospecting", icon: Target },
            { title: "System Management", url: "/admin/system-management", icon: Sliders },
            { title: "Dashboard", url: "/", icon: LayoutDashboard },
             { title: "Analytics", url: "/admin/analytics", icon: BarChart2 },
             { title: "Earnings", url: "/admin/earnings", icon: TrendingUp },
             
          ],
        },
        {
          label: "MANAGEMENT",
          items: [
           
            { title: "Notifications", url: "/admin/notifications", icon: Bell },
            { title: "Messages", url: "/admin/messages", icon: MessageCircle },
            { title: "Reviews", url: "/admin/reviews", icon: Star },            
          ],
        },
        {
          label: "SERVICES",
          items: [
            { title: "Maintenance", url: "/admin/maintenance", icon: Wrench },
            
          ],
        },
        {
          label: "USERS & PERMISSIONS",
          items: [
            { title: "Users", url: "/admin/users", icon: Users },
            { title: "Roles & Permissions", url: "/admin/roles", icon: ShieldCheck },
            { title: "Suppliers", url: "/admin/suppliers", icon: Store },
            { title: "Delivery", url: "/admin/delivery", icon: Truck },
          ],
        },
        {
          label: "MAIN",
          items: [
            { title: "Categories", url: "/admin/categories", icon: Folder },
            { title: "Products", url: "/admin/products", icon: Package },
            { title: "Stores", url: "/admin/stores", icon: Store },
            { title: "Orders", url: "/orders", icon: ClipboardList },
            { title: "Invoices", url: "/admin/invoices", icon: FileText },
            { title: "Payments", url: "/admin/payments", icon: DollarSign },
            
           
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
            { title: "Store", url: "/supplier/store", icon: Store },
            { title: "Categories", url: "/supplier/categories", icon: Folder },
            { title: "Products", url: "/supplier/products", icon: Package },
            { title: "Inventory", url: "/supplier/inventory", icon: Warehouse },
          ],
        },
        {
          label: "ORDERS",
          items: [
            { title: "Order Requests", url: "/supplier/order-requests", icon: ClipboardCheck },
            { title: "Orders", url: "/orders", icon: ClipboardList },
            { title: "Order Delivery", url: "/supplier/delivery-status", icon: MapPin },
            { title: "Returns", url: "/supplier/returns", icon: RotateCcw },
          ],
        },
         {
          label: "MARKETING",
          items: [
            { title: "Messages", url: "/supplier/messages", icon: MessageCircle },
            { title: "Notifications", url: "/supplier/notifications", icon: Bell },
            { title: "Reviews", url: "/supplier/reviews", icon: Star },
            { title: "Promotions", url: "/supplier/promotions", icon: Tag },
            { title: "Discount Codes", url: "/supplier/discount-codes", icon: Ticket },
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
            
          ],
        },
        
        {
          label: "ACCOUNT",
          items: [
            { title: "Settings", url: "/supplier/settings", icon: Settings },
             { title: "Help Center", url: "/supplier/help", icon: HelpCircle },
          ],
        },
        
      ];
    }

    if (user.role === "DELIVERY_COMPANY") {
      return [
        {
          label: "MAIN",
          items: [
            { title: "Dashboard", url: "/", icon: LayoutDashboard },
            { title: "Available Deliveries", url: "/delivery/available", icon: Package },
            { title: "My Deliveries", url: "/delivery/my-deliveries", icon: Truck },
            { title: "Drivers", url: "/delivery/drivers", icon: Users },
            { title: "Messages", url: "/delivery/messages", icon: MessageCircle },
          ],
        },
      ];
    }

    if (user.role === "DRIVER") {
      return [
        {
          label: "MAIN",
          items: [
            { title: "Dashboard", url: "/", icon: LayoutDashboard },
            { title: "My Deliveries", url: "/delivery/deliveries", icon: Truck },
            { title: "Messages", url: "/delivery/messages", icon: MessageCircle },
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
                {group.items.filter((item) => item.title !== "Messages" || isAdmin || messagingSettings.globalVisible).map((item) => (
                  <NavLink
                    key={item.title}
                    item={item}
                    badge={item.title === "Messages" ? unreadCount : undefined}
                  />
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

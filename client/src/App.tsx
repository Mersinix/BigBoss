import { Switch, Route, Redirect, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import LandingPage from "@/pages/landing-page";
import BrowseProducts from "@/pages/cafe/browse-products";
import CartPage from "@/pages/cafe/cart-page";
import SupplierDashboard from "@/pages/supplier/dashboard";
import ManageProducts from "@/pages/supplier/manage-products";
import CategoriesPage from "@/pages/supplier/categories-page";
import StorePage from "@/pages/supplier/store-page";
import StoreDetailPage from "@/pages/cafe/store-detail-page";
import InventoryPage from "@/pages/supplier/inventory-page";
import OrderRequestsPage from "@/pages/supplier/order-requests-page";
import SupplierOrdersPage from "@/pages/supplier/orders-page";
import ReturnsPage from "@/pages/supplier/returns-page";
import DeliveryStatusPage from "@/pages/supplier/delivery-status-page";
import FinanceAnalyticsPage from "@/pages/supplier/finance-analytics-page";
import SupplierEarningsPage from "@/pages/supplier/earnings-page";
import PayoutsPage from "@/pages/supplier/payouts-page";
import SupplierInvoicesPage from "@/pages/supplier/invoices-page";
import CafesPage from "@/pages/supplier/cafes-page";
import ReviewsPage from "@/pages/supplier/reviews-page";
import SupplierNotificationsPage from "@/pages/supplier/notifications-page";
import PromotionsPage from "@/pages/supplier/promotions-page";
import DiscountCodesPage from "@/pages/supplier/discount-codes-page";
import SupplierSettingsPage from "@/pages/supplier/settings-page";
import HelpCenterPage from "@/pages/supplier/help-center-page";
import OrdersPage from "@/pages/shared/orders-page";
import PrintPage from "@/pages/cafe/print/print-page";
import PrintDetailPage from "@/pages/cafe/print/print-detail-page";
import BaristaPage from "@/pages/cafe/barista/barista-page";
import MarketingPage from "@/pages/cafe/marketing/marketing-page";
import SupplierMessagesPage from "@/pages/supplier/messages-page";
import AdminMessagesPage from "@/pages/admin/messages-page";
import DeliveryMessagesPage from "@/pages/delivery/messages-page";
import DeliveryDashboard from "@/pages/delivery/dashboard";
import AvailableDeliveriesPage from "@/pages/delivery/available-deliveries-page";
import MyDeliveriesPage from "@/pages/delivery/my-deliveries-page";
import DeliveryCompanyDriversPage from "@/pages/delivery/drivers-page";
import DriverDeliveriesPage from "@/pages/delivery/driver-deliveries-page";
import SupplierMyDeliveriesPage from "@/pages/supplier/my-deliveries-page";
import SupplierDeliveryDriversPage from "@/pages/supplier/delivery-drivers-page";
import { DriverAccountShell } from "@/components/layout/driver-account-shell";
import DriverAccountPage from "@/pages/driver/account";
import DriverPlanningPage from "@/pages/driver/planning";
import DriverWalletPage from "@/pages/driver/wallet";
import DriverPaymentsPage from "@/pages/driver/payments";
import DriverOpportunitiesPage from "@/pages/driver/opportunities";
import DriverActivityPage from "@/pages/driver/activity";
import DriverRewardsPage from "@/pages/driver/rewards";
import DriverReviewsPage from "@/pages/driver/reviews";
import DriverSettingsPage from "@/pages/driver/settings";

// New role dashboards
import PrinterDashboard from "@/pages/printer/dashboard";
import PrinterServices from "@/pages/printer/services";
import PrinterOrders from "@/pages/printer/orders";
import PrinterCatalog from "@/pages/printer/catalog";
import PrinterInvoices from "@/pages/printer/invoices";
import PrinterAnalytics from "@/pages/printer/analytics";
import PrinterSettings from "@/pages/printer/settings";
import MarketingDashboard from "@/pages/marketing/dashboard";
import BaristaAcademyDashboard from "@/pages/barista-academy/dashboard";
import BaristaMarketplaceDashboard from "@/pages/barista-marketplace/dashboard";
import BaristaMarketplaceProfilePage from "@/pages/barista-marketplace/profile";
import BaristaMarketplaceRequestsPage from "@/pages/barista-marketplace/requests";
import BaristaMarketplaceMissionsPage from "@/pages/barista-marketplace/missions";
import BaristaMarketplaceRevenuePage from "@/pages/barista-marketplace/revenue";
import BaristaMarketplaceSettingsPage from "@/pages/barista-marketplace/settings";
import BaristaMarketplaceMessagesPage from "@/pages/barista-marketplace/messages";
import BaristaMarketplaceReviewsPage from "@/pages/barista-marketplace/reviews";
import { BaristaAccountShell } from "@/components/layout/barista-account-shell";
import MaintenanceDashboard from "@/pages/maintenance/dashboard";
import MaintenancePage from "@/pages/cafe/maintenance/maintenance-page";

// Admin pages
import AdminCategoriesPage from "@/pages/admin/categories-page";
import CategoryRequestsPage from "@/pages/admin/category-requests-page";
import AdminProductsPage from "@/pages/admin/products-page";
import SuppliersPage from "@/pages/admin/suppliers-page";
import AdminStoresPage from "@/pages/admin/stores-page";
import UsersPage from "@/pages/admin/users-page";
import RolesPage from "@/pages/admin/roles-page";
import DeliveryPage from "@/pages/admin/delivery-page";
import PaymentsPage from "@/pages/admin/payments-page";
import InvoicesPage from "@/pages/admin/invoices-page";
import AnalyticsPage from "@/pages/admin/analytics-page";
import NotificationsPage from "@/pages/admin/notifications-page";
import EarningsPage from "@/pages/admin/earnings-page";
import SystemManagementPage from "@/pages/admin/system-management-page";
import ProspectingPage from "@/pages/admin/prospecting-page";
import AdminReviewsPage from "@/pages/admin/reviews-page";
import AdminMaintenancePage from "@/pages/admin/maintenance-page";
import ComingSoonPage from "@/pages/coming-soon-page";

import { useAuth } from "@/hooks/use-auth";
import { useServiceStates, type ServiceKey } from "@/hooks/use-service-states";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MarketplaceLayout } from "@/components/cafe/marketplace-layout";
import { useAccountOpenStore } from "@/store/account-open-store";

// ── Protected route helpers ───────────────────────────────────────────────────

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"];
const CAFE_ROLES = ["CAFE_OWNER"];
const PROVIDER_ROLES = ["SUPPLIER", "PRINTER", "MARKETING", "BARISTA_ACADEMY", "BARISTA_MARKETPLACE", "DELIVERY_COMPANY", "MAINTENANCE"];
const ALL_PENDING_ROLES = [...PROVIDER_ROLES, "CAFE_OWNER"];

function needsApproval(user: { role: string; status: string }) {
  return ALL_PENDING_ROLES.includes(user.role) && user.status !== "approved";
}

const ProtectedRoute = ({
  component: Component,
  allowedRoles,
  requireApproved = false,
}: {
  component: any;
  allowedRoles?: string[];
  requireApproved?: boolean;
}) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
  if (!user) return <Redirect to="/" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Redirect to="/" />;
  // Pending users are redirected to the landing page (which shows the approval modal)
  if (requireApproved && needsApproval(user)) return <Redirect to="/" />;
  return <Component />;
};

// ── Cafe route redirectors — open Marketplace panels without old pages ─────────

function CafeSettingsRedirect() {
  const openWithTab = useAccountOpenStore((s) => s.openWithTab);
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const tab = searchParams.get("tab");
  useEffect(() => {
    openWithTab(tab === "orders" ? "orders" : "settings");
    navigate("/products", { replace: true } as any);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <Spinner />;
}

function CafeOrdersRedirect() {
  const openWithTab = useAccountOpenStore((s) => s.openWithTab);
  const [, navigate] = useLocation();
  useEffect(() => {
    openWithTab("orders");
    navigate("/products", { replace: true } as any);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <Spinner />;
}

function CafeMessagesRedirect() {
  const openChat = useAccountOpenStore((s) => s.openChat);
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const service = params.get("service") || undefined;
  const conversationId = Number(params.get("conversationId")) || null;
  useEffect(() => {
    openChat(service, conversationId);
    navigate("/products", { replace: true } as any);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <Spinner />;
}

function GatedServiceRoute({ service, component: Component }: { service: ServiceKey; component: any }) {
  const { states, isLoading } = useServiceStates();
  const { user, isLoading: authLoading } = useAuth();
  if (isLoading || authLoading) return <Spinner />;
  if (!user) return <Redirect to="/" />;
  const state = states[service];
  if (state === "HIDDEN") return <NotFound />;
  return <Component comingSoon={state === "COMING_SOON"} />;
}

// Requires the user to be authenticated; redirects to landing page otherwise
function RequireAuth({ component: Component }: { component: any }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
  if (!user) return <Redirect to="/" />;
  return <Component />;
}

function SmartDashboard() {
  const { user } = useAuth();
  if (user?.role === "SUPPLIER") return <SupplierDashboard />;
  if (user?.role === "PRINTER") return <PrinterDashboard />;
  if (user?.role === "MARKETING") return <MarketingDashboard />;
  if (user?.role === "BARISTA_ACADEMY") return <BaristaAcademyDashboard />;
  if (user?.role === "BARISTA_MARKETPLACE") return <BaristaMarketplaceDashboard />;
  if (user?.role === "MAINTENANCE") return <MaintenanceDashboard />;
  if (user?.role === "DELIVERY_COMPANY" || user?.role === "DRIVER") return <DeliveryDashboard />;
  return <Dashboard />;
}

// /delivery/my-deliveries and /delivery/drivers are shared routes: a Driver belongs to
// exactly one operator (Delivery Company or Supplier — see users.deliveryCompanyId /
// users.supplierId), and each operator gets its own page at the same URL rather than a
// second set of routes. Mirrors the SmartDashboard role-branch pattern above.
function MyDeliveriesRoute() {
  const { user } = useAuth();
  if (user?.role === "SUPPLIER") return <SupplierMyDeliveriesPage />;
  return <MyDeliveriesPage />;
}
function DriversRoute() {
  const { user } = useAuth();
  if (user?.role === "SUPPLIER") return <SupplierDeliveryDriversPage />;
  return <DeliveryCompanyDriversPage />;
}

// ── Home route logic ──────────────────────────────────────────────────────────

function HomeRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
  if (!user) return <LandingPage />;
  // Pending users of any role stay on the landing page (which shows the approval modal)
  if (needsApproval(user)) return <LandingPage />;
  if (user.role === "CAFE_OWNER") return <Redirect to="/products" />;
  if (user.role === "MAINTENANCE") return <MaintenanceDashboard />;
  if (user.role === "BARISTA_MARKETPLACE") return <Redirect to="/barista-marketplace" />;
  // Driver account switcher (like Barista Marketplace) replaces the generic sidebar for
  // Drivers — see components/layout/driver-account-shell.tsx.
  if (user.role === "DRIVER") return <Redirect to="/driver" />;
  return (
    <DashboardLayout>
      <SmartDashboard />
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      {/* /login and /auth both redirect to landing page */}
      <Route path="/login">{() => <Redirect to="/" />}</Route>
      <Route path="/auth">{() => <Redirect to="/" />}</Route>

      <Route path="/" component={HomeRoute} />

      {/* ── Cafe Owner routes (MarketplaceLayout, no sidebar) ── */}
      <Route path="/products">
        {() => (
          <MarketplaceLayout>
            <RequireAuth component={BrowseProducts} />
          </MarketplaceLayout>
        )}
      </Route>

      <Route path="/products/:productId">{() => <Redirect to="/products" />}</Route>

      <Route path="/stores/:storeId">
        {() => (
          <MarketplaceLayout>
            <RequireAuth component={StoreDetailPage} />
          </MarketplaceLayout>
        )}
      </Route>

      <Route path="/cart">
        {() => (
          <MarketplaceLayout>
            <ProtectedRoute component={CartPage} allowedRoles={CAFE_ROLES} />
          </MarketplaceLayout>
        )}
      </Route>

      {/* ── Supplier routes ── */}
      <Route path="/supplier/products">
        {() => (<DashboardLayout><ProtectedRoute component={ManageProducts} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/categories">
        {() => (<DashboardLayout><ProtectedRoute component={CategoriesPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/store">
        {() => (<DashboardLayout><ProtectedRoute component={StorePage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/inventory">
        {() => (<DashboardLayout><ProtectedRoute component={InventoryPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/order-requests">
        {() => (<DashboardLayout><ProtectedRoute component={OrderRequestsPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/orders">
        {() => (<DashboardLayout><ProtectedRoute component={SupplierOrdersPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/returns">
        {() => (<DashboardLayout><ProtectedRoute component={ReturnsPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/delivery-status">
        {() => (<DashboardLayout><ProtectedRoute component={DeliveryStatusPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/analytics">
        {() => (<DashboardLayout><ProtectedRoute component={FinanceAnalyticsPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/earnings">
        {() => (<DashboardLayout><ProtectedRoute component={SupplierEarningsPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/payouts">
        {() => (<DashboardLayout><ProtectedRoute component={PayoutsPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/invoices">
        {() => (<DashboardLayout><ProtectedRoute component={SupplierInvoicesPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/cafes">
        {() => (<DashboardLayout><ProtectedRoute component={CafesPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/reviews">
        {() => (<DashboardLayout><ProtectedRoute component={ReviewsPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/notifications">
        {() => (<DashboardLayout><ProtectedRoute component={SupplierNotificationsPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/promotions">
        {() => (<DashboardLayout><ProtectedRoute component={PromotionsPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/discount-codes">
        {() => (<DashboardLayout><ProtectedRoute component={DiscountCodesPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/settings">
        {() => (<DashboardLayout><ProtectedRoute component={SupplierSettingsPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/help">
        {() => (<DashboardLayout><ProtectedRoute component={HelpCenterPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/messages">
        {() => (<DashboardLayout><ProtectedRoute component={SupplierMessagesPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>

      {/* ── Printer routes ── */}
      <Route path="/printer/services">
        {() => (<DashboardLayout><ProtectedRoute component={PrinterServices} allowedRoles={["PRINTER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/printer/orders">
        {() => (<DashboardLayout><ProtectedRoute component={PrinterOrders} allowedRoles={["PRINTER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/printer/catalog">
        {() => (<DashboardLayout><ProtectedRoute component={PrinterCatalog} allowedRoles={["PRINTER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/printer/invoices">
        {() => (<DashboardLayout><ProtectedRoute component={PrinterInvoices} allowedRoles={["PRINTER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/printer/analytics">
        {() => (<DashboardLayout><ProtectedRoute component={PrinterAnalytics} allowedRoles={["PRINTER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/printer/settings">
        {() => (<DashboardLayout><ProtectedRoute component={PrinterSettings} allowedRoles={["PRINTER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/printer">
        {() => (<DashboardLayout><ProtectedRoute component={PrinterDashboard} allowedRoles={["PRINTER"]} requireApproved /></DashboardLayout>)}
      </Route>

      {/* ── Marketing Panel routes ── */}
      <Route path="/marketing-panel/:rest*">
        {() => (<DashboardLayout><ProtectedRoute component={MarketingDashboard} allowedRoles={["MARKETING"]} requireApproved /></DashboardLayout>)}
      </Route>

      {/* ── Barista Academy routes ── */}
      <Route path="/barista-academy/:rest*">
        {() => (<DashboardLayout><ProtectedRoute component={BaristaAcademyDashboard} allowedRoles={["BARISTA_ACADEMY"]} requireApproved /></DashboardLayout>)}
      </Route>

      {/* ── Barista Marketplace routes — top switcher shell instead of the sidebar, see barista-account-shell.tsx ── */}
      <Route path="/barista-marketplace">
        {() => (<BaristaAccountShell><ProtectedRoute component={BaristaMarketplaceDashboard} allowedRoles={["BARISTA_MARKETPLACE"]} requireApproved /></BaristaAccountShell>)}
      </Route>
      <Route path="/barista-marketplace/profile">
        {() => (<BaristaAccountShell><ProtectedRoute component={BaristaMarketplaceProfilePage} allowedRoles={["BARISTA_MARKETPLACE"]} requireApproved /></BaristaAccountShell>)}
      </Route>
      <Route path="/barista-marketplace/requests">
        {() => (<BaristaAccountShell><ProtectedRoute component={BaristaMarketplaceRequestsPage} allowedRoles={["BARISTA_MARKETPLACE"]} requireApproved /></BaristaAccountShell>)}
      </Route>
      <Route path="/barista-marketplace/missions">
        {() => (<BaristaAccountShell><ProtectedRoute component={BaristaMarketplaceMissionsPage} allowedRoles={["BARISTA_MARKETPLACE"]} requireApproved /></BaristaAccountShell>)}
      </Route>
      <Route path="/barista-marketplace/revenue">
        {() => (<BaristaAccountShell><ProtectedRoute component={BaristaMarketplaceRevenuePage} allowedRoles={["BARISTA_MARKETPLACE"]} requireApproved /></BaristaAccountShell>)}
      </Route>
      <Route path="/barista-marketplace/messages">
        {() => (<BaristaAccountShell><ProtectedRoute component={BaristaMarketplaceMessagesPage} allowedRoles={["BARISTA_MARKETPLACE"]} requireApproved /></BaristaAccountShell>)}
      </Route>
      <Route path="/barista-marketplace/reviews">
        {() => (<BaristaAccountShell><ProtectedRoute component={BaristaMarketplaceReviewsPage} allowedRoles={["BARISTA_MARKETPLACE"]} requireApproved /></BaristaAccountShell>)}
      </Route>
      <Route path="/barista-marketplace/settings">
        {() => (<BaristaAccountShell><ProtectedRoute component={BaristaMarketplaceSettingsPage} allowedRoles={["BARISTA_MARKETPLACE"]} requireApproved /></BaristaAccountShell>)}
      </Route>

      {/* ── Maintenance Agent routes ── */}
      <Route path="/maintenance-panel/:rest*">
        {() => (<ProtectedRoute component={MaintenanceDashboard} allowedRoles={["MAINTENANCE"]} requireApproved />)}
      </Route>

      {/* ── Service pages (publicly viewable, gated by System Management) ── */}
      <Route path="/coming-soon">
        {() => (
          <MarketplaceLayout>
            <ComingSoonPage />
          </MarketplaceLayout>
        )}
      </Route>
      <Route path="/print/:productId">
        {() => (
          <MarketplaceLayout>
            <GatedServiceRoute service="PRINTING" component={PrintDetailPage} />
          </MarketplaceLayout>
        )}
      </Route>
      <Route path="/print">
        {() => (
          <MarketplaceLayout>
            <GatedServiceRoute service="PRINTING" component={PrintPage} />
          </MarketplaceLayout>
        )}
      </Route>
      <Route path="/barista">
        {() => (
          <MarketplaceLayout>
            <GatedServiceRoute service="BARISTA" component={BaristaPage} />
          </MarketplaceLayout>
        )}
      </Route>
      <Route path="/marketing">
        {() => (
          <MarketplaceLayout>
            <GatedServiceRoute service="MARKETING" component={MarketingPage} />
          </MarketplaceLayout>
        )}
      </Route>
      <Route path="/maintenance">
        {() => (
          <MarketplaceLayout>
            <GatedServiceRoute service="MAINTENANCE" component={MaintenancePage} />
          </MarketplaceLayout>
        )}
      </Route>

      {/* ── Shared ── */}
      <Route path="/orders">
        {() => (
          <DashboardLayout>
            <ProtectedRoute component={OrdersPage} />
          </DashboardLayout>
        )}
      </Route>

      <Route path="/cafe/orders">
        {() => <CafeOrdersRedirect />}
      </Route>

      <Route path="/cafe/messages">
        {() => <CafeMessagesRedirect />}
      </Route>

      <Route path="/cafe/settings">
        {() => <CafeSettingsRedirect />}
      </Route>

      {/* ── Admin routes ── */}
      <Route path="/admin/products">
        {() => (<DashboardLayout><ProtectedRoute component={AdminProductsPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/categories">
        {() => (<DashboardLayout><ProtectedRoute component={AdminCategoriesPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/suppliers">
        {() => (<DashboardLayout><ProtectedRoute component={SuppliersPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/stores">
        {() => (<DashboardLayout><ProtectedRoute component={AdminStoresPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/users">
        {() => (<DashboardLayout><ProtectedRoute component={UsersPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/roles">
        {() => (<DashboardLayout><ProtectedRoute component={RolesPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/delivery">
        {() => (<DashboardLayout><ProtectedRoute component={DeliveryPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/payments">
        {() => (<DashboardLayout><ProtectedRoute component={PaymentsPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/invoices">
        {() => (<DashboardLayout><ProtectedRoute component={InvoicesPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/analytics">
        {() => (<DashboardLayout><ProtectedRoute component={AnalyticsPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/notifications">
        {() => (<DashboardLayout><ProtectedRoute component={NotificationsPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/earnings">
        {() => (<DashboardLayout><ProtectedRoute component={EarningsPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/category-requests">
        {() => (<DashboardLayout><ProtectedRoute component={CategoryRequestsPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/system-management">
        {() => (<DashboardLayout><ProtectedRoute component={SystemManagementPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/prospecting">
        {() => (<DashboardLayout><ProtectedRoute component={ProspectingPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/reviews">
        {() => (<DashboardLayout><ProtectedRoute component={AdminReviewsPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/maintenance">
        {() => (<DashboardLayout><ProtectedRoute component={AdminMaintenancePage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>
      <Route path="/admin/messages">
        {() => (<DashboardLayout><ProtectedRoute component={AdminMessagesPage} allowedRoles={ADMIN_ROLES} /></DashboardLayout>)}
      </Route>

      {/* ── Delivery Company routes ── */}
      <Route path="/delivery/available">
        {() => (<DashboardLayout><ProtectedRoute component={AvailableDeliveriesPage} allowedRoles={["DELIVERY_COMPANY"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/delivery/my-deliveries">
        {() => (<DashboardLayout><ProtectedRoute component={MyDeliveriesRoute} allowedRoles={["DELIVERY_COMPANY", "SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/delivery/drivers">
        {() => (<DashboardLayout><ProtectedRoute component={DriversRoute} allowedRoles={["DELIVERY_COMPANY", "SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>

      {/* ── Driver routes ── */}
      <Route path="/delivery/deliveries">
        {() => (<DashboardLayout><ProtectedRoute component={DriverDeliveriesPage} allowedRoles={["DRIVER"]} requireApproved /></DashboardLayout>)}
      </Route>

      {/* ── Shared Delivery Company / Driver routes ── */}
      <Route path="/delivery/messages">
        {() => (<DashboardLayout><ProtectedRoute component={DeliveryMessagesPage} allowedRoles={["DELIVERY_COMPANY", "DRIVER"]} requireApproved /></DashboardLayout>)}
      </Route>

      {/* ── Driver account — top switcher shell instead of the sidebar, mirrors the Barista
          Marketplace account structure (see driver-account-shell.tsx). The old
          /delivery/deliveries and /delivery/messages routes above are left registered
          unchanged for backward compatibility (and because /delivery/messages is still used
          by DELIVERY_COMPANY as-is) — Driver navigation now happens exclusively through
          these /driver/... routes instead. ── */}
      <Route path="/driver">
        {() => (<DriverAccountShell><ProtectedRoute component={DriverAccountPage} allowedRoles={["DRIVER"]} requireApproved /></DriverAccountShell>)}
      </Route>
      <Route path="/driver/planning">
        {() => (<DriverAccountShell><ProtectedRoute component={DriverPlanningPage} allowedRoles={["DRIVER"]} requireApproved /></DriverAccountShell>)}
      </Route>
      <Route path="/driver/deliveries">
        {() => (<DriverAccountShell><ProtectedRoute component={DriverDeliveriesPage} allowedRoles={["DRIVER"]} requireApproved /></DriverAccountShell>)}
      </Route>
      <Route path="/driver/wallet">
        {() => (<DriverAccountShell><ProtectedRoute component={DriverWalletPage} allowedRoles={["DRIVER"]} requireApproved /></DriverAccountShell>)}
      </Route>
      <Route path="/driver/payments">
        {() => (<DriverAccountShell><ProtectedRoute component={DriverPaymentsPage} allowedRoles={["DRIVER"]} requireApproved /></DriverAccountShell>)}
      </Route>
      <Route path="/driver/opportunities">
        {() => (<DriverAccountShell><ProtectedRoute component={DriverOpportunitiesPage} allowedRoles={["DRIVER"]} requireApproved /></DriverAccountShell>)}
      </Route>
      <Route path="/driver/activity">
        {() => (<DriverAccountShell><ProtectedRoute component={DriverActivityPage} allowedRoles={["DRIVER"]} requireApproved /></DriverAccountShell>)}
      </Route>
      <Route path="/driver/rewards">
        {() => (<DriverAccountShell><ProtectedRoute component={DriverRewardsPage} allowedRoles={["DRIVER"]} requireApproved /></DriverAccountShell>)}
      </Route>
      <Route path="/driver/messages">
        {() => (<DriverAccountShell><ProtectedRoute component={DeliveryMessagesPage} allowedRoles={["DRIVER"]} requireApproved /></DriverAccountShell>)}
      </Route>
      <Route path="/driver/reviews">
        {() => (<DriverAccountShell><ProtectedRoute component={DriverReviewsPage} allowedRoles={["DRIVER"]} requireApproved /></DriverAccountShell>)}
      </Route>
      <Route path="/driver/settings">
        {() => (<DriverAccountShell><ProtectedRoute component={DriverSettingsPage} allowedRoles={["DRIVER"]} requireApproved /></DriverAccountShell>)}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import LandingPage from "@/pages/landing-page";
import BrowseProducts from "@/pages/cafe/browse-products";
import ProductDetailPage from "@/pages/cafe/product-detail-page";
import CartPage from "@/pages/cafe/cart-page";
import SupplierDashboard from "@/pages/supplier/dashboard";
import ManageProducts from "@/pages/supplier/manage-products";
import CategoriesPage from "@/pages/supplier/categories-page";
import InventoryPage from "@/pages/supplier/inventory-page";
import OrderRequestsPage from "@/pages/supplier/order-requests-page";
import ReturnsPage from "@/pages/supplier/returns-page";
import DriversPage from "@/pages/supplier/drivers-page";
import DeliveryStatusPage from "@/pages/supplier/delivery-status-page";
import FinanceAnalyticsPage from "@/pages/supplier/finance-analytics-page";
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
import PrintPage from "@/pages/print-page";
import PrintDetailPage from "@/pages/print-detail-page";
import BaristaPage from "@/pages/barista-page";
import MarketingPage from "@/pages/marketing-page";
import MessagesPage from "@/pages/cafe/messages-page";
import CafeSettingsPage from "@/pages/cafe/settings-page";

// New role dashboards
import PrinterDashboard from "@/pages/printer/dashboard";
import MarketingDashboard from "@/pages/marketing/dashboard";
import BaristaAcademyDashboard from "@/pages/barista-academy/dashboard";
import BaristaMarketplaceDashboard from "@/pages/barista-marketplace/dashboard";

// Admin pages
import AdminCategoriesPage from "@/pages/admin/categories-page";
import CategoryRequestsPage from "@/pages/admin/category-requests-page";
import AdminProductsPage from "@/pages/admin/products-page";
import SuppliersPage from "@/pages/admin/suppliers-page";
import UsersPage from "@/pages/admin/users-page";
import RolesPage from "@/pages/admin/roles-page";
import DeliveryPage from "@/pages/admin/delivery-page";
import PaymentsPage from "@/pages/admin/payments-page";
import InvoicesPage from "@/pages/admin/invoices-page";
import AnalyticsPage from "@/pages/admin/analytics-page";
import NotificationsPage from "@/pages/admin/notifications-page";
import EarningsPage from "@/pages/admin/earnings-page";
import SystemManagementPage from "@/pages/admin/system-management-page";
import ComingSoonPage from "@/pages/coming-soon-page";

import { useAuth } from "@/hooks/use-auth";
import { useServiceStates, type ServiceKey } from "@/hooks/use-service-states";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MarketplaceLayout } from "@/components/cafe/marketplace-layout";
import { PendingApprovalScreen } from "@/components/auth/pending-approval-screen";

// ── Protected route helpers ───────────────────────────────────────────────────

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"];
const CAFE_ROLES = ["CAFE_OWNER"];
const PROVIDER_ROLES = ["SUPPLIER", "PRINTER", "MARKETING", "BARISTA_ACADEMY", "BARISTA_MARKETPLACE", "DELIVERY_COMPANY"];

function needsApproval(user: { role: string; status: string }) {
  return PROVIDER_ROLES.includes(user.role) && user.status !== "approved";
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
  if (requireApproved && needsApproval(user)) return <PendingApprovalScreen />;
  return <Component />;
};

const SERVICE_LABELS: Record<ServiceKey, string> = {
  PRINTING: "PRINT",
  MARKETING: "MARKETING",
  BARISTA: "BARISTA",
};

function GatedServiceRoute({ service, component: Component }: { service: ServiceKey; component: any }) {
  const { states, isLoading } = useServiceStates();
  if (isLoading) return <Spinner />;
  const state = states[service];
  if (state === "HIDDEN") return <NotFound />;
  if (state === "COMING_SOON") return <ComingSoonPage label={SERVICE_LABELS[service]} />;
  return <Component />;
}

function SmartDashboard() {
  const { user } = useAuth();
  if (user && needsApproval(user)) return <PendingApprovalScreen />;
  if (user?.role === "SUPPLIER") return <SupplierDashboard />;
  if (user?.role === "PRINTER") return <PrinterDashboard />;
  if (user?.role === "MARKETING") return <MarketingDashboard />;
  if (user?.role === "BARISTA_ACADEMY") return <BaristaAcademyDashboard />;
  if (user?.role === "BARISTA_MARKETPLACE") return <BaristaMarketplaceDashboard />;
  return <Dashboard />;
}

// ── Home route logic ──────────────────────────────────────────────────────────

function HomeRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
  if (!user) return <LandingPage />;
  if (user.role === "CAFE_OWNER") return <Redirect to="/products" />;
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
            <BrowseProducts />
          </MarketplaceLayout>
        )}
      </Route>

      <Route path="/products/:productId">
        {() => (
          <MarketplaceLayout>
            <ProductDetailPage />
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
      <Route path="/supplier/inventory">
        {() => (<DashboardLayout><ProtectedRoute component={InventoryPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/order-requests">
        {() => (<DashboardLayout><ProtectedRoute component={OrderRequestsPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/returns">
        {() => (<DashboardLayout><ProtectedRoute component={ReturnsPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/drivers">
        {() => (<DashboardLayout><ProtectedRoute component={DriversPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/delivery-status">
        {() => (<DashboardLayout><ProtectedRoute component={DeliveryStatusPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/analytics">
        {() => (<DashboardLayout><ProtectedRoute component={FinanceAnalyticsPage} allowedRoles={["SUPPLIER"]} requireApproved /></DashboardLayout>)}
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

      {/* ── Printer routes ── */}
      <Route path="/printer/:rest*">
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

      {/* ── Barista Marketplace routes ── */}
      <Route path="/barista-marketplace/:rest*">
        {() => (<DashboardLayout><ProtectedRoute component={BaristaMarketplaceDashboard} allowedRoles={["BARISTA_MARKETPLACE"]} requireApproved /></DashboardLayout>)}
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

      {/* ── Shared ── */}
      <Route path="/orders">
        {() => (
          <DashboardLayout>
            <ProtectedRoute component={OrdersPage} />
          </DashboardLayout>
        )}
      </Route>

      <Route path="/cafe/orders">
        {() => (
          <DashboardLayout>
            <ProtectedRoute component={OrdersPage} allowedRoles={["CAFE_OWNER"]} />
          </DashboardLayout>
        )}
      </Route>

      <Route path="/cafe/messages">
        {() => (
          <MarketplaceLayout>
            <MessagesPage />
          </MarketplaceLayout>
        )}
      </Route>

      <Route path="/cafe/settings">
        {() => (
          <MarketplaceLayout>
            <ProtectedRoute component={CafeSettingsPage} allowedRoles={CAFE_ROLES} />
          </MarketplaceLayout>
        )}
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

import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import AuthPage from "@/pages/auth-page";
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

import { useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MarketplaceLayout } from "@/components/cafe/marketplace-layout";

// ── Protected route helpers ───────────────────────────────────────────────────

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ProtectedRoute = ({ component: Component, allowedRoles }: { component: any; allowedRoles?: string[] }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
  if (!user) return <Redirect to="/auth" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Redirect to="/" />;
  return <Component />;
};

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"];
const CAFE_ROLES = ["CAFE_OWNER"];

function SmartDashboard() {
  const { user } = useAuth();
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
      {/* Auth — both /login and /auth work */}
      <Route path="/login" component={AuthPage} />
      <Route path="/auth" component={AuthPage} />

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
        {() => (<DashboardLayout><ProtectedRoute component={ManageProducts} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/categories">
        {() => (<DashboardLayout><ProtectedRoute component={CategoriesPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/inventory">
        {() => (<DashboardLayout><ProtectedRoute component={InventoryPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/order-requests">
        {() => (<DashboardLayout><ProtectedRoute component={OrderRequestsPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/returns">
        {() => (<DashboardLayout><ProtectedRoute component={ReturnsPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/drivers">
        {() => (<DashboardLayout><ProtectedRoute component={DriversPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/delivery-status">
        {() => (<DashboardLayout><ProtectedRoute component={DeliveryStatusPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/analytics">
        {() => (<DashboardLayout><ProtectedRoute component={FinanceAnalyticsPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/payouts">
        {() => (<DashboardLayout><ProtectedRoute component={PayoutsPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/invoices">
        {() => (<DashboardLayout><ProtectedRoute component={SupplierInvoicesPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/cafes">
        {() => (<DashboardLayout><ProtectedRoute component={CafesPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/reviews">
        {() => (<DashboardLayout><ProtectedRoute component={ReviewsPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/notifications">
        {() => (<DashboardLayout><ProtectedRoute component={SupplierNotificationsPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/promotions">
        {() => (<DashboardLayout><ProtectedRoute component={PromotionsPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/discount-codes">
        {() => (<DashboardLayout><ProtectedRoute component={DiscountCodesPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/settings">
        {() => (<DashboardLayout><ProtectedRoute component={SupplierSettingsPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>
      <Route path="/supplier/help">
        {() => (<DashboardLayout><ProtectedRoute component={HelpCenterPage} allowedRoles={["SUPPLIER"]} /></DashboardLayout>)}
      </Route>

      {/* ── Printer routes ── */}
      <Route path="/printer/:rest*">
        {() => (<DashboardLayout><ProtectedRoute component={PrinterDashboard} allowedRoles={["PRINTER"]} /></DashboardLayout>)}
      </Route>

      {/* ── Marketing Panel routes ── */}
      <Route path="/marketing-panel/:rest*">
        {() => (<DashboardLayout><ProtectedRoute component={MarketingDashboard} allowedRoles={["MARKETING"]} /></DashboardLayout>)}
      </Route>

      {/* ── Barista Academy routes ── */}
      <Route path="/barista-academy/:rest*">
        {() => (<DashboardLayout><ProtectedRoute component={BaristaAcademyDashboard} allowedRoles={["BARISTA_ACADEMY"]} /></DashboardLayout>)}
      </Route>

      {/* ── Barista Marketplace routes ── */}
      <Route path="/barista-marketplace/:rest*">
        {() => (<DashboardLayout><ProtectedRoute component={BaristaMarketplaceDashboard} allowedRoles={["BARISTA_MARKETPLACE"]} /></DashboardLayout>)}
      </Route>

      {/* ── Service pages (publicly viewable) ── */}
      <Route path="/print/:productId">
        {() => (
          <MarketplaceLayout>
            <PrintDetailPage />
          </MarketplaceLayout>
        )}
      </Route>
      <Route path="/print">
        {() => (
          <MarketplaceLayout>
            <PrintPage />
          </MarketplaceLayout>
        )}
      </Route>
      <Route path="/barista">
        {() => (
          <MarketplaceLayout>
            <BaristaPage />
          </MarketplaceLayout>
        )}
      </Route>
      <Route path="/marketing">
        {() => (
          <MarketplaceLayout>
            <MarketingPage />
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

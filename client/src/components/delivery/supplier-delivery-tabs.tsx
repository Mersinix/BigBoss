import { Link, useLocation } from "wouter";

const TABS = [
  { label: "Delivery Status", href: "/supplier/delivery-status" },
  { label: "My Deliveries", href: "/delivery/my-deliveries" },
  { label: "Drivers", href: "/delivery/drivers" },
];

/**
 * Tab switcher shared by the three Supplier delivery pages. Each tab is a real route (per the
 * existing routing conventions — /delivery/my-deliveries and /delivery/drivers already exist
 * for Delivery Company and are extended, not duplicated, for Supplier), so the active tab is
 * simply "whichever route we're on".
 */
export default function SupplierDeliveryTabs() {
  const [location] = useLocation();
  return (
    <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 w-fit">
      {TABS.map((tab) => {
        const active = location === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${active ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

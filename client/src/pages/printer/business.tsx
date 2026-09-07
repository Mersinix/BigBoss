import { Printer, ClipboardList, Package, FileText, UserCheck, Layers } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import PrinterServices from "@/pages/printer/services";
import PrinterOrders from "@/pages/printer/orders";
import PrinterCatalog from "@/pages/printer/catalog";
import PrinterInvoices from "@/pages/printer/invoices";
import PrinterProfilePage from "@/pages/printer/profile";
import PrinterCategoriesPage from "@/pages/printer/categories";

// Business tab — Services / Commandes / Catalogue / Facturation / Profil, each
// the account's own existing page component moved under one switcher (same
// mechanism as every other professional account's Business tab, see
// sub-tab-switcher.tsx). Services is now real per-service CRUD presented as
// cards (services.tsx) with its own Aperçu modal; Profil is a NEW, separate
// company-level page (profile.tsx) — description/website/visibility only,
// never touching service data. Catégories is kept as an extra tab (not in the
// task's own headline list, but nothing gets removed per this task's own
// "do not remove the category system" instruction) — it stays the same
// self-service category-mapping page it always was, unchanged.
export default function PrinterBusiness() {
  return (
    <SubTabSwitcher
      testIdPrefix="printer-business"
      activeTextClass="text-blue-600 dark:text-blue-400"
      tabs={[
        { key: "profile", label: "Profil", icon: UserCheck, content: <PrinterProfilePage /> },
        { key: "services", label: "Services", icon: Printer, content: <PrinterServices /> },
        { key: "orders", label: "Commandes", icon: ClipboardList, content: <PrinterOrders /> },
        { key: "catalog", label: "Catalogue", icon: Package, content: <PrinterCatalog /> },
        { key: "invoices", label: "Facturation", icon: FileText, content: <PrinterInvoices /> },
        { key: "categories", label: "Catégories", icon: Layers, content: <PrinterCategoriesPage /> },
      ]}
    />
  );
}

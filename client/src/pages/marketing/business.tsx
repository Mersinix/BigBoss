import { Megaphone, Briefcase, Users, FileText, UserCheck, Layers } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import MarketingServicesPage from "@/pages/marketing/services";
import MarketingProjects from "@/pages/marketing/projects";
import MarketingClients from "@/pages/marketing/clients";
import MarketingInvoices from "@/pages/marketing/invoices";
import MarketingProfilePage from "@/pages/marketing/profile";
import MarketingCategoriesPage from "@/pages/marketing/categories";

// Business tab — Services / Projets / Clients / Devis & Factures / Profil /
// Catégories, each the account's own existing page component moved under one
// switcher (same mechanism as every other professional account's Business
// tab, see sub-tab-switcher.tsx). Agency → Multiple Services split: Profil
// and Services are now two REAL, separate pages — Profil owns only
// agency-level fields (description/website/portfolio/availability/
// visibility), Services owns the per-service CRUD (category/subcategories/
// price/response time/description/image, each its own row) — no more one
// editor pretending to be both. Catégories (Categories & Subcategories:
// Complete End-to-End Integration) mirrors Espace Imprimerie → Business →
// Catégories: the agency selects which Admin-managed categories/
// subcategories it offers, gating what Services can use.
export default function MarketingBusiness() {
  return (
    <SubTabSwitcher
      testIdPrefix="marketing-business"
      activeTextClass="text-fuchsia-600 dark:text-fuchsia-400"
      tabs={[
        { key: "profile", label: "Profil", icon: UserCheck, content: <MarketingProfilePage /> },
        { key: "services", label: "Services", icon: Megaphone, content: <MarketingServicesPage /> },
        { key: "categories", label: "Catégories", icon: Layers, content: <MarketingCategoriesPage /> },
        { key: "projects", label: "Projets", icon: Briefcase, content: <MarketingProjects /> },
        { key: "clients", label: "Clients", icon: Users, content: <MarketingClients /> },
        { key: "invoices", label: "Devis & Factures", icon: FileText, content: <MarketingInvoices /> },
      ]}
    />
  );
}

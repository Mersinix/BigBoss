import { Megaphone, Briefcase, Users, FileText, UserCheck } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import MarketingServicesPage from "@/pages/marketing/services";
import MarketingProjects from "@/pages/marketing/projects";
import MarketingClients from "@/pages/marketing/clients";
import MarketingInvoices from "@/pages/marketing/invoices";
import MarketingProfilePage from "@/pages/marketing/profile";

// Business tab — Services / Projets / Clients / Devis & Factures / Profil,
// each the account's own existing page component moved under one switcher
// (same mechanism as every other professional account's Business tab, see
// sub-tab-switcher.tsx). Agency → Multiple Services split (this task): Profil
// and Services are now two REAL, separate pages — Profil owns only
// agency-level fields (description/website/portfolio/availability/
// visibility), Services owns the new per-service CRUD (category/price/
// response time/description/image, each its own row) — no more one editor
// pretending to be both.
export default function MarketingBusiness() {
  return (
    <SubTabSwitcher
      testIdPrefix="marketing-business"
      activeTextClass="text-fuchsia-600 dark:text-fuchsia-400"
      tabs={[
        { key: "services", label: "Services", icon: Megaphone, content: <MarketingServicesPage /> },
        { key: "projects", label: "Projets", icon: Briefcase, content: <MarketingProjects /> },
        { key: "clients", label: "Clients", icon: Users, content: <MarketingClients /> },
        { key: "invoices", label: "Devis & Factures", icon: FileText, content: <MarketingInvoices /> },
        { key: "profile", label: "Profil", icon: UserCheck, content: <MarketingProfilePage /> },
      ]}
    />
  );
}

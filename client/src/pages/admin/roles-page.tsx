import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";

const roles = [
  {
    name: "SUPER_ADMIN",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    description: "Full access to all platform features and settings.",
    permissions: ["Manage Users", "Manage Suppliers", "Manage Orders", "Platform Settings", "View Analytics", "Manage Commissions"],
  },
  {
    name: "ADMIN",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    description: "Administrative access excluding core system settings.",
    permissions: ["Manage Users", "Approve Suppliers", "Manage Orders", "View Analytics"],
  },
  {
    name: "SUPPLIER",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    description: "Vendors that list and sell coffee-related products.",
    permissions: ["Manage Products", "View Orders", "Confirm Orders", "View Invoices"],
  },
  {
    name: "CAFE_OWNER",
    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    description: "Coffee shop owners who purchase through the platform.",
    permissions: ["Browse Products", "Place Orders", "Track Orders", "Leave Reviews"],
  },
  {
    name: "DELIVERY_COMPANY",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    description: "Logistics partners that handle order deliveries.",
    permissions: ["View Assigned Orders", "Update Delivery Status"],
  },
  {
    name: "DRIVER",
    color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
    description: "Individual delivery drivers assigned by delivery companies.",
    permissions: ["View Delivery Queue", "Update Delivery Status"],
  },
];

export default function RolesPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Roles &amp; Permissions</h1>
        <p className="text-muted-foreground text-sm mt-1">An overview of each role and its capabilities on the platform.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((role) => (
          <Card key={role.name}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="bg-muted rounded-lg p-2">
                  <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">
                    <Badge variant="secondary" className={role.color}>
                      {role.name.replace(/_/g, " ")}
                    </Badge>
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">{role.description}</p>
              <div className="flex flex-wrap gap-2">
                {role.permissions.map((perm) => (
                  <Badge key={perm} variant="outline" className="text-xs font-normal">
                    {perm}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

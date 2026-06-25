import { Clock, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";

const PROFILE_ROUTES: Record<string, string> = {
  SUPPLIER: "/supplier/settings",
  PRINTER: "/printer/settings",
  MARKETING: "/marketing/settings",
  BARISTA_ACADEMY: "/barista-academy/settings",
  BARISTA_MARKETPLACE: "/barista-marketplace/settings",
  DELIVERY_COMPANY: "/delivery/settings",
  CAFE_OWNER: "/cafe/settings",
};

export function PendingApprovalScreen() {
  const { user, logout, isLoggingOut } = useAuth();
  const profilePath = user ? (PROFILE_ROUTES[user.role] ?? "/settings") : "/";

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full border shadow-sm">
        <CardContent className="pt-8 pb-8 px-6 text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
            <Clock className="w-7 h-7 text-amber-600" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Your account is pending admin approval</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You will receive an email or phone notification once your account is activated.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            <Link href={profilePath}>
              <Button variant="outline" className="gap-2 w-full sm:w-auto">
                <User className="w-4 h-4" />
                View Profile
              </Button>
            </Link>
            <Button
              variant="secondary"
              className="gap-2 w-full sm:w-auto"
              onClick={() => logout()}
              disabled={isLoggingOut}
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

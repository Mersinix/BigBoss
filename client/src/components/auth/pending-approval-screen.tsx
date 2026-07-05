import { Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export function PendingApprovalScreen() {
  const { logout, isLoggingOut } = useAuth();

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full border shadow-sm">
        <CardContent className="pt-8 pb-8 px-6 text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-full bg-amber-400 dark:bg-amber-950/40 flex items-center justify-center">
            <Clock className="w-7 h-7 text-amber-600" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Compte en attente d'approbation</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Votre compte est en cours de vérification par notre équipe.<br />
              L'accès à la plateforme sera disponible une fois votre dossier validé.<br />
              Vous recevrez une notification par email ou téléphone dès approbation.
            </p>
          </div>
          <Button
            variant="secondary"
            className="gap-2 w-full"
            onClick={() => logout()}
            disabled={isLoggingOut}
            data-testid="button-pending-logout"
          >
            <LogOut className="w-4 h-4" />
            {isLoggingOut ? "Déconnexion..." : "Retour à l'accueil"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

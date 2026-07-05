import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { useLocation } from "wouter";

export default function ComingSoonPage({ label }: { label?: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6 text-center">
          <div className="flex flex-col items-center gap-3 mb-4">
            <div className="w-14 h-14 bg-amber-400 rounded-full flex items-center justify-center">
              <Clock className="h-7 w-7 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-coming-soon-title">
              {label ? `${label} — Bientôt disponible` : "Bientôt disponible"}
            </h1>
          </div>

          <p className="mt-2 text-sm text-gray-600">
            Ce service est en cours de préparation. Revenez bientôt pour le découvrir.
          </p>

          <Button
            className="mt-6 bg-amber-500 hover:bg-amber-600 text-white rounded-xl"
            onClick={() => navigate("/")}
            data-testid="button-back-home"
          >
            Retour à l'accueil
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

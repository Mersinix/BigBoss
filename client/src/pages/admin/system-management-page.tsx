import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Printer, Megaphone, Coffee, Eye, EyeOff, Clock, Sliders } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ServiceKey, ServiceState, ServiceStatesMap } from "@/hooks/use-service-states";

const SERVICES: { key: ServiceKey; label: string; description: string; icon: any }[] = [
  { key: "PRINTING", label: "Printing", description: "Marketplace PRINT — services d'impression pour les cafés.", icon: Printer },
  { key: "MARKETING", label: "Marketing", description: "Services MARKETING — agences et prestataires marketing.", icon: Megaphone },
  { key: "BARISTA", label: "Barista", description: "Barista Academy & Marketplace Baristas.", icon: Coffee },
];

const STATE_OPTIONS: { value: ServiceState; label: string; icon: any; badgeClass: string }[] = [
  { value: "VISIBLE", label: "Visible", icon: Eye, badgeClass: "bg-green-100 text-green-700 border-green-200" },
  { value: "COMING_SOON", label: "Coming Soon", icon: Clock, badgeClass: "bg-amber-400 text-amber-700 border-amber-200" },
  { value: "HIDDEN", label: "Hidden", icon: EyeOff, badgeClass: "bg-gray-100 text-gray-600 border-gray-200" },
];

export default function SystemManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: states, isLoading } = useQuery<ServiceStatesMap>({
    queryKey: ["/api/system-services"],
  });

  const updateState = useMutation({
    mutationFn: ({ service, state }: { service: ServiceKey; state: ServiceState }) =>
      apiRequest("PATCH", `/api/admin/system-services/${service}`, { state }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-services"] });
      toast({ title: "Service visibility updated" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to update service", description: "Please try again." });
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="bg-amber-500/10 rounded-xl p-3">
          <Sliders className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">System Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Control the global visibility of each marketplace service across the platform.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-32 mb-3" />
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-2/3 mb-4" />
                  <Skeleton className="h-9 w-full" />
                </CardContent>
              </Card>
            ))
          : SERVICES.map((svc) => {
              const currentState: ServiceState = states?.[svc.key] ?? "VISIBLE";
              const currentOption = STATE_OPTIONS.find((o) => o.value === currentState)!;
              const isPending = updateState.isPending && updateState.variables?.service === svc.key;
              return (
                <Card key={svc.key} data-testid={`card-service-${svc.key.toLowerCase()}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-muted rounded-lg p-2.5">
                          <svc.icon className="w-5 h-5 text-foreground/70" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{svc.label}</CardTitle>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-xs ${currentOption.badgeClass}`}
                        data-testid={`badge-status-${svc.key.toLowerCase()}`}
                      >
                        {currentOption.label}
                      </Badge>
                    </div>
                    <CardDescription className="pt-2 text-sm">{svc.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-col gap-2">
                      {STATE_OPTIONS.map((opt) => (
                        <Button
                          key={opt.value}
                          type="button"
                          size="sm"
                          variant={currentState === opt.value ? "default" : "outline"}
                          disabled={isPending}
                          onClick={() => updateState.mutate({ service: svc.key, state: opt.value })}
                          className={`justify-start gap-2 w-full ${currentState === opt.value ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`}
                          data-testid={`button-set-${svc.key.toLowerCase()}-${opt.value.toLowerCase()}`}
                        >
                          <opt.icon className="w-4 h-4" />
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>
    </div>
  );
}

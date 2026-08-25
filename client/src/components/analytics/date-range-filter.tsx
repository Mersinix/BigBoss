import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { DateRangePreset } from "@/lib/marketplace-analytics";

const OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "today", label: "Aujourd'hui" },
  { value: "7d", label: "7 derniers jours" },
  { value: "30d", label: "30 derniers jours" },
  { value: "month", label: "Ce mois" },
  { value: "lastMonth", label: "Mois précédent" },
  { value: "year", label: "Cette année" },
  { value: "custom", label: "Personnalisé" },
];

export function DateRangeFilter({
  preset, onPresetChange, custom, onCustomChange,
}: {
  preset: DateRangePreset;
  onPresetChange: (p: DateRangePreset) => void;
  custom: { from: string; to: string };
  onCustomChange: (c: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={(v) => onPresetChange(v as DateRangePreset)}>
        <SelectTrigger className="w-44" data-testid="select-date-range"><SelectValue /></SelectTrigger>
        <SelectContent>
          {OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input type="date" value={custom.from} onChange={(e) => onCustomChange({ ...custom, from: e.target.value })} className="w-[9.5rem]" />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" value={custom.to} onChange={(e) => onCustomChange({ ...custom, to: e.target.value })} className="w-[9.5rem]" />
        </div>
      )}
    </div>
  );
}

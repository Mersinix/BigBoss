import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, Plus, Download, RefreshCw, MapPin, Phone, Globe, Star,
  MoreHorizontal, Trash2, Archive, CheckCircle, PhoneCall, Edit,
  ExternalLink, Copy, Calendar, Target, TrendingUp, Users, Building2,
  Filter, X, ChevronLeft, ChevronRight, AlertCircle, Loader2,
  UserPlus, Eye, BarChart2, Clock, Zap, SlidersHorizontal,
  UserCheck, UserX, HelpCircle, Tag, Wrench, Truck, GraduationCap,
  Coffee, Megaphone, Printer as PrinterIcon, Car,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { DashboardHero, KpiOverviewButton, KpiOverviewModal } from "@/components/dashboard/dashboard-kit";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Prospect, ProspectStats, ProspectNote, ProspectTimelineEvent, ProspectFollowUp, AddressDetails } from "@shared/schema";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";
import { PasswordInputField } from "@/components/settings/password-input-field";

// Account-existence indicator — computed live server-side (never stored on the
// prospect row, see storage.matchProspectsToAccounts) so it can't go stale when
// either side's contact info changes.
export type ProspectAccountMatch = { status: "MATCHED" | "AMBIGUOUS" | "NONE"; accounts: { id: number; name: string; email: string; role: string }[] };
export type ProspectWithMatch = Prospect & { accountMatch?: ProspectAccountMatch };

// Admin-added types layered on top of the compiled-in TYPE_LABELS below — this
// is the merged, live list (GET /api/admin/prospecting/types) that the Type
// filter, Edit Details, Add Manually, and Google Places search all read from,
// per Phase 7's single-source-of-truth requirement.
export type ProspectTypeOption = { key: string; label: string; builtin: boolean };

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; badge: string; row: string }> = {
  NEW:               { label: "New",               badge: "bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-400",           row: "" },
  NOT_CONTACTED:     { label: "Not Contacted",     badge: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",          row: "" },
  CALLED:            { label: "Called",             badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",            row: "" },
  INTERESTED:        { label: "Interested",         badge: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",              row: "bg-sky-50 dark:bg-sky-500/10" },
  MEETING_SCHEDULED: { label: "Meeting Scheduled", badge: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",        row: "bg-purple-50 dark:bg-purple-500/10" },
  WAITING_REPLY:     { label: "Waiting Reply",     badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",           row: "bg-amber-50 dark:bg-amber-500/10" },
  NEGOTIATION:       { label: "Negotiation",       badge: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",         row: "bg-orange-50 dark:bg-orange-500/10" },
  CONVERTED:         { label: "Converted",         badge: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",           row: "bg-green-50 dark:bg-green-500/10" },
  REJECTED:          { label: "Rejected",          badge: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",               row: "bg-red-50 dark:bg-red-500/10" },
  NOT_INTERESTED:    { label: "Not Interested",    badge: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400",               row: "bg-red-50 dark:bg-red-500/10" },
  DUPLICATE:         { label: "Duplicate",         badge: "bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-500",             row: "bg-gray-50 dark:bg-gray-500/10 opacity-60" },
  INVALID:           { label: "Invalid",           badge: "bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-500",             row: "bg-gray-50 dark:bg-gray-500/10 opacity-60" },
  ARCHIVED:          { label: "Archived",          badge: "bg-gray-200 text-gray-500 dark:bg-gray-500/20 dark:text-gray-500",             row: "bg-gray-50 dark:bg-gray-500/10 opacity-60" },
};

const TYPE_LABELS: Record<string, string> = {
  COFFEE_SHOP: "Coffee Shop", COFFEE_ROASTERY: "Coffee Roastery", COFFEE_SUPPLIER: "Coffee Supplier",
  WATER_SUPPLIER: "Water Supplier", JUICE_SUPPLIER: "Juice Supplier", MILK_SUPPLIER: "Milk Supplier",
  PASTRY_SUPPLIER: "Pastry Supplier", BAKERY: "Bakery", PACKAGING_SUPPLIER: "Packaging Supplier",
  PRINTER: "Printer", MARKETING_AGENCY: "Marketing Agency", DELIVERY_COMPANY: "Delivery Company",
  BARISTA_TRAINER: "Barista Trainer", COFFEE_EQUIPMENT: "Coffee Equipment",
  MAINTENANCE_COMPANY: "Maintenance Co.", CLEANING_COMPANY: "Cleaning Co.", OTHER: "Other",
};

const RADIUS_OPTIONS = [1, 2, 5, 10, 20, 30, 50, 100];
const MIN_RATING_OPTIONS = ["", "2", "3", "4", "4.5"];

// ── Score & Grade ─────────────────────────────────────────────────────────────

function computeScore(p: Prospect): number {
  let s = p.prospectScore ?? 0;
  if (s) return s;
  let score = 0;
  if (p.phone) score += 20;
  if (p.website) score += 15;
  if (p.rating && parseFloat(p.rating) >= 4.5) score += 20;
  if ((p.reviewCount ?? 0) >= 100) score += 15;
  return score;
}

function scoreGrade(score: number): { grade: string; color: string } {
  if (score >= 60) return { grade: "A", color: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" };
  if (score >= 40) return { grade: "B", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400" };
  if (score >= 20) return { grade: "C", color: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" };
  return { grade: "D", color: "bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-400" };
}

// ── Account Match Indicator ──────────────────────────────────────────────────

function AccountMatchBadge({ match, compact }: { match?: ProspectAccountMatch; compact?: boolean }) {
  if (!match || match.status === "NONE") {
    return compact ? <span className="text-xs text-muted-foreground">—</span> : (
      <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
        <UserX className="w-3 h-3" />No account
      </Badge>
    );
  }
  if (match.status === "AMBIGUOUS") {
    return (
      <Badge className="text-[10px] gap-1 bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" title="Multiple possible accounts matched — verify manually">
        <HelpCircle className="w-3 h-3" />Needs review
      </Badge>
    );
  }
  const acc = match.accounts[0];
  return (
    <Badge className="text-[10px] gap-1 bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" title={acc ? `${acc.name} (${acc.role})` : undefined}>
      <UserCheck className="w-3 h-3" />{compact ? "Has account" : `Has account${acc ? ` · ${acc.role}` : ""}`}
    </Badge>
  );
}

// ── Stats Row ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function StatsRow({ stats, isLoading }: { stats?: ProspectStats; isLoading: boolean }) {
  if (isLoading) return <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  if (!stats) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      <StatCard label="Total Prospects" value={stats.total} icon={Target} color="bg-primary/10 text-primary" />
      <StatCard label="Converted" value={stats.convertedCount} icon={CheckCircle} color="bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400" />
      <StatCard label="Interested" value={stats.interestedCount} icon={TrendingUp} color="bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400" />
      <StatCard label="Called Today" value={stats.calledToday} icon={PhoneCall} color="bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400" />
      <StatCard label="Follow-ups Today" value={stats.followUpsToday} icon={Calendar} color="bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400" />
      <StatCard label="Overdue" value={stats.overdueFollowUps} icon={AlertCircle} color="bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400" />
      <StatCard label="With Phone" value={stats.withPhone} icon={Phone} color="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" />
      <StatCard label="Avg Rating" value={stats.avgRating.toFixed(1)} icon={Star} color="bg-yellow-100 text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-400" />
    </div>
  );
}

// ── Google Places Search Dialog ───────────────────────────────────────────────

function SearchDialog({ open, onClose, onComplete, prospectTypes }: { open: boolean; onClose: () => void; onComplete: () => void; prospectTypes: ProspectTypeOption[] }) {
  const { toast } = useToast();
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<{ description: string; place_id: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [radiusKm, setRadiusKm] = useState("5");
  // Multiple keywords, shown as removable badges (Phase 12) — each one is a
  // genuinely separate Google Places query (see handleSearch/the server route),
  // not a client-side filter, so results reflect ALL of them, not just the first.
  const [keywords, setKeywords] = useState<string[]>(["coffee"]);
  const [keywordInput, setKeywordInput] = useState("");
  const addKeyword = () => {
    const trimmed = keywordInput.trim();
    if (!trimmed) return;
    if (keywords.some(k => k.toLowerCase() === trimmed.toLowerCase())) { setKeywordInput(""); return; }
    setKeywords(prev => [...prev, trimmed]);
    setKeywordInput("");
  };
  const removeKeyword = (k: string) => setKeywords(prev => prev.filter(x => x !== k));
  const [keytype, setkeytype] = useState("cafe");
  const [prospectType, setProspectType] = useState("");
  const [minRating, setMinRating] = useState("");
  const [onlyWithPhone, setOnlyWithPhone] = useState(false);
  const [onlyWithWebsite, setOnlyWithWebsite] = useState(false);
  const [includeClosedPlaces, setIncludeClosedPlaces] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<{
    searchCenter: string;
    gridCells: number;
    nearbyRequests: number;
    googlePlacesFound: number;
    uniquePlaces: number;
    detailsFetched: number;
    saved: number;
    skipped: number;
    duplicates: number;
    elapsedMs: number;
  } | null>(null);
  const autocompleteRef = useRef<any>(null);
  const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

  // Load Google Maps script for autocomplete
  useEffect(() => {
    if (!open) return;
    if (window.google?.maps?.places) {
      autocompleteRef.current = new window.google.maps.places.AutocompleteService();
      return;
    }
    if (!MAPS_KEY) return;
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) return;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => {
      autocompleteRef.current = new window.google.maps.places.AutocompleteService();
    };
    document.head.appendChild(script);
  }, [open, MAPS_KEY]);

  const fetchSuggestions = useCallback((q: string) => {
    if (!q.trim() || !autocompleteRef.current) { setSuggestions([]); return; }
    autocompleteRef.current.getPlacePredictions({ input: q, types: ['(regions)'] }, (preds: any, status: string) => {
      if (status === 'OK' && preds) setSuggestions(preds.slice(0, 5).map((p: any) => ({ description: p.description, place_id: p.place_id })));
      else setSuggestions([]);
    });
  }, []);

  const handleSearch = async () => {
    if (!address.trim()) { toast({ title: "Please enter a search address", variant: "destructive" }); return; }
    // A keyword still sitting in the input (typed but not yet confirmed as a
    // badge) is included too, so pressing Search directly after typing doesn't
    // silently drop it.
    const pendingTyped = keywordInput.trim();
    const effectiveKeywords = pendingTyped && !keywords.some(k => k.toLowerCase() === pendingTyped.toLowerCase())
      ? [...keywords, pendingTyped] : keywords;
    if (effectiveKeywords.length === 0) { toast({ title: "Enter at least one search keyword", variant: "destructive" }); return; }
    setIsSearching(true);
    setResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/prospecting/search", {
        address, radiusKm: parseFloat(radiusKm), keywords: effectiveKeywords, keytype, prospectType: prospectType || null,
        minRating: minRating ? parseFloat(minRating) : null, onlyWithPhone, onlyWithWebsite, includeClosedPlaces,
      });
      const data = await res.json();
      setResult(data);
      onComplete();
    } catch (err: any) {
      toast({ title: err?.message ?? "Search failed", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent hideClose className="sm:max-w-lg max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
        <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={onClose} aria-label="Close" data-testid="button-close-search-dialog">
          <X className="w-4 h-4" />
        </button>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Search Google Places
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Address */}
          <div>
            <Label>Search Center Address</Label>
            <div className="relative mt-1">
              <MapPin className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="e.g. Tunis, Nabeul, Avenue Habib Bourguiba..."
                value={address}
                onChange={e => { setAddress(e.target.value); fetchSuggestions(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border rounded-lg shadow-lg">
                  {suggestions.map(s => (
                    <button key={s.place_id} className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/50 transition-colors" onMouseDown={() => { setAddress(s.description); setSuggestions([]); setShowSuggestions(false); }}>
                      <MapPin className="w-3 h-3 inline mr-1.5 text-muted-foreground" />{s.description}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Radius */}
            <div>
              <Label>Radius</Label>
              <Select value={radiusKm} onValueChange={setRadiusKm}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RADIUS_OPTIONS.map(r => <SelectItem key={r} value={String(r)}>{r} km</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Min Rating */}
            <div>
              <Label>Min Rating</Label>
              {/* Radix forbids SelectItem value="" (reserved to mean "cleared") — mirrors
                  FilterBar's own "all" sentinel pattern above: the Select only ever sees a
                  non-empty value, translated back to "" (→ no rating filter) at the boundary,
                  so minRating's own semantics (used by handleSearch below) are unchanged. */}
              <Select value={minRating || "any"} onValueChange={v => setMinRating(v === "any" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {MIN_RATING_OPTIONS.filter(Boolean).map(r => <SelectItem key={r} value={r}>{r}+</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Keyword — multiple, shown as removable badges (Phase 12) */}
          <div>
            <Label>Search Keyword</Label>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 min-h-9">
              {keywords.map(k => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs" data-testid={`badge-keyword-${k}`}>
                  {k}
                  <button type="button" onClick={() => removeKeyword(k)} aria-label={`Remove keyword ${k}`} className="hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                className="flex-1 min-w-24 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder={keywords.length === 0 ? "coffee, café, supplier water..." : "Add another…"}
                value={keywordInput}
                onChange={e => setKeywordInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKeyword(); }
                  else if (e.key === "Backspace" && !keywordInput && keywords.length > 0) { removeKeyword(keywords[keywords.length - 1]); }
                }}
                onBlur={addKeyword}
                data-testid="input-search-keyword"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Press Enter to add a keyword. The search runs all of them.</p>
          </div>
          <div>
            <Label>Type de Business</Label>
            <Input className="mt-1" placeholder="coffee, café, supplier water, printer..." value={keytype} onChange={e => setkeytype(e.target.value)} />
          </div>

          {/* Prospect Type */}
          <div>
            <Label>Prospect Type</Label>
            {/* Same Radix constraint as Min Rating above — "auto" sentinel translated back to
                "" (→ auto-detect, unchanged handleSearch semantics: prospectType || null).
                Same merged built-in ∪ admin-added list as the Type filter/Edit Details/Add
                Manually (Phase 7). */}
            <Select value={prospectType || "auto"} onValueChange={v => setProspectType(v === "auto" ? "" : v)}>
              <SelectTrigger className="mt-1" data-testid="select-search-prospect-type"><SelectValue placeholder="Auto Detect" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto Detect</SelectItem>
                {prospectTypes.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            {[
              { label: "Only businesses with phone", value: onlyWithPhone, onChange: setOnlyWithPhone },
              { label: "Only businesses with website", value: onlyWithWebsite, onChange: setOnlyWithWebsite },
            ].map(({ label, value, onChange }) => (
              <label key={label} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={value} onCheckedChange={(c) => onChange(!!c)} />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>

          {/* Progress / Result */}
          {isSearching && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              Grid search running — this may take 30–90 seconds for large areas…
            </div>
          )}
          {result && (
            <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-lg p-3 space-y-1.5">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">Grid Search Complete ✓</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-green-600 dark:text-green-400">
                <span>Grid cells searched: <strong>{result.gridCells}</strong></span>
                <span>API requests: <strong>{result.nearbyRequests}</strong></span>
                <span>Places found: <strong>{result.googlePlacesFound}</strong></span>
                <span>Unique places: <strong>{result.uniquePlaces}</strong></span>
                <span>Details fetched: <strong>{result.detailsFetched}</strong></span>
                <span>DB duplicates: <strong>{result.duplicates}</strong></span>
                <span>Saved: <strong>{result.saved}</strong></span>
                <span>Skipped: <strong>{result.skipped}</strong></span>
              </div>
              <p className="text-xs text-green-500">Elapsed: {(result.elapsedMs / 1000).toFixed(1)}s · Center: {result.searchCenter}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSearch} disabled={isSearching}>
            {isSearching ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Searching...</> : <><Search className="w-4 h-4 mr-1.5" />Search</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Manual Prospect Dialog ────────────────────────────────────────────────────

function AddProspectDialog({ open, onClose, onSaved, prospectTypes }: { open: boolean; onClose: () => void; onSaved: () => void; prospectTypes: ProspectTypeOption[] }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ businessName: "", prospectType: "", address: "", city: "", phone: "", website: "", email: "", rating: "", notes: "", facebook: "", instagram: "", linkedin: "" });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/prospecting", {
      ...form,
      notes: form.notes ? [{ id: Date.now().toString(), text: form.notes, createdAt: new Date().toISOString() }] : [],
    }),
    onSuccess: () => { toast({ title: "Prospect created" }); onSaved(); onClose(); setForm({ businessName: "", prospectType: "", address: "", city: "", phone: "", website: "", email: "", rating: "", notes: "", facebook: "", instagram: "", linkedin: "" }); },
    onError: () => toast({ title: "Failed to create prospect", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent hideClose className="sm:max-w-md max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
        <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={onClose} aria-label="Close" data-testid="button-close-add-prospect-dialog">
          <X className="w-4 h-4" />
        </button>
        <DialogHeader><DialogTitle>Add Prospect Manually</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>Business Name *</Label><Input className="mt-1" value={form.businessName} onChange={e => set("businessName", e.target.value)} /></div>
          <div><Label>Type</Label>
            {/* Same merged built-in ∪ admin-added list as the Type filter/Edit
                Details/Google Places search — single source of truth (Phase 7/11). */}
            <Select value={form.prospectType || "none"} onValueChange={v => set("prospectType", v === "none" ? "" : v)}>
              <SelectTrigger className="mt-1" data-testid="select-add-prospect-type"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {prospectTypes.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input className="mt-1" value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
            <div><Label>Email</Label><Input className="mt-1" type="email" value={form.email} onChange={e => set("email", e.target.value)} /></div>
          </div>
          <div><Label>Website</Label><Input className="mt-1" value={form.website} onChange={e => set("website", e.target.value)} /></div>
          <div><Label>Address</Label><Input className="mt-1" value={form.address} onChange={e => set("address", e.target.value)} /></div>
          <div><Label>City</Label><Input className="mt-1" value={form.city} onChange={e => set("city", e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Facebook</Label><Input className="mt-1" value={form.facebook} onChange={e => set("facebook", e.target.value)} /></div>
            <div><Label>Instagram</Label><Input className="mt-1" value={form.instagram} onChange={e => set("instagram", e.target.value)} /></div>
            <div><Label>LinkedIn</Label><Input className="mt-1" value={form.linkedin} onChange={e => set("linkedin", e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Textarea className="mt-1" rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.businessName.trim()}>
            {save.isPending ? "Saving..." : "Add Prospect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────

type Filters = { search: string; status: string; prospectType: string; city: string; hasPhone: string; hasWebsite: string; minRating: string; sortBy: string; sortOrder: string };

const RATING_FILTER_OPTIONS = ["2", "3", "4", "4.5"];

function FilterBar({ filters, onChange, prospectTypes, onAddType }: { filters: Filters; onChange: (f: Partial<Filters>) => void; prospectTypes: ProspectTypeOption[]; onAddType: () => void }) {
  const active = Object.values(filters).filter(v => v && v !== 'createdAt' && v !== 'desc').length;
  // Mobile-only: the search input collapses to an icon button until tapped, so it
  // doesn't permanently eat most of the horizontal filter strip's width — same
  // filters.search state either way, nothing about search behavior changes.
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  return (
    // Mobile: one non-wrapping horizontally scrollable row (hidden scrollbar, same
    // technique already used for the app's horizontal tab switchers) instead of
    // wrapping across multiple lines. sm+: reverts to the original wrapping row.
    <div
      className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0 sm:mb-0"
      style={{ scrollbarWidth: "none" }}
    >
      <div className="relative shrink-0 sm:flex-1 sm:min-w-48">
        {!mobileSearchOpen && (
          <button
            type="button"
            className="sm:hidden w-9 h-9 flex items-center justify-center rounded-md border border-input text-muted-foreground"
            onClick={() => { setMobileSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 0); }}
            aria-label="Ouvrir la recherche"
            data-testid="button-open-prospecting-search"
          >
            <Search className="w-4 h-4" />
          </button>
        )}
        <div className={`${mobileSearchOpen ? "flex" : "hidden"} sm:flex items-center relative w-48 sm:w-auto`}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            className="pl-8"
            placeholder="Search by name, phone, city…"
            value={filters.search}
            onChange={e => onChange({ search: e.target.value })}
            onBlur={() => { if (!filters.search) setMobileSearchOpen(false); }}
            data-testid="input-prospecting-search"
          />
        </div>
      </div>
      <Select value={filters.status || "all"} onValueChange={v => onChange({ status: v === "all" ? "" : v })}>
        <SelectTrigger className="w-40 shrink-0"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.prospectType || "all"} onValueChange={v => { if (v === "__add_new__") { onAddType(); return; } onChange({ prospectType: v === "all" ? "" : v }); }}>
        <SelectTrigger className="w-44 shrink-0" data-testid="select-type-filter"><SelectValue placeholder="Type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          {prospectTypes.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
          <SelectSeparator />
          <SelectItem value="__add_new__" data-testid="select-item-add-new-type">+ Add New Type</SelectItem>
        </SelectContent>
      </Select>
      <Input className="w-32 shrink-0" placeholder="City" value={filters.city} onChange={e => onChange({ city: e.target.value })} />
      <Select value={filters.hasPhone || "all"} onValueChange={v => onChange({ hasPhone: v === "all" ? "" : v })}>
        <SelectTrigger className="w-36 shrink-0"><SelectValue placeholder="Phone" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Phone: Any</SelectItem>
          <SelectItem value="true">Has Phone</SelectItem>
          <SelectItem value="false">No Phone</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.hasWebsite || "all"} onValueChange={v => onChange({ hasWebsite: v === "all" ? "" : v })}>
        <SelectTrigger className="w-40 shrink-0" data-testid="select-website-filter"><SelectValue placeholder="Website" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any</SelectItem>
          <SelectItem value="true">Has Website</SelectItem>
          <SelectItem value="false">No Website</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.minRating || "any"} onValueChange={v => onChange({ minRating: v === "any" ? "" : v })}>
        <SelectTrigger className="w-32 shrink-0" data-testid="select-rating-filter"><SelectValue placeholder="Rating" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any</SelectItem>
          {RATING_FILTER_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}+</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={`${filters.sortBy}:${filters.sortOrder}`} onValueChange={v => { const [by, order] = v.split(':'); onChange({ sortBy: by, sortOrder: order }); }}>
        <SelectTrigger className="w-44 shrink-0"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="createdAt:desc">Newest First</SelectItem>
          <SelectItem value="createdAt:asc">Oldest First</SelectItem>
          <SelectItem value="rating:desc">Highest Rating</SelectItem>
          <SelectItem value="reviewCount:desc">Most Reviews</SelectItem>
          <SelectItem value="businessName:asc">Name A–Z</SelectItem>
          <SelectItem value="distanceKm:asc">Nearest First</SelectItem>
        </SelectContent>
      </Select>
      {active > 0 && (
        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onChange({ search: "", status: "", prospectType: "", city: "", hasPhone: "", hasWebsite: "", minRating: "", sortBy: "createdAt", sortOrder: "desc" })}>
          <X className="w-3.5 h-3.5 mr-1" />Clear filters
        </Button>
      )}
    </div>
  );
}

// ── Bulk Actions ──────────────────────────────────────────────────────────────

function BulkActions({ ids, onClear, onAction }: { ids: number[]; onClear: () => void; onAction: (action: string, data?: any) => void }) {
  const [statusOpen, setStatusOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
      <span className="text-sm font-medium text-primary">{ids.length} selected</span>
      <div className="flex-1" />
      <Button size="sm" variant="outline" onClick={() => onAction("mark_called")}><PhoneCall className="w-3.5 h-3.5 mr-1" />Mark Called</Button>
      <Button size="sm" variant="outline" onClick={() => onAction("archive")}><Archive className="w-3.5 h-3.5 mr-1" />Archive</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline"><SlidersHorizontal className="w-3.5 h-3.5 mr-1" />Status</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <DropdownMenuItem key={k} onClick={() => onAction("status", { status: k })}>{v.label}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="destructive" onClick={() => onAction("delete")}><Trash2 className="w-3.5 h-3.5 mr-1" />Delete</Button>
      <Button size="sm" variant="ghost" onClick={onClear}><X className="w-3.5 h-3.5" /></Button>
    </div>
  );
}

// ── Row Actions ───────────────────────────────────────────────────────────────

function RowActions({ prospect, onView, onAction }: {
  prospect: ProspectWithMatch;
  onView: () => void;
  onAction: (action: string, data?: any) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => e.stopPropagation()}>
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onView}><Eye className="w-3.5 h-3.5 mr-2" />View Details</DropdownMenuItem>
        <DropdownMenuSeparator />
        {prospect.phone && (
          <>
            <DropdownMenuItem onClick={() => window.open(`tel:${prospect.phone}`)}><PhoneCall className="w-3.5 h-3.5 mr-2" />Call</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(prospect.phone!); }}><Copy className="w-3.5 h-3.5 mr-2" />Copy Phone</DropdownMenuItem>
          </>
        )}
        {prospect.website && (
          <>
            <DropdownMenuItem onClick={() => window.open(prospect.website!, '_blank')}><ExternalLink className="w-3.5 h-3.5 mr-2" />Open Website</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(prospect.website!); }}><Copy className="w-3.5 h-3.5 mr-2" />Copy Website</DropdownMenuItem>
          </>
        )}
        {prospect.latitude && prospect.longitude && (
          <DropdownMenuItem onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${prospect.latitude},${prospect.longitude}`, '_blank')}>
            <MapPin className="w-3.5 h-3.5 mr-2" />Open Google Maps
          </DropdownMenuItem>
        )}
        {prospect.googlePlaceId && (
          <DropdownMenuItem onClick={() => window.open(`https://www.google.com/maps/place/?q=place_id:${prospect.googlePlaceId}`, '_blank')}>
            <Globe className="w-3.5 h-3.5 mr-2" />Open Place
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("status", { status: "CALLED" })}><PhoneCall className="w-3.5 h-3.5 mr-2" />Mark as Called</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("status", { status: "ARCHIVED" })}><Archive className="w-3.5 h-3.5 mr-2" />Archive</DropdownMenuItem>
        <DropdownMenuSeparator />
        {Object.entries(ACCOUNT_TYPE_CONFIG).map(([role, cfg]) => (
          <DropdownMenuItem key={role} onClick={() => onAction("create_account", { type: role })} data-testid={`menu-item-create-${role.toLowerCase()}`}>
            <cfg.icon className="w-3.5 h-3.5 mr-2" />Create {cfg.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("delete")} className="text-destructive focus:text-destructive">
          <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Prospect Detail Sheet ─────────────────────────────────────────────────────

function ProspectSheet({ prospect, open, onClose, onSaved, prospectTypes }: {
  prospect: ProspectWithMatch | null;
  open: boolean;
  onClose: () => void;
  prospectTypes: ProspectTypeOption[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [noteText, setNoteText] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Prospect>>({});
  // This sheet's own authoritative copy, updated directly from each mutation's
  // response — NOT the parent's `rows` array, which is still the pre-mutation
  // snapshot at the moment invalidateQueries fires (the refetch is async), so
  // relying on it here was overwriting a just-saved change back to its stale
  // value (e.g. a freshly created follow-up would "save" successfully, the
  // stats would update, but the sheet itself kept showing the empty form).
  const [liveProspect, setLiveProspect] = useState<ProspectWithMatch | null>(prospect);

  useEffect(() => { setLiveProspect(prospect); if (prospect) setEditForm({ ...prospect }); setEditMode(false); }, [prospect?.id]);

  const update = useMutation({
    mutationFn: (data: Partial<Prospect>) => apiRequest("PATCH", `/api/admin/prospecting/${prospect!.id}`, data),
    onSuccess: async (res) => {
      const updated = await res.json();
      setLiveProspect((prev) => ({ ...prev, ...updated, accountMatch: prev?.accountMatch }));
      qc.invalidateQueries({ queryKey: ["/api/admin/prospecting"] }); qc.invalidateQueries({ queryKey: ["/api/admin/prospecting/stats"] }); onSaved(); toast({ title: "Saved" }); setEditMode(false);
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const addNote = () => {
    if (!noteText.trim() || !liveProspect) return;
    const notes = [...((liveProspect.notes as ProspectNote[]) ?? []), { id: Date.now().toString(), text: noteText.trim(), createdAt: new Date().toISOString() }];
    update.mutate({ notes } as any);
    setNoteText("");
  };

  const setFollowUp = (followUp: ProspectFollowUp | null) => {
    update.mutate({ followUp, nextFollowUpDate: followUp ? new Date(`${followUp.date}T${followUp.time ?? '09:00'}`) : null } as any);
  };

  if (!liveProspect) return null;
  const prospectView = liveProspect;

  const score = computeScore(prospectView);
  const grade = scoreGrade(score);
  const notes = (prospectView.notes as ProspectNote[]) ?? [];
  const timeline = (prospectView.timeline as ProspectTimelineEvent[]) ?? [];
  const followUp = prospectView.followUp as ProspectFollowUp | null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      {/* Thin scrollbar treatment — matches the existing Admin Order Details modal's own
          scroll container exactly, same thumb/track/hover classes, not a new scrollbar style. */}
      {/* [&>button]:hidden — suppresses shadcn Sheet's own default top-right close
          button, which this sticky custom header (same bg, same corner) was
          visually overlapping; the explicit button in the header below replaces
          it with one guaranteed-visible close affordance (Phase 10). */}
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0 [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b px-4 pt-4 pb-3">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg leading-tight truncate">{prospectView.businessName}</h2>
              {prospectView.address && <p className="text-xs text-muted-foreground mt-0.5 truncate">{prospectView.address}</p>}
            </div>
            <Badge className={`text-xs shrink-0 ${STATUS_CONFIG[prospectView.status]?.badge ?? "bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-400"}`}>
              {STATUS_CONFIG[prospectView.status]?.label ?? prospectView.status}
            </Badge>
            {/* Close/back — works from every tab since it lives in the sticky header,
                outside the Tabs component (Phase 10). Edit mode keeps its own
                explicit Save/Cancel, so closing mid-edit via this button discards
                unsaved changes exactly like Cancel already does (no silent save). */}
            <button type="button" className="shrink-0 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={onClose} aria-label="Close" data-testid="button-close-prospect-sheet">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {prospectView.prospectType && <Badge variant="outline" className="text-[10px]">{prospectTypes.find(t => t.key === prospectView.prospectType)?.label ?? TYPE_LABELS[prospectView.prospectType] ?? prospectView.prospectType}</Badge>}
            <Badge className={`text-[10px] ${grade.color}`}>{grade.grade}</Badge>
            {prospectView.rating && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {parseFloat(prospectView.rating).toFixed(1)} ({prospectView.reviewCount} reviews)
              </div>
            )}
            <AccountMatchBadge match={prospectView.accountMatch} />
          </div>
        </div>

        <div className="p-4">
          <Tabs defaultValue="general">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="notes">Notes {notes.length > 0 && `(${notes.length})`}</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="followup">Follow-up</TabsTrigger>
            </TabsList>

            {/* ── General ── */}
            <TabsContent value="general" className="mt-4 space-y-4">
              {!editMode ? (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {[
                      ["Phone", prospectView.phone],
                      ["Email", prospectView.email],
                      ["Website", prospectView.website],
                      ["City", prospectView.city],
                      ["Country", prospectView.country],
                      ["Distance", prospectView.distanceKm ? `${prospectView.distanceKm} km` : null],
                      ["Keyword", prospectView.keyword],
                      ["Business Type", prospectView.businessType],
                      ["Search Radius", prospectView.searchRadius ? `${prospectView.searchRadius} km` : null],
                      ["Search Center", prospectView.searchCenter],
                    ].filter(([, v]) => v).map(([label, val]) => (
                      <div key={label as string}>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="font-medium truncate">{val}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select value={prospectView.status} onValueChange={v => update.mutate({ status: v } as any)}>
                      <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    {prospectView.phone && <Button size="sm" variant="outline" onClick={() => window.open(`tel:${prospectView.phone}`)}><PhoneCall className="w-3.5 h-3.5 mr-1" />Call</Button>}
                    {prospectView.website && <Button size="sm" variant="outline" onClick={() => window.open(prospectView.website!, '_blank')}><ExternalLink className="w-3.5 h-3.5 mr-1" />Website</Button>}
                    {prospectView.latitude && <Button size="sm" variant="outline" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${prospectView.latitude},${prospectView.longitude}`, '_blank')}><MapPin className="w-3.5 h-3.5 mr-1" />Maps</Button>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditMode(true)}><Edit className="w-3.5 h-3.5 mr-1" />Edit Details</Button>
                </>
              ) : (
                <div className="space-y-3">
                  {([
                    { key: "businessName", label: "Business Name" },
                    { key: "phone", label: "Phone" },
                    { key: "email", label: "Email" },
                    { key: "website", label: "Website" },
                    { key: "address", label: "Address" },
                    { key: "city", label: "City" },
                    { key: "facebook", label: "Facebook" },
                    { key: "instagram", label: "Instagram" },
                    { key: "linkedin", label: "LinkedIn" },
                  ] as { key: keyof Prospect; label: string }[]).map(({ key, label }) => (
                    <div key={key}>
                      <Label className="text-xs">{label}</Label>
                      <Input className="mt-1 h-8" value={(editForm[key] as string) ?? ""} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} />
                    </div>
                  ))}
                  <div>
                    <Label className="text-xs">Type</Label>
                    {/* Same merged built-in ∪ admin-added list the Type filter, Add
                        Manually, and Google Places search all read from (Phase 7) —
                        editing this never touches status/notes/timeline/follow-up. */}
                    <Select value={editForm.prospectType ?? "none"} onValueChange={v => setEditForm(f => ({ ...f, prospectType: v === "none" ? null : v }))}>
                      <SelectTrigger className="mt-1 h-8" data-testid="select-edit-prospect-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {prospectTypes.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => update.mutate(editForm as any)} disabled={update.isPending}>{update.isPending ? "Saving..." : "Save"}</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── Notes ── */}
            <TabsContent value="notes" className="mt-4 space-y-3">
              <div className="flex gap-2">
                <Textarea rows={2} className="flex-1 text-sm resize-none" placeholder="Add a note..." value={noteText} onChange={e => setNoteText(e.target.value)} />
                <Button size="sm" onClick={addNote} disabled={!noteText.trim() || update.isPending} className="self-end">Add</Button>
              </div>
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No notes yet.</p>
              ) : (
                <div className="space-y-2">
                  {[...notes].reverse().map(n => (
                    <div key={n.id} className="bg-secondary/30 rounded-lg p-2.5">
                      <p className="text-sm">{n.text}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}{n.createdByName ? ` · ${n.createdByName}` : ""}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Timeline ── */}
            <TabsContent value="timeline" className="mt-4">
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No timeline events.</p>
              ) : (
                <div className="relative pl-4 space-y-4">
                  <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
                  {[...timeline].reverse().map(e => (
                    <div key={e.id} className="relative">
                      <div className="absolute -left-[14px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary/30 border-2 border-primary/50" />
                      <p className="text-sm font-medium">{e.event}</p>
                      {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
                      <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(e.createdAt).toLocaleString()}{e.userName ? ` · ${e.userName}` : ""}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Follow-up ── */}
            <TabsContent value="followup" className="mt-4 space-y-4">
              {followUp ? (
                <div className="border rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{followUp.date} {followUp.time && `at ${followUp.time}`}</p>
                      <Badge className={`text-[10px] mt-1 ${
                        followUp.priority === 'URGENT' ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' :
                        followUp.priority === 'HIGH' ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400' :
                        followUp.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' :
                        'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400'
                      }`}>{followUp.priority}</Badge>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setFollowUp(null)}><X className="w-4 h-4" /></Button>
                  </div>
                  {followUp.notes && <p className="text-xs text-muted-foreground">{followUp.notes}</p>}
                </div>
              ) : (
                <FollowUpForm onSave={setFollowUp} />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FollowUpForm({ onSave }: { onSave: (f: ProspectFollowUp) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<ProspectFollowUp["priority"]>("MEDIUM");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Date</Label><Input type="date" className="mt-1" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><Label>Time</Label><Input type="time" className="mt-1" value={time} onChange={e => setTime(e.target.value)} /></div>
      </div>
      <div>
        <Label>Priority</Label>
        <Select value={priority} onValueChange={v => setPriority(v as any)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["LOW","MEDIUM","HIGH","URGENT"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Notes</Label><Textarea className="mt-1" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
      <Button size="sm" onClick={() => onSave({ date, time, notes, priority })} disabled={!date}>
        <Calendar className="w-3.5 h-3.5 mr-1" />Set Follow-up
      </Button>
    </div>
  );
}

// ── Prospect Type Management Modal ───────────────────────────────────────────

function TypeManagementModal({ open, onClose, prospectTypes }: { open: boolean; onClose: () => void; prospectTypes: ProspectTypeOption[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newLabel, setNewLabel] = useState("");

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/prospecting/types", { label: newLabel.trim() }),
    onSuccess: () => {
      // Re-fetched immediately — every screen reading this same query (filter,
      // Edit Details, Add Manually, Google Places search) picks it up without a
      // manual page reload (Phase 7's single-source-of-truth requirement).
      qc.invalidateQueries({ queryKey: ["/api/admin/prospecting/types"] });
      toast({ title: "Type created" });
      setNewLabel("");
    },
    onError: (err: any) => toast({ title: err?.message ?? "Failed to create type", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent hideClose className="sm:max-w-md">
        <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={onClose} aria-label="Close" data-testid="button-close-manage-prospect-types">
          <X className="w-4 h-4" />
        </button>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="w-4 h-4 text-primary" />Manage Prospect Types</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">Existing types</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              {prospectTypes.map(t => (
                <Badge key={t.key} variant={t.builtin ? "outline" : "secondary"} className="text-[11px]" data-testid={`badge-type-${t.key}`}>
                  {t.label}{!t.builtin && <span className="ml-1 opacity-60">· custom</span>}
                </Badge>
              ))}
            </div>
          </div>
          <div className="border-t pt-3">
            <Label className="text-xs">Add a new type</Label>
            <div className="flex gap-2 mt-1.5">
              <Input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. Roastery Equipment"
                onKeyDown={e => { if (e.key === "Enter" && newLabel.trim()) create.mutate(); }}
                data-testid="input-new-type-label"
              />
              <Button onClick={() => create.mutate()} disabled={create.isPending || !newLabel.trim()} data-testid="button-create-type">
                {create.isPending ? "Adding..." : "Add"}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create Account Modal ──────────────────────────────────────────────────────

// Mirrors landing-page.tsx's ROLES/buildPayload exactly — the same 9 account
// types the public Inscription flow supports (DRIVER is the one exception:
// it has no public self-registration path anywhere in the app today, only
// this same generic admin-creation endpoint, so it gets the simplest shape
// and no location requirement, matching its actual existing capability).
const ACCOUNT_TYPE_CONFIG: Record<string, { label: string; icon: any; nameShape: "cafe" | "company" | "person" | "simple"; needsLocation: boolean }> = {
  CAFE_OWNER:          { label: "Café Owner",          icon: Coffee,        nameShape: "cafe",    needsLocation: true },
  SUPPLIER:            { label: "Supplier",             icon: Building2,     nameShape: "company", needsLocation: true },
  BARISTA_ACADEMY:     { label: "Barista Academy",      icon: GraduationCap, nameShape: "company", needsLocation: true },
  BARISTA_MARKETPLACE: { label: "Barista Marketplace",  icon: Coffee,        nameShape: "company", needsLocation: true },
  DELIVERY_COMPANY:    { label: "Delivery",             icon: Truck,         nameShape: "person",  needsLocation: false },
  DRIVER:              { label: "Driver",               icon: Car,           nameShape: "simple",  needsLocation: false },
  MAINTENANCE:         { label: "Maintenance",           icon: Wrench,        nameShape: "company", needsLocation: true },
  MARKETING:           { label: "Marketing",             icon: Megaphone,     nameShape: "company", needsLocation: true },
  PRINTER:             { label: "Printing / Imprimerie", icon: PrinterIcon,   nameShape: "company", needsLocation: true },
};

// Satisfies the shared 8+/uppercase/digit/symbol policy by construction —
// admin can see/edit it via the eye-toggle password field below, same as any
// other temp password, before actually creating the account.
function generateTempPassword(): string {
  return `Temp${Math.random().toString(36).slice(2, 8)}1!`;
}

function CreateAccountModal({ prospect, type, open, onClose }: { prospect: ProspectWithMatch; type: string; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const config = ACCOUNT_TYPE_CONFIG[type] ?? ACCOUNT_TYPE_CONFIG.CAFE_OWNER;

  // Prefilled from prospect data where available, never auto-overwriting
  // anything — the admin can correct/complete every field before submitting
  // (Phase 8C). Name sub-fields vary by account type's actual registration
  // shape (buildPayload in landing-page.tsx), not a one-size-fits-all "Name".
  const [cafeName, setCafeName] = useState(prospect?.businessName ?? "");
  const [companyName, setCompanyName] = useState(prospect?.businessName ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactName, setContactName] = useState("");
  const [simpleName, setSimpleName] = useState(prospect?.businessName ?? "");
  const [email, setEmail] = useState(prospect?.email ?? "");
  const [phone, setPhone] = useState(prospect?.phone ?? "");
  const [password, setPassword] = useState(generateTempPassword());
  const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  const buildName = (): string => {
    switch (config.nameShape) {
      case "cafe": return `${firstName} — ${cafeName}`;
      case "person": return `${firstName} ${lastName}`;
      case "simple": return simpleName;
      default: return companyName;
    }
  };
  const nameValid = (): boolean => {
    switch (config.nameShape) {
      case "cafe": return cafeName.trim().length >= 2 && firstName.trim().length >= 2;
      case "person": return firstName.trim().length >= 2 && lastName.trim().length >= 2;
      case "simple": return simpleName.trim().length >= 2;
      default: return companyName.trim().length >= 2;
    }
  };

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/users", {
      name: buildName(), email, phone, password, role: type,
      ...(pickedLocation ? {
        locationAddress: pickedLocation.address,
        locationLat: pickedLocation.lat ? parseFloat(pickedLocation.lat) : null,
        locationLng: pickedLocation.lng ? parseFloat(pickedLocation.lng) : null,
        locationPlaceId: pickedLocation.placeId || null,
        locationDetails: pickedLocation.details ?? null,
      } : {}),
    }),
    onSuccess: () => { toast({ title: `${config.label} account created!` }); onClose(); },
    onError: (err: any) => toast({ title: err?.message ?? "Failed to create account", variant: "destructive" }),
  });

  const canSubmit = email.trim() && nameValid() && (!config.needsLocation || pickedLocation) && !create.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent hideClose className="sm:max-w-md max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
        <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={onClose} aria-label="Close" data-testid="button-close-create-account-modal">
          <X className="w-4 h-4" />
        </button>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><config.icon className="w-4 h-4 text-primary" />Create {config.label} Account</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          {prospect.accountMatch && prospect.accountMatch.status !== "NONE" && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {prospect.accountMatch.status === "MATCHED"
                ? `This prospect already appears to match an existing account (${prospect.accountMatch.accounts[0]?.email}). Creating a new one may duplicate it.`
                : "This prospect has ambiguous matches with existing accounts — verify before creating a new one."}
            </div>
          )}

          {config.nameShape === "cafe" && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nom du café *</Label><Input className="mt-1" value={cafeName} onChange={e => setCafeName(e.target.value)} data-testid="input-create-account-cafename" /></div>
              <div><Label>Prénom *</Label><Input className="mt-1" value={firstName} onChange={e => setFirstName(e.target.value)} data-testid="input-create-account-firstname" /></div>
            </div>
          )}
          {config.nameShape === "company" && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nom de l'entreprise *</Label><Input className="mt-1" value={companyName} onChange={e => setCompanyName(e.target.value)} data-testid="input-create-account-companyname" /></div>
              <div><Label>Contact *</Label><Input className="mt-1" value={contactName} onChange={e => setContactName(e.target.value)} data-testid="input-create-account-contactname" /></div>
            </div>
          )}
          {config.nameShape === "person" && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Prénom *</Label><Input className="mt-1" value={firstName} onChange={e => setFirstName(e.target.value)} data-testid="input-create-account-firstname" /></div>
              <div><Label>Nom *</Label><Input className="mt-1" value={lastName} onChange={e => setLastName(e.target.value)} data-testid="input-create-account-lastname" /></div>
            </div>
          )}
          {config.nameShape === "simple" && (
            <div><Label>Name *</Label><Input className="mt-1" value={simpleName} onChange={e => setSimpleName(e.target.value)} data-testid="input-create-account-name" /></div>
          )}

          <div><Label>Email *</Label><Input className="mt-1" type="email" value={email} onChange={e => setEmail(e.target.value)} data-testid="input-create-account-email" /></div>
          <div><Label>Phone</Label><Input className="mt-1" value={phone} onChange={e => setPhone(e.target.value)} data-testid="input-create-account-phone" /></div>
          <div>
            <Label>Temp Password</Label>
            <PasswordInputField value={password} onChange={setPassword} className="mt-1" autoComplete="new-password" testId="input-create-account-password" toggleTestId="button-toggle-create-account-password" ariaLabel="temporary password" />
          </div>

          {config.needsLocation && (
            <div>
              <Label className="text-xs text-muted-foreground">Location {config.needsLocation && "*"}</Label>
              {pickedLocation ? (
                <div className="mt-1 flex items-start justify-between gap-2 rounded-lg border p-2.5">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{pickedLocation.address || pickedLocation.details?.street}</p>
                    {pickedLocation.details?.street && <p className="text-xs text-muted-foreground truncate">{pickedLocation.details.street}</p>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setLocationModalOpen(true)} data-testid="button-edit-create-account-location">Edit</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="mt-1 w-full" onClick={() => setLocationModalOpen(true)} data-testid="button-pick-create-account-location">
                  <MapPin className="w-3.5 h-3.5 mr-1.5" />Choose location{prospect.address ? ` (from "${prospect.address}")` : ""}
                </Button>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!canSubmit} data-testid="button-submit-create-account">
            {create.isPending ? "Creating..." : "Create Account"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {config.needsLocation && (
        <LocationPickerModal
          open={locationModalOpen}
          mode="account"
          title="Choisissez l'emplacement du compte"
          requireStreetAddress
          initialAddress={pickedLocation?.address ?? prospect.address ?? undefined}
          initialLat={pickedLocation?.lat ?? prospect.latitude ?? undefined}
          initialLng={pickedLocation?.lng ?? prospect.longitude ?? undefined}
          initialDetails={pickedLocation?.details ?? (prospect.city ? ({ municipality: prospect.city } as AddressDetails) : undefined)}
          onClose={() => setLocationModalOpen(false)}
          onConfirm={(loc) => { setPickedLocation(loc); setLocationModalOpen(false); }}
        />
      )}
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: Filters = { search: "", status: "", prospectType: "", city: "", hasPhone: "", hasWebsite: "", minRating: "", sortBy: "createdAt", sortOrder: "desc" };

export default function ProspectingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const isMobile = useIsMobile();
  const [kpiModalOpen, setKpiModalOpen] = useState(false);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [sheetProspect, setSheetProspect] = useState<ProspectWithMatch | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProspectWithMatch | null>(null);
  const [createAccount, setCreateAccount] = useState<{ prospect: ProspectWithMatch; type: string } | null>(null);
  const [typeModalOpen, setTypeModalOpen] = useState(false);

  const LIMIT = 50;

  const queryKey = ["/api/admin/prospecting", filters, page];

  const { data: statsData, isLoading: statsLoading } = useQuery<ProspectStats>({ queryKey: ["/api/admin/prospecting/stats"] });

  // Merged built-in ∪ admin-added types — single source of truth for the Type
  // filter, Edit Details, Add Manually, and Google Places search (Phase 7).
  const { data: prospectTypes = [] } = useQuery<ProspectTypeOption[]>({ queryKey: ["/api/admin/prospecting/types"] });

  const { data, isLoading } = useQuery<{ prospects: ProspectWithMatch[]; total: number }>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (filters.prospectType) params.set("prospectType", filters.prospectType);
      if (filters.city) params.set("city", filters.city);
      if (filters.hasPhone) params.set("hasPhone", filters.hasPhone);
      if (filters.hasWebsite) params.set("hasWebsite", filters.hasWebsite);
      if (filters.minRating) params.set("minRating", filters.minRating);
      params.set("sortBy", filters.sortBy);
      params.set("sortOrder", filters.sortOrder);
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      const res = await fetch(`/api/admin/prospecting?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const rows = data?.prospects ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const updateProspect = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/admin/prospecting/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/prospecting"] }); qc.invalidateQueries({ queryKey: ["/api/admin/prospecting/stats"] }); },
  });

  const deleteProspect = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/prospecting/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/prospecting"] }); qc.invalidateQueries({ queryKey: ["/api/admin/prospecting/stats"] }); toast({ title: "Prospect deleted" }); setDeleteTarget(null); },
  });

  const bulk = useMutation({
    mutationFn: ({ action, ids, data }: { action: string; ids: number[]; data?: any }) =>
      apiRequest("POST", "/api/admin/prospecting/bulk", { action, ids, data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/prospecting"] }); qc.invalidateQueries({ queryKey: ["/api/admin/prospecting/stats"] }); setSelectedIds([]); },
  });

  const handleRowAction = (prospect: ProspectWithMatch, action: string, data?: any) => {
    if (action === "delete") { setDeleteTarget(prospect); return; }
    if (action === "create_account") { setCreateAccount({ prospect, type: data.type }); return; }
    updateProspect.mutate({ id: prospect.id, data: action === "status" ? { status: data.status } : { status: action === "archive" ? "ARCHIVED" : "CALLED", ...(action === "mark_called" ? { lastContactDate: new Date().toISOString() } : {}) } });
  };

  const handleBulkAction = (action: string, data?: any) => {
    if (!selectedIds.length) return;
    bulk.mutate({ action, ids: selectedIds, data });
  };

  const exportCSV = () => {
    window.open("/api/admin/prospecting/export", "_blank");
  };

  const toggleSelect = (id: number) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelectedIds(prev => prev.length === rows.length ? [] : rows.map(r => r.id));

  return (
    <div className="space-y-5 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title={<span className="flex items-center gap-2"><Target className="w-6 h-6 text-primary" />Prospecting</span>}
        subtitle="Discover and manage potential customers & suppliers"
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ["/api/admin/prospecting"] }); qc.invalidateQueries({ queryKey: ["/api/admin/prospecting/stats"] }); }}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-3.5 h-3.5 mr-1.5" />Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Add Manually
            </Button>
            <Button size="sm" onClick={() => setSearchOpen(true)}>
              <Search className="w-3.5 h-3.5 mr-1.5" />Search Google Places
            </Button>
            {isMobile && <KpiOverviewButton onClick={() => setKpiModalOpen(true)} />}
          </div>
        }
      />

      {/* Stats */}
      {!isMobile && <StatsRow stats={statsData} isLoading={statsLoading} />}

      <KpiOverviewModal open={isMobile && kpiModalOpen} onClose={() => setKpiModalOpen(false)}>
        <StatsRow stats={statsData} isLoading={statsLoading} />
      </KpiOverviewModal>

      {/* Filters */}
      <FilterBar filters={filters} onChange={f => { setFilters(prev => ({ ...prev, ...f })); setPage(1); setSelectedIds([]); }} prospectTypes={prospectTypes} onAddType={() => setTypeModalOpen(true)} />

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <BulkActions ids={selectedIds} onClear={() => setSelectedIds([])} onAction={handleBulkAction} />
      )}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox checked={selectedIds.length === rows.length && rows.length > 0} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Distance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(8).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    {Array(13).fill(0).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-12 text-muted-foreground">
                    <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No prospects found. Search Google Places or add manually to get started.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(p => {
                  const statusCfg = STATUS_CONFIG[p.status] ?? { label: p.status, badge: "bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-400", row: "" };
                  const score = computeScore(p);
                  const grade = scoreGrade(score);
                  return (
                    <TableRow
                      key={p.id}
                      className={`cursor-pointer ${statusCfg.row} ${selectedIds.includes(p.id) ? "ring-2 ring-inset ring-primary/30" : ""}`}
                      onClick={() => setSheetProspect(p)}
                    >
                      <TableCell onClick={e => { e.stopPropagation(); toggleSelect(p.id); }}>
                        <Checkbox checked={selectedIds.includes(p.id)} />
                      </TableCell>
                      <TableCell className="max-w-40">
                        <p className="font-medium truncate text-sm">{p.businessName}</p>
                        {p.address && <p className="text-[10px] text-muted-foreground truncate">{p.address}</p>}
                      </TableCell>
                      <TableCell>
                        {p.prospectType ? (
                          <Badge variant="outline" className="text-[10px] whitespace-nowrap">{TYPE_LABELS[p.prospectType] ?? p.prospectType}</Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {p.rating ? (
                          <div className="flex items-center gap-1 text-xs">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {parseFloat(p.rating).toFixed(1)}
                            <span className="text-muted-foreground">({p.reviewCount})</span>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {p.phone ? (
                          <a href={`tel:${p.phone}`} onClick={e => e.stopPropagation()} className="text-xs text-primary hover:underline flex items-center gap-1">
                            <Phone className="w-3 h-3" />{p.phone}
                          </a>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {p.website ? (
                          <a href={p.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-primary hover:underline flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            <span className="max-w-24 truncate">{p.website.replace(/^https?:\/\//, '').split('/')[0]}</span>
                          </a>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><span className="text-xs">{p.city ?? "—"}</span></TableCell>
                      <TableCell><span className="text-xs">{p.distanceKm ? `${p.distanceKm} km` : "—"}</span></TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${statusCfg.badge}`}>{statusCfg.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <AccountMatchBadge match={p.accountMatch} compact />
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${grade.color}`}>{grade.grade}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-[10px] text-muted-foreground">
                          {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}
                        </span>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <RowActions
                          prospect={p}
                          onView={() => setSheetProspect(p)}
                          onAction={(action, data) => handleRowAction(p, action, data)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-muted-foreground">
              {total} prospect{total !== 1 ? "s" : ""} · Page {page} of {totalPages}
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                return (
                  <Button key={pg} size="sm" variant={pg === page ? "default" : "outline"} onClick={() => setPage(pg)}>{pg}</Button>
                );
              })}
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Dialogs & Sheets */}
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} onComplete={() => { qc.invalidateQueries({ queryKey: ["/api/admin/prospecting"] }); qc.invalidateQueries({ queryKey: ["/api/admin/prospecting/stats"] }); }} prospectTypes={prospectTypes} />
      <AddProspectDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/admin/prospecting"] }); qc.invalidateQueries({ queryKey: ["/api/admin/prospecting/stats"] }); }} prospectTypes={prospectTypes} />
      <TypeManagementModal open={typeModalOpen} onClose={() => setTypeModalOpen(false)} prospectTypes={prospectTypes} />

      <ProspectSheet
        prospect={sheetProspect}
        open={!!sheetProspect}
        onClose={() => setSheetProspect(null)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/admin/prospecting"] }); if (sheetProspect) { const updated = rows.find(r => r.id === sheetProspect.id); if (updated) setSheetProspect(updated); } }}
        prospectTypes={prospectTypes}
      />

      {createAccount && (
        <CreateAccountModal
          prospect={createAccount.prospect}
          type={createAccount.type}
          open={true}
          onClose={() => setCreateAccount(null)}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Prospect?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteTarget?.businessName}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteProspect.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

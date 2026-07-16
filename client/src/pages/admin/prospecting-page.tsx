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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Prospect, ProspectStats, ProspectNote, ProspectTimelineEvent, ProspectFollowUp } from "@shared/schema";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; badge: string; row: string }> = {
  NEW:               { label: "New",               badge: "bg-gray-100 text-gray-700",           row: "" },
  NOT_CONTACTED:     { label: "Not Contacted",     badge: "bg-slate-100 text-slate-600",          row: "" },
  CALLED:            { label: "Called",             badge: "bg-blue-100 text-blue-700",            row: "" },
  INTERESTED:        { label: "Interested",         badge: "bg-sky-100 text-sky-700",              row: "bg-sky-50" },
  MEETING_SCHEDULED: { label: "Meeting Scheduled", badge: "bg-purple-100 text-purple-700",        row: "bg-purple-50" },
  WAITING_REPLY:     { label: "Waiting Reply",     badge: "bg-amber-100 text-amber-700",           row: "bg-amber-50" },
  NEGOTIATION:       { label: "Negotiation",       badge: "bg-orange-100 text-orange-700",         row: "bg-orange-50" },
  CONVERTED:         { label: "Converted",         badge: "bg-green-100 text-green-700",           row: "bg-green-50" },
  REJECTED:          { label: "Rejected",          badge: "bg-red-100 text-red-700",               row: "bg-red-50" },
  NOT_INTERESTED:    { label: "Not Interested",    badge: "bg-red-100 text-red-600",               row: "bg-red-50" },
  DUPLICATE:         { label: "Duplicate",         badge: "bg-gray-100 text-gray-500",             row: "bg-gray-50 opacity-60" },
  INVALID:           { label: "Invalid",           badge: "bg-gray-100 text-gray-500",             row: "bg-gray-50 opacity-60" },
  ARCHIVED:          { label: "Archived",          badge: "bg-gray-200 text-gray-500",             row: "bg-gray-50 opacity-60" },
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
  if (score >= 60) return { grade: "A", color: "bg-green-100 text-green-700" };
  if (score >= 40) return { grade: "B", color: "bg-blue-100 text-blue-700" };
  if (score >= 20) return { grade: "C", color: "bg-amber-100 text-amber-700" };
  return { grade: "D", color: "bg-gray-100 text-gray-500" };
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
      <StatCard label="Converted" value={stats.convertedCount} icon={CheckCircle} color="bg-green-100 text-green-600" />
      <StatCard label="Interested" value={stats.interestedCount} icon={TrendingUp} color="bg-sky-100 text-sky-600" />
      <StatCard label="Called Today" value={stats.calledToday} icon={PhoneCall} color="bg-blue-100 text-blue-600" />
      <StatCard label="Follow-ups Today" value={stats.followUpsToday} icon={Calendar} color="bg-purple-100 text-purple-600" />
      <StatCard label="Overdue" value={stats.overdueFollowUps} icon={AlertCircle} color="bg-red-100 text-red-600" />
      <StatCard label="With Phone" value={stats.withPhone} icon={Phone} color="bg-amber-100 text-amber-600" />
      <StatCard label="Avg Rating" value={stats.avgRating.toFixed(1)} icon={Star} color="bg-yellow-100 text-yellow-600" />
    </div>
  );
}

// ── Google Places Search Dialog ───────────────────────────────────────────────

function SearchDialog({ open, onClose, onComplete }: { open: boolean; onClose: () => void; onComplete: () => void }) {
  const { toast } = useToast();
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<{ description: string; place_id: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [radiusKm, setRadiusKm] = useState("5");
  const [keyword, setKeyword] = useState("coffee");
  const [prospectType, setProspectType] = useState("");
  const [minRating, setMinRating] = useState("");
  const [onlyWithPhone, setOnlyWithPhone] = useState(false);
  const [onlyWithWebsite, setOnlyWithWebsite] = useState(false);
  const [includeClosedPlaces, setIncludeClosedPlaces] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<{ saved: number; skipped: number; total: number; pages: string[] } | null>(null);
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
    setIsSearching(true);
    setResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/prospecting/search", {
        address, radiusKm: parseFloat(radiusKm), keyword, prospectType: prospectType || null,
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
      <DialogContent className="sm:max-w-lg">
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
              <Select value={minRating} onValueChange={setMinRating}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  {MIN_RATING_OPTIONS.filter(Boolean).map(r => <SelectItem key={r} value={r}>{r}+</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Keyword */}
          <div>
            <Label>Search Keyword</Label>
            <Input className="mt-1" placeholder="coffee, café, supplier water, printer..." value={keyword} onChange={e => setKeyword(e.target.value)} />
          </div>

          {/* Prospect Type */}
          <div>
            <Label>Prospect Type</Label>
            <Select value={prospectType} onValueChange={setProspectType}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Auto Detect" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Auto Detect</SelectItem>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
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
              Searching... (this may take up to 10 seconds)
            </div>
          )}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
              <p className="text-sm font-semibold text-green-700">Search Complete ✓</p>
              <p className="text-sm text-green-600">Found {result.total} places · Saved {result.saved} · Skipped {result.skipped} duplicates</p>
              {result.pages.map((p, i) => <p key={i} className="text-xs text-green-500">{p}</p>)}
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

function AddProspectDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ businessName: "", prospectType: "", address: "", city: "", phone: "", website: "", email: "", rating: "", notes: "" });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/prospecting", {
      ...form,
      notes: form.notes ? [{ id: Date.now().toString(), text: form.notes, createdAt: new Date().toISOString() }] : [],
    }),
    onSuccess: () => { toast({ title: "Prospect created" }); onSaved(); onClose(); setForm({ businessName: "", prospectType: "", address: "", city: "", phone: "", website: "", email: "", rating: "", notes: "" }); },
    onError: () => toast({ title: "Failed to create prospect", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Prospect Manually</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>Business Name *</Label><Input className="mt-1" value={form.businessName} onChange={e => set("businessName", e.target.value)} /></div>
          <div><Label>Type</Label>
            <Select value={form.prospectType} onValueChange={v => set("prospectType", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>{Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input className="mt-1" value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
            <div><Label>Email</Label><Input className="mt-1" type="email" value={form.email} onChange={e => set("email", e.target.value)} /></div>
          </div>
          <div><Label>Website</Label><Input className="mt-1" value={form.website} onChange={e => set("website", e.target.value)} /></div>
          <div><Label>Address</Label><Input className="mt-1" value={form.address} onChange={e => set("address", e.target.value)} /></div>
          <div><Label>City</Label><Input className="mt-1" value={form.city} onChange={e => set("city", e.target.value)} /></div>
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

type Filters = { search: string; status: string; prospectType: string; city: string; hasPhone: string; hasWebsite: string; sortBy: string; sortOrder: string };

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Partial<Filters>) => void }) {
  const active = Object.values(filters).filter(v => v && v !== 'createdAt' && v !== 'desc').length;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Search by name, phone, city…" value={filters.search} onChange={e => onChange({ search: e.target.value })} />
      </div>
      <Select value={filters.status || "all"} onValueChange={v => onChange({ status: v === "all" ? "" : v })}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.prospectType || "all"} onValueChange={v => onChange({ prospectType: v === "all" ? "" : v })}>
        <SelectTrigger className="w-44"><SelectValue placeholder="Type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input className="w-32" placeholder="City" value={filters.city} onChange={e => onChange({ city: e.target.value })} />
      <Select value={filters.hasPhone || "all"} onValueChange={v => onChange({ hasPhone: v === "all" ? "" : v })}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Phone" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Phone: Any</SelectItem>
          <SelectItem value="true">Has Phone</SelectItem>
          <SelectItem value="false">No Phone</SelectItem>
        </SelectContent>
      </Select>
      <Select value={`${filters.sortBy}:${filters.sortOrder}`} onValueChange={v => { const [by, order] = v.split(':'); onChange({ sortBy: by, sortOrder: order }); }}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
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
        <Button size="sm" variant="ghost" onClick={() => onChange({ search: "", status: "", prospectType: "", city: "", hasPhone: "", hasWebsite: "", sortBy: "createdAt", sortOrder: "desc" })}>
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
  prospect: Prospect;
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
        <DropdownMenuItem onClick={() => onAction("create_account", { type: "CAFE_OWNER" })}><UserPlus className="w-3.5 h-3.5 mr-2" />Create Café Owner</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("create_account", { type: "SUPPLIER" })}><Building2 className="w-3.5 h-3.5 mr-2" />Create Supplier</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("delete")} className="text-destructive focus:text-destructive">
          <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Prospect Detail Sheet ─────────────────────────────────────────────────────

function ProspectSheet({ prospect, open, onClose, onSaved }: {
  prospect: Prospect | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [noteText, setNoteText] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Prospect>>({});

  useEffect(() => { if (prospect) setEditForm({ ...prospect }); setEditMode(false); }, [prospect?.id]);

  const update = useMutation({
    mutationFn: (data: Partial<Prospect>) => apiRequest("PATCH", `/api/admin/prospecting/${prospect!.id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/prospecting"] }); qc.invalidateQueries({ queryKey: ["/api/admin/prospecting/stats"] }); onSaved(); toast({ title: "Saved" }); setEditMode(false); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const addNote = () => {
    if (!noteText.trim() || !prospect) return;
    const notes = [...((prospect.notes as ProspectNote[]) ?? []), { id: Date.now().toString(), text: noteText.trim(), createdAt: new Date().toISOString() }];
    update.mutate({ notes } as any);
    setNoteText("");
  };

  const setFollowUp = (followUp: ProspectFollowUp | null) => {
    update.mutate({ followUp, nextFollowUpDate: followUp ? new Date(`${followUp.date}T${followUp.time ?? '09:00'}`) : null } as any);
  };

  if (!prospect) return null;

  const score = computeScore(prospect);
  const grade = scoreGrade(score);
  const notes = (prospect.notes as ProspectNote[]) ?? [];
  const timeline = (prospect.timeline as ProspectTimelineEvent[]) ?? [];
  const followUp = prospect.followUp as ProspectFollowUp | null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b px-4 pt-4 pb-3">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg leading-tight truncate">{prospect.businessName}</h2>
              {prospect.address && <p className="text-xs text-muted-foreground mt-0.5 truncate">{prospect.address}</p>}
            </div>
            <Badge className={`text-xs shrink-0 ${STATUS_CONFIG[prospect.status]?.badge ?? "bg-gray-100 text-gray-700"}`}>
              {STATUS_CONFIG[prospect.status]?.label ?? prospect.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {prospect.prospectType && <Badge variant="outline" className="text-[10px]">{TYPE_LABELS[prospect.prospectType] ?? prospect.prospectType}</Badge>}
            <Badge className={`text-[10px] ${grade.color}`}>{grade.grade}</Badge>
            {prospect.rating && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {parseFloat(prospect.rating).toFixed(1)} ({prospect.reviewCount} reviews)
              </div>
            )}
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
                      ["Phone", prospect.phone],
                      ["Email", prospect.email],
                      ["Website", prospect.website],
                      ["City", prospect.city],
                      ["Country", prospect.country],
                      ["Distance", prospect.distanceKm ? `${prospect.distanceKm} km` : null],
                      ["Keyword", prospect.keyword],
                      ["Search Radius", prospect.searchRadius ? `${prospect.searchRadius} km` : null],
                    ].filter(([, v]) => v).map(([label, val]) => (
                      <div key={label as string}>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="font-medium truncate">{val}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select value={prospect.status} onValueChange={v => update.mutate({ status: v } as any)}>
                      <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    {prospect.phone && <Button size="sm" variant="outline" onClick={() => window.open(`tel:${prospect.phone}`)}><PhoneCall className="w-3.5 h-3.5 mr-1" />Call</Button>}
                    {prospect.website && <Button size="sm" variant="outline" onClick={() => window.open(prospect.website!, '_blank')}><ExternalLink className="w-3.5 h-3.5 mr-1" />Website</Button>}
                    {prospect.latitude && <Button size="sm" variant="outline" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${prospect.latitude},${prospect.longitude}`, '_blank')}><MapPin className="w-3.5 h-3.5 mr-1" />Maps</Button>}
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
                        followUp.priority === 'URGENT' ? 'bg-red-100 text-red-700' :
                        followUp.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                        followUp.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
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

// ── Create Account Modal ──────────────────────────────────────────────────────

function CreateAccountModal({ prospect, type, open, onClose }: { prospect: Prospect; type: string; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(prospect?.businessName ?? "");
  const [email, setEmail] = useState(prospect?.email ?? "");
  const [phone, setPhone] = useState(prospect?.phone ?? "");
  const [password, setPassword] = useState("TempPass123!");

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/users", { name, email, phone, password, role: type, status: "pending" }),
    onSuccess: () => { toast({ title: `${type === "CAFE_OWNER" ? "Café Owner" : "Supplier"} account created!` }); onClose(); },
    onError: (err: any) => toast({ title: err?.message ?? "Failed to create account", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create {type === "CAFE_OWNER" ? "Café Owner" : "Supplier"} Account</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>Name</Label><Input className="mt-1" value={name} onChange={e => setName(e.target.value)} /></div>
          <div><Label>Email *</Label><Input className="mt-1" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><Label>Phone</Label><Input className="mt-1" value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <div><Label>Temp Password</Label><Input className="mt-1" value={password} onChange={e => setPassword(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !email.trim()}>
            {create.isPending ? "Creating..." : "Create Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: Filters = { search: "", status: "", prospectType: "", city: "", hasPhone: "", hasWebsite: "", sortBy: "createdAt", sortOrder: "desc" };

export default function ProspectingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [sheetProspect, setSheetProspect] = useState<Prospect | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Prospect | null>(null);
  const [createAccount, setCreateAccount] = useState<{ prospect: Prospect; type: string } | null>(null);

  const LIMIT = 50;

  const queryKey = ["/api/admin/prospecting", filters, page];

  const { data: statsData, isLoading: statsLoading } = useQuery<ProspectStats>({ queryKey: ["/api/admin/prospecting/stats"] });

  const { data, isLoading } = useQuery<{ prospects: Prospect[]; total: number }>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (filters.prospectType) params.set("prospectType", filters.prospectType);
      if (filters.city) params.set("city", filters.city);
      if (filters.hasPhone) params.set("hasPhone", filters.hasPhone);
      if (filters.hasWebsite) params.set("hasWebsite", filters.hasWebsite);
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

  const handleRowAction = (prospect: Prospect, action: string, data?: any) => {
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
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="w-6 h-6 text-primary" />
            Prospecting
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Discover and manage potential customers &amp; suppliers</p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      {/* Stats */}
      <StatsRow stats={statsData} isLoading={statsLoading} />

      {/* Filters */}
      <FilterBar filters={filters} onChange={f => { setFilters(prev => ({ ...prev, ...f })); setPage(1); setSelectedIds([]); }} />

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
                <TableHead>Score</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(8).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    {Array(12).fill(0).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                    <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No prospects found. Search Google Places or add manually to get started.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(p => {
                  const statusCfg = STATUS_CONFIG[p.status] ?? { label: p.status, badge: "bg-gray-100 text-gray-700", row: "" };
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
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} onComplete={() => { qc.invalidateQueries({ queryKey: ["/api/admin/prospecting"] }); qc.invalidateQueries({ queryKey: ["/api/admin/prospecting/stats"] }); }} />
      <AddProspectDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["/api/admin/prospecting"] })} />

      <ProspectSheet
        prospect={sheetProspect}
        open={!!sheetProspect}
        onClose={() => setSheetProspect(null)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/admin/prospecting"] }); if (sheetProspect) { const updated = rows.find(r => r.id === sheetProspect.id); if (updated) setSheetProspect(updated); } }}
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

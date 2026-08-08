import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useFavorites } from "@/hooks/use-favorites";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MaintenanceMarketplaceCard } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Wrench, Search, MapPin, Star, MessageCircle, SlidersHorizontal,
  RotateCcw, X, Heart, Clock, Calendar, Shield, Zap, Award, Users,
  Building2, User, Send,
} from "lucide-react";

type AccessLevel = "visitor" | "pending" | "approved";

function useAccessLevel(): AccessLevel {
  const { user } = useAuth();
  if (!user) return "visitor";
  if (["SUPER_ADMIN", "ADMIN", "SUPPLIER"].includes(user.role)) return "approved";
  if (user.role === "CAFE_OWNER" && user.status === "approved") return "approved";
  return "pending";
}

const CATEGORY_ICONS: Record<string, string> = {
  Machines: "⚙️", Infrastructure: "🔌", "Digital & IT": "💻",
  "Mobilier & Design": "🪑", Plomberie: "🚿", Électricité: "⚡",
  Climatisation: "❄️", Menuiserie: "🪵",
};
const TYPE_COLORS: Record<string, string> = {
  Freelance: "bg-blue-100 text-blue-700",
  Company: "bg-purple-100 text-purple-700",
  Agency: "bg-orange-100 text-orange-700",
};
const TYPE_ICONS: Record<string, any> = { Freelance: User, Company: Building2, Agency: Users };

function ratingValue(agent: MaintenanceMarketplaceCard) {
  return agent.rating > 0 ? (agent.rating / 10).toFixed(1) : "—";
}

function StarRating({ agent }: { agent: MaintenanceMarketplaceCard }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      <Star className="w-3 h-3 fill-amber-400" />
      <span className="text-[11px] font-semibold text-gray-700">{ratingValue(agent)}</span>
    </span>
  );
}

function AgentCard({
  agent, onOpenDetail, onContact,
}: {
  agent: MaintenanceMarketplaceCard;
  onOpenDetail: (agent: MaintenanceMarketplaceCard) => void;
  onContact: (agent: MaintenanceMarketplaceCard) => void;
}) {
  const fmt = useFormatCurrency();
  const favoriteId = agent.userId;
  const faved = useFavorites((s) => !!s.maintenance[favoriteId]);
  const toggleMaintenance = useFavorites((s) => s.toggleMaintenance);
  const TypeIcon = TYPE_ICONS[agent.profileType] ?? User;

  return (
    <div
      data-testid={`card-maintenance-${agent.userId}`}
      className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col cursor-pointer"
      onClick={() => onOpenDetail(agent)}
    >
      <button
        className="absolute top-2 right-2 z-10 w-6 h-6 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
        onClick={(event) => {
          event.stopPropagation();
          toggleMaintenance({
            id: favoriteId, name: agent.name, initials: agent.initials,
            specialty: agent.specialty, categories: agent.categories,
            location: agent.location, rating: Number(ratingValue(agent)) || 0,
            available: agent.available,
          });
        }}
        data-testid={`button-fav-maintenance-${agent.userId}`}
      >
        <Heart className={`w-3 h-3 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
      </button>
      <div className="h-2 bg-gradient-to-r from-orange-500 to-amber-500" />
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <Avatar className="w-10 h-10 shrink-0">
            <AvatarFallback className="bg-orange-100 text-orange-700 font-bold text-sm">{agent.initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center justify-between gap-1">
              <h3 className="font-bold text-sm leading-tight truncate group-hover:text-orange-600 transition-colors">{agent.name}</h3>
              <span className={`w-2 h-2 rounded-full shrink-0 ${agent.available ? "bg-green-500" : "bg-gray-300"}`} />
            </div>
            <p className="text-[11px] text-gray-500 truncate">{agent.jobTitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`text-[10px] border-0 px-1.5 flex items-center gap-0.5 ${TYPE_COLORS[agent.profileType] ?? "bg-gray-100 text-gray-700"}`}>
            <TypeIcon className="w-2.5 h-2.5" />{agent.profileType}
          </Badge>
          <span className="flex items-center gap-0.5 text-[11px] text-gray-400"><MapPin className="w-2.5 h-2.5" />{agent.location || "—"}</span>
          <span className="flex items-center gap-0.5 text-[11px] text-gray-400"><Zap className="w-2.5 h-2.5" />{agent.responseTime}</span>
        </div>
        <div className="flex items-center gap-2">
          <StarRating agent={agent} />
          <span className="text-[11px] text-gray-400">({agent.reviewCount} avis)</span>
          <span className="text-[11px] text-gray-400">· {agent.yearsExperience} ans exp.</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {agent.skills.slice(0, 3).map((skill) => <span key={skill} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">{skill}</span>)}
        </div>
        {agent.certifications.length > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-amber-600"><Award className="w-2.5 h-2.5" />{agent.certifications[0]}{agent.certifications.length > 1 ? ` +${agent.certifications.length - 1}` : ""}</div>
        )}
        <div className="mt-auto pt-2 border-t border-gray-50 flex items-center justify-between gap-2">
          <div><p className="text-[10px] text-gray-400">Tarif / jour</p><p className="font-bold text-sm text-orange-600">{fmt(agent.dailyRateInCents)}</p></div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-[11px] border-gray-200 text-gray-600 rounded-lg px-2" onClick={(e) => { e.stopPropagation(); onContact(agent); }}>
              <MessageCircle className="w-3 h-3" />
            </Button>
            <Button size="sm" className="h-7 text-[11px] bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-3" disabled={!agent.available} onClick={(e) => { e.stopPropagation(); onOpenDetail(agent); }}>
              {agent.available ? "Réserver" : "Indisponible"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentDetailModal({
  agent, open, onClose, onContact, onReserve,
}: {
  agent: MaintenanceMarketplaceCard | null;
  open: boolean;
  onClose: () => void;
  onContact: (agent: MaintenanceMarketplaceCard) => void;
  onReserve: (agent: MaintenanceMarketplaceCard, data: { date: string; time: string; location: string; description: string }) => void;
}) {
  const fmt = useFormatCurrency();
  const [booking, setBooking] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const faved = useFavorites((s) => agent ? !!s.maintenance[agent.userId] : false);
  const toggleMaintenance = useFavorites((s) => s.toggleMaintenance);
  if (!agent) return null;

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-2xl border-0 shadow-2xl [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Profil Technicien Maintenance</DialogTitle></VisuallyHidden>
        <div className="bg-white">
          <div className="h-3 bg-gradient-to-r from-orange-500 to-amber-500" />
          <div className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <Avatar className="w-14 h-14"><AvatarFallback className="bg-orange-100 text-orange-700 font-bold text-lg">{agent.initials}</AvatarFallback></Avatar>
                <div>
                  <h2 className="font-bold text-lg leading-tight">{agent.name}</h2>
                  <p className="text-sm text-gray-500">{agent.jobTitle}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={`text-[10px] border-0 px-1.5 ${TYPE_COLORS[agent.profileType] ?? "bg-gray-100 text-gray-700"}`}>{agent.profileType}</Badge>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${agent.available ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{agent.available ? "✓ Disponible" : "Indisponible"}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleMaintenance({ id: agent.userId, name: agent.name, initials: agent.initials, specialty: agent.specialty, categories: agent.categories, location: agent.location, rating: Number(ratingValue(agent)) || 0, available: agent.available })} className="w-9 h-9 rounded-full bg-gray-100 hover:bg-rose-50 flex items-center justify-center"><Heart className={`w-4 h-4 ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} /></button>
                <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><X className="w-4 h-4 text-gray-500" /></button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[{ icon: Star, val: ratingValue(agent), label: `${agent.reviewCount} avis`, color: "text-amber-500" }, { icon: Shield, val: `${agent.yearsExperience} ans`, label: "Expérience", color: "text-blue-500" }, { icon: Zap, val: agent.responseTime, label: "Réponse", color: "text-green-500" }].map((stat) => (
                <div key={stat.label} className="bg-gray-50 rounded-xl p-3 text-center"><stat.icon className={`w-4 h-4 mx-auto mb-1 ${stat.color}`} /><p className="font-bold text-sm">{stat.val}</p><p className="text-[10px] text-gray-400">{stat.label}</p></div>
              ))}
            </div>
            <div className="mb-4"><h3 className="font-semibold text-sm mb-1.5">À propos</h3><p className="text-sm text-gray-600 leading-relaxed">{agent.description || "Aucune description disponible."}</p></div>
            <div className="mb-4"><h3 className="font-semibold text-sm mb-1.5">Catégories & Compétences</h3><div className="flex flex-wrap gap-1.5">{agent.categories.map((item) => <span key={item} className="text-[11px] bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">{item}</span>)}{agent.skills.map((item) => <span key={item} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item}</span>)}</div></div>
            {agent.certifications.length > 0 && <div className="mb-4"><h3 className="font-semibold text-sm mb-1.5 flex items-center gap-1"><Award className="w-3.5 h-3.5 text-amber-500" /> Certifications</h3><div className="flex flex-wrap gap-1.5">{agent.certifications.map((item) => <span key={item} className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">{item}</span>)}</div></div>}
            <div className="mb-4 bg-gray-50 rounded-xl p-3 space-y-2"><h3 className="font-semibold text-sm mb-2">Infos pratiques</h3><div className="flex items-center gap-2 text-sm text-gray-600"><MapPin className="w-3.5 h-3.5 text-orange-500" />Zone d'intervention : {agent.coverageArea || agent.location || "—"}</div><div className="flex items-center gap-2 text-sm text-gray-600"><Clock className="w-3.5 h-3.5 text-orange-500" />Horaires : {agent.workingHours}</div></div>
            {agent.portfolioImages.length > 0 && <div className="mb-4"><h3 className="font-semibold text-sm mb-1.5">Portfolio</h3><div className="grid grid-cols-2 gap-2">{agent.portfolioImages.map((image, i) => <img key={i} src={image} alt={`Portfolio ${i + 1}`} className="w-full h-28 object-cover rounded-xl" />)}</div></div>}
            {!booking ? (
              <div className="border-t border-gray-100 pt-4 flex items-center justify-between gap-3">
                <div><p className="text-xs text-gray-400">Tarif journalier</p><p className="font-bold text-xl text-orange-600">{fmt(agent.dailyRateInCents)}</p></div>
                <div className="flex gap-2"><Button variant="outline" onClick={() => onContact(agent)} className="border-gray-200 text-gray-600 rounded-xl px-4"><MessageCircle className="w-4 h-4 mr-1.5" />Contacter</Button><Button onClick={() => setBooking(true)} disabled={!agent.available} className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl px-5"><Calendar className="w-4 h-4 mr-1.5" />{agent.available ? "Réserver" : "Indisponible"}</Button></div>
              </div>
            ) : (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <h3 className="font-semibold text-sm">Demander une intervention</h3>
                <div className="grid grid-cols-2 gap-3"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
                <Input placeholder="Lieu d'intervention" value={location} onChange={(e) => setLocation(e.target.value)} />
                <Input placeholder="Décrivez votre besoin" value={description} onChange={(e) => setDescription(e.target.value)} />
                <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setBooking(false)}>Annuler</Button><Button disabled={!date} onClick={() => onReserve(agent, { date, time, location, description })} className="bg-orange-600 hover:bg-orange-700 text-white"><Send className="w-4 h-4 mr-1.5" />Envoyer la demande</Button></div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MaintenancePage({ comingSoon = false }: { comingSoon?: boolean }) {
  const { user } = useAuth();
  const accessLevel = useAccessLevel();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterAvailability, setFilterAvailability] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<MaintenanceMarketplaceCard | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { data: profiles = [] } = useQuery<MaintenanceMarketplaceCard[]>({ queryKey: ["/api/maintenance/profiles"] });
  const { data: categories = [] } = useQuery<string[]>({ queryKey: ["/api/maintenance/categories"] });
  const { data: favoriteIds = [] } = useQuery<number[]>({ queryKey: ["/api/maintenance-favorites"], enabled: !!user && accessLevel === "approved" });
  const hydrateMaintenance = useFavorites((s) => s.hydrateMaintenance);

  useEffect(() => { hydrateMaintenance(favoriteIds); }, [favoriteIds, hydrateMaintenance]);
  const allLocations = useMemo(() => Array.from(new Set(profiles.map((item) => item.location).filter(Boolean))).sort(), [profiles]);
  const filtered = useMemo(() => {
    let list = profiles;
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter((item) => [item.name, item.jobTitle, item.description, item.location, ...item.skills, ...item.categories].join(" ").toLowerCase().includes(q)); }
    if (filterCategory) list = list.filter((item) => item.categories.includes(filterCategory));
    if (filterType) list = list.filter((item) => item.profileType === filterType);
    if (filterAvailability === "available") list = list.filter((item) => item.available);
    if (filterAvailability === "unavailable") list = list.filter((item) => !item.available);
    if (filterLocation) list = list.filter((item) => item.location === filterLocation);
    return list;
  }, [profiles, search, filterCategory, filterType, filterAvailability, filterLocation]);
  const reserve = useMutation({
    mutationFn: ({ agent, data }: { agent: MaintenanceMarketplaceCard; data: { date: string; time: string; location: string; description: string } }) =>
      apiRequest("POST", "/api/maintenance/reservations", { maintenanceUserId: agent.userId, service: agent.jobTitle, category: agent.specialty, ...data }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/maintenance/reservations"] }); setDetailOpen(false); toast({ title: "Demande envoyée", description: "Le technicien pourra maintenant la confirmer." }); },
    onError: (error: Error) => toast({ title: "Impossible d'envoyer la demande", description: error.message, variant: "destructive" }),
  });
  const contact = async (agent: MaintenanceMarketplaceCard) => {
    try { await apiRequest("POST", "/api/messages/conversations", { targetUserId: agent.userId }); navigate("/cafe/messages"); }
    catch (error) { toast({ title: "Contact impossible", description: error instanceof Error ? error.message : "Veuillez réessayer.", variant: "destructive" }); }
  };
  const hasFilters = !!(search || filterCategory || filterType || filterAvailability || filterLocation);
  const openDetail = (agent: MaintenanceMarketplaceCard) => { setSelectedAgent(agent); setDetailOpen(true); };

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="relative pt-12 pb-16 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-900/90 via-orange-800/85 to-amber-900/90" />
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm"><Wrench className="w-10 h-10 text-white" /></div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">BigBoss <span className="text-orange-200">MAINTENANCE</span></h1>
          <p className="text-orange-100 text-lg mb-6 max-w-xl mx-auto">Trouvez des techniciens certifiés pour la maintenance et réparation de vos équipements de café</p>
          <div className="flex items-center justify-center gap-6 flex-wrap text-orange-100 text-sm"><span className="flex items-center gap-1.5"><Users className="w-4 h-4" />{profiles.filter((item) => item.available).length} techniciens disponibles</span><span className="flex items-center gap-1.5"><Shield className="w-4 h-4" />{profiles.filter((item) => item.certifications.length > 0).length} certifiés</span><span className="flex items-center gap-1.5"><Zap className="w-4 h-4" />Intervention rapide</span></div>
        </div>
      </section>
      {comingSoon ? <div className="max-w-3xl mx-auto px-4 py-20 text-center"><Clock className="w-8 h-8 text-orange-600 mx-auto mb-5" /><h2 className="text-xl font-bold text-gray-900 mb-2">Bientôt disponible</h2><p className="text-sm text-gray-500">Ce service est en cours de préparation. Revenez bientôt pour le découvrir.</p></div> : (
        <>
          <div className="bg-white border-b border-gray-100 sticky top-0 z-20"><div className="max-w-7xl mx-auto px-4 py-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}><button onClick={() => setFilterCategory("")} className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 border ${!filterCategory ? "bg-orange-600 text-white border-orange-600" : "bg-white text-gray-600 border-gray-200"}`}>Tous</button>{categories.map((category) => <button key={category} onClick={() => setFilterCategory(filterCategory === category ? "" : category)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 border ${filterCategory === category ? "bg-orange-600 text-white border-orange-600" : "bg-white text-gray-600 border-gray-200"}`}><span>{CATEGORY_ICONS[category] ?? "🛠️"}</span>{category}</button>)}</div></div>
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="bg-white border border-gray-100 rounded-2xl p-3 mb-5 shadow-sm"><div className="flex items-center gap-2 flex-wrap"><SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" /><div className="relative flex-1 min-w-[180px] max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, compétence, service..." className="h-7 text-xs pl-8 border-gray-200 bg-gray-50 rounded-full" /></div><Select value={filterType || "__all__"} onValueChange={(value) => setFilterType(value === "__all__" ? "" : value)}><SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[120px]"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent><SelectItem value="__all__">Tous types</SelectItem><SelectItem value="Freelance">Freelance</SelectItem><SelectItem value="Company">Entreprise</SelectItem><SelectItem value="Agency">Agence</SelectItem></SelectContent></Select><Select value={filterAvailability || "__all__"} onValueChange={(value) => setFilterAvailability(value === "__all__" ? "" : value)}><SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[130px]"><SelectValue placeholder="Disponibilité" /></SelectTrigger><SelectContent><SelectItem value="__all__">Toutes disponibilités</SelectItem><SelectItem value="available">Disponible</SelectItem><SelectItem value="unavailable">Indisponible</SelectItem></SelectContent></Select><Select value={filterLocation || "__all__"} onValueChange={(value) => setFilterLocation(value === "__all__" ? "" : value)}><SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[110px]"><SelectValue placeholder="Ville" /></SelectTrigger><SelectContent><SelectItem value="__all__">Toutes villes</SelectItem>{allLocations.map((location) => <SelectItem key={location} value={location}>{location}</SelectItem>)}</SelectContent></Select>{hasFilters && <button onClick={() => { setSearch(""); setFilterCategory(""); setFilterType(""); setFilterAvailability(""); setFilterLocation(""); }} className="flex items-center gap-1 text-xs text-destructive"><RotateCcw className="w-3 h-3" />Reset</button>}</div></div>
            {filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-16 gap-3 text-center"><Wrench className="w-12 h-12 text-gray-200" /><p className="font-semibold text-gray-700">Aucun technicien trouvé</p><p className="text-sm text-gray-400">{profiles.length === 0 ? "Aucun profil Maintenance publié pour le moment." : "Essayez d'ajuster vos filtres."}</p></div> : <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{filtered.map((agent) => <AgentCard key={agent.userId} agent={agent} onOpenDetail={openDetail} onContact={contact} />)}</div>}
          </div>
          <AgentDetailModal agent={selectedAgent} open={detailOpen} onClose={() => setDetailOpen(false)} onContact={contact} onReserve={(agent, data) => reserve.mutate({ agent, data })} />
        </>
      )}
    </div>
  );
}
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Star, MapPin, Package, Search, Phone, Globe, ShoppingBag } from "lucide-react";
import "leaflet/dist/leaflet.css";

const fakeSuppliers = [
  { id: 1, name: "Premium Beans Co", category: "Coffee Beans", location: "Tunis Centre, Tunisia", lat: 36.8065, lng: 10.1815, rating: 4.9, orders: 14, products: 12, favorite: true, phone: "+216 71 234 001", website: "www.premiumbeans.tn", description: "Specialty coffee importer with a focus on single-origin beans from Ethiopia and Colombia.", tags: ["Single Origin", "Specialty", "Direct Trade"] },
  { id: 2, name: "Oat & Grain Supply", category: "Dairy Alternatives", location: "Sfax, Tunisia", lat: 34.7406, lng: 10.7603, rating: 4.7, orders: 9, products: 8, favorite: true, phone: "+216 74 345 002", website: "www.oatgrain.tn", description: "Barista-grade plant-based milks and dairy alternatives for modern cafés.", tags: ["Vegan", "Barista Grade", "Plant-Based"] },
  { id: 3, name: "Arabica Direct", category: "Coffee Beans", location: "Sousse, Tunisia", lat: 35.8245, lng: 10.6346, rating: 4.5, orders: 6, products: 15, favorite: false, phone: "+216 73 456 003", website: "www.arabicadirect.tn", description: "Direct trade arabica beans sourced from Yemen and Kenya with full traceability.", tags: ["Direct Trade", "Arabica", "Certified"] },
  { id: 4, name: "TunRoast", category: "Roasted Coffee", location: "Ariana, Tunisia", lat: 36.8666, lng: 10.1647, rating: 4.6, orders: 4, products: 10, favorite: true, phone: "+216 70 567 004", website: "www.tunroast.tn", description: "Local artisan roaster offering fresh espresso and filter roasts weekly.", tags: ["Artisan", "Fresh Roast", "Local"] },
  { id: 5, name: "CaféEquip Pro", category: "Equipment & Supplies", location: "Monastir, Tunisia", lat: 35.7643, lng: 10.8113, rating: 4.3, orders: 2, products: 30, favorite: false, phone: "+216 73 678 005", website: "www.cafeequip.tn", description: "Full range of café equipment, cups, filters, and packaging supplies.", tags: ["Equipment", "Wholesale", "Eco-Friendly"] },
  { id: 6, name: "Capsule Express", category: "Capsules & Pods", location: "Bizerte, Tunisia", lat: 37.2744, lng: 9.8739, rating: 4.4, orders: 3, products: 20, favorite: false, phone: "+216 72 789 006", website: "www.capsuleexpress.tn", description: "Nespresso-compatible and proprietary capsules for high-volume cafés.", tags: ["Capsules", "Compatible", "Bulk"] },
];

function SupplierMap({ suppliers, selectedId, onSelect }: { suppliers: typeof fakeSuppliers; selectedId: number | null; onSelect: (id: number) => void }) {
  const [MapComponents, setMapComponents] = useState<any>(null);

  useEffect(() => {
    import("react-leaflet").then((rl) => {
      import("leaflet").then((L) => {
        delete (L.default.Icon.Default.prototype as any)._getIconUrl;
        L.default.Icon.Default.mergeOptions({
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        });
        setMapComponents({ MapContainer: rl.MapContainer, TileLayer: rl.TileLayer, Marker: rl.Marker, Popup: rl.Popup });
      });
    });
  }, []);

  if (!MapComponents) {
    return (
      <div className="w-full h-72 rounded-xl bg-muted flex items-center justify-center">
        <p className="text-muted-foreground text-sm animate-pulse">Loading map...</p>
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Popup } = MapComponents;

  return (
    <MapContainer center={[36.2, 10.2]} zoom={7} className="w-full rounded-xl z-0" style={{ height: 300 }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
      {suppliers.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} eventHandlers={{ click: () => onSelect(s.id) }}>
          <Popup>
            <div className="min-w-[120px]">
              <p className="font-bold text-sm">{s.name}</p>
              <p className="text-xs text-gray-500">{s.category}</p>
              <p className="text-xs text-gray-500 mt-1">⭐ {s.rating} · {s.products} products</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

function SupplierDetail({ supplier, onClose }: { supplier: typeof fakeSuppliers[0]; onClose: () => void }) {
  const [favorites, setFavorites] = useState<Set<number>>(new Set([1, 2, 4]));
  const toggle = (id: number) => setFavorites(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Card className="border-primary/20 shadow-lg">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-2xl font-black text-primary">{supplier.name.charAt(0)}</span>
            </div>
            <div>
              <h3 className="font-bold text-lg text-foreground">{supplier.name}</h3>
              <Badge variant="secondary" className="mt-1 text-xs">{supplier.category}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => toggle(supplier.id)} data-testid={`button-detail-fav-${supplier.id}`}>
              <Star className={`w-5 h-5 transition-colors ${favorites.has(supplier.id) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
            </button>
            <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">Close</Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{supplier.description}</p>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {supplier.tags.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { icon: Star, label: "Rating", value: `${supplier.rating}/5`, cls: "text-amber-500" },
            { icon: Package, label: "Products", value: supplier.products, cls: "text-primary" },
            { icon: ShoppingBag, label: "My Orders", value: supplier.orders, cls: "text-green-600" },
            { icon: MapPin, label: "Location", value: supplier.location.split(",")[0], cls: "text-foreground" },
          ].map(({ icon: Icon, label, value, cls }) => (
            <div key={label} className="bg-muted/40 rounded-lg p-3 text-center">
              <Icon className={`w-4 h-4 mx-auto mb-1 ${cls}`} />
              <p className="text-[10px] text-muted-foreground">{label}</p>
              <p className="text-xs font-bold">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 text-xs text-muted-foreground mb-4">
          <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{supplier.phone}</span>
          <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />{supplier.website}</span>
          <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{supplier.location}</span>
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" data-testid={`button-detail-browse-${supplier.id}`}>Browse Products</Button>
          <Button size="sm" variant="outline" className="flex-1" data-testid={`button-detail-contact-${supplier.id}`}>Contact Supplier</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CafeSuppliersPage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set(fakeSuppliers.filter((s) => s.favorite).map((s) => s.id)));

  const toggle = (id: number) => setFavorites((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filtered = fakeSuppliers.filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.category.toLowerCase().includes(search.toLowerCase())
  );

  const selected = fakeSuppliers.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Browse and favorite your trusted suppliers.</p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input data-testid="input-search-suppliers" className="pl-9" placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Map */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" /> Supplier Locations — Click a pin to view details
          </p>
          <SupplierMap suppliers={fakeSuppliers} selectedId={selectedId} onSelect={setSelectedId} />
        </CardContent>
      </Card>

      {/* Selected supplier detail */}
      {selected && <SupplierDetail supplier={selected} onClose={() => setSelectedId(null)} />}

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((s) => (
          <Card
            key={s.id}
            className={`flex flex-col cursor-pointer transition-all hover:shadow-md ${selectedId === s.id ? "ring-2 ring-primary" : ""}`}
            onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
            data-testid={`card-supplier-${s.id}`}
          >
            <CardContent className="p-5 flex flex-col gap-3 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{s.name}</p>
                  <Badge variant="secondary" className="mt-1 text-xs">{s.category}</Badge>
                </div>
                <button data-testid={`button-favorite-${s.id}`} onClick={(e) => { e.stopPropagation(); toggle(s.id); }} className="mt-0.5 shrink-0">
                  <Star className={`w-5 h-5 transition-colors ${favorites.has(s.id) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                </button>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.description}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-auto pt-2 border-t border-border/40">
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {s.location.split(",")[0]}</span>
                <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {s.products} products</span>
                <span className="flex items-center gap-1"><Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {s.rating}</span>
              </div>
              <Button size="sm" variant="outline" className="w-full mt-1" data-testid={`button-view-${s.id}`} onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); }}>
                View Details
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

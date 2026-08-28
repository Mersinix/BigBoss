import { useState, useRef, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Upload, X, Star, Clock, MapPin, FileImage,
  ShoppingCart, Check, Package, Scissors
} from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";
import { useThemeStore } from "@/store/theme-store";
import type { PrintCatalogCard } from "@shared/schema";

function useTheme(isDark: boolean) {
  return {
    pageBg: isDark ? "bg-gray-900" : "bg-gray-50",
    cardBg: isDark ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    textSubtle: isDark ? "text-gray-500" : "text-gray-400",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    mutedBg: isDark ? "bg-gray-700/60" : "bg-gray-50",
  };
}

// ── Star Rating ───────────────────────────────────────────────────────────────

function StarRating({ rating, count, isDark }: { rating: number; count: number; isDark: boolean }) {
  if (count === 0) {
    return <span className={`text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>Aucun avis</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {[1,2,3,4,5].map((s) => (
          <Star
            key={s}
            className={`w-4 h-4 ${s <= Math.round(rating) ? "fill-amber-400 text-amber-400" : isDark ? "text-gray-600" : "text-gray-200"}`}
          />
        ))}
      </div>
      <span className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>{rating.toFixed(1)} ({count} avis)</span>
    </div>
  );
}

// ── File Upload ───────────────────────────────────────────────────────────────

function FileUploadArea({ fileName, previewUrl, onFile, onClear, isDark }: {
  fileName: string | null;
  previewUrl: string | null;
  onFile: (file: File, dataUrl: string) => void;
  onClear: () => void;
  isDark: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onFile(file, reader.result as string);
    reader.readAsDataURL(file);
  }, [onFile]);

  if (previewUrl && fileName) {
    const isPdf = fileName.toLowerCase().endsWith(".pdf");
    return (
      <div className={`border-2 border-blue-400/40 rounded-xl p-4 ${isDark ? "bg-blue-950/40" : "bg-blue-50"}`}>
        <div className="flex items-start gap-3">
          {isPdf ? (
            <div className="w-16 h-16 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-red-500 font-bold text-xs">PDF</span>
            </div>
          ) : (
            <img src={previewUrl} alt="Aperçu" className="w-16 h-16 rounded-lg object-cover border border-blue-400/40 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold truncate ${isDark ? "text-gray-100" : "text-gray-800"}`}>{fileName}</p>
            <p className="text-xs text-blue-600 mt-0.5">Fichier chargé avec succès</p>
            <button onClick={onClear} className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 mt-2">
              <X className="w-3 h-3" /> Supprimer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center hover:border-blue-400 transition-all cursor-pointer ${isDark ? "border-gray-600 hover:bg-blue-950/20" : "border-gray-300 hover:bg-blue-50/30"}`}
      onClick={() => inputRef.current?.click()}
    >
      <Upload className={`w-8 h-8 mx-auto mb-3 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
      <p className={`text-sm font-semibold mb-1 ${isDark ? "text-gray-200" : "text-gray-700"}`}>Glissez ou cliquez pour uploader</p>
      <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>PNG, JPG, SVG, PDF — max 10 Mo</p>
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.svg,.pdf"
        className="hidden"
        onChange={handleChange}
        data-testid="input-file-upload"
      />
    </div>
  );
}

// ── Main Detail Page ───────────────────────────────────────────────────────────

export default function PrintDetailPage() {
  const params = useParams<{ productId: string }>();
  const { addPrintItem } = useCart();
  const { toast } = useToast();
  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);
  const fmt = useFormatCurrency();

  const { data: card, isLoading, isError } = useQuery<PrintCatalogCard>({
    queryKey: ["/api/print/marketplace", params.productId],
    enabled: !!params.productId,
  });

  // Customization state — the real PrintCatalogItem schema has no per-item
  // color/size variants (only a flat materials[] and a single unit/price), so
  // customization here is limited to what the catalog item actually supports:
  // an optional material choice, a plain quantity, an uploaded design file and
  // free-text notes.
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [material, setMaterial] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState("");
  const [added, setAdded] = useState(false);
  const [initializedFor, setInitializedFor] = useState<number | null>(null);

  // Seed material/quantity defaults once the card has loaded.
  if (card && initializedFor !== card.id) {
    setInitializedFor(card.id);
    setMaterial(card.materials[0] ?? "");
    setQuantity(card.minQuantity || 1);
  }

  if (isLoading) {
    return (
      <div className={`min-h-screen ${t.pageBg}`}>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Skeleton className="h-5 w-40 mb-6" />
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
            <Skeleton className="h-96 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !card) {
    return (
      <div className={`min-h-screen ${t.pageBg} flex flex-col items-center justify-center gap-4 px-4`}>
        <Package className={`w-16 h-16 ${t.textSubtle}`} />
        <p className={`font-semibold ${t.textMuted}`}>Service introuvable</p>
        <Link href="/print">
          <Button variant="outline">Retour aux services PRINT</Button>
        </Link>
      </div>
    );
  }

  const starRating = card.rating / 10;
  const subtotal = card.priceInCents * quantity;

  const handleAddToCart = () => {
    if (quantity < card.minQuantity) {
      toast({
        title: "Quantité insuffisante",
        description: `Quantité minimum : ${card.minQuantity} ${card.unit}(s)`,
        variant: "destructive",
      });
      return;
    }

    addPrintItem({
      catalogItemId: card.id,
      name: card.name,
      imageUrl: card.imageUrl,
      printerId: card.printerId,
      printerName: card.printerName,
      productionTimeDays: card.productionTimeDays,
      unitPriceInCents: card.priceInCents,
      unit: card.unit,
      minQuantity: card.minQuantity,
      quantity,
      material,
      uploadedFileDataUrl: uploadedDataUrl,
      uploadedFileName,
      notes,
    });

    setAdded(true);
    toast({
      title: "Ajouté au panier !",
      description: `${card.name} × ${quantity} ${card.unit}(s)`,
    });
    setTimeout(() => setAdded(false), 2500);
  };

  return (
    <div className={`min-h-screen ${t.pageBg}`}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Back */}
        <Link href="/print" className={`inline-flex items-center gap-2 text-sm ${t.textMuted} hover:text-blue-600 transition-colors mb-6`}>
          <ArrowLeft className="w-4 h-4" />
          Retour aux services PRINT
        </Link>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* ── Left: Product Info ── */}
          <div className="space-y-6">
            {/* Image */}
            <div className={`rounded-2xl overflow-hidden aspect-[4/3] border shadow-sm ${t.cardBg}`}>
              {card.imageUrl ? (
                <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Package className={`w-14 h-14 ${t.textSubtle}`} /></div>
              )}
            </div>

            {/* Info card */}
            <div className={`${t.cardBg} rounded-2xl border shadow-sm p-6 space-y-4`}>
              <div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {card.category && (
                    <Badge className="bg-blue-100 text-blue-700 border-0">
                      {card.category}
                    </Badge>
                  )}
                  {card.subCategory && (
                    <Badge variant="outline" className={t.textMuted}>{card.subCategory}</Badge>
                  )}
                </div>
                <h1 className={`text-2xl font-bold ${t.textPrimary}`}>{card.name}</h1>
                <p className={`${t.textMuted} text-sm mt-2 leading-relaxed`}>{card.description}</p>
              </div>

              <StarRating rating={starRating} count={card.reviewCount} isDark={isDark} />

              {card.printerName && (
                <div className={`flex items-start gap-3 p-3 rounded-xl ${t.mutedBg}`}>
                  <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-sm">{card.printerName.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{card.printerName}</p>
                    <div className={`flex items-center gap-3 text-xs ${t.textMuted} mt-0.5`}>
                      {card.printerLocation && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{card.printerLocation}</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Livraison {card.productionTimeDays}j</span>
                    </div>
                  </div>
                </div>
              )}

              <div className={`flex items-center justify-between text-sm ${t.textMuted} pt-1`}>
                <span>Min. commande :</span>
                <span className={`font-semibold ${t.textPrimary}`}>{card.minQuantity} {card.unit}(s)</span>
              </div>
            </div>
          </div>

          {/* ── Right: Customization ── */}
          <div className="space-y-5">
            <div className={`${t.cardBg} rounded-2xl border shadow-sm p-6 space-y-6`}>
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Scissors className="w-5 h-5 text-blue-600" />
                Personnalisation
              </h2>

              {/* File Upload */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <FileImage className="w-3.5 h-3.5 text-blue-600" /> Logo / Fichier de design
                </Label>
                  <FileUploadArea
                    isDark={isDark}
                  fileName={uploadedFileName}
                  previewUrl={uploadedDataUrl}
                  onFile={(file, dataUrl) => {
                    setUploadedFileName(file.name);
                    setUploadedDataUrl(dataUrl);
                  }}
                  onClear={() => { setUploadedFileName(null); setUploadedDataUrl(null); }}
                />
              </div>

              {/* Material */}
              {card.materials.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Matière</Label>
                    <div className="flex flex-wrap gap-2">
                      {card.materials.map((m) => (
                        <button
                          key={m}
                          onClick={() => setMaterial(m)}
                          data-testid={`button-material-${m.toLowerCase().replace(/\s+/g, "-")}`}
                          className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                            material === m
                              ? "bg-blue-600 text-white border-blue-600"
                              : `${isDark ? "border-gray-700 text-gray-300 hover:border-blue-400" : "border-gray-200 text-gray-600 hover:border-blue-300"} hover:text-blue-600`
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Quantity */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-blue-600" /> Quantité totale
                </Label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity((q) => Math.max(card.minQuantity, q - (card.minQuantity > 10 ? 10 : 1)))}
                    className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors text-lg font-bold ${isDark ? "border-gray-700 hover:bg-gray-700" : "border-gray-200 hover:bg-gray-100"}`}
                    data-testid="button-qty-decrease"
                  >−</button>
                  <Input
                    type="number"
                    value={quantity}
                    min={card.minQuantity}
                    onChange={(e) => setQuantity(Math.max(card.minQuantity, parseInt(e.target.value) || card.minQuantity))}
                    className="h-9 w-24 text-center font-semibold"
                    data-testid="input-quantity"
                  />
                  <button
                    onClick={() => setQuantity((q) => q + (card.minQuantity > 10 ? 10 : 1))}
                    className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors text-lg font-bold ${isDark ? "border-gray-700 hover:bg-gray-700" : "border-gray-200 hover:bg-gray-100"}`}
                    data-testid="button-qty-increase"
                  >+</button>
                  <span className={`text-sm ${t.textSubtle}`}>{card.unit}(s)</span>
                </div>
                {card.minQuantity > 1 && (
                  <p className={`text-xs ${t.textSubtle}`}>Min. {card.minQuantity} {card.unit}(s)</p>
                )}
              </div>

              <Separator />

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Instructions spéciales</Label>
                <Textarea
                  placeholder="Ex. : Logo sur la poitrine, impression recto-verso, finition dorée…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[90px] text-sm resize-none"
                  data-testid="textarea-notes"
                />
              </div>
            </div>

            {/* Price Summary + CTA */}
            <div className={`rounded-2xl border shadow-sm p-6 space-y-4 sticky top-6 ${isDark ? "bg-gray-800 border-blue-900/60" : "bg-white border-blue-100"}`}>
              <h3 className={`font-bold ${t.textPrimary}`}>Récapitulatif</h3>
              <div className="space-y-2 text-sm">
                <div className={`flex justify-between ${t.textMuted}`}>
                  <span>Prix unitaire</span>
                  <span className="font-medium">{fmt(card.priceInCents)} / {card.unit}</span>
                </div>
                <div className={`flex justify-between ${t.textMuted}`}>
                  <span>Quantité</span>
                  <span className="font-medium">{quantity} {card.unit}(s)</span>
                </div>
                {material && (
                  <div className={`flex justify-between ${t.textMuted}`}>
                    <span>Matière</span>
                    <span className="font-medium">{material}</span>
                  </div>
                )}
                <div className={`flex justify-between ${t.textMuted}`}>
                  <span>Livraison estimée</span>
                  <span className="font-medium flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {card.productionTimeDays}j
                  </span>
                </div>
                <div className={`border-t pt-3 flex justify-between items-center ${t.border}`}>
                  <span className={`font-bold ${t.textPrimary}`}>Sous-total</span>
                  <span className="text-xl font-bold text-blue-600">{fmt(subtotal)}</span>
                </div>
              </div>

              <Button
                onClick={handleAddToCart}
                disabled={added}
                className={`w-full h-12 text-base font-semibold rounded-xl transition-all ${
                  added
                    ? "bg-green-600 hover:bg-green-600"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
                data-testid="button-add-to-cart"
              >
                {added ? (
                  <span className="flex items-center gap-2"><Check className="w-5 h-5" /> Ajouté au panier !</span>
                ) : (
                  <span className="flex items-center gap-2"><ShoppingCart className="w-5 h-5" /> Ajouter au panier</span>
                )}
              </Button>

              <Link href="/cart">
                <button className="w-full text-sm text-blue-600 hover:text-blue-700 underline underline-offset-2 transition-colors" data-testid="link-view-cart">
                  Voir le panier
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

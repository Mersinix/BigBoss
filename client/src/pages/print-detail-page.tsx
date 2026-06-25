import { useState, useRef, useCallback } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Upload, X, Star, Clock, MapPin, FileImage,
  ShoppingCart, Check, Package, Palette, Scissors, Ruler
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";
import {
  getPrintProduct, getPrintBrand, getPrintCategory, getPrintSubCategory,
  COLOR_SWATCHES, SIZE_OPTIONS,
} from "@/data/print-data";

// ── Star Rating ───────────────────────────────────────────────────────────────

function StarRating({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {[1,2,3,4,5].map((s) => (
          <Star
            key={s}
            className={`w-4 h-4 ${s <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-gray-200"}`}
          />
        ))}
      </div>
      <span className="text-sm text-gray-500">{rating.toFixed(1)} ({count} avis)</span>
    </div>
  );
}

// ── Color Swatch Selector ─────────────────────────────────────────────────────

function ColorSelector({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold flex items-center gap-1.5">
        <Palette className="w-3.5 h-3.5 text-blue-600" /> {label}
      </Label>
      <div className="flex flex-wrap gap-2">
        {COLOR_SWATCHES.map((c) => (
          <button
            key={c.value}
            title={c.name}
            onClick={() => onChange(c.value)}
            className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${
              value === c.value ? "border-blue-600 scale-110 shadow-md" : "border-gray-200"
            }`}
            style={{ backgroundColor: c.value }}
            data-testid={`color-${c.name.toLowerCase()}`}
          />
        ))}
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={value || "#1A1A1A"}
            onChange={(e) => onChange(e.target.value)}
            className="w-7 h-7 rounded-full border-2 border-gray-200 cursor-pointer overflow-hidden p-0"
            title="Couleur personnalisée"
          />
          <span className="text-xs text-gray-400">Personnalisé</span>
        </div>
      </div>
      {value && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-4 h-4 rounded-full border border-gray-200" style={{ backgroundColor: value }} />
          {COLOR_SWATCHES.find((c) => c.value === value)?.name ?? value}
        </div>
      )}
    </div>
  );
}

// ── Size Matrix ───────────────────────────────────────────────────────────────

function SizeMatrix({ sizeMatrix, onChange }: {
  sizeMatrix: Record<string, number>;
  onChange: (matrix: Record<string, number>) => void;
}) {
  const total = Object.values(sizeMatrix).reduce((s, v) => s + v, 0);
  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold flex items-center gap-1.5">
        <Ruler className="w-3.5 h-3.5 text-blue-600" /> Quantité par taille
      </Label>
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Taille</th>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Quantité</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {SIZE_OPTIONS.map((size) => (
              <tr key={size} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-2.5">
                  <Badge variant="outline" className="font-bold text-xs">{size}</Badge>
                </td>
                <td className="px-4 py-2">
                  <Input
                    type="number"
                    min="0"
                    value={sizeMatrix[size] ?? 0}
                    onChange={(e) => onChange({ ...sizeMatrix, [size]: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="h-8 w-24 text-sm"
                    data-testid={`input-size-${size.toLowerCase()}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-blue-50 border-t border-blue-100">
            <tr>
              <td className="px-4 py-2.5 font-bold text-blue-700">Total</td>
              <td className="px-4 py-2.5 font-bold text-blue-700" data-testid="text-total-qty">{total} pièce{total !== 1 ? "s" : ""}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── File Upload ───────────────────────────────────────────────────────────────

function FileUploadArea({ fileName, previewUrl, onFile, onClear }: {
  fileName: string | null;
  previewUrl: string | null;
  onFile: (file: File, dataUrl: string) => void;
  onClear: () => void;
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
      <div className="border-2 border-blue-200 rounded-xl p-4 bg-blue-50">
        <div className="flex items-start gap-3">
          {isPdf ? (
            <div className="w-16 h-16 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-red-500 font-bold text-xs">PDF</span>
            </div>
          ) : (
            <img src={previewUrl} alt="Aperçu" className="w-16 h-16 rounded-lg object-cover border border-blue-200 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{fileName}</p>
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
      className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer"
      onClick={() => inputRef.current?.click()}
    >
      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
      <p className="text-sm font-semibold text-gray-700 mb-1">Glissez ou cliquez pour uploader</p>
      <p className="text-xs text-gray-400">PNG, JPG, SVG, PDF — max 10 Mo</p>
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

  const product = getPrintProduct(params.productId ?? "");
  const brand = product ? getPrintBrand(product.brandId) : null;
  const category = product ? getPrintCategory(product.categoryId) : null;
  const subCategory = product ? getPrintSubCategory(product.subCategoryId) : null;

  // Customization state
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#1A1A1A");
  const [secondaryColor, setSecondaryColor] = useState("#FFFFFF");
  const [material, setMaterial] = useState(product?.materials?.[0] ?? "");
  const [sizeMatrix, setSizeMatrix] = useState<Record<string, number>>(
    Object.fromEntries(SIZE_OPTIONS.map((s) => [s, 0]))
  );
  const [generalQuantity, setGeneralQuantity] = useState(product?.minQuantity ?? 1);
  const [notes, setNotes] = useState("");
  const [added, setAdded] = useState(false);

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-4">
        <Package className="w-16 h-16 text-gray-200" />
        <p className="font-semibold text-gray-600">Service introuvable</p>
        <Link href="/print">
          <Button variant="outline">Retour aux services PRINT</Button>
        </Link>
      </div>
    );
  }

  const totalQuantity = product.hasSizes
    ? Object.values(sizeMatrix).reduce((s, v) => s + v, 0)
    : generalQuantity;

  const subtotal = product.basePrice * totalQuantity;

  const handleAddToCart = () => {
    if (totalQuantity < product.minQuantity) {
      toast({
        title: "Quantité insuffisante",
        description: `Quantité minimum : ${product.minQuantity} ${product.priceUnit}(s)`,
        variant: "destructive",
      });
      return;
    }

    addPrintItem({
      printProductId: product.id,
      printProductName: product.name,
      printProductImage: product.imageUrl,
      brandId: product.brandId,
      brandName: brand?.name ?? "",
      deliveryTime: product.deliveryTime,
      uploadedFileDataUrl: uploadedDataUrl,
      uploadedFileName,
      primaryColor,
      secondaryColor,
      material,
      sizeMatrix,
      hasSizes: product.hasSizes,
      generalQuantity,
      notes,
      unitPrice: product.basePrice,
      totalQuantity,
      priceUnit: product.priceUnit,
    });

    setAdded(true);
    toast({
      title: "Ajouté au panier !",
      description: `${product.name} × ${totalQuantity} ${product.priceUnit}(s)`,
    });
    setTimeout(() => setAdded(false), 2500);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Back */}
        <Link href="/print" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />
          Retour aux services PRINT
        </Link>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* ── Left: Product Info ── */}
          <div className="space-y-6">
            {/* Image */}
            <div className="rounded-2xl overflow-hidden aspect-[4/3] bg-white border border-gray-100 shadow-sm">
              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
            </div>

            {/* Info card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {category && (
                    <Badge className="bg-blue-100 text-blue-700 border-0">
                      {category.icon} {category.name}
                    </Badge>
                  )}
                  {subCategory && (
                    <Badge variant="outline" className="text-gray-600">{subCategory.name}</Badge>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
                <p className="text-gray-500 text-sm mt-2 leading-relaxed">{product.description}</p>
              </div>

              <StarRating rating={product.rating} count={product.reviewCount} />

              {brand && (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-sm">{brand.name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{brand.name}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{brand.location}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Livraison {brand.deliveryTime}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-sm text-gray-500 pt-1">
                <span>Min. commande :</span>
                <span className="font-semibold text-gray-700">{product.minQuantity} {product.priceUnit}(s)</span>
              </div>
            </div>
          </div>

          {/* ── Right: Customization ── */}
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
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
                  fileName={uploadedFileName}
                  previewUrl={uploadedDataUrl}
                  onFile={(file, dataUrl) => {
                    setUploadedFileName(file.name);
                    setUploadedDataUrl(dataUrl);
                  }}
                  onClear={() => { setUploadedFileName(null); setUploadedDataUrl(null); }}
                />
              </div>

              <Separator />

              {/* Colors */}
              <ColorSelector label="Couleur principale" value={primaryColor} onChange={setPrimaryColor} />
              <ColorSelector label="Couleur secondaire" value={secondaryColor} onChange={setSecondaryColor} />

              {/* Material */}
              {product.materials.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Matière</Label>
                    <div className="flex flex-wrap gap-2">
                      {product.materials.map((m) => (
                        <button
                          key={m}
                          onClick={() => setMaterial(m)}
                          data-testid={`button-material-${m.toLowerCase().replace(/\s+/g, "-")}`}
                          className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                            material === m
                              ? "bg-blue-600 text-white border-blue-600"
                              : "border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600"
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

              {/* Sizes or General Quantity */}
              {product.hasSizes ? (
                <SizeMatrix sizeMatrix={sizeMatrix} onChange={setSizeMatrix} />
              ) : (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-blue-600" /> Quantité totale
                  </Label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setGeneralQuantity((q) => Math.max(product.minQuantity, q - (product.minQuantity > 10 ? 10 : 1)))}
                      className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors text-lg font-bold"
                      data-testid="button-qty-decrease"
                    >−</button>
                    <Input
                      type="number"
                      value={generalQuantity}
                      min={product.minQuantity}
                      onChange={(e) => setGeneralQuantity(Math.max(product.minQuantity, parseInt(e.target.value) || product.minQuantity))}
                      className="h-9 w-24 text-center font-semibold"
                      data-testid="input-quantity"
                    />
                    <button
                      onClick={() => setGeneralQuantity((q) => q + (product.minQuantity > 10 ? 10 : 1))}
                      className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors text-lg font-bold"
                      data-testid="button-qty-increase"
                    >+</button>
                    <span className="text-sm text-gray-400">{product.priceUnit}(s)</span>
                  </div>
                  {product.minQuantity > 1 && (
                    <p className="text-xs text-gray-400">Min. {product.minQuantity} {product.priceUnit}(s)</p>
                  )}
                </div>
              )}

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
            <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-6 space-y-4 sticky bottom-4">
              <h3 className="font-bold text-gray-900">Récapitulatif</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Prix unitaire</span>
                  <span className="font-medium">{formatCurrency(product.basePrice)} / {product.priceUnit}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Quantité</span>
                  <span className="font-medium">{totalQuantity} {product.priceUnit}(s)</span>
                </div>
                {material && (
                  <div className="flex justify-between text-gray-600">
                    <span>Matière</span>
                    <span className="font-medium">{material}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>Livraison estimée</span>
                  <span className="font-medium flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {product.deliveryTime}
                  </span>
                </div>
                <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
                  <span className="font-bold text-gray-900">Sous-total</span>
                  <span className="text-xl font-bold text-blue-600">{formatCurrency(subtotal)}</span>
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

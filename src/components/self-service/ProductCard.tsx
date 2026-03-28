import { Flame, Star, Sparkles, Heart, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Product = {
  id: string;
  name: string;
  price: number;
  station: string;
  category_id: string | null;
  stock: number | null;
  menu_image_url?: string | null;
  description?: string | null;
  featured_on_menu?: boolean;
};

interface ProductCardProps {
  product: Product;
  isTrending: boolean;
  trendingRank: number | null;
  isNew: boolean;
  onSelect: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
  hasComplements: boolean;
}

export default function ProductCard({
  product,
  isTrending,
  trendingRank,
  isNew,
  onSelect,
  onQuickAdd,
  hasComplements,
}: ProductCardProps) {
  const isOutOfStock = product.stock !== null && product.stock === 0;

  const badge = isOutOfStock
    ? null
    : trendingRank !== null && trendingRank <= 2
      ? { label: "Mais vendido", icon: <Star className="h-2.5 w-2.5" />, className: "bg-amber-500/90 text-white border-0" }
      : isTrending
        ? { label: "Em Alta", icon: <Flame className="h-2.5 w-2.5" />, className: "bg-orange-500/90 text-white border-0" }
        : isNew
          ? { label: "Novo", icon: <Sparkles className="h-2.5 w-2.5" />, className: "bg-emerald-500/90 text-white border-0" }
          : product.featured_on_menu
            ? { label: "Favorito", icon: <Heart className="h-2.5 w-2.5" />, className: "bg-pink-500/90 text-white border-0" }
            : null;

  return (
    <div
      className={`relative rounded-xl border border-border bg-card overflow-hidden transition-all ${
        isOutOfStock ? "opacity-50 pointer-events-none" : "active:scale-[0.98]"
      }`}
    >
      {/* Clickable area (opens detail dialog) */}
      <button
        onClick={() => !isOutOfStock && onSelect(product)}
        disabled={isOutOfStock}
        className="w-full text-left"
      >
        {/* Image */}
        {product.menu_image_url && (
          <div className="relative w-full h-28 overflow-hidden">
            <img
              src={product.menu_image_url}
              alt={product.name}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            {badge && (
              <Badge className={`absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 gap-0.5 ${badge.className}`}>
                {badge.icon}
                {badge.label}
              </Badge>
            )}
          </div>
        )}

        <div className="p-2.5 pb-1">
          {/* Badge if no image */}
          {!product.menu_image_url && badge && (
            <Badge className={`text-[10px] px-1.5 py-0.5 gap-0.5 mb-1 ${badge.className}`}>
              {badge.icon}
              {badge.label}
            </Badge>
          )}

          <h3 className="text-sm font-medium text-foreground line-clamp-2 leading-tight">
            {product.name}
          </h3>

          {product.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
              {product.description}
            </p>
          )}

          {product.stock !== null && product.stock >= 0 && product.stock <= 5 && (
            <p className={`text-[10px] mt-0.5 ${product.stock === 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              {product.stock === 0 ? "Esgotado" : `Restam ${product.stock}`}
            </p>
          )}
        </div>
      </button>

      {/* Price + Quick Add row */}
      <div className="flex items-center justify-between px-2.5 pb-2.5 pt-0.5">
        <span className="text-sm font-bold text-accent">
          R$ {Number(product.price).toFixed(2)}
        </span>
        {!isOutOfStock && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (hasComplements) {
                onSelect(product);
              } else {
                onQuickAdd(product);
              }
            }}
            className="flex items-center gap-1 rounded-full bg-accent text-accent-foreground px-2.5 py-1 text-[11px] font-semibold active:scale-95 transition-transform"
          >
            <Plus className="h-3 w-3" />
            Adicionar
          </button>
        )}
      </div>
    </div>
  );
}

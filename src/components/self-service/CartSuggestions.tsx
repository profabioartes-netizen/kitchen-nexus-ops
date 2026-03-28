import { useMemo } from "react";
import { Plus } from "lucide-react";

type Product = {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  menu_image_url?: string | null;
};

interface CartSuggestionsProps {
  cartProductIds: Set<string>;
  allProducts: Product[];
  onQuickAdd: (product: any) => void;
}

export default function CartSuggestions({ cartProductIds, allProducts, onQuickAdd }: CartSuggestionsProps) {
  const suggestions = useMemo(() => {
    if (cartProductIds.size === 0) return [];

    // Get categories in cart
    const cartCategories = new Set<string | null>();
    for (const p of allProducts) {
      if (cartProductIds.has(p.id)) cartCategories.add(p.category_id);
    }

    // Suggest products from different categories that aren't in cart, prioritize ones with images
    const candidates = allProducts
      .filter((p) => !cartProductIds.has(p.id) && !cartCategories.has(p.category_id))
      .sort((a, b) => (b.menu_image_url ? 1 : 0) - (a.menu_image_url ? 1 : 0));

    // If not enough cross-category, add same-category items
    if (candidates.length < 4) {
      const sameCat = allProducts
        .filter((p) => !cartProductIds.has(p.id) && cartCategories.has(p.category_id))
        .slice(0, 4 - candidates.length);
      candidates.push(...sameCat);
    }

    return candidates.slice(0, 4);
  }, [cartProductIds, allProducts]);

  if (suggestions.length === 0) return null;

  return (
    <div className="px-4 py-3 border-t border-border">
      <p className="text-xs font-semibold text-muted-foreground mb-2">🍽️ Leve também</p>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {suggestions.map((p) => (
          <button
            key={p.id}
            onClick={() => onQuickAdd(p)}
            className="shrink-0 w-28 rounded-lg border border-border bg-card p-2 text-left active:scale-95 transition-transform"
          >
            {p.menu_image_url && (
              <img
                src={p.menu_image_url}
                alt={p.name}
                className="w-full h-14 object-cover rounded mb-1"
                loading="lazy"
              />
            )}
            <p className="text-[11px] font-medium text-foreground line-clamp-1">{p.name}</p>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[11px] font-bold text-accent">R$ {Number(p.price).toFixed(2)}</span>
              <Plus className="h-3 w-3 text-accent" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

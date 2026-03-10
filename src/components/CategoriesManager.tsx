import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, GripVertical } from "lucide-react";

export function CategoriesManager() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
      const { error } = await supabase.from("categories").insert({
        name: newName.trim(),
        sort_order: maxOrder + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Categoria criada!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("categories").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Categoria atualizada!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Categoria removida!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Categorias</h2>
      </div>

      {/* Add new */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Nova categoria..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && newName.trim() && addMutation.mutate()}
          className="flex-1 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          disabled={!newName.trim() || addMutation.isPending}
          onClick={() => addMutation.mutate()}
          className="flex items-center gap-1 rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center gap-3 rounded-md border bg-card px-4 py-3"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
            {editingId === cat.id ? (
              <input
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") updateMutation.mutate({ id: cat.id, name: editingName });
                  if (e.key === "Escape") setEditingId(null);
                }}
                onBlur={() => {
                  if (editingName.trim() && editingName !== cat.name) {
                    updateMutation.mutate({ id: cat.id, name: editingName });
                  } else {
                    setEditingId(null);
                  }
                }}
                className="flex-1 rounded border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <span className="flex-1 text-sm font-medium">{cat.name}</span>
            )}
            <span className="text-xs text-muted-foreground">#{cat.sort_order}</span>
            <button
              onClick={() => {
                setEditingId(cat.id);
                setEditingName(cat.name);
              }}
              className="rounded p-1 hover:bg-secondary"
            >
              <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button
              onClick={() => {
                if (confirm(`Remover categoria "${cat.name}"?`)) {
                  deleteMutation.mutate(cat.id);
                }
              }}
              className="rounded p-1 hover:bg-destructive/10 text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            Nenhuma categoria cadastrada
          </p>
        )}
      </div>
    </div>
  );
}

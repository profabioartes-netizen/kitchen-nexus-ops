import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, ChevronRight, X, Edit2, Check } from "lucide-react";

function formatCurrency(value: string): string {
  // Remove everything except digits
  const digits = value.replace(/\D/g, "");
  const num = parseInt(digits || "0", 10);
  const formatted = (num / 100).toFixed(2).replace(".", ",");
  return formatted;
}

function parseCurrency(formatted: string): number {
  // "2,50" -> 2.5
  return parseFloat(formatted.replace(",", ".")) || 0;
}

export function ComplementsManager() {
  const queryClient = useQueryClient();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupMin, setNewGroupMin] = useState(0);
  const [newGroupMax, setNewGroupMax] = useState(1);
  const [newGroupRequired, setNewGroupRequired] = useState(false);

  // Edit group state
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupMin, setEditGroupMin] = useState(0);
  const [editGroupMax, setEditGroupMax] = useState(1);
  const [editGroupRequired, setEditGroupRequired] = useState(false);

  // New complement state
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newCompName, setNewCompName] = useState("");
  const [newCompPrice, setNewCompPrice] = useState("0,00");

  const { data: groups = [] } = useQuery({
    queryKey: ["complement_groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complement_groups")
        .select("*, complements(*)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const createGroup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("complement_groups").insert({
        name: newGroupName.trim(),
        min_select: newGroupMin,
        max_select: newGroupMax,
        required: newGroupRequired,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setShowNewGroup(false);
      setNewGroupName("");
      setNewGroupMin(0);
      setNewGroupMax(1);
      setNewGroupRequired(false);
      queryClient.invalidateQueries({ queryKey: ["complement_groups"] });
      toast.success("Grupo criado!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const updateGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("complement_groups").update({
        name: editGroupName.trim(),
        min_select: editGroupMin,
        max_select: editGroupMax,
        required: editGroupRequired,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingGroupId(null);
      queryClient.invalidateQueries({ queryKey: ["complement_groups"] });
      toast.success("Grupo atualizado!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("complement_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complement_groups"] });
      toast.success("Grupo removido!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const addComplement = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from("complements").insert({
        group_id: groupId,
        name: newCompName.trim(),
        price: parseCurrency(newCompPrice),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAddingToGroup(null);
      setNewCompName("");
      setNewCompPrice("0,00");
      queryClient.invalidateQueries({ queryKey: ["complement_groups"] });
      toast.success("Complemento adicionado!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteComplement = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("complements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complement_groups"] });
      toast.success("Complemento removido!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const startEditGroup = (group: any) => {
    setEditingGroupId(group.id);
    setEditGroupName(group.name);
    setEditGroupMin(group.min_select);
    setEditGroupMax(group.max_select);
    setEditGroupRequired(group.required);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Complementos</h2>
        <button
          onClick={() => setShowNewGroup(true)}
          className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Novo Grupo
        </button>
      </div>

      {/* New group form */}
      {showNewGroup && (
        <div className="rounded-lg border bg-card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Novo Grupo</h3>
            <button onClick={() => setShowNewGroup(false)} className="rounded p-1 hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Nome do grupo (ex: Extras, Tamanho)"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Mín. seleção</label>
                <input
                  type="number"
                  min="0"
                  value={newGroupMin}
                  onChange={(e) => setNewGroupMin(parseInt(e.target.value) || 0)}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Máx. seleção</label>
                <input
                  type="number"
                  min="1"
                  value={newGroupMax}
                  onChange={(e) => setNewGroupMax(parseInt(e.target.value) || 1)}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newGroupRequired}
                    onChange={(e) => setNewGroupRequired(e.target.checked)}
                    className="rounded border-input h-4 w-4 accent-accent"
                  />
                  <span className="text-sm">Obrigatório</span>
                </label>
              </div>
            </div>
            <button
              disabled={!newGroupName.trim() || createGroup.isPending}
              onClick={() => createGroup.mutate()}
              className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              Criar Grupo
            </button>
          </div>
        </div>
      )}

      {/* Groups list */}
      <div className="space-y-3">
        {groups.map((group) => {
          const isExpanded = expandedGroup === group.id;
          const isEditing = editingGroupId === group.id;
          const complements = group.complements || [];
          return (
            <div key={group.id} className="rounded-lg border bg-card overflow-hidden">
              {/* Group header */}
              {isEditing ? (
                <div className="px-4 py-3 space-y-3 border-b bg-secondary/20">
                  <input
                    type="text"
                    value={editGroupName}
                    onChange={(e) => setEditGroupName(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Mín. seleção</label>
                      <input
                        type="number"
                        min="0"
                        value={editGroupMin}
                        onChange={(e) => setEditGroupMin(parseInt(e.target.value) || 0)}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Máx. seleção</label>
                      <input
                        type="number"
                        min="1"
                        value={editGroupMax}
                        onChange={(e) => setEditGroupMax(parseInt(e.target.value) || 1)}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editGroupRequired}
                          onChange={(e) => setEditGroupRequired(e.target.checked)}
                          className="rounded border-input h-4 w-4 accent-accent"
                        />
                        <span className="text-sm">Obrigatório</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={!editGroupName.trim() || updateGroup.isPending}
                      onClick={() => updateGroup.mutate(group.id)}
                      className="flex items-center gap-1 rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditingGroupId(null)}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="flex-1 font-medium text-sm">{group.name}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {group.required && (
                      <span className="rounded-full bg-accent/10 text-accent px-2 py-0.5 font-medium">
                        Obrigatório
                      </span>
                    )}
                    <span>{complements.length} item(s)</span>
                    <span>({group.min_select}–{group.max_select})</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditGroup(group);
                    }}
                    className="rounded p-1 hover:bg-secondary text-muted-foreground"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Remover grupo "${group.name}" e todos os complementos?`)) {
                        deleteGroup.mutate(group.id);
                      }
                    }}
                    className="rounded p-1 hover:bg-destructive/10 text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </button>
              )}

              {isExpanded && !isEditing && (
                <div className="border-t px-4 py-3 space-y-2">
                  {complements.map((comp) => (
                    <div
                      key={comp.id}
                      className="flex items-center justify-between rounded-md bg-background border p-2.5 text-sm"
                    >
                      <span className="font-medium">{comp.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          {Number(comp.price) > 0 ? `+R$ ${Number(comp.price).toFixed(2).replace(".", ",")}` : "Grátis"}
                        </span>
                        <button
                          onClick={() => {
                            if (confirm(`Remover "${comp.name}"?`)) deleteComplement.mutate(comp.id);
                          }}
                          className="rounded p-1 hover:bg-destructive/10 text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add complement inline */}
                  {addingToGroup === group.id ? (
                    <div className="flex gap-2 items-center">
                      <input
                        autoFocus
                        placeholder="Nome"
                        value={newCompName}
                        onChange={(e) => setNewCompName(e.target.value)}
                        className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                        <input
                          placeholder="0,00"
                          inputMode="numeric"
                          value={newCompPrice}
                          onChange={(e) => setNewCompPrice(formatCurrency(e.target.value))}
                          className="w-full rounded-md border bg-background pl-8 pr-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <button
                        disabled={!newCompName.trim() || addComplement.isPending}
                        onClick={() => addComplement.mutate(group.id)}
                        className="rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        Salvar
                      </button>
                      <button
                        onClick={() => setAddingToGroup(null)}
                        className="rounded p-1 hover:bg-secondary text-muted-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setAddingToGroup(group.id);
                        setNewCompName("");
                        setNewCompPrice("0,00");
                      }}
                      className="flex items-center gap-1 text-sm text-accent hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar complemento
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {groups.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            Nenhum grupo de complementos cadastrado
          </p>
        )}
      </div>
    </div>
  );
}

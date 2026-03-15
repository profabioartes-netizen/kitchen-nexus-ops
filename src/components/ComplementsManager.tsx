import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, ChevronRight, X, Edit2, Check, GripVertical, Copy } from "lucide-react";

function formatCurrency(value: string): string {
  const digits = value.replace(/\D/g, "");
  const num = parseInt(digits || "0", 10);
  return (num / 100).toFixed(2).replace(".", ",");
}

function parseCurrency(formatted: string): number {
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

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupMin, setEditGroupMin] = useState(0);
  const [editGroupMax, setEditGroupMax] = useState(1);
  const [editGroupRequired, setEditGroupRequired] = useState(false);

  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newCompName, setNewCompName] = useState("");
  const [newCompPrice, setNewCompPrice] = useState("0,00");

  // Edit complement state
  const [editingCompId, setEditingCompId] = useState<string | null>(null);
  const [editCompName, setEditCompName] = useState("");
  const [editCompPrice, setEditCompPrice] = useState("0,00");

  // Drag state
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const dragGroupRef = useRef<string | null>(null);

  const { data: groups = [] } = useQuery({
    queryKey: ["complement_groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complement_groups")
        .select("*, complements(*)")
        .order("name");
      if (error) throw error;
      // Sort complements by sort_order within each group
      return data.map((g: any) => ({
        ...g,
        complements: [...(g.complements || [])].sort(
          (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        ),
      }));
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
      // Get max sort_order for this group
      const group = groups.find((g) => g.id === groupId);
      const maxOrder = (group?.complements || []).reduce(
        (max: number, c: any) => Math.max(max, c.sort_order ?? 0),
        -1
      );
      const { error } = await supabase.from("complements").insert({
        group_id: groupId,
        name: newCompName.trim(),
        price: parseCurrency(newCompPrice),
        sort_order: maxOrder + 1,
      } as any);
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

  const updateComplement = useMutation({
    mutationFn: async ({ id, name, price }: { id: string; name: string; price: number }) => {
      const { error } = await supabase.from("complements").update({ name, price }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingCompId(null);
      queryClient.invalidateQueries({ queryKey: ["complement_groups"] });
      toast.success("Complemento atualizado!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const duplicateComplement = useMutation({
    mutationFn: async ({ comp, groupId }: { comp: any; groupId: string }) => {
      const group = groups.find((g) => g.id === groupId);
      const maxOrder = (group?.complements || []).reduce(
        (max: number, c: any) => Math.max(max, c.sort_order ?? 0),
        -1
      );
      const { error } = await supabase.from("complements").insert({
        group_id: groupId,
        name: `${comp.name} (cópia)`,
        price: Number(comp.price),
        sort_order: maxOrder + 1,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complement_groups"] });
      toast.success("Complemento duplicado!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const duplicateGroup = useMutation({
    mutationFn: async (group: any) => {
      const { data: newGroup, error: gErr } = await supabase
        .from("complement_groups")
        .insert({
          name: `${group.name} (cópia)`,
          min_select: group.min_select,
          max_select: group.max_select,
          required: group.required,
        })
        .select()
        .single();
      if (gErr) throw gErr;
      const comps = group.complements || [];
      if (comps.length > 0) {
        const { error: cErr } = await supabase.from("complements").insert(
          comps.map((c: any, i: number) => ({
            group_id: newGroup.id,
            name: c.name,
            price: Number(c.price),
            sort_order: i,
          })) as any
        );
        if (cErr) throw cErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complement_groups"] });
      toast.success("Grupo duplicado!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const reorderMutation = useMutation({
    mutationFn: async (items: { id: string; sort_order: number }[]) => {
      for (const item of items) {
        await supabase.from("complements").update({ sort_order: item.sort_order } as any).eq("id", item.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complement_groups"] });
    },
  });

  const handleDragStart = (compId: string, groupId: string) => {
    setDragItem(compId);
    dragGroupRef.current = groupId;
  };

  const handleDragOver = (e: React.DragEvent, compId: string, groupId: string) => {
    e.preventDefault();
    if (dragGroupRef.current !== groupId) return;
    setDragOverItem(compId);
  };

  const handleDrop = (groupId: string) => {
    if (!dragItem || !dragOverItem || dragItem === dragOverItem || dragGroupRef.current !== groupId) {
      setDragItem(null);
      setDragOverItem(null);
      return;
    }

    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const items = [...(group.complements || [])];
    const fromIdx = items.findIndex((c) => c.id === dragItem);
    const toIdx = items.findIndex((c) => c.id === dragOverItem);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);

    const updates = items.map((item, idx) => ({ id: item.id, sort_order: idx }));
    reorderMutation.mutate(updates);

    // Optimistic update
    queryClient.setQueryData(["complement_groups"], (old: any[]) => {
      if (!old) return old;
      return old.map((g) => {
        if (g.id !== groupId) return g;
        const sorted = [...(g.complements || [])];
        const fi = sorted.findIndex((c: any) => c.id === dragItem);
        const ti = sorted.findIndex((c: any) => c.id === dragOverItem);
        if (fi === -1 || ti === -1) return g;
        const [m] = sorted.splice(fi, 1);
        sorted.splice(ti, 0, m);
        return { ...g, complements: sorted.map((c: any, i: number) => ({ ...c, sort_order: i })) };
      });
    });

    setDragItem(null);
    setDragOverItem(null);
  };

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
                <input type="number" min="0" value={newGroupMin} onChange={(e) => setNewGroupMin(parseInt(e.target.value) || 0)} className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Máx. seleção</label>
                <input type="number" min="1" value={newGroupMax} onChange={(e) => setNewGroupMax(parseInt(e.target.value) || 1)} className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newGroupRequired} onChange={(e) => setNewGroupRequired(e.target.checked)} className="rounded border-input h-4 w-4 accent-accent" />
                  <span className="text-sm">Obrigatório</span>
                </label>
              </div>
            </div>
            <button disabled={!newGroupName.trim() || createGroup.isPending} onClick={() => createGroup.mutate()} className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
              Criar Grupo
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {groups.map((group) => {
          const isExpanded = expandedGroup === group.id;
          const isEditing = editingGroupId === group.id;
          const complements = group.complements || [];
          return (
            <div key={group.id} className="rounded-lg border bg-card overflow-hidden">
              {isEditing ? (
                <div className="px-4 py-3 space-y-3 border-b bg-secondary/20">
                  <input type="text" value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} className="w-full rounded-md border bg-background px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-ring" />
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Mín. seleção</label>
                      <input type="number" min="0" value={editGroupMin} onChange={(e) => setEditGroupMin(parseInt(e.target.value) || 0)} className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Máx. seleção</label>
                      <input type="number" min="1" value={editGroupMax} onChange={(e) => setEditGroupMax(parseInt(e.target.value) || 1)} className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={editGroupRequired} onChange={(e) => setEditGroupRequired(e.target.checked)} className="rounded border-input h-4 w-4 accent-accent" />
                        <span className="text-sm">Obrigatório</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button disabled={!editGroupName.trim() || updateGroup.isPending} onClick={() => updateGroup.mutate(group.id)} className="flex items-center gap-1 rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50">
                      <Check className="h-3.5 w-3.5" /> Salvar
                    </button>
                    <button onClick={() => setEditingGroupId(null)} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-secondary">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30"
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <span className="flex-1 font-medium text-sm">{group.name}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {group.required && <span className="rounded-full bg-accent/10 text-accent px-2 py-0.5 font-medium">Obrigatório</span>}
                    <span>{complements.length} item(s)</span>
                    <span>({group.min_select}–{group.max_select})</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); startEditGroup(group); }} className="rounded p-1 hover:bg-secondary text-muted-foreground">
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); duplicateGroup.mutate(group); }} className="rounded p-1 hover:bg-secondary text-muted-foreground" title="Duplicar grupo">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm(`Remover grupo "${group.name}" e todos os complementos?`)) deleteGroup.mutate(group.id); }} className="rounded p-1 hover:bg-destructive/10 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </button>
              )}

              {isExpanded && !isEditing && (
                <div className="border-t px-4 py-3 space-y-2">
                  {complements.map((comp) => (
                    <div
                      key={comp.id}
                      draggable={editingCompId !== comp.id}
                      onDragStart={() => handleDragStart(comp.id, group.id)}
                      onDragOver={(e) => handleDragOver(e, comp.id, group.id)}
                      onDrop={() => handleDrop(group.id)}
                      onDragEnd={() => { setDragItem(null); setDragOverItem(null); }}
                      className={`flex items-center justify-between rounded-md bg-background border p-2.5 text-sm transition-all ${
                        dragItem === comp.id ? "opacity-40" : ""
                      } ${
                        dragOverItem === comp.id && dragItem !== comp.id ? "border-t-2 border-t-accent" : ""
                      }`}
                    >
                      {editingCompId === comp.id ? (
                        <div className="flex items-center gap-2 w-full">
                          <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 opacity-30" />
                          <input autoFocus value={editCompName} onChange={(e) => setEditCompName(e.target.value)} className="flex-1 rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring" />
                          <div className="relative w-28">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                            <input inputMode="numeric" value={editCompPrice} onChange={(e) => setEditCompPrice(formatCurrency(e.target.value))} className="w-full rounded-md border bg-background pl-8 pr-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring" />
                          </div>
                          <button disabled={!editCompName.trim() || updateComplement.isPending} onClick={() => updateComplement.mutate({ id: comp.id, name: editCompName.trim(), price: parseCurrency(editCompPrice) })} className="rounded p-1 hover:bg-accent/10 text-accent">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => setEditingCompId(null)} className="rounded p-1 hover:bg-secondary text-muted-foreground">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0" />
                            <span className="font-medium">{comp.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              {Number(comp.price) > 0 ? `+R$ ${Number(comp.price).toFixed(2).replace(".", ",")}` : "Grátis"}
                            </span>
                            <button onClick={() => { setEditingCompId(comp.id); setEditCompName(comp.name); setEditCompPrice(Number(comp.price).toFixed(2).replace(".", ",")); }} className="rounded p-1 hover:bg-secondary text-muted-foreground">
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button onClick={() => duplicateComplement.mutate({ comp, groupId: group.id })} className="rounded p-1 hover:bg-secondary text-muted-foreground" title="Duplicar">
                              <Copy className="h-3 w-3" />
                            </button>
                            <button onClick={() => { if (confirm(`Remover "${comp.name}"?`)) deleteComplement.mutate(comp.id); }} className="rounded p-1 hover:bg-destructive/10 text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {addingToGroup === group.id ? (
                    <div className="flex gap-2 items-center">
                      <input autoFocus placeholder="Nome" value={newCompName} onChange={(e) => setNewCompName(e.target.value)} className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                        <input placeholder="0,00" inputMode="numeric" value={newCompPrice} onChange={(e) => setNewCompPrice(formatCurrency(e.target.value))} className="w-full rounded-md border bg-background pl-8 pr-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                      <button disabled={!newCompName.trim() || addComplement.isPending} onClick={() => addComplement.mutate(group.id)} className="rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50">Salvar</button>
                      <button onClick={() => setAddingToGroup(null)} className="rounded p-1 hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <button onClick={() => { setAddingToGroup(group.id); setNewCompName(""); setNewCompPrice("0,00"); }} className="flex items-center gap-1 text-sm text-accent hover:underline">
                      <Plus className="h-3.5 w-3.5" /> Adicionar complemento
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {groups.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum grupo de complementos cadastrado</p>
        )}
      </div>
    </div>
  );
}

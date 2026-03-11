import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search, Plus, Minus, Trash2, ArrowLeft, Loader2, Printer, CreditCard, Banknote, Smartphone, Clock, StickyNote, User, X, ArrowRightLeft, Merge, Ban, CheckCircle2, Receipt, Save, ShoppingBag, UtensilsCrossed,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import ActivityTimeline from "@/components/ActivityTimeline";
import AddItemDialog, { type AddItemPayload } from "@/components/AddItemDialog";
import PaymentPanel, { type PaymentResult } from "@/components/PaymentPanel";
import { useComandaLock } from "@/hooks/useComandaLock";
import { Lock } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";

type TableStatus = "free" | "occupied" | "bill" | "delivered";

const statusLabels: Record<TableStatus, string> = {
  free: "Livre",
  occupied: "Pendente",
  bill: "Conta",
  delivered: "Concluído",
};

const methodLabels: Record<string, string> = {
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
  pix: "Pix",
};

// Helper to log activity
async function logActivity(
  tableId: string,
  action: string,
  description: string,
  orderId?: string | null,
  userName?: string | null,
) {
  await supabase.from("table_activity_log").insert({
    table_id: tableId,
    order_id: orderId ?? null,
    action,
    description,
    user_name: userName ?? null,
  });
}

export default function TableOrderPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { customerName?: string; sector?: string } | null;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [waiterName, setWaiterName] = useState("");
  const [showWaiterPrompt, setShowWaiterPrompt] = useState(false);
  const [noteItemId, setNoteItemId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [serviceFeeEnabled, setServiceFeeEnabled] = useState(false);
  const autoCreatedRef = useRef(false);
  const leavingRef = useRef(false);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);

  // Concurrency lock
  const { lockInfo, loading: lockLoading } = useComandaLock(
    tableId,
    profile?.id,
    profile?.full_name,
  );

  const invalidateLog = () => queryClient.invalidateQueries({ queryKey: ["activity_log", tableId] });

  // Realtime: sync order data instantly across all screens
  useEffect(() => {
    const channel = supabase
      .channel(`table-order-${tableId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        queryClient.invalidateQueries({ queryKey: ["order_items"] });
        queryClient.invalidateQueries({ queryKey: ["preview_order_items"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
        queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, () => {
        queryClient.invalidateQueries({ queryKey: ["table", tableId] });
        queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        queryClient.invalidateQueries({ queryKey: ["order_payments"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, tableId]);

  // Fetch table
  const { data: table, isLoading: tableLoading } = useQuery({
    queryKey: ["table", tableId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("*")
        .eq("id", tableId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!tableId,
  });

  // Fetch active order for this table (open, billing_in_progress, or paid_pending_finalization)
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["table_order", tableId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("table_id", tableId!)
        .in("status", ["open", "billing_in_progress", "paid_pending_finalization"])
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tableId,
  });

  // Fetch order items
  const { data: orderItems = [] } = useQuery({
    queryKey: ["order_items", order?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", order!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!order?.id,
  });

  // Mark unviewed items as viewed when the page loads
  useEffect(() => {
    if (!orderItems.length) return;
    const unviewed = orderItems.filter((i) => !(i as any).viewed_at);
    if (unviewed.length === 0) return;
    const ids = unviewed.map((i) => i.id);
    supabase
      .from("order_items")
      .update({ viewed_at: new Date().toISOString() } as any)
      .in("id", ids)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["preview_order_items"] });
      });
  }, [orderItems, queryClient]);

  // Fetch payments for this order
  const { data: payments = [] } = useQuery({
    queryKey: ["order_payments", order?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("order_id", order!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!order?.id,
  });

  // Fetch complements for all order items
  const orderItemIds = orderItems.map((i) => i.id);
  const { data: itemComplements = [] } = useQuery({
    queryKey: ["order_item_complements", orderItemIds.join(",")],
    queryFn: async () => {
      if (orderItemIds.length === 0) return [];
      const { data, error } = await supabase
        .from("order_item_complements")
        .select("*")
        .in("order_item_id", orderItemIds);
      if (error) throw error;
      return data;
    },
    enabled: orderItemIds.length > 0,
  });

  // Products & categories
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name)")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // All active tables (for transfer dialog)
  const { data: allTables = [] } = useQuery({
    queryKey: ["restaurant_tables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Open orders for all tables (to detect conflicts)
  const { data: allOpenOrders = [] } = useQuery({
    queryKey: ["open_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("status", ["open", "billing_in_progress", "paid_pending_finalization"]);
      if (error) throw error;
      return data;
    },
  });

  if (!activeCategory && categories.length > 0) {
    setActiveCategory(categories[0].id);
  }

  // Transfer order mutation
  const transferOrder = useMutation({
    mutationFn: async ({ targetTableId, merge }: { targetTableId: string; merge: boolean }) => {
      if (!order) throw new Error("Sem pedido aberto");
      const targetTable = allTables.find((t) => t.id === targetTableId);
      const targetOrder = allOpenOrders.find((o) => o.table_id === targetTableId);

      if (targetOrder && !merge) {
        throw new Error("MERGE_REQUIRED");
      }

      if (targetOrder && merge) {
        // Move all items to target order
        await supabase.from("order_items").update({ order_id: targetOrder.id }).eq("order_id", order.id);
        // Move payments
        await supabase.from("payments").update({ order_id: targetOrder.id }).eq("order_id", order.id);
        // Update target order total
        const newTotal = Number(order.total) + Number(targetOrder.total);
        await supabase.from("orders").update({ total: newTotal }).eq("id", targetOrder.id);
        // Close source order
        await supabase.from("orders").update({ status: "merged" }).eq("id", order.id);
        // Copy activity logs to target table
        await logActivity(targetTableId, "order_merged", `Pedido da ${table?.name ?? "comanda"} mesclado — R$ ${Number(order.total).toFixed(2)}`, targetOrder.id, profile?.full_name);
      } else {
        // Simply reassign the order to the target table
        await supabase.from("orders").update({ table_id: targetTableId }).eq("id", order.id);
        // Copy activity logs referencing this table to the new one
        await logActivity(targetTableId, "order_received", `Pedido transferido da ${table?.name ?? "comanda"} — R$ ${Number(order.total).toFixed(2)}`, order.id, profile?.full_name);
      }

      // Source table becomes free
      await supabase.from("restaurant_tables").update({ status: "free" }).eq("id", tableId!);
      // Target table becomes occupied
      await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", targetTableId);

      // Log on source table
      await logActivity(tableId!, "table_transferred", `Pedido transferido para ${targetTable?.name ?? "outra comanda"}${merge ? " (mesclado)" : ""}`, order.id, profile?.full_name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      toast.success("Pedido transferido com sucesso!");
      navigate("/");
    },
    onError: (err) => {
      if ((err as Error).message === "MERGE_REQUIRED") {
        setMergeConfirm(true);
      } else {
        toast.error((err as Error).message);
      }
    },
  });

  // Merge tables mutation
  const mergeTablesMutation = useMutation({
    mutationFn: async (sourceTableId: string) => {
      if (!order) throw new Error("Sem pedido aberto nesta comanda");
      const sourceTable = allTables.find((t) => t.id === sourceTableId);
      const sourceOrder = allOpenOrders.find((o) => o.table_id === sourceTableId);
      if (!sourceOrder) throw new Error("Comanda selecionada não possui pedido aberto");

      // Move all items from source order to this order
      await supabase.from("order_items").update({ order_id: order.id }).eq("order_id", sourceOrder.id);
      // Move all item complements (they follow the order_items FK automatically)
      // Move payments from source to this order
      await supabase.from("payments").update({ order_id: order.id }).eq("order_id", sourceOrder.id);

      // Combine totals
      const newTotal = Number(order.total) + Number(sourceOrder.total);
      // Preserve waiter info: keep both if different
      const waiters = [order.waiter_name, sourceOrder.waiter_name].filter(Boolean);
      const combinedWaiter = [...new Set(waiters)].join(", ") || null;
      // Track merged tables
      const existingMerged = (order as any).merged_from || [];
      const mergedFrom = [...existingMerged, sourceTable?.name ?? sourceTableId];

      await supabase.from("orders").update({
        total: newTotal,
        waiter_name: combinedWaiter,
        merged_from: mergedFrom,
      } as any).eq("id", order.id);

      // Close source order as merged
      await supabase.from("orders").update({ status: "merged" }).eq("id", sourceOrder.id);
      // Free the source table
      await supabase.from("restaurant_tables").update({ status: "free" }).eq("id", sourceTableId);

      // Log on this (target) table
      await logActivity(
        tableId!, "tables_merged",
        `Mesas mescladas: ${sourceTable?.name ?? "?"} → ${table?.name ?? "?"} | Itens e pagamentos combinados | Total: R$ ${newTotal.toFixed(2)}${combinedWaiter ? ` | Garçons: ${combinedWaiter}` : ""}`,
        order.id, profile?.full_name
      );
      // Log on source table
      await logActivity(
        sourceTableId, "table_merged_out",
        `Mesa mesclada com ${table?.name ?? "?"} — pedido movido`,
        sourceOrder.id, profile?.full_name
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["order_item_complements"] });
      invalidateLog();
      setShowMerge(false);
      setMergeTarget(null);
      toast.success("Mesas mescladas com sucesso!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const createOrder = useMutation({
    mutationFn: async (params?: { customerName?: string; guests?: number; notes?: string }) => {
      const waiterLabel = profile?.full_name || null;
      const customerName = params?.customerName || null;
      const guests = params?.guests || 1;
      const defaultName = (table as any)?.default_name || "Comanda";
      const { data, error } = await supabase
        .from("orders")
        .insert({ table_id: tableId!, status: "open", total: 0, waiter_name: waiterLabel, customer_name: customerName, guests } as any)
        .select()
        .single();
      if (error) throw error;
      const tableName = customerName || defaultName;
      await supabase.from("restaurant_tables").update({ status: "occupied", name: tableName }).eq("id", tableId!);
      const desc = `Mesa ${table?.name ?? ""} aberta${waiterLabel ? ` — Garçom: ${waiterLabel}` : ""}${customerName ? ` | Cliente: ${customerName}` : ""} | ${guests} pessoa(s)${params?.notes ? ` | Obs: ${params.notes}` : ""}`;
      await logActivity(tableId!, "table_opened", desc, data.id, waiterLabel);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["table", tableId] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      invalidateLog();
      setShowOpenDialog(false);
    },
  });

  // Auto-create order for free tables (skip dialog)
  useEffect(() => {
    if (!tableLoading && !orderLoading && !order && tableId && !autoCreatedRef.current && !createOrder.isPending && !leavingRef.current) {
      autoCreatedRef.current = true;
      createOrder.mutate({ customerName: navState?.customerName });
    }
  }, [tableLoading, orderLoading, order, tableId, createOrder.isPending, navState]);


  const addItem = useMutation({
    mutationFn: async (payload: AddItemPayload) => {
      const { product, quantity, notes, complements, complementsTotal } = payload;
      let currentOrder = order;
      if (!currentOrder) {
        currentOrder = await createOrder.mutateAsync({});
      }

      const unitPrice = Number(product.price) + complementsTotal;
      const { data: insertedItem, error: itemError } = await supabase.from("order_items").insert({
        order_id: currentOrder.id,
        product_id: product.id,
        product_name: product.name,
        price: unitPrice,
        quantity,
        notes: notes || null,
        sent_to_kitchen: true,
        preparation_status: "sent",
        sent_at: new Date().toISOString(),
      } as any).select().single();
      if (itemError) throw itemError;

      // Insert complements for this item
      if (complements.length > 0) {
        await supabase.from("order_item_complements").insert(
          complements.map((c) => ({
            order_item_id: insertedItem.id,
            complement_id: c.id,
            complement_name: c.name,
            price: c.price,
            quantity: c.quantity,
          }))
        );
      }

      // Create print job for the product's station (skip if no station)
      const station = (product as any).station || "";
      if (station) {
        await supabase.from("print_jobs").insert({
          station,
          status: "pending",
          payload: {
            product_name: product.name,
            quantity,
            table_name: table?.name || "—",
            waiter_name: currentOrder.waiter_name || waiterName || null,
            notes: notes || null,
            complements: complements.map((c) => c.name),
            order_id: currentOrder.id,
          },
        });
      }

      const newTotal = [...orderItems, { price: unitPrice, quantity }].reduce(
        (s, i) => s + Number(i.price) * i.quantity, 0
      );
      await supabase.from("orders").update({ total: newTotal }).eq("id", currentOrder.id);

      // If table is currently "delivered", reset to "occupied" since new items were added
      if (table?.status === "delivered") {
        await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", tableId!);
      }

      const compDesc = complements.length > 0 ? ` [${complements.map(c => c.name).join(", ")}]` : "";
      await logActivity(tableId!, "item_added", `Adicionado e enviado à produção: ${product.name} ×${quantity}${compDesc} (R$ ${(unitPrice * quantity).toFixed(2)})`, currentOrder.id);
    },
    onSuccess: () => {
      setSelectedProduct(null);
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["order_item_complements"] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["table", tableId] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      queryClient.invalidateQueries({ queryKey: ["kitchen_items"] });
      invalidateLog();
    },
  });

  // Update qty
  const updateQty = useMutation({
    mutationFn: async ({ itemId, delta }: { itemId: string; delta: number }) => {
      const item = orderItems.find((i) => i.id === itemId);
      if (!item) return;
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        await supabase.from("order_items").delete().eq("id", itemId);
        await logActivity(tableId!, "item_removed", `Removido: ${item.product_name}`, order?.id);
      } else {
        await supabase.from("order_items").update({ quantity: newQty }).eq("id", itemId);
        await logActivity(
          tableId!,
          "item_qty_changed",
          `${item.product_name}: ${item.quantity} → ${newQty}`,
          order?.id
        );
      }
      const remaining = orderItems
        .map((i) => (i.id === itemId ? { ...i, quantity: newQty } : i))
        .filter((i) => i.quantity > 0);
      const newTotal = remaining.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
      await supabase.from("orders").update({ total: newTotal }).eq("id", order!.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      invalidateLog();
    },
  });

  // Remove item
  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const item = orderItems.find((i) => i.id === itemId);
      await supabase.from("order_items").delete().eq("id", itemId);
      const remaining = orderItems.filter((i) => i.id !== itemId);
      const newTotal = remaining.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
      await supabase.from("orders").update({ total: newTotal }).eq("id", order!.id);
      if (item) {
        await logActivity(tableId!, "item_removed", `Removido: ${item.product_name} (×${item.quantity})`, order?.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      invalidateLog();
    },
  });

  // Save note on item
  const saveNote = useMutation({
    mutationFn: async ({ itemId, notes }: { itemId: string; notes: string }) => {
      const { error } = await supabase
        .from("order_items")
        .update({ notes: notes || null })
        .eq("id", itemId);
      if (error) throw error;
      const item = orderItems.find((i) => i.id === itemId);
      if (notes && item) {
        await logActivity(tableId!, "note_added", `Obs em ${item.product_name}: "${notes}"`, order?.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      setNoteItemId(null);
      setNoteText("");
      invalidateLog();
      toast.success("Observação salva!");
    },
  });

  // Print full bill to Caixa station
  const printBill = useMutation({
    mutationFn: async () => {
      if (!order || orderItems.length === 0) throw new Error("Sem itens para imprimir");

      await supabase.from("print_jobs").insert({
        station: "Caixa",
        status: "pending",
        payload: {
          type: "full_bill",
          table_name: table?.name || "—",
          customer_name: order.customer_name || null,
          waiter_name: order.waiter_name || null,
          order_id: order.id,
          items: orderItems.map((i) => ({
            name: i.product_name,
            quantity: i.quantity,
            unit_price: Number(i.price),
            total: Number(i.price) * i.quantity,
          })),
          total: orderItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0),
        },
      });

      await logActivity(tableId!, "print_bill", `Conta geral impressa no Caixa`, order.id, profile?.full_name);
    },
    onSuccess: () => {
      toast.success("Conta enviada para impressão no Caixa!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // Pay — records payment and marks items as paid
  const payMutation = useMutation({
    mutationFn: async (result: PaymentResult) => {
      const { payments, paidItems } = result;
      if (!order) throw new Error("Sem pedido aberto");
      await supabase
        .from("order_items")
        .update({ sent_to_kitchen: true })
        .eq("order_id", order.id);

      // Insert all payments
      for (const p of payments) {
        await supabase.from("payments").insert({ order_id: order.id, method: p.method, amount: p.amount });
      }

      const totalVal = payments.reduce((s, p) => s + p.amount, 0);

      // Mark specific items as paid if split-by-items was used
      if (paidItems && Object.keys(paidItems).length > 0) {
        for (const [itemId, qtyPaid] of Object.entries(paidItems)) {
          const item = orderItems.find((i) => i.id === itemId);
          if (item) {
            const newPaidQty = ((item as any).paid_quantity ?? 0) + qtyPaid;
            await supabase.from("order_items").update({ paid_quantity: newPaidQty } as any).eq("id", itemId);
          }
        }
      } else {
        // Full payment (no split-by-items) — mark all items as fully paid
        for (const item of orderItems) {
          await supabase.from("order_items").update({ paid_quantity: item.quantity } as any).eq("id", item.id);
        }
      }

      // Check if all items are fully paid
      const updatedItems = orderItems.map((i) => {
        if (paidItems && Object.keys(paidItems).length > 0) {
          const addedPaid = paidItems[i.id] ?? 0;
          const totalPaid = ((i as any).paid_quantity ?? 0) + addedPaid;
          return { ...i, paid_quantity: totalPaid };
        }
        // Full payment — all items are fully paid
        return { ...i, paid_quantity: i.quantity };
      });
      const allItemsPaid = updatedItems.every((i) => (i.paid_quantity ?? 0) >= i.quantity);

      // Calculate remaining unpaid total for the order
      const unpaidTotal = updatedItems.reduce((s, i) => {
        const unpaidQty = Math.max(0, i.quantity - (i.paid_quantity ?? 0));
        return s + Number(i.price) * unpaidQty;
      }, 0);
      
      if (allItemsPaid) {
        // All paid — move to paid_pending_finalization
        await supabase.from("orders").update({ status: "paid_pending_finalization", total: totalVal } as any).eq("id", order.id);
        await supabase.from("restaurant_tables").update({ status: "bill" }).eq("id", tableId!);
        await logActivity(tableId!, "payment_completed", `Pagamento concluído — aguardando finalização`, order.id);
      } else {
        // Partial payment — keep order open, update total to unpaid amount
        await supabase.from("orders").update({ status: "billing_in_progress", total: unpaidTotal } as any).eq("id", order.id);
        await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", tableId!);
      }

      // Create receipt print job
      await supabase.from("print_jobs").insert({
        station: "Caixa",
        status: "pending",
        payload: {
          type: "receipt",
          table_name: table?.name || "—",
          waiter_name: order.waiter_name || null,
          order_id: order.id,
          items: orderItems.map((i) => ({
            name: i.product_name,
            quantity: i.quantity,
            unit_price: Number(i.price),
            total: Number(i.price) * i.quantity,
          })),
          subtotal: orderItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0),
          total: totalVal,
          payments: payments.map((p) => ({
            method: methodLabels[p.method] ?? p.method,
            amount: p.amount,
          })),
          closed_at: new Date().toISOString(),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      setShowPayment(false);
      toast.success("Pagamento registrado!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // Finalize — moves order to finalized (appears in reports) and frees table
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      leavingRef.current = true;
      if (!order) throw new Error("Sem pedido");
      await supabase.from("orders").update({ status: "finalized", total: orderItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0) }).eq("id", order.id);
      const { data: tableData } = await supabase
        .from("restaurant_tables")
        .select("default_name")
        .eq("id", tableId!)
        .single();
      const resetName = (tableData as any)?.default_name || table?.name;
      await supabase.from("restaurant_tables").update({ status: "free", name: resetName, sector: null } as any).eq("id", tableId!);
      await logActivity(tableId!, "table_finalized", `Mesa ${table?.name ?? ""} finalizada — pedido registrado nos relatórios`, order.id, profile?.full_name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["order_items"] });
      toast.success("Comanda finalizada! Dados registrados nos relatórios.");
      navigate("/");
    },
    onError: (err) => { leavingRef.current = false; toast.error((err as Error).message); },
  });

  // Cancel / delete order without sending to reports
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<"menu" | "order">("menu");
  const cancelOrder = useMutation({
    mutationFn: async () => {
      leavingRef.current = true;
      if (!order) throw new Error("Sem pedido aberto");
      // Delete complements for all order items first (FK constraint)
      const itemIds = orderItems.map((i) => i.id);
      if (itemIds.length > 0) {
        const { error: compErr } = await supabase.from("order_item_complements").delete().in("order_item_id", itemIds);
        if (compErr) throw compErr;
      }
      // Delete all order items
      const { error: itemsErr } = await supabase.from("order_items").delete().eq("order_id", order.id);
      if (itemsErr) throw itemsErr;
      // Delete payments associated with this order
      const { error: payErr } = await supabase.from("payments").delete().eq("order_id", order.id);
      if (payErr) throw payErr;
      // Set order status to cancelled (will NOT appear in reports)
      const { error: orderErr } = await supabase.from("orders").update({ status: "canceled", total: 0, customer_name: null }).eq("id", order.id);
      if (orderErr) throw orderErr;
      // Reset table fully
      const { data: tableData } = await supabase
        .from("restaurant_tables")
        .select("default_name")
        .eq("id", tableId!)
        .single();
      const resetName = (tableData as any)?.default_name || table?.name;
      const { error: tableErr } = await supabase.from("restaurant_tables").update({ status: "free", name: resetName, sector: null } as any).eq("id", tableId!);
      if (tableErr) throw tableErr;
      await logActivity(tableId!, "order_cancelled", `Pedido cancelado — Mesa ${table?.name ?? ""} liberada. Itens e pagamentos removidos.`, order.id, profile?.full_name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["order_items"] });
      toast.success("Pedido cancelado. Mesa liberada.");
      navigate("/");
    },
    onError: (err) => { leavingRef.current = false; toast.error((err as Error).message); },
  });

  // Save order — print only NEW unsent items to their station printers (Cozinha, Bebidas, Sobremesa)
  const saveOrder = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error("Sem pedido aberto");

      // Only print unsent items
      const unsent = orderItems.filter((i) => !i.sent_to_kitchen);

      if (unsent.length > 0) {
        // Group unsent items by station and create print jobs
        const itemsByStation: Record<string, typeof unsent> = {};
        for (const item of unsent) {
          const product = products.find((p) => p.id === item.product_id);
          const station = (product as any)?.station || "";
          if (!station || station === "Caixa") continue; // Caixa prints via "Imprimir" button
          if (!itemsByStation[station]) itemsByStation[station] = [];
          itemsByStation[station].push(item);
        }

        for (const [station, items] of Object.entries(itemsByStation)) {
          await supabase.from("print_jobs").insert({
            station,
            status: "pending",
            payload: {
              type: "order_save",
              table_name: table?.name || "—",
              waiter_name: order.waiter_name || null,
              order_id: order.id,
              items: items.map((i) => ({
                name: i.product_name,
                quantity: i.quantity,
                notes: i.notes || null,
              })),
            },
          });
        }

        // Mark unsent items as sent
        const ids = unsent.map((i) => i.id);
        await supabase
          .from("order_items")
          .update({ sent_to_kitchen: true, preparation_status: "sent", sent_at: new Date().toISOString() } as any)
          .in("id", ids);

        await logActivity(tableId!, "order_saved", `Pedido salvo — ${unsent.length} novo(s) item(ns) enviado(s) para impressão`, order.id, profile?.full_name);
      } else {
        await logActivity(tableId!, "order_saved", `Pedido salvo (sem novos itens para imprimir)`, order.id, profile?.full_name);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["kitchen_items"] });
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      toast.success("Pedido salvo!");
      navigate("/");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // Quick-add item from payment screen
  const addQuickItem = async (product: { id: string; name: string; price: number }, quantity: number = 1) => {
    if (!order) return;
    const existing = orderItems.find((i) => i.product_id === product.id);
    if (existing) {
      const newQty = existing.quantity + quantity;
      await supabase.from("order_items").update({ quantity: newQty }).eq("id", existing.id);
    } else {
      await supabase.from("order_items").insert({
        order_id: order.id,
        product_id: product.id,
        product_name: product.name,
        price: product.price,
        quantity,
        sent_to_kitchen: true,
      });
    }
    const newTotal = orderItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0) + product.price * quantity;
    await supabase.from("orders").update({ total: newTotal }).eq("id", order.id);
    await logActivity(tableId!, "item_added", `Venda rápida: ${product.name} ×${quantity} (R$ ${(product.price * quantity).toFixed(2)})`, order.id, profile?.full_name);
    queryClient.invalidateQueries({ queryKey: ["order_items", order.id] });
    queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
    queryClient.invalidateQueries({ queryKey: ["open_orders"] });
    toast.success(`${product.name} ×${quantity} adicionado!`);
  };

  // Remove quick-sale item from order
  const removeQuickItem = async (productId: string) => {
    if (!order) return;
    const item = orderItems.find((i) => i.product_id === productId);
    if (!item) return;
    await supabase.from("order_items").delete().eq("id", item.id);
    const newTotal = orderItems.filter((i) => i.id !== item.id).reduce((s, i) => s + Number(i.price) * i.quantity, 0);
    await supabase.from("orders").update({ total: newTotal }).eq("id", order.id);
    await logActivity(tableId!, "item_removed", `Removido (venda rápida): ${item.product_name}`, order.id, profile?.full_name);
    queryClient.invalidateQueries({ queryKey: ["order_items", order.id] });
    queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
    queryClient.invalidateQueries({ queryKey: ["open_orders"] });
    toast.success(`${item.product_name} removido!`);
  };

  const filtered = products.filter(
    (p) =>
      p.category_id === activeCategory &&
      p.name.toLowerCase().includes(search.toLowerCase())
  );

  const total = orderItems.reduce((s, i) => {
    const unpaidQty = i.quantity - ((i as any).paid_quantity ?? 0);
    return s + Number(i.price) * unpaidQty;
  }, 0);
  const unsentCount = orderItems.filter((i) => !i.sent_to_kitchen).length;
  const unpaidItems = orderItems.filter((i) => ((i as any).paid_quantity ?? 0) < i.quantity);
  const paidItems = orderItems.filter((i) => ((i as any).paid_quantity ?? 0) >= i.quantity);

  if (tableLoading || orderLoading || lockLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Lock blocked by another user
  if (lockInfo && !lockInfo.acquired) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 gap-4">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-destructive/10">
          <Lock className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Comanda em uso</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Esta comanda está sendo editada por <strong>{lockInfo.lockedByUserName || "outro usuário"}</strong>.
          {lockInfo.lockExpiresAt && (
            <> O bloqueio expira em breve. Tente novamente após a liberação.</>
          )}
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 rounded-md border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // Auto-creating order, show loading
  if (!order && !orderLoading && !tableLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Abrindo comanda...</span>
      </div>
    );
  }

  const orderItemCount = orderItems.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="flex h-full flex-col md:flex-row overflow-hidden">
      {/* Mobile header */}
      {isMobile && (
        <div className="flex items-center gap-2 p-3 border-b bg-card">
          <button
            onClick={() => navigate("/")}
            className="rounded-md border bg-background p-2.5 hover:bg-secondary transition-colors touch-manipulation"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight truncate">
              {order?.customer_name || (table as any)?.default_name || table?.name || "Comanda"}
            </h1>
            {order?.customer_name && (
              <span className="text-[10px] text-muted-foreground">{(table as any)?.default_name || table?.name}</span>
            )}
          </div>
          {table && (
            <span className={`table-status-${table.status} rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider border`}>
              {statusLabels[table.status as TableStatus] ?? table.status}
            </span>
          )}
        </div>
      )}

      {/* Mobile tab switcher */}
      {isMobile && (
        <div className="flex border-b bg-card md:hidden">
          <button
            onClick={() => setMobileTab("menu")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors touch-manipulation ${
              mobileTab === "menu" ? "text-accent border-b-2 border-accent" : "text-muted-foreground"
            }`}
          >
            <UtensilsCrossed className="h-4 w-4" />
            Cardápio
          </button>
          <button
            onClick={() => setMobileTab("order")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors touch-manipulation relative ${
              mobileTab === "order" ? "text-accent border-b-2 border-accent" : "text-muted-foreground"
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            Comanda
            {orderItemCount > 0 && (
              <span className="absolute top-1.5 right-[calc(50%-40px)] flex h-5 min-w-5 items-center justify-center rounded-full bg-accent text-accent-foreground text-[10px] font-bold px-1">
                {orderItemCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Left: Product selection */}
      <div className={`flex-1 flex flex-col p-3 md:p-4 overflow-hidden ${isMobile && mobileTab !== "menu" ? "hidden" : ""}`}>
        {/* Desktop header */}
        {!isMobile && (
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate("/")}
            className="rounded-md border bg-card p-2 hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="flex flex-col">
              <h1 className="text-xl font-semibold leading-tight">
                {order?.customer_name || (table as any)?.default_name || table?.name || "Comanda"}
              </h1>
              {order?.customer_name && (
                <span className="text-[10px] text-muted-foreground">{(table as any)?.default_name || table?.name}</span>
              )}
              <input
                type="text"
                defaultValue={(table as any)?.sector ?? ""}
                key={`sector-${table?.id}`}
                placeholder="Mesa (ex: Mesa 1, Quiosque)"
                onBlur={async (e) => {
                  const newSector = e.target.value.trim();
                  if (table && newSector !== ((table as any)?.sector ?? "")) {
                    await supabase.from("restaurant_tables").update({ sector: newSector || null } as any).eq("id", table.id);
                    queryClient.invalidateQueries({ queryKey: ["restaurant_table", tableId] });
                    queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
                  }
                }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="text-xs text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-ring outline-none py-0.5 max-w-[180px]"
              />
            </div>
            {table && (
              <span className={`table-status-${table.status} rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider border`}>
                {statusLabels[table.status as TableStatus] ?? table.status}
              </span>
            )}
          </div>
          <button
            onClick={() => { setShowTransfer(true); setTransferTarget(null); setMergeConfirm(false); }}
            disabled={!order || orderItems.length === 0}
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors bg-card hover:bg-secondary disabled:opacity-50"
          >
            <ArrowRightLeft className="h-4 w-4" />
            Transferir
          </button>
          <button
            onClick={() => { setShowMerge(true); setMergeTarget(null); }}
            disabled={!order || orderItems.length === 0}
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors bg-card hover:bg-secondary disabled:opacity-50"
          >
            <Merge className="h-4 w-4" />
            Juntar Mesas
          </button>
          <button
            onClick={() => setShowTimeline(!showTimeline)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              showTimeline ? "bg-accent text-accent-foreground" : "bg-card hover:bg-secondary"
            }`}
          >
            <Clock className="h-4 w-4" />
            Histórico
          </button>
        </div>
        )}

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap touch-manipulation ${
                activeCategory === cat.id
                  ? "bg-accent text-accent-foreground"
                  : "bg-card text-foreground hover:bg-secondary"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 overflow-auto flex-1 items-start content-start">
          {filtered.map((product) => (
            <button
              key={product.id}
              onClick={() => setSelectedProduct(product)}
              disabled={addItem.isPending}
              className="flex flex-col rounded-lg border bg-card text-left transition-all hover:border-accent active:scale-[0.97] overflow-hidden touch-manipulation"
            >
              {product.image_url && (
                <div className="w-full aspect-[4/3] bg-secondary">
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-2 md:p-3">
                <span className="font-medium text-xs md:text-sm">{product.name}</span>
                <span className="text-accent font-semibold mt-0.5 md:mt-1 block text-sm">
                  R$ {Number(product.price).toFixed(2)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Order panel */}
      <div className={`md:w-80 md:border-l bg-card flex flex-col ${isMobile && mobileTab !== "order" ? "hidden" : isMobile ? "flex-1" : ""}`}>
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg">Comanda</h2>
          <div className="flex items-center gap-1.5 mt-1">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={waiterName || order?.waiter_name || ""}
              onChange={(e) => setWaiterName(e.target.value)}
              onBlur={async () => {
                if (order && waiterName && waiterName !== order.waiter_name) {
                  await supabase.from("orders").update({ waiter_name: waiterName }).eq("id", order.id);
                  queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
                }
              }}
              placeholder="Nome do garçom..."
              className="text-xs bg-transparent border-b border-transparent hover:border-border focus:border-ring outline-none py-0.5 flex-1 text-muted-foreground"
            />
          </div>
          {(order as any)?.merged_from?.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              <Merge className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Mesclado de:</span>
              {((order as any).merged_from as string[]).map((name: string, i: number) => (
                <span key={i} className="text-[10px] bg-accent/50 rounded px-1.5 py-0.5 font-medium">
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-1">
          {orderItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Toque num produto para adicionar
            </p>
          )}
          {/* Paid items section */}
          {paidItems.length > 0 && (
            <>
              <p className="text-[10px] text-accent uppercase tracking-wider font-semibold px-1 pt-1">✓ Itens pagos</p>
              {paidItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-md border border-accent/20 bg-accent/5 p-2 opacity-60">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate line-through">{item.product_name}</p>
                      <span className="text-[9px] rounded px-1 py-0.5 font-medium bg-accent/10 text-accent">PAGO</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      R$ {Number(item.price).toFixed(2)} × {item.quantity}
                    </p>
                  </div>
                </div>
              ))}
              {unpaidItems.length > 0 && (
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold px-1 pt-2">Itens pendentes</p>
              )}
            </>
          )}
          {/* Unpaid items */}
          {unpaidItems.map((item) => {
            const paidQty = (item as any).paid_quantity ?? 0;
            const remainingQty = item.quantity - paidQty;
            const prepStatus = (item as any).preparation_status ?? "pending";
            const prepColors: Record<string, string> = {
              pending: "text-muted-foreground bg-muted",
              sent: "text-[hsl(var(--status-reserved))] bg-[hsl(var(--status-reserved)/0.12)]",
              preparing: "text-[hsl(var(--status-occupied))] bg-[hsl(var(--status-occupied)/0.12)]",
              ready: "text-[hsl(var(--status-free))] bg-[hsl(var(--status-free)/0.12)]",
              delivered: "text-primary bg-primary/10",
            };
            const prepLabels: Record<string, string> = {
              pending: "PENDENTE",
              sent: "ENVIADO",
              preparing: "PREPARANDO",
              ready: "PRONTO",
              delivered: "ENTREGUE",
            };
            return (
              <div
                key={item.id}
                className={`flex items-center justify-between rounded-md border p-2 ${
                  item.sent_to_kitchen ? "bg-muted/50 border-muted" : "bg-background"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium truncate">{item.product_name}</p>
                    {item.sent_to_kitchen && (
                      <span className={`text-[9px] rounded px-1 py-0.5 font-medium whitespace-nowrap ${prepColors[prepStatus] ?? prepColors.pending}`}>
                        {prepLabels[prepStatus] ?? "PENDENTE"}
                      </span>
                    )}
                    {paidQty > 0 && (
                      <span className="text-[9px] rounded px-1 py-0.5 font-medium bg-accent/10 text-accent">
                        {paidQty}/{item.quantity} pago
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    R$ {Number(item.price).toFixed(2)} × {remainingQty}
                    {paidQty > 0 && <span className="text-accent ml-1">(total: {item.quantity})</span>}
                  </p>
                  {/* Complements */}
                  {(() => {
                    const comps = itemComplements.filter((c) => c.order_item_id === item.id);
                    if (comps.length === 0) return null;
                    return (
                      <div className="mt-0.5 space-y-0">
                        {comps.map((c) => (
                          <p key={c.id} className="text-[10px] text-muted-foreground">
                            + {c.complement_name}
                          </p>
                        ))}
                      </div>
                    );
                  })()}
                  {item.notes && (
                    <p className="text-[10px] text-muted-foreground italic mt-0.5 truncate">📝 {item.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 ml-2">
                  <button
                    onClick={() => { setNoteItemId(item.id); setNoteText(item.notes ?? ""); }}
                    className="rounded p-1.5 md:p-1 hover:bg-secondary touch-manipulation"
                    title="Observação"
                  >
                    <StickyNote className="h-4 w-4 md:h-3.5 md:w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => updateQty.mutate({ itemId: item.id, delta: -1 })}
                    disabled={item.sent_to_kitchen}
                    className="rounded p-1.5 md:p-1 hover:bg-secondary disabled:opacity-30 touch-manipulation"
                  >
                    <Minus className="h-4 w-4 md:h-3.5 md:w-3.5" />
                  </button>
                  <span className="w-7 text-center text-sm font-bold">{remainingQty}</span>
                  <button
                    onClick={() => updateQty.mutate({ itemId: item.id, delta: 1 })}
                    disabled={item.sent_to_kitchen}
                    className="rounded p-1.5 md:p-1 hover:bg-secondary disabled:opacity-30 touch-manipulation"
                  >
                    <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" />
                  </button>
                  <button
                    onClick={() => removeItem.mutate(item.id)}
                    disabled={item.sent_to_kitchen}
                    className="rounded p-1.5 md:p-1 hover:bg-destructive/10 text-destructive ml-0.5 disabled:opacity-30 touch-manipulation"
                  >
                    <Trash2 className="h-4 w-4 md:h-3.5 md:w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="border-t px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pagamentos ({payments.length})
              </span>
              <span className="ml-auto text-xs font-bold tabular-nums">
                R$ {payments.reduce((s, p) => s + Number(p.amount), 0).toFixed(2)}
              </span>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-auto">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-md border bg-muted/30 px-2.5 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] rounded px-1.5 py-0.5 font-medium bg-primary/10 text-primary">
                        {methodLabels[p.method] ?? p.method}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(p.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {" · "}
                      {new Date(p.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">R$ {Number(p.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t p-3 md:p-4 space-y-3">
          {order?.status === "paid_pending_finalization" ? (
            <>
              <div className="rounded-md bg-accent/10 border border-accent/30 p-3 text-center">
                <p className="text-sm font-semibold text-accent">✓ Pagamento concluído</p>
                <p className="text-xs text-muted-foreground mt-0.5">Finalize para registrar nos relatórios</p>
              </div>
              <button
                onClick={() => finalizeMutation.mutate()}
                disabled={finalizeMutation.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-md bg-status-free text-accent-foreground py-3 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <CheckCircle2 className="h-5 w-5" />
                <span>{finalizeMutation.isPending ? "Finalizando..." : "Finalizar Comanda"}</span>
              </button>
              <button
                onClick={() => setShowCancelConfirm(true)}
                disabled={cancelOrder.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-md border border-destructive/30 text-destructive py-2 text-sm font-medium hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                <Ban className="h-3.5 w-3.5" />
                Cancelar Mesa
              </button>
            </>
          ) : !showPayment ? (
            <>
              <div className="flex items-center justify-between">
                <span className="font-display text-xl">TOTAL</span>
                <span className="font-display text-xl">R$ {total.toFixed(2)}</span>
              </div>
              {payments.length > 0 && total > 0 && (
                <button
                  onClick={() => payMutation.mutate({ payments: [{ method: "cash", amount: total }], paidItems: {} })}
                  disabled={payMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-md bg-accent/15 border border-accent/30 text-accent py-2.5 text-sm font-semibold hover:bg-accent/25 transition-colors disabled:opacity-50"
                >
                  <Banknote className="h-4 w-4" />
                  Pagar Restante — R$ {total.toFixed(2)}
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={!order || orderItems.length === 0 || printBill.isPending}
                  onClick={() => printBill.mutate()}
                  className="flex items-center justify-center gap-2 rounded-md bg-blue-600 text-white py-3.5 md:py-3 font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 touch-manipulation"
                >
                  <Printer className="h-4 w-4" />
                  <span className="text-sm">{printBill.isPending ? "..." : "Imprimir"}</span>
                </button>
                <button
                  disabled={unpaidItems.length === 0}
                  onClick={() => setShowPayment(true)}
                  className="flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground py-3.5 md:py-3 font-medium hover:opacity-90 transition-opacity disabled:opacity-50 touch-manipulation"
                >
                  <CreditCard className="h-4 w-4" />
                  <span className="text-sm">Fechar Conta</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => saveOrder.mutate()}
                  disabled={!order || orderItems.length === 0 || saveOrder.isPending}
                  className="flex items-center justify-center gap-2 rounded-md py-3.5 md:py-2 text-sm font-medium transition-colors disabled:opacity-50 touch-manipulation"
                  style={{ backgroundColor: "#16a34a", color: "white" }}
                >
                  <Save className="h-4 w-4 md:h-3.5 md:w-3.5" />
                  {saveOrder.isPending ? "Salvando..." : "Salvar"}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={!order || cancelOrder.isPending}
                  className="flex items-center justify-center gap-2 rounded-md border border-destructive/30 text-destructive py-3.5 md:py-2 text-sm font-medium hover:bg-destructive/10 transition-colors disabled:opacity-50 touch-manipulation"
                >
                  <Ban className="h-4 w-4 md:h-3.5 md:w-3.5" />
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <PaymentPanel
              total={total}
              orderItems={orderItems}
              itemComplements={itemComplements}
              serviceFeeEnabled={serviceFeeEnabled}
              onToggleServiceFee={setServiceFeeEnabled}
              onPay={(result) => payMutation.mutate(result)}
              onCancel={() => setShowPayment(false)}
              isPending={payMutation.isPending}
              onAddQuickItem={addQuickItem}
              onRemoveQuickItem={removeQuickItem}
              onRemoveItem={(itemId) => updateQty.mutate({ itemId, delta: -1 })}
              onUpdateItemQty={(itemId, delta) => updateQty.mutate({ itemId, delta })}
            />
          )}
        </div>
      </div>

      {/* Timeline panel - desktop only */}
      {showTimeline && tableId && !isMobile && (
        <div className="w-72 border-l bg-background flex flex-col">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-sm">Histórico de Atividades</h2>
          </div>
          <div className="flex-1 overflow-auto">
            <ActivityTimeline tableId={tableId} />
          </div>
        </div>
      )}
      {/* Note dialog */}
      {noteItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30">
          <div className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Observação do Item</h3>
              <button onClick={() => { setNoteItemId(null); setNoteText(""); }} className="rounded p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Ex: Sem cebola, bem passado..."
              rows={3}
              autoFocus
              className="w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => { setNoteItemId(null); setNoteText(""); }}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={() => saveNote.mutate({ itemId: noteItemId, notes: noteText.trim() })}
                disabled={saveNote.isPending}
                className="rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add item dialog */}
      <AddItemDialog
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAdd={(payload) => addItem.mutate(payload)}
        isPending={addItem.isPending}
      />

      {/* Transfer dialog */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30">
          <div className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Transferir Pedido
              </h3>
              <button onClick={() => setShowTransfer(false)} className="rounded p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!mergeConfirm ? (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  Selecione a mesa de destino para transferir o pedido da <strong>{table?.name}</strong>:
                </p>
                <div className="grid grid-cols-3 gap-2 max-h-64 overflow-auto">
                  {allTables
                    .filter((t) => t.id !== tableId)
                    .map((t) => {
                      const hasOrder = allOpenOrders.some((o) => o.table_id === t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={() => {
                            setTransferTarget(t.id);
                            transferOrder.mutate({ targetTableId: t.id, merge: false });
                          }}
                          disabled={transferOrder.isPending}
                          className={`table-status-${t.status} relative flex flex-col items-center rounded-lg border-2 p-3 transition-all hover:scale-[1.02] active:scale-[0.98] ${
                            transferTarget === t.id ? "ring-2 ring-ring" : ""
                          }`}
                        >
                          <span className="font-medium text-sm">{t.name}</span>
                          <span className="text-[10px] text-muted-foreground">{t.seats} lug</span>
                          <span className="text-[9px] font-medium uppercase tracking-wider mt-1 text-muted-foreground">
                            {statusLabels[t.status as TableStatus]}
                          </span>
                          {hasOrder && (
                            <span className="text-[9px] text-[hsl(var(--status-occupied))] font-medium mt-0.5">
                              Com pedido
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  A <strong>{allTables.find((t) => t.id === transferTarget)?.name}</strong> já possui um pedido aberto.
                </p>
                <p className="text-sm font-medium">
                  Deseja mesclar os dois pedidos?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setMergeConfirm(false); setTransferTarget(null); }}
                    className="flex-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-secondary"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (transferTarget) {
                        transferOrder.mutate({ targetTableId: transferTarget, merge: true });
                      }
                    }}
                    disabled={transferOrder.isPending}
                    className="flex-1 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {transferOrder.isPending ? "Mesclando..." : "Mesclar Pedidos"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Merge dialog */}
      {showMerge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30">
          <div className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Merge className="h-4 w-4" />
                Juntar Mesas
              </h3>
              <button onClick={() => setShowMerge(false)} className="rounded p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!mergeTarget ? (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  Selecione a mesa que será absorvida pela <strong>{table?.name}</strong>.
                  Todos os itens, pagamentos e observações serão combinados.
                </p>
                <div className="grid grid-cols-3 gap-2 max-h-64 overflow-auto">
                  {allTables
                    .filter((t) => t.id !== tableId && allOpenOrders.some((o) => o.table_id === t.id))
                    .map((t) => {
                      const tOrder = allOpenOrders.find((o) => o.table_id === t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={() => setMergeTarget(t.id)}
                          className={`table-status-${t.status} flex flex-col items-center rounded-lg border-2 p-3 transition-all hover:scale-[1.02] active:scale-[0.98]`}
                        >
                          <span className="font-medium text-sm">{t.name}</span>
                          <span className="text-[10px] text-muted-foreground">{t.seats} lug</span>
                          {tOrder && (
                            <span className="text-[10px] font-semibold mt-1">R$ {Number(tOrder.total).toFixed(2)}</span>
                          )}
                          {tOrder?.waiter_name && (
                            <span className="text-[9px] text-muted-foreground">{tOrder.waiter_name}</span>
                          )}
                        </button>
                      );
                    })}
                  {allTables.filter((t) => t.id !== tableId && allOpenOrders.some((o) => o.table_id === t.id)).length === 0 && (
                    <p className="col-span-3 text-sm text-muted-foreground text-center py-6">
                      Nenhuma outra mesa com pedido aberto
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const srcTable = allTables.find((t) => t.id === mergeTarget);
                  const srcOrder = allOpenOrders.find((o) => o.table_id === mergeTarget);
                  return (
                    <>
                      <div className="rounded-md border p-3 space-y-1">
                        <p className="text-sm font-medium">Resumo da Junção</p>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{srcTable?.name} →</span>
                          <span>{table?.name} (mesa principal)</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span>Total {table?.name}:</span>
                          <span>R$ {Number(order?.total ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span>Total {srcTable?.name}:</span>
                          <span>R$ {Number(srcOrder?.total ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-semibold border-t pt-1 mt-1">
                          <span>Novo Total:</span>
                          <span>R$ {(Number(order?.total ?? 0) + Number(srcOrder?.total ?? 0)).toFixed(2)}</span>
                        </div>
                        {(order?.waiter_name || srcOrder?.waiter_name) && (
                          <p className="text-[10px] text-muted-foreground">
                            Garçons: {[...new Set([order?.waiter_name, srcOrder?.waiter_name].filter(Boolean))].join(", ")}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        A <strong>{srcTable?.name}</strong> será liberada após a junção.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setMergeTarget(null)}
                          className="flex-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-secondary"
                        >
                          Voltar
                        </button>
                        <button
                          onClick={() => mergeTablesMutation.mutate(mergeTarget)}
                          disabled={mergeTablesMutation.isPending}
                          className="flex-1 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                        >
                          {mergeTablesMutation.isPending ? "Juntando..." : "Confirmar Junção"}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel order confirmation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30">
          <div className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-destructive/10">
                <Ban className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold">Cancelar Mesa</h3>
                <p className="text-xs text-muted-foreground">Esta ação não pode ser desfeita</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              O pedido será cancelado e <strong>não será contabilizado nos relatórios</strong>. Todos os pagamentos parciais serão descartados e a mesa será liberada.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-secondary"
              >
                Voltar
              </button>
              <button
                onClick={() => cancelOrder.mutate()}
                disabled={cancelOrder.isPending}
                className="rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {cancelOrder.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

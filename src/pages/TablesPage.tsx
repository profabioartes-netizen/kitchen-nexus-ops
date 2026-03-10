import { useState } from "react";
import { Users, Clock, CircleDollarSign } from "lucide-react";

type TableStatus = "free" | "occupied" | "reserved" | "bill";

interface TableData {
  id: number;
  name: string;
  seats: number;
  status: TableStatus;
  waiter?: string;
  total?: number;
  duration?: string;
}

const initialTables: TableData[] = [
  { id: 1, name: "Mesa 1", seats: 2, status: "free" },
  { id: 2, name: "Mesa 2", seats: 4, status: "occupied", waiter: "Carlos", total: 87.5, duration: "45min" },
  { id: 3, name: "Mesa 3", seats: 4, status: "occupied", waiter: "Ana", total: 134.0, duration: "1h12" },
  { id: 4, name: "Mesa 4", seats: 6, status: "reserved" },
  { id: 5, name: "Mesa 5", seats: 2, status: "free" },
  { id: 6, name: "Mesa 6", seats: 8, status: "bill", waiter: "Carlos", total: 256.9, duration: "2h05" },
  { id: 7, name: "Mesa 7", seats: 4, status: "free" },
  { id: 8, name: "Mesa 8", seats: 2, status: "occupied", waiter: "Maria", total: 42.0, duration: "20min" },
  { id: 9, name: "Mesa 9", seats: 6, status: "free" },
  { id: 10, name: "Mesa 10", seats: 4, status: "free" },
  { id: 11, name: "Mesa 11", seats: 2, status: "occupied", waiter: "Ana", total: 65.0, duration: "35min" },
  { id: 12, name: "Mesa 12", seats: 8, status: "free" },
];

const statusLabels: Record<TableStatus, string> = {
  free: "Livre",
  occupied: "Ocupada",
  reserved: "Reservada",
  bill: "Conta",
};

const statusCycle: TableStatus[] = ["free", "occupied", "reserved", "bill"];

export default function TablesPage() {
  const [tables, setTables] = useState<TableData[]>(initialTables);

  const cycleStatus = (id: number) => {
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const idx = statusCycle.indexOf(t.status);
        const next = statusCycle[(idx + 1) % statusCycle.length];
        return { ...t, status: next };
      })
    );
  };

  const occupied = tables.filter((t) => t.status === "occupied").length;
  const totalRevenue = tables.reduce((sum, t) => sum + (t.total || 0), 0);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Mapa de Mesas</h1>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 rounded-md bg-card px-3 py-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{occupied}/{tables.length} ocupadas</span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-card px-3 py-2">
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">R$ {totalRevenue.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Status legend */}
      <div className="flex gap-4 mb-6">
        {statusCycle.map((s) => (
          <div key={s} className="flex items-center gap-2 text-xs">
            <div className={`h-3 w-3 rounded-full border-2 table-status-${s}`} />
            <span className="text-muted-foreground">{statusLabels[s]}</span>
          </div>
        ))}
      </div>

      {/* Floor plan grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {tables.map((table) => (
          <button
            key={table.id}
            onClick={() => cycleStatus(table.id)}
            className={`table-status-${table.status} relative flex flex-col items-center justify-center rounded-lg border-2 p-4 min-h-[120px] cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]`}
          >
            <span className="font-display text-lg">{table.name}</span>
            <span className="text-xs text-muted-foreground mt-1">
              {table.seats} lugares
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider mt-2 text-muted-foreground">
              {statusLabels[table.status]}
            </span>

            {table.status !== "free" && table.total !== undefined && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="font-semibold">R$ {table.total.toFixed(2)}</span>
                {table.duration && (
                  <span className="flex items-center gap-0.5 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {table.duration}
                  </span>
                )}
              </div>
            )}

            {table.waiter && (
              <span className="text-[10px] text-muted-foreground mt-1">
                {table.waiter}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

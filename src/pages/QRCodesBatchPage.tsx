import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoSrc from "@/assets/coffee-thrones-logo.png";

export default function QRCodesBatchPage() {
  const baseUrl = window.location.origin;

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ["restaurant_tables_qr"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("id, name, internal_number")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">QR Codes — Todas as Mesas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tables.length} mesa(s) ativa(s). Imprima esta página para recortar os QR Codes.
          </p>
        </div>
        <Button onClick={() => window.print()} className="gap-2">
          <Printer className="h-4 w-4" />
          Imprimir Todos
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 print:grid-cols-3 print:gap-4">
        {tables.map((table) => {
          const url = `${baseUrl}/autoatendimento/${table.id}`;
          return (
            <div
              key={table.id}
              className="flex flex-col items-center border border-border rounded-lg p-4 bg-card print:break-inside-avoid print:border print:border-gray-300"
            >
              <h3 className="font-semibold text-sm mb-1 text-foreground">{table.name}</h3>
              {table.internal_number && (
                <span className="text-[10px] text-muted-foreground mb-2">#{table.internal_number}</span>
              )}
              <div className="bg-white p-3 rounded-md">
                <QRCodeSVG
                  value={url}
                  size={140}
                  level="H"
                  imageSettings={{
                    src: logoSrc,
                    height: 30,
                    width: 30,
                    excavate: true,
                  }}
                />
              </div>
              <p className="text-[9px] text-muted-foreground mt-2 text-center break-all leading-tight max-w-[160px]">
                {url}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 italic">
                Escaneie para fazer seu pedido
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

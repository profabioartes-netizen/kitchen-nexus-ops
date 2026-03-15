import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoSrc from "@/assets/coffee-thrones-logo.png";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export default function QRCodesBatchPage() {
  const baseUrl = "https://coffeethrones.app";
  const [exporting, setExporting] = useState(false);

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ["restaurant_tables_qr"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("id, name, internal_number, sector")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const sections = Array.from(
        document.querySelectorAll("[data-pdf-section]")
      ) as HTMLElement[];

      if (sections.length === 0) return;

      const A4_WIDTH_MM = 210;
      const A4_HEIGHT_MM = 297;
      const MARGIN_MM = 12;
      const CONTENT_WIDTH_MM = A4_WIDTH_MM - MARGIN_MM * 2;
      const SECTION_GAP_MM = 6;

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let currentY = MARGIN_MM;

      for (const section of sections) {
        const canvas = await html2canvas(section, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        });

        const scaleFactor = CONTENT_WIDTH_MM / canvas.width;
        const heightMM = canvas.height * scaleFactor;
        const remainingSpace = A4_HEIGHT_MM - MARGIN_MM - currentY;

        if (heightMM > remainingSpace && currentY > MARGIN_MM) {
          pdf.addPage();
          currentY = MARGIN_MM;
        }

        const imgData = canvas.toDataURL("image/png");
        pdf.addImage(imgData, "PNG", MARGIN_MM, currentY, CONTENT_WIDTH_MM, heightMM);
        currentY += heightMM + SECTION_GAP_MM;
      }

      pdf.save("qrcodes-mesas.pdf");
    } catch (err) {
      console.error("PDF export error:", err);
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto h-full overflow-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">QR Codes — Todas as Mesas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tables.length} mesa(s) ativa(s). Gere o PDF para imprimir e recortar.
          </p>
        </div>
        <Button onClick={handleExportPDF} disabled={exporting} className="gap-2">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? "Gerando..." : "Gerar PDF"}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
        {tables.map((table) => {
          const url = `${baseUrl}/auto-atendimento/${table.id}`;
          return (
            <div
              key={table.id}
              data-pdf-section
              className="flex flex-col items-center border border-border rounded-lg p-4 bg-card"
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
              <p className="text-base text-foreground mt-3 font-bold text-center">
                Escaneie e faça o seu pedido pelo celular
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

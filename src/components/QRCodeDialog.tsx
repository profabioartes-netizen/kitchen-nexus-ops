import { QRCodeSVG } from "qrcode.react";
import { X, Download, Printer } from "lucide-react";

interface Props {
  tableId: string;
  tableName: string;
  onClose: () => void;
}

export default function QRCodeDialog({ tableId, tableName, onClose }: Props) {
  const baseUrl = window.location.origin;
  const url = `${baseUrl}/autoatendimento/${tableId}`;

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>QR Code - ${tableName}</title>
          <style>
            body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; font-family: sans-serif; }
            h2 { margin-bottom: 8px; font-size: 20px; }
            p { margin: 4px 0 16px; font-size: 12px; color: #666; }
            svg { width: 250px; height: 250px; }
          </style>
        </head>
        <body>
          <h2>${tableName}</h2>
          <p>Escaneie para fazer seu pedido</p>
          ${document.getElementById("qr-svg-container")?.innerHTML || ""}
          <p style="margin-top: 12px; font-size: 10px; color: #999;">${url}</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background shadow-lg">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">QR Code · {tableName}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center space-y-4">
          <div id="qr-svg-container" className="bg-white p-4 rounded-lg">
            <QRCodeSVG value={url} size={200} level="M" />
          </div>
          <p className="text-xs text-muted-foreground text-center break-all">{url}</p>
        </div>

        <div className="border-t border-border p-4 flex gap-2">
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground py-2.5 font-medium text-sm hover:opacity-90"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-border py-2.5 font-medium text-sm text-foreground hover:bg-secondary"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

import { FileX2 } from "lucide-react";

export default function AccountingSalesPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3 p-6">
      <FileX2 className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Módulo fiscal indisponível</h1>
      <p className="text-sm text-muted-foreground max-w-md">
        A emissão de NFC-e foi desativada neste sistema. Apenas cupons não
        fiscais são gerados. Consulte o relatório financeiro interno.
      </p>
    </div>
  );
}

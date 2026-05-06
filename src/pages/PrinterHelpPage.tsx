import { Link } from "react-router-dom";
import { ArrowLeft, Download, Printer, HelpCircle, Monitor } from "lucide-react";

export default function PrinterHelpPage() {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link to="/impressoras" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Voltar para Impressoras
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-md bg-accent/10 p-2 text-accent">
          <HelpCircle className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold">Ajuda — HuskyPDV Agent &amp; Impressão</h1>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        O instalador do <strong>HuskyPDV Agent</strong> ainda não está disponível neste ambiente. Enquanto isso,
        você pode operar o PDV normalmente usando a <strong>Impressão pelo Navegador</strong> (fallback nativo).
      </p>

      <div className="space-y-4">
        <section className="rounded-lg border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-2">
            <Monitor className="h-5 w-5 text-accent" /> Use a Impressora do Sistema (sem Agent)
          </h2>
          <ol className="list-decimal pl-5 text-sm space-y-1 text-muted-foreground">
            <li>No fechamento da venda, clique em <strong>Imprimir pelo Navegador</strong>.</li>
            <li>O navegador abrirá a janela de impressão do Windows/macOS.</li>
            <li>Selecione sua impressora térmica (80mm ou 58mm) e confirme.</li>
            <li>Recomendado: configure papel térmico como padrão e desative cabeçalhos/margens nas opções avançadas.</li>
          </ol>
        </section>

        <section className="rounded-lg border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-2">
            <Download className="h-5 w-5 text-accent" /> Quando o Agent ficar disponível
          </h2>
          <p className="text-sm text-muted-foreground">
            O Agent permite impressão automática silenciosa, sem abrir janela do navegador, e suporta múltiplas
            estações (Caixa, Cozinha, Bar). Assim que o instalador for liberado, o botão de download na tela
            de Impressoras passa a funcionar automaticamente.
          </p>
        </section>

        <section className="rounded-lg border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-2">
            <Printer className="h-5 w-5 text-accent" /> Suporte
          </h2>
          <p className="text-sm text-muted-foreground">
            Se precisar de ajuda imediata, entre em contato com o suporte HuskyPDV pelo WhatsApp. A operação do
            PDV continua funcionando sem o Agent — apenas a impressão automática fica indisponível.
          </p>
        </section>
      </div>
    </div>
  );
}

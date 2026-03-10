import { Users, Printer, Shield, FileText, QrCode, Monitor, Truck } from "lucide-react";

const sections = [
  {
    title: "Equipe & Permissões",
    icon: Shield,
    description: "Gerencie funcionários e defina permissões por cargo (gerente, caixa, garçom).",
    items: [
      { role: "Gerente", permissions: "Acesso total", count: 1 },
      { role: "Caixa", permissions: "PDV, Relatórios básicos", count: 2 },
      { role: "Garçom", permissions: "Mesas, Pedidos", count: 4 },
    ],
  },
  {
    title: "Impressoras & Estações",
    icon: Printer,
    description: "Configure o roteamento de impressoras térmicas por estação de preparo.",
    items: [
      { role: "Cozinha", permissions: "Impressora 1 — Epson TM-T20", count: null },
      { role: "Bar", permissions: "Impressora 2 — Epson TM-T20", count: null },
      { role: "Caixa", permissions: "Impressora 3 — Bematech MP-4200", count: null },
    ],
  },
];

const futureModules = [
  { icon: QrCode, name: "QR Code Mesa", description: "Cardápio digital e pedido pelo celular do cliente" },
  { icon: Monitor, name: "KDS Cozinha", description: "Tela de preparo para a cozinha com priorização" },
  { icon: Truck, name: "Delivery", description: "Integração com iFood, Rappi e pedidos diretos" },
  { icon: FileText, name: "Fiscal / NFC-e", description: "Emissão de notas fiscais eletrônicas" },
];

export default function ManagementPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Gestão</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {sections.map((section) => (
          <div key={section.title} className="rounded-lg border bg-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <section.icon className="h-5 w-5 text-accent" />
              <h2 className="font-semibold">{section.title}</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{section.description}</p>
            <div className="space-y-2">
              {section.items.map((item) => (
                <div
                  key={item.role}
                  className="flex items-center justify-between rounded-md bg-background border p-3 text-sm"
                >
                  <div>
                    <span className="font-medium">{item.role}</span>
                    <span className="text-muted-foreground ml-2">— {item.permissions}</span>
                  </div>
                  {item.count !== null && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {item.count}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Future modules */}
      <h2 className="text-lg font-semibold mb-4">Módulos Futuros</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {futureModules.map((mod) => (
          <div
            key={mod.name}
            className="rounded-lg border border-dashed bg-card/50 p-4 opacity-70"
          >
            <mod.icon className="h-6 w-6 text-accent mb-2" />
            <h3 className="font-medium text-sm">{mod.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{mod.description}</p>
            <span className="inline-block mt-3 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Em breve
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

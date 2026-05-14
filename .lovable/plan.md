## Recurso: F6 → Histórico de Lançamentos da Comanda

Adicionar atalho **F6** na página da comanda aberta (`TableOrderPage`) que abre um modal listando cada item lançado com **data e hora** do lançamento.

### Comportamento

- Tecla **F6** (em qualquer lugar da página da comanda, exceto inputs de texto): abre o modal.
- **Esc** ou clique fora: fecha.
- Funciona apenas com comanda aberta carregada.

### Conteúdo do modal

Lista cronológica (mais recente primeiro) com:

- Hora `HH:mm` + data `dd/MM/yyyy` (de `order_items.created_at`)
- Nome do produto + quantidade
- Complementos (se houver)
- Preço unitário
- Quem lançou: usa `orders.waiter_name` da comanda (não temos campo por item) e marca origem se `origin = 'self_service'` mostrando "Autoatendimento"
- Status do item: Pendente / Enviado cozinha / Pronto / Entregue (derivado de `preparation_status` e `sent_to_kitchen`)

Agrupamento opcional por "rodada" (mesmo minuto de lançamento) com separador visual para facilitar leitura.

### Detalhes técnicos

- Arquivo: `src/pages/TableOrderPage.tsx`
- Reaproveitar a query já existente `["order_items", order?.id]` (já traz `created_at`, `sent_at`, `preparation_status`, complementos via map).
- Novo state `historyOpen: boolean`.
- `useEffect` com listener `keydown` global: se `e.key === "F6"` e o target não for `INPUT/TEXTAREA/[contenteditable]`, `e.preventDefault()` e `setHistoryOpen(true)`.
- Componente: `<Dialog>` (shadcn) já disponível no projeto, com `DialogContent` rolável (`max-h-[80vh] overflow-auto`).
- Ordenação: copiar `items` e `sort` por `created_at` desc.
- Formatadores: `toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })` e `toLocaleDateString("pt-BR")`.
- Sem mudanças no banco — `order_items.created_at` já existe e é preenchido por `default now()`.
- Dica visual no rodapé do painel direito da comanda: pequeno texto "F6: histórico" para descoberta.

### Fora de escopo

- Não registra usuário por item (schema atual não tem). Mostra apenas o garçom da comanda.
- Não exporta/imprime o histórico (pode virar feature futura).
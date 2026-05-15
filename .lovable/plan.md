## Atalho F10 → Imprimir notinha da comanda

Adicionar atalho de teclado **F10** na página da comanda aberta (`TableOrderPage`) que dispara a mesma ação do botão **Imprimir** já existente (mutation `printBill`).

### Comportamento

- Tecla **F10** em qualquer lugar da página da comanda (exceto inputs/textareas/contenteditable): chama `printBill.mutate()`.
- Ignora se: não há `order`, a comanda está sem itens, ou já existe impressão em andamento (`printBill.isPending`).
- `e.preventDefault()` para evitar comportamento nativo do navegador (F10 abre menu em alguns browsers).

### Detalhes técnicos

- Arquivo único: `src/pages/TableOrderPage.tsx`.
- Reaproveita o `useEffect` de keydown que já existe (linhas ~216-232, atalho F6 do histórico). Adicionar branch para `e.key === "F10"`.
- Sem nova mutation/state — chama exatamente o mesmo fluxo do botão "Imprimir" (linha 1600), que já usa `printViaLocalAgent` + fallback navegador e registra `logActivity`.
- Atualizar a dica visual no rodapé do painel direito (perto de "Atalho: F6") para incluir "F10: imprimir conta".

### Fora de escopo

- Não muda formato/conteúdo da notinha.
- Não altera o fluxo de impressão (continua via Print Agent local com fallback).

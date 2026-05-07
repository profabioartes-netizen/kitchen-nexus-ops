## Objetivo

Corrigir o cupom impresso pelo navegador (HuskyPDV Caixa Launcher / Chrome em modo kiosk-printing) para:
1. Eliminar caracteres estranhos em palavras acentuadas ("REFEIção" → "REFEICAO").
2. Garantir alinhamento perfeito das colunas da tabela de itens, evitando que o TOTAL "vaze" para a linha de baixo (como acontece no cupom da foto: `30,` / `28`).

O componente impacto é `src/lib/browserPrint.ts` (que gera o HTML do cupom). Esse mesmo HTML é o que o launcher manda para a térmica.

## Mudanças

### 1. Utilitário `removeAccents`

Criar `src/lib/removeAccents.ts`:

```ts
export function removeAccents(input: unknown): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
```

Usa NFD + strip de combining marks — cobre todos os acentos latinos (á, é, í, ó, ú, â, ê, ô, ã, õ, ç, ü, etc.) sem precisar de mapa manual.

Observação: já existe `src/lib/normalize.ts` que faz NFD + lowercase para busca. O novo utilitário **não** faz lowercase (preserva o caixa original do nome do produto/cliente).

### 2. Aplicar `removeAccents` em `browserPrint.ts`

Em `buildHtml()`, envolver o `escape()` para todos os campos visíveis no cupom:
- `business_name`, `business_phone`
- `title`, `table_name`
- `customer_name`, `waiter_name`
- `product_name` (após o cálculo de `displayName`)
- `complements[]`
- `payment_method`
- `message` (cupom de teste)

Forma mais limpa: criar um helper local `safe(s) = escape(removeAccents(s))` e substituir as chamadas de `escape()` que recebem texto livre. Campos puramente numéricos (preços, quantidades, "R$ ...") seguem sem o tratamento.

### 3. Refatorar CSS da tabela de itens

Trocar as larguras fixas em `mm` por **porcentagens fixas**, conforme pedido:

```css
table.items { table-layout: fixed; width: 100%; }
table.items th, table.items td {
  font-family: 'Courier New', Courier, monospace;
  font-weight: 700;
  font-size: 12px;
  vertical-align: top;
  padding: 0;
}
table.items td.prod, table.items th.prod {
  width: 45%;
  text-align: left;
  word-wrap: break-word;
  overflow-wrap: break-word;
  padding-right: 1mm;
}
table.items td.qnt,  table.items th.qnt  { width: 15%; text-align: right; white-space: nowrap; }
table.items td.unit, table.items th.unit { width: 20%; text-align: right; white-space: nowrap; padding-left: 1mm; }
table.items td.tot,  table.items th.tot  { width: 20%; text-align: right; white-space: nowrap; padding-left: 1mm; }
```

Pontos-chave:
- `table-layout: fixed` força o navegador a respeitar as larguras de coluna (sem isso, o conteúdo "empurra" e estoura).
- `white-space: nowrap` em QNT/UNIT/TOTAL impede a quebra do `30,28`.
- `word-wrap: break-word` na coluna PRODUTO permite que nomes longos quebrem em múltiplas linhas dentro da própria célula.
- Fonte forçada `'Courier New', Courier, monospace` com `font-weight: 700` em todo o cupom (já é o padrão do `body`, mas reforçado na tabela).
- Diminuir levemente para `font-size: 12px` na tabela ajuda a caber as 4 colunas em 72mm sem aperto.

Também alinhar o cabeçalho `QNT` à direita (hoje está `text-align: left` por causa da regra genérica `table.items th`).

### 4. Sem mudanças em outros arquivos

- O agente Tauri (`desktop-agent`) usa texto monoespaçado puro em `render.ts` — não tem o problema de tabela HTML, fica como está.
- O `receiptText.ts` (texto plano) já não tem acentos relevantes; não muda.
- O `caixa-launcher` apenas abre o Chrome em `--kiosk-printing` e não toca no HTML.

## Arquivos editados

- `src/lib/removeAccents.ts` (novo)
- `src/lib/browserPrint.ts` (helper `safe()` + CSS da tabela)

## Resultado esperado

- "REFEIÇÃO" imprime como `REFEICAO`, "Café Coado" como `CAFE COADO`, "Fábio" como `FABIO`.
- Colunas da tabela alinhadas em 45/15/20/20%, com TOTAL `R$ 30,28` na mesma linha do produto, sem quebra.
- Nomes longos de produto quebram dentro da própria célula PRODUTO sem desalinhar QNT/UNIT/TOTAL.

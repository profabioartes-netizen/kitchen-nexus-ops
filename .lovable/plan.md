## Contexto: o que já existe

O HuskyPDV **já tem** quase tudo para múltiplas impressoras por setor — só falta polimento:

- `products.station` (texto): cada produto já pode ter um setor (Cozinha, Bar, Sobremesa...).
- `printers.station`: catálogo de setores que aparece no formulário de produto.
- `print_agents.station`: **cada agente Tauri instalado é vinculado a 1 setor**. Ao parear, é escolhido onde aquele PC vai imprimir.
- `print_jobs.station`: o ticket é criado com o setor do produto e a função RPC `claim_print_jobs_for_agent` só entrega ao agente os jobs do setor dele.
- Em `WaiterOrderPage`/`TableOrderPage` (linhas ~411–445 e ~906–938), os itens da comanda **já são agrupados por `product.station`** e geram um `print_job` por setor. Caixa/recibo continua indo para o agente da estação `Caixa`.

Ou seja: hoje, se o cliente parear 1 PC como "Cozinha" e outro como "Bar", já funciona. O que falta é (a) UX clara para configurar isso, (b) flexibilidade para 1 PC ouvir mais de um setor, e (c) lista gerenciada de setores em vez de texto livre.

---

## Plano de mudanças

### 1. Permitir que 1 agente atenda múltiplos setores
Hoje cada `print_agents` tem **um** `station` (texto). Em comércios pequenos com 1 só impressora, ele precisa imprimir Caixa **e** Cozinha. Solução:

- Migração: adicionar `print_agents.stations text[] not null default '{}'` (mantém `station` para compatibilidade — backfill `stations = ARRAY[station]`).
- Atualizar a função RPC `claim_print_jobs_for_agent`: trocar `WHERE station = v_agent.station` por `WHERE station = ANY(v_agent.stations)`.
- Mesma mudança em `agent_pairing_codes`: aceitar `stations text[]` (e manter `station` como fallback do primeiro item).
- Edge function `generate-pairing-code` e `pair-print-agent`: passar/retornar `stations` (array). Manter `station` retornando `stations[0]` para o agente Tauri atual continuar exibindo a estação principal sem precisar republicar binário.

### 2. Lista gerenciada de setores (em vez de texto livre)
Hoje "Setor" é um `<input type=text>` em `PrintersPage` e `ProductFormDialog` lê `printers.station` distinct. É frágil ("Cozinha" vs "cozinha" vs "Cozin").

- Introduzir setores **canônicos pré-criados** por tenant (semente: `Caixa`, `Cozinha`, `Bar`, `Sobremesa`) e UI para adicionar/renomear.
- Implementação leve: usar a própria tabela `printers` como catálogo (já é assim), porém:
  - Trocar input livre por `<select>` + botão "+ Novo setor" no `PrintersPage` e `ProductFormDialog`.
  - Garantir uppercase-insensitive na hora de roteirizar (`station` salvo como digitado, mas comparação case-insensitive — fazemos isso normalizando para Title Case ao salvar).

### 3. UI de pareamento e gestão de agentes (`PrintersPage` + `PrintAgentsList`)
- Ao gerar código de pareamento: mostrar **checkboxes de setores** ("este PC vai imprimir: ☑ Caixa ☑ Cozinha ☐ Bar").
- Em `PrintAgentsList`, o badge de setor vira **chips múltiplos** editáveis (`Caixa` `Cozinha`). Botão "Editar setores" abre o mesmo seletor.
- Adicionar coluna "Setores" e indicador visual de qual agente é o "padrão de Caixa" (qualquer agente que tenha `Caixa` em `stations`).

### 4. Compatibilidade com fluxo atual de impressão
Sem mudanças nos call sites de `print_jobs.insert` em `WaiterOrderPage`, `TableOrderPage`, `CashierPage`, `printCancellation.ts`, `NfceStatus.tsx` — o agrupamento por setor já existe. Só garantir que:
- Recibo/cupom de pagamento continua com `station: "Caixa"` (já está).
- Ticket de cancelamento herda o setor do produto cancelado (já é gerado por item).
- Se um produto não tiver `station` preenchido, cair no setor `Caixa` (fallback novo) para nunca perder ticket.

### 5. Documentação curta no painel
Caixa de ajuda em `PrintersPage` explicando o modelo:
> "Cada PC instalado escolhe quais setores vai imprimir. Produtos cadastrados como `Cozinha` saem na impressora dos PCs que escutam Cozinha. O Caixa imprime recibos e cancelamentos."

---

## Arquivos a tocar

- **Migração SQL** (nova): adicionar `print_agents.stations text[]`, `agent_pairing_codes.stations text[]`, atualizar `claim_print_jobs_for_agent`, backfill.
- `supabase/functions/generate-pairing-code/index.ts`: aceitar `stations: string[]`.
- `supabase/functions/pair-print-agent/index.ts`: retornar `stations`.
- `src/pages/PrintersPage.tsx`: dropdown de setores + UX de "novo setor".
- `src/components/PrintAgentsList.tsx`: chips multi-setor, edição via checkboxes.
- `src/components/ProductFormDialog.tsx`: dropdown alimentado pela lista canônica.
- (Opcional, sem rebuild obrigatório do .exe) `desktop-agent/src/App.tsx`: exibir lista de setores em vez de uma string única — se não atualizado, ainda funciona pois `station` continua existindo.

---

## Resultado esperado

- Cliente pode ter 1 ou N impressoras espalhadas: Caixa imprime recibos, Cozinha imprime ticket de produção da cozinha, Bar imprime bebidas, etc.
- Crescer para Sobremesa / Padaria / Confeitaria é só adicionar o setor no painel e parear o novo PC marcando esse setor.
- Quem só tem 1 PC pode marcar todos os setores num agente só — tudo sai numa impressora.
- Nada quebra no fluxo atual: Caixa segue como padrão.

Posso aplicar?

## Objetivo

Restringir o que usuários com função GARÇOM (`profile.role === "waiter"`) veem no painel desktop/PDV. O garçom deve ter acesso apenas a abrir/gerenciar comandas — sem Relatórios, Vendas, gestão de quantidade de comandas, etc.

Hoje, mesmo existindo o modo mobile `/garcom`, se um garçom acessa o painel principal (`AppLayout`) ele enxerga toda a barra lateral e todos os botões do topo do Mapa de Comandas.

## Alterações

### 1. `src/components/NavigationRail.tsx` — esconder itens para garçom

- Ler `profile.role` do `useAuth()`.
- Definir `isWaiter = profile?.role === "waiter"`.
- Para garçom, exibir apenas:
  - Operacional: **Comandas** (`/`)
  - (ocultar Caixa, Abertura de Caixa, toda a seção Gestão e Plataforma)
- Manter footer (tema, atualizar, sair, recolher) intacto.

Implementação: filtrar `operationalItems` e pular renderização da seção "Gestão" e "Plataforma" quando `isWaiter` for true.

### 2. `src/pages/TablesPage.tsx` — esconder controles de gestão no topo

No bloco de botões do header (linhas ~744–813), ocultar quando `profile?.role === "waiter"`:
- Botão **Relatórios** (`navigate("/relatorios")`)
- Botão **Usuários** (`navigate("/usuarios")`)
- Popover **Qtd. Comandas** (controle de quantidade)

Manter visível: busca, KPIs (Mesas Ocupadas / Livres / Média / Clientes) — são apenas leitura operacional, úteis para o garçom.

> Observação: se o usuário também quiser ocultar os 4 cards de KPI no topo para o garçom, basta confirmar — adiciono um `if (!isWaiter)` ao redor do `Summary Bar`.

### 3. `src/App.tsx` — guarda de rota (defesa em profundidade)

Como as rotas `/relatorios`, `/vendas`, `/usuarios`, `/configuracoes`, `/produtos`, `/impressoras`, `/caixa`, `/controle-caixa` continuam acessíveis por URL direta, adicionar um wrapper simples `RequireNotWaiter` que redireciona garçons para `/`. Aplicar nessas rotas administrativas dentro do bloco já protegido por `RequireAuth`.

## Detalhes técnicos

- Fonte da verdade do papel: `profile.role` (já usado em `WaiterLayout` e `AuthRoute`).
- Não mexer em RLS — é apenas restrição de UI/navegação.
- Não alterar o fluxo `/garcom` (modo mobile dedicado continua funcionando como hoje).
- Header mobile (`AppLayout`) já é mínimo (logo, atualizar, sair) — nenhuma mudança necessária ali.

## Arquivos a editar

- `src/components/NavigationRail.tsx`
- `src/pages/TablesPage.tsx`
- `src/App.tsx`

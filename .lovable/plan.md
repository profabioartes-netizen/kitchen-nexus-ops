## Atalho F3 → abrir "Nova Comanda"

Em `src/pages/TablesPage.tsx`, adicionar um `useEffect` que registra um listener global de `keydown`:

- Dispara quando `e.key === "F3"`.
- Ignora se o foco está em `input`, `textarea`, ou elemento `contentEditable` (evita conflito com digitação).
- Ignora se já há diálogo aberto (`newComandaOpen`) ou se outro modal/lock está ativo.
- Chama `e.preventDefault()` (cancela o "buscar próximo" do navegador) e `setNewComandaOpen(true)`.

Sem outras mudanças; o restante do fluxo (passo 1 número → passo 2 cliente → cria comanda) já existe.

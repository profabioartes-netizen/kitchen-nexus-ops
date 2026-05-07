## Problema

No KDS/Cozinha (`/cozinha`), o botão **"Marcar Entregue"** (e demais botões de avanço de status) responde mal no mobile:
- Área de toque pequena (`py-2`, ~32px de altura) — abaixo do mínimo recomendado de 44–48px.
- Usa apenas `onClick`, que no mobile pode ter delay de ~300ms ou ser engolido se o dedo deslizar 1–2px.
- Sem `touch-manipulation` / sem feedback visual de toque (`active:`).
- Sem `select-none`, então toque longo seleciona texto em vez de disparar a ação.

## Alteração

Em `src/pages/KitchenStationPage.tsx`, no botão de avançar status (linhas ~402–421):

1. **Aumentar área de toque no mobile**: `py-3 min-h-[48px]` em mobile, mantendo `sm:py-2` no desktop.
2. **Tipografia mais legível**: `text-base font-semibold` no mobile, `sm:text-sm sm:font-medium` no desktop.
3. **Resposta instantânea ao toque**: trocar `onClick` por `onPointerUp` com `e.preventDefault()`, eliminando o delay e mantendo um `onClick` neutralizado (apenas `preventDefault`) para evitar duplicação. Continua respeitando `updateStatus.isPending`.
4. **Feedback tátil/visual**: adicionar `touch-manipulation`, `select-none`, `active:scale-[0.98]` e `transition-all`.

Mantém a lógica de Optimistic UI já implementada (a mutation `updateStatus` continua disparando o cache update imediato), apenas torna o toque confiável.

## Arquivo

- `src/pages/KitchenStationPage.tsx` (somente o bloco do botão de ação)

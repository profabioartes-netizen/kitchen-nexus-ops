## Objetivo

Pular por enquanto a edge function de proxy. Manter o botão "Baixar HuskyPDV Agent" usando apenas a variável `VITE_AGENT_DOWNLOAD_URL`. Se ela estiver vazia ou inválida, exibir mensagem clara em vez de abrir um link quebrado.

## Mudança única

Arquivo: `src/pages/PrintersPage.tsx` (linhas 98-106)

1. Remover o fallback hardcoded `https://github.com/huskypdv/desktop-agent/releases/...`.
2. Ler a env e considerar válida apenas se for uma URL `https://...` que termine com `.exe`.
3. Atualizar `handleDownloadInstaller`:
   - Se a URL for válida → abrir em nova aba (comportamento atual) + toast de sucesso.
   - Se vazia/inválida → `toast.error("Instalador ainda não publicado. Entre em contato com o suporte.")` e não abrir aba.
4. Pequeno ajuste visual no bloco do PASSO 2 (linhas 801-817):
   - Quando a URL não estiver configurada, mostrar um aviso discreto (`text-xs text-muted-foreground`) abaixo do botão: *"Instalador ainda não publicado."* e deixar o botão visualmente desabilitado (`opacity-60 cursor-not-allowed`), mas ainda clicável para disparar o toast informativo.

## O que NÃO será feito agora

- Não criar `supabase/functions/download-print-agent`.
- Não solicitar os secrets `GITHUB_AGENT_REPO` / `GITHUB_AGENT_TOKEN`.
- Não mexer em rotas, RLS, banco ou no projeto `desktop-agent/`.

## Próximos passos (após você publicar a release)

1. Você sobe o repo `huskypdv-agent`, gera ícones, faz `git tag v0.1.0 && git push --tags`.
2. Confere o asset `HuskyPDV-Agent-Setup.exe` na release.
3. Marca a release como pública (ou deixa privada).
4. Caso pública: define `VITE_AGENT_DOWNLOAD_URL` no Lovable apontando pro link `releases/latest/download/HuskyPDV-Agent-Setup.exe` — botão passa a funcionar.
5. Caso queira manter privada: aí sim implementamos a edge function `download-print-agent` com proxy autenticado (validando auth + tenant ativo + role `admin_cliente` ou `super_admin`) usando os secrets do GitHub.

## Objetivo
Padronizar o nome do instalador do Agente como `HuskyPrintAgent.exe` e usar a URL `latest/download` (sempre aponta para a release mais recente, evitando 404).

## Situação atual
- Workflow `.github/workflows/build-desktop-agent.yml` hoje gera o asset com nome **`HuskyPDV-Agent-Setup.exe`**.
- Botão em `src/pages/PrintersPage.tsx` aponta para `…/latest/download/HuskyPDV-Agent-Setup.exe`.
- Pedido do usuário: usar `HuskyPrintAgent.exe`.

Como os nomes não batem, é necessário alinhar workflow e botão, senão a próxima release continuará com nome antigo e a URL nova dará 404.

## Mudanças

### 1. `.github/workflows/build-desktop-agent.yml`
- No passo "Rename installer to stable filename": copiar para `HuskyPrintAgent.exe`.
- No passo "Upload artifact": `name: HuskyPrintAgent` e `path: HuskyPrintAgent.exe`.
- No passo "Publish GitHub Release": `files: HuskyPrintAgent.exe`.

### 2. `src/pages/PrintersPage.tsx`
- Constante `INSTALLER_URL` → `https://github.com/profabioartes-netizen/kitchen-nexus-ops/releases/latest/download/HuskyPrintAgent.exe`.
- Atributo `link.download` → `"HuskyPrintAgent.exe"`.
- Texto do passo do instalador (lista ordenada): "Execute o **HuskyPrintAgent.exe**…".

## Observação importante
A URL `latest/download/HuskyPrintAgent.exe` só funcionará após uma nova release ser publicada com o workflow atualizado (basta criar uma nova tag `v*`). Releases já existentes continuarão com o nome antigo. Se o usuário precisar de funcionamento imediato, é necessário publicar uma nova tag depois desta alteração.
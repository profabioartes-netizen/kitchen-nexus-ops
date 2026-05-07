# Apontar o botão de download para o seu repo real

Vi no print que seu projeto está conectado ao GitHub em **`profabioartes-netizen/kitchen-nexus-ops`**. Hoje o botão "Baixar HuskyPrintAgent.exe" aponta para um placeholder (`HuskyPDV/huskypdv`) que dá 404. Vou corrigir isso.

## O que vou fazer (build mode)

### 1. `src/pages/PrintersPage.tsx`
Trocar a constante:
```ts
const INSTALLER_URL = "https://github.com/profabioartes-netizen/kitchen-nexus-ops/releases/latest/download/HuskyPrintAgent.exe";
```

### 2. `print-agent-py/README.md`
Substituir todas as ocorrências de `<ORG>/<REPO>` por `profabioartes-netizen/kitchen-nexus-ops` para os comandos ficarem prontos para copiar/colar.

## O que VOCÊ precisa fazer (1 vez só, ~3 minutos)

Como o build do `.exe` precisa de um Windows com Python (que você não tem), o GitHub Actions vai fazer isso na nuvem **de graça**. Passos:

1. Abra: `https://github.com/profabioartes-netizen/kitchen-nexus-ops/actions`
2. Na lista da esquerda, clique em **"Build & Release HuskyPrintAgent"**.
3. Clique no botão **"Run workflow"** (verde, à direita) → branch `main` → **Run workflow**.
4. Aguarde ~3 minutos (vai aparecer um check verde).
5. Pronto. O `.exe` fica disponível em duas URLs:
   - **Artifacts** (na própria execução) — para você baixar e testar manualmente
   - **Releases** (`/releases/latest`) — só aparece se você criar uma tag

### Para gerar a Release pública (URL estável que o botão usa)
No próprio GitHub:
1. Vá em **Releases** → **Draft a new release**.
2. Em "Choose a tag" digite `print-agent-v1.0.0` → **Create new tag**.
3. **Publish release**.
4. Isso dispara o workflow novamente e anexa o `.exe` à release. Em ~3 min o botão "Baixar HuskyPrintAgent.exe" no `/impressoras` passa a funcionar.

A URL estável que vai ficar no botão:
```
https://github.com/profabioartes-netizen/kitchen-nexus-ops/releases/latest/download/HuskyPrintAgent.exe
```

> O repositório precisa estar **público** para o download direto funcionar sem login. Se estiver privado, eu sugiro tornar **só esse asset** público publicando a Release como pública (é o padrão).

Posso aplicar?

## Problema

GitHub Actions só lê workflows em `.github/workflows/` na **raiz** do repositório. O arquivo atual está em `print-agent-py/.github/workflows/release.yml` (subpasta), por isso a aba Actions mostra a tela "Get started" e nenhum workflow aparece para rodar.

## Correção

1. **Criar** `/.github/workflows/build-print-agent.yml` na raiz do repositório, com o mesmo conteúdo do atual (já usa `working-directory: print-agent-py`, então funciona da raiz sem ajustes).

2. **Remover** o arquivo antigo `print-agent-py/.github/workflows/release.yml` (e a pasta `.github` dentro de `print-agent-py/`) para evitar confusão.

## Resultado esperado

Após o sync com o GitHub (automático), ao recarregar `https://github.com/profabioartes-netizen/kitchen-nexus-ops/actions`, vai aparecer o workflow **"Build & Release HuskyPrintAgent"** na lista da esquerda, com o botão **"Run workflow"** disponível.

## Próximos passos (manuais, do seu lado)

1. Aba Actions → "Build & Release HuskyPrintAgent" → **Run workflow** (~3 min)
2. Baixar o `.exe` em **Artifacts**
3. (Opcional) Publicar tag `print-agent-v1.0.0` em Releases para ativar o link público estável do botão da tela `/impressoras`

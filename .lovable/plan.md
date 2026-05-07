# Hospedar o HuskyPrintAgent.exe sem você precisar buildar

Você não precisa instalar Python nem rodar `build.bat`. O projeto já está no GitHub (a integração com Lovable é bidirecional), então vou usar o **GitHub Actions** para compilar o `.exe` automaticamente em um servidor Windows da nuvem e publicá-lo como **GitHub Release público**. Isso é exatamente o mesmo padrão que já existe em `desktop-agent/.github/workflows/release.yml`.

Você só precisa, **uma única vez**, criar uma "tag" no GitHub (1 clique). O `.exe` fica pronto em ~3 minutos numa URL pública e estável.

## O que vou fazer (build mode)

### 1. Criar workflow `print-agent-py/.github/workflows/release.yml`
Roda em `windows-latest`, instala Python 3.11, instala dependências, builda com PyInstaller e publica o `.exe` numa Release.

```text
push tag "print-agent-v*" 
  → setup-python 
  → pip install -r requirements.txt 
  → pyinstaller --onefile --noconsole --name HuskyPrintAgent agent.py
  → upload dist/HuskyPrintAgent.exe
  → publish GitHub Release (público)
```

URL final estável (independente da versão):
`https://github.com/<sua-org>/<seu-repo>/releases/latest/download/HuskyPrintAgent.exe`

### 2. Ajustar `src/pages/PrintersPage.tsx`
Trocar a constante `INSTALLER_URL` de `huskypdv.com/downloads/...` (que hoje retorna 404) para a URL real da Release do GitHub.

### 3. Atualizar `print-agent-py/README.md`
Adicionar a seção "Como gerar uma nova versão do .exe": basta rodar no GitHub a aba **Actions → Build Print Agent → Run workflow**, ou criar uma tag `print-agent-v1.0.0`. Sem Python local.

### 4. Remover `icon.ico` da linha do PyInstaller
O `build.bat` atual referencia `--icon icon.ico` que não existe — isso quebra o build. Vou remover (ou deixar opcional via `if exist`).

## O que VOCÊ precisa fazer (3 passos, 2 minutos)

1. Garantir que o projeto está conectado ao GitHub (menu **+ → GitHub → Connect**, se ainda não estiver).
2. Tornar o repositório **público** OU manter privado mas marcar a Release como pública (o workflow faz isso automaticamente; em repo privado o download direto do asset funciona porque a URL `releases/latest/download` é pública para releases publicadas).
3. No GitHub, ir em **Actions → Build Print Agent → Run workflow** (botão verde). Em ~3 min o `.exe` aparece em **Releases**.

A partir daí, o botão **"Baixar HuskyPrintAgent.exe"** no painel `/impressoras` baixa direto o binário pronto. Cliente final só clica → roda → imprime.

## Alternativa (se você não quiser nem tocar no GitHub)

Posso hospedar o `.exe` no **Supabase Storage** (Lovable Cloud) num bucket público. Mas eu ainda preciso do binário compilado uma vez para fazer upload — e como você não tem Python, o caminho do GitHub Actions é o mais limpo. **Se você preferir, posso rodar o GitHub Actions a partir do meu lado em build mode e te entregar o link pronto** — basta aprovar este plano.

## Por que não Tauri (que já existe no projeto)?

O `desktop-agent/` em Tauri já tem workflow pronto, mas ele é outro produto (pareamento 6 dígitos + fila de jobs via Supabase). O agente novo é um servidor HTTP local simples em `127.0.0.1:8080` — manter os dois separados é o certo.

Quer que eu prossiga?


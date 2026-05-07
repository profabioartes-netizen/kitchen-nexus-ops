## Migrar para o Desktop Agent (Tauri/Rust) — sem antivírus barrando

A pasta `/desktop-agent/` já tem um agente Tauri v2 pronto que gera um instalador NSIS `.exe` nativo em Rust. Bin\u00e1rios Rust quase nunca s\u00e3o sinalizados como falso-positivo (ao contr\u00e1rio de PyInstaller). Vamos abandonar o `print-agent-py` e ativar o build do Tauri no GitHub Actions.

### Problema atual
- O workflow do Tauri est\u00e1 em `desktop-agent/.github/workflows/release.yml` (subpasta) — GitHub Actions s\u00f3 enxerga workflows em `.github/workflows/` na **raiz** do repo. Mesma pegadinha que tivemos antes.
- O bot\u00e3o "Baixar" em `/impressoras` aponta para `HuskyPrintAgent.exe` (PyInstaller). Precisa apontar para `HuskyPDV-Agent-Setup.exe` (NSIS/Tauri).

### Mudan\u00e7as

1. **Mover workflow para a raiz**
   - Criar `.github/workflows/build-desktop-agent.yml` com o conte\u00fado de `desktop-agent/.github/workflows/release.yml` (ele j\u00e1 usa `working-directory: desktop-agent`, n\u00e3o precisa alterar nada).
   - Remover `desktop-agent/.github/workflows/release.yml` e a pasta `desktop-agent/.github/`.
   - Manter o trigger `workflow_dispatch` + `tags: ["v*"]`.

2. **Remover o build antigo (PyInstaller) do Actions**
   - Apagar `.github/workflows/build-print-agent.yml` (o que criamos na rodada anterior).
   - Manter os arquivos em `print-agent-py/` por enquanto (deletar depois quando o Tauri estiver validado em produ\u00e7\u00e3o).

3. **Atualizar `src/pages/PrintersPage.tsx`**
   - Trocar `INSTALLER_URL` para:
     `https://github.com/profabioartes-netizen/kitchen-nexus-ops/releases/latest/download/HuskyPDV-Agent-Setup.exe`
   - Trocar `link.download = "HuskyPrintAgent.exe"` para `"HuskyPDV-Agent-Setup.exe"`.
   - Atualizar textos visíveis ("HuskyPDV Agent" em vez de "HuskyPrintAgent").

4. **Atualizar `desktop-agent/README.md`** com instru\u00e7\u00f5es claras: aba Actions \u2192 "Build & Release Windows Installer" \u2192 Run workflow, e/ou criar tag `v0.1.0` para publicar release p\u00fablica.

### Como o usu\u00e1rio vai rodar (depois do sync)

1. Abrir https://github.com/profabioartes-netizen/kitchen-nexus-ops/actions
2. Clicar em **"Build & Release Windows Installer"** \u2192 **Run workflow** \u2192 `main` \u2192 verde.
3. Aguardar ~5-7 min (Rust compila mais devagar que Python na primeira vez; depois fica em cache).
4. Baixar `HuskyPDV-Agent-Setup` em **Artifacts**.
5. Para liberar a URL p\u00fablica do bot\u00e3o "Baixar" em `/impressoras`, criar uma release com tag `v0.1.0` (Releases \u2192 Draft new release \u2192 tag `v0.1.0` \u2192 Publish).

### Por que isso resolve o antiv\u00edrus

- Tauri compila para um bin\u00e1rio Rust nativo do Windows, com instalador NSIS padr\u00e3o (mesmo formato de Discord, VS Code, Spotify). Defender n\u00e3o reage como reage a PyInstaller.
- O `tauri.conf.json` j\u00e1 tem `publisher: "HuskyPDV"`, identifier `com.huskypdv.agent` e `installMode: perMachine` — assinatura visual de software leg\u00edtimo.
- Se ainda assim algum cliente tiver Avast/Kaspersky paranoico, o pr\u00f3ximo passo (futuro) \u00e9 assinar com certificado de code-signing — mas a maioria n\u00e3o vai precisar.

### N\u00e3o vou mexer (agora)

- C\u00f3digo Rust do agente (`desktop-agent/src-tauri/src/lib.rs` etc.) — j\u00e1 funciona.
- Pasta `print-agent-py/` — fica como backup at\u00e9 validar o Tauri em produ\u00e7\u00e3o.
- Configura\u00e7\u00f5es do Tauri — j\u00e1 est\u00e3o boas (NSIS, perMachine, autostart plugin).
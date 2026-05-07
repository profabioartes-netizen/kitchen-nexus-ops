# HuskyPDV Caixa — Launcher

Launcher oficial **mínimo** que abre o HuskyPDV em modo aplicativo no Chrome/Edge
com impressão automática (`--kiosk-printing`).

> Este projeto **NÃO** é um agente de impressão.
> Ele apenas localiza o navegador e abre a URL configurada.
> Sem WebSocket, sem servidor local, sem ESC/POS, sem fila offline.

## Como funciona

1. Detecta Chrome em locais padrão; se não achar, tenta Edge.
2. Abre: `chrome.exe --kiosk-printing --app="<URL>/caixa"`.
3. URL é fixa em build via env `HUSKYPDV_PUBLIC_URL` (default `https://app.huskypdv.com.br`).
4. NSIS cria atalhos **HuskyPDV Caixa** na Área de Trabalho e Menu Iniciar.

## Build (Windows)

Pré-requisitos: Rust stable + `cargo install tauri-cli --version "^2"`.

```bash
cd caixa-launcher
set HUSKYPDV_PUBLIC_URL=https://app.huskypdv.com.br
cargo tauri build
```

O instalador NSIS sai em `src-tauri/target/release/bundle/nsis/HuskyPDV Caixa_<version>_x64-setup.exe`.

## Publicação

Copie o `.exe` para `public/downloads/HuskyPDV-Caixa-Setup.exe` no repositório
principal e faça deploy. O botão **Baixar HuskyPDV Caixa** na tela
*Impressoras* aponta para esse caminho.

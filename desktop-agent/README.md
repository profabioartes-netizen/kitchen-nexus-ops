# HuskyPDV Agent (Desktop)

Cliente desktop em **Tauri v2 + React** para Windows. Substitui o instalador `.zip + .bat`.

## O que faz

1. App nativo Windows (~5-8 MB) instalado via `HuskyPDV-Agent-Setup.exe` (NSIS).
2. Inicia com Windows (autostart).
3. Pede o **código de pareamento de 6 dígitos** gerado no painel HuskyPDV em `/impressoras`.
4. Lista as impressoras instaladas no Windows (via comando `wmic` / `Get-Printer`).
5. Permite escolher uma impressora padrão e fazer **Teste de impressão**.
6. Mantém status **online** enviando heartbeat a cada 30s para o backend.

## Setup local (desenvolvedor)

Pré-requisitos:
- Node 20+
- Rust (https://rustup.rs/)
- Windows: Visual Studio Build Tools com "Desktop development with C++"

```bash
cd desktop-agent
npm install
npm run tauri dev
```

## Build manual de instalador

```bash
npm run tauri build
# Saída: src-tauri/target/release/bundle/nsis/HuskyPDV-Agent_<versão>_x64-setup.exe
```

## Build automatizado (recomendado)

Faça um push de tag `v*` para o repositório privado. O workflow em
`.github/workflows/release.yml` builda o `.exe` no Windows runner do GitHub
Actions e publica em **GitHub Releases**.

```bash
git tag v0.1.0
git push origin v0.1.0
```

A URL pública do instalador (mesmo em repo privado, com token) ficará em:
`https://github.com/<org>/<repo>/releases/latest/download/HuskyPDV-Agent-Setup.exe`

> Como o repo é privado, você precisa decidir se vai:
> a) Tornar o release público (recomendado — só o binário fica acessível) via configuração da release, ou
> b) Fazer proxy do download através de uma edge function do HuskyPDV que injeta o token GH.

Por padrão o painel aponta pra `huskypdv-agent.s3.amazonaws.com` ou pra release pública — você ajusta a env `VITE_AGENT_DOWNLOAD_URL` no projeto Lovable.

## Configuração que precisa estar no app

O app embute apenas dados públicos (URL e ANON KEY do Supabase). A configuração
sensível (token do agente) é gravada no `appConfigDir` após o pareamento.

`src/config.ts`:
```ts
export const SUPABASE_URL = "https://rydfhkphvhkqxwpqoeku.supabase.co";
export const SUPABASE_ANON_KEY = "<chave anon do projeto>";
```

## Roadmap

- [x] Pareamento 6 dígitos
- [x] Listar impressoras Windows
- [x] Teste de impressão
- [x] Heartbeat
- [ ] Processar fila de `print_jobs` em tempo real (precisa de edge function `agent-jobs`)
- [ ] Auto-update via `tauri-plugin-updater`
- [ ] Code signing (DigiCert / Azure Trusted Signing)

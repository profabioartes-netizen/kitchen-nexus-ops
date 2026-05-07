# HuskyPDV Desktop Agent (Tauri v2)

Agente de impressão local em **Rust + Tauri v2**, distribuído como instalador
NSIS `.exe` nativo do Windows. Substitui o antigo agente Python (PyInstaller),
que era frequentemente bloqueado por antivírus como falso-positivo.

## 🚀 Como gerar o instalador (sem precisar de Rust no seu PC)

O build roda na nuvem via **GitHub Actions** em um runner Windows.

1. Abra: <https://github.com/profabioartes-netizen/kitchen-nexus-ops/actions>
2. Selecione o workflow **"Build & Release Windows Installer"**.
3. Clique em **Run workflow** → branch `main` → botão verde **Run workflow**.
4. Aguarde ~5–7 minutos (a primeira execução é mais lenta; depois fica em cache).
5. Baixe **`HuskyPDV-Agent-Setup`** na seção **Artifacts** da execução.

### Publicar como Release pública (ativa o botão "Baixar" em `/impressoras`)

```bash
git tag v0.1.0
git push origin v0.1.0
```

Isso roda o workflow novamente e anexa o `.exe` à release pública. A URL fixa
(usada pelo botão na tela de Impressoras) é:

```
https://github.com/profabioartes-netizen/kitchen-nexus-ops/releases/latest/download/HuskyPDV-Agent-Setup.exe
```

## Por que Tauri/Rust em vez de Python?

- **Sem falso-positivo**: binário Rust nativo + instalador NSIS padrão é o mesmo
  formato usado por Discord, VS Code, Spotify. Defender/Avast não reagem.
- **Tamanho menor**: ~6 MB vs ~40 MB do PyInstaller.
- **Sem janela preta**: roda silencioso na bandeja do sistema.

## Instalação no PC do cliente

1. Baixe o `HuskyPDV-Agent-Setup.exe` pelo botão na tela `/impressoras`.
2. Execute o instalador (instalação per-machine, requer admin).
3. O agente inicia automaticamente com o Windows (plugin `autostart` ativado).
4. Defina a impressora térmica como **padrão** no Windows.
5. Volte ao HuskyPDV → o badge fica **Online**.

## Build local (opcional)

Pré-requisitos: Node 20+, Rust stable, Visual Studio Build Tools.

```bash
cd desktop-agent
npm install
npm run tauri build -- --bundles nsis
```

Saída: `src-tauri/target/release/bundle/nsis/*-setup.exe`.

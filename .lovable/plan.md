## Diagnóstico

O `.exe` fecha instantaneamente **antes** de qualquer log Python rodar. Isso descarta hipóteses de "exceção no código". O culpado é o **bootstrap do PyInstaller `--onefile`**, que extrai DLLs/Python embarcado em `%TEMP%\_MEIxxxxxx` e executa de lá. Se essa extração falhar — antivírus, política de SRP/AppLocker, falta do VC++ Redistributable, `%TEMP%` sem permissão de execução — o processo morre em milissegundos sem deixar rastro, e como compilamos com `--noconsole`, nem mensagem de erro aparece.

A correção real é em três frentes: build, runtime e fallback.

## O que fazer

### 1. `print-agent-py/agent.py` — reescrever com proteção total

- `try/except` no nível de módulo (top-level), não só em `main()`.
- `sys.excepthook` global gravando qualquer exceção não tratada.
- Logging para `%TEMP%\HuskyPrintAgent.log` (RotatingFileHandler 512 KB × 2) **e** para `%LOCALAPPDATA%\HuskyPrintAgent\agent.log` como fallback se `%TEMP%` falhar.
- Logs de startup explícitos: "iniciando", "checando win32print", "porta 8080 livre? sim/não", "bind ok", "servindo".
- Detecção de porta 8080 ocupada com `socket.bind` antes de iniciar Flask. Se ocupada, mostra `MessageBoxW` e mantém processo vivo aguardando ENTER (no modo console) ou loga e sai (no modo silencioso).
- `MessageBoxW` (via `ctypes.windll.user32`) para qualquer falha fatal, incluindo "win32print ausente" e "porta ocupada". Sempre cita o caminho do log.
- `input("Pressione ENTER para sair…")` no final do `main()` quando rodando em modo console (detectado via `sys.stdout.isatty()`), assim a janela não fecha.
- Bumpar versão para `1.0.1`.

### 2. `print-agent-py/build.bat` — compilar com console + hidden-imports + diagnostics

Substituir o build atual por dois targets:

- **HuskyPrintAgent.exe** (produção, sem console) — mesmo nome de hoje.
- **HuskyPrintAgent-debug.exe** (com `--console` e `--debug=imports`) — gera log no stderr na hora do bootstrap, mostrando se o problema é DLL ausente.

Adicionar flags críticas em ambos:
- `--collect-all flask --collect-all flask_cors --collect-all werkzeug --collect-all jinja2`
- `--hidden-import win32print --hidden-import win32api --hidden-import pywintypes`
- `--runtime-tmpdir .` para que o PyInstaller extraia ao lado do `.exe` em vez de `%TEMP%` (resolve o caso de antivírus/política bloqueando `%TEMP%\_MEI*`).
- `--noupx` (UPX é falso-positivo comum de antivírus).

### 3. `print-agent-py/README.md` — checklist para o cliente

Documentar passos quando o `.exe` fecha sozinho:
1. Executar `HuskyPrintAgent-debug.exe` num CMD e enviar a saída.
2. Instalar **Microsoft Visual C++ Redistributable 2015–2022 (x64)** — link direto.
3. Adicionar exclusão no Windows Defender para a pasta do `.exe`.
4. Conferir `%TEMP%\HuskyPrintAgent.log` e `%LOCALAPPDATA%\HuskyPrintAgent\agent.log`.

### 4. `src/pages/PrintersPage.tsx` — mensagem de erro do "Testar Conexão" mais útil

Trocar o `alert` genérico atual por um diagnóstico passo-a-passo (checar processo no Gerenciador de Tarefas, baixar a versão `-debug`, instalar VC++ Redist, conferir log).

### 5. Disparar nova release

Após editar, o cliente baixa o `HuskyPrintAgent.exe` v1.0.1 pelo botão da própria tela de Impressoras (já aponta para a release fixa do GitHub). O CI/Action existente em `.github/workflows/build-desktop-agent.yml` precisa ser revisado — vou confirmar se ele cobre o `print-agent-py` ou só o `desktop-agent` Tauri (provavelmente só Tauri, então preciso adicionar um job `pyinstaller` ao workflow, ou usar o `build.bat` localmente).

## Por que isso resolve o que as tentativas anteriores não resolveram

- Tentativas anteriores assumiram **bug no Python** (exceção, porta, CORS). O processo morre **antes do Python rodar** — nenhum `try/except` em Python ajudaria.
- `--runtime-tmpdir .` elimina a maior causa de "fecha sozinho": políticas que bloqueiam execução em `%TEMP%`.
- `--collect-all` e `--hidden-import` cobrem o caso de PyInstaller não detectar dependências dinâmicas do Flask/pywin32 (gera `ImportError` no bootstrap, invisível com `--noconsole`).
- Build `-debug` separado dá ao cliente uma forma de capturar o erro real sem recompilar.
- `--noupx` evita falso-positivo de antivírus que mata o `.exe` antes mesmo de extrair.

## Arquivos a editar

- `print-agent-py/agent.py` — reescrita completa.
- `print-agent-py/build.bat` — adicionar flags de empacotamento e build `-debug`.
- `print-agent-py/README.md` — checklist de troubleshooting.
- `src/pages/PrintersPage.tsx` — mensagem de erro melhor.
- (Possivelmente) `.github/workflows/build-desktop-agent.yml` — adicionar job PyInstaller.

Aprovando, eu aplico tudo de uma vez.

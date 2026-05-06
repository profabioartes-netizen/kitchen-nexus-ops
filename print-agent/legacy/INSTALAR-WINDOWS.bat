@echo off
REM =====================================================================
REM  HuskyPDV Print Agent - Instalador DEFINITIVO Windows
REM  Faz TUDO automaticamente: cria pasta, baixa deps, instala servico,
REM  inicia em background. Nao precisa de PM2.
REM =====================================================================
setlocal enabledelayedexpansion
title HuskyPDV - Instalador do Agente de Impressao

echo.
echo  ============================================================
echo    HuskyPDV - Instalador do Agente de Impressao
echo  ============================================================
echo.

REM -- 1. Verificar Node.js --
where node >nul 2>nul
if errorlevel 1 (
  echo  [ERRO] Node.js nao encontrado.
  echo.
  echo  Baixe e instale o Node.js 20 LTS em:
  echo    https://nodejs.org/
  echo.
  echo  Apos instalar, RODE ESTE INSTALADOR DE NOVO.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo  [OK] Node.js %%v detectado.

REM -- 2. Garantir que estamos na pasta correta --
cd /d "%~dp0"
echo  [OK] Pasta de instalacao: %CD%

REM -- 3. Instalar dependencias --
echo.
echo  [*] Instalando dependencias (pode levar 1-2 minutos)...
call npm install --silent --no-audit --no-fund
if errorlevel 1 (
  echo  [ERRO] Falha ao instalar dependencias.
  pause
  exit /b 1
)
echo  [OK] Dependencias instaladas.

REM -- 4. Remover qualquer servico antigo do PM2 (se existir) --
where pm2 >nul 2>nul
if not errorlevel 1 (
  echo  [*] Removendo agente antigo do PM2 (se existir)...
  call pm2 delete coffee-print >nul 2>nul
)

REM -- 5. Remover task antiga (se existir) --
schtasks /Query /TN "HuskyPDV-PrintAgent" >nul 2>nul
if not errorlevel 1 (
  echo  [*] Removendo agendamento antigo...
  schtasks /Delete /TN "HuskyPDV-PrintAgent" /F >nul 2>nul
)

REM -- 6. Matar qualquer processo node antigo do agente --
echo  [*] Encerrando instancias antigas do agente...
wmic process where "name='node.exe' and commandline like '%%agent.mjs%%'" delete >nul 2>nul

REM -- 7. Criar script de inicializacao em background --
set "RUN_SCRIPT=%CD%\run-agent.vbs"
echo  [*] Criando script de inicializacao silenciosa...
(
  echo Set WshShell = CreateObject^("WScript.Shell"^)
  echo WshShell.CurrentDirectory = "%CD%"
  echo WshShell.Run "cmd /c node agent.mjs ^>^> agent.log 2^>^&1", 0, False
) > "%RUN_SCRIPT%"
echo  [OK] Script criado: %RUN_SCRIPT%

REM -- 8. Registrar no Task Scheduler para iniciar com Windows --
echo  [*] Registrando agendamento para iniciar com o Windows...
schtasks /Create ^
  /TN "HuskyPDV-PrintAgent" ^
  /TR "wscript.exe \"%RUN_SCRIPT%\"" ^
  /SC ONLOGON ^
  /RL HIGHEST ^
  /F >nul
if errorlevel 1 (
  echo  [AVISO] Nao foi possivel criar agendamento. Rode como Administrador.
) else (
  echo  [OK] Agendamento criado: HuskyPDV-PrintAgent
)

REM -- 9. Iniciar agora --
echo.
echo  [*] Iniciando o agente AGORA...
wscript.exe "%RUN_SCRIPT%"
timeout /t 3 /nobreak >nul

REM -- 10. Verificar se esta rodando --
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if errorlevel 1 (
  echo  [AVISO] Agente nao parece estar rodando. Verifique agent.log
) else (
  echo  [OK] Agente esta rodando em background!
)

echo.
echo  ============================================================
echo    INSTALACAO CONCLUIDA!
echo  ============================================================
echo.
echo   - O agente roda em background (sem janela visivel)
echo   - Inicia automaticamente quando voce fizer login no Windows
echo   - Logs estao em: %CD%\agent.log
echo.
echo   Para ver os logs em tempo real, abra outro PowerShell e digite:
echo     Get-Content "%CD%\agent.log" -Wait -Tail 30
echo.
echo   Para PARAR o agente:
echo     taskkill /F /IM node.exe
echo.
echo   Para REINICIAR o agente:
echo     wscript.exe "%RUN_SCRIPT%"
echo.
echo  ============================================================
echo.
echo  AGORA: vai no HuskyPDV ^> Impressoras ^> clica em "Testar"
echo         O cupom deve sair em 5 segundos.
echo.
pause

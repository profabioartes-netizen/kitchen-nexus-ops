@echo off
echo.
echo   ☕ Coffee Thrones — Instalacao do Agente de Impressao
echo   ─────────────────────────────────────────────────────
echo.

cd /d "%~dp0"

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   Node.js nao encontrado. Instale em https://nodejs.org
    pause
    exit /b 1
)

echo   Node.js encontrado
echo.

:: Install local dependencies
echo   Instalando dependencias do agente...
call npm install
if %errorlevel% neq 0 (
    echo   Falha ao instalar dependencias.
    pause
    exit /b 1
)
echo.

:: Install PM2 and Windows startup helper
echo   Instalando PM2...
call npm install -g pm2 pm2-windows-startup
if %errorlevel% neq 0 (
    echo   Falha ao instalar PM2. Rode este arquivo como Administrador.
    pause
    exit /b 1
)
echo.

:: Enable PM2 startup on Windows
echo   Configurando inicio automatico com Windows...
call pm2-startup install
if %errorlevel% neq 0 (
    echo   Aviso: nao foi possivel configurar o auto-start. Rode este arquivo como Administrador.
)
echo.

:: Start or restart agent with PM2
echo   Iniciando agente...
call pm2 delete coffee-print >nul 2>&1
call pm2 start agent.mjs --name coffee-print --cwd "%~dp0"
if %errorlevel% neq 0 (
    echo   Falha ao iniciar o agente no PM2.
    pause
    exit /b 1
)

echo   Salvando configuracao do PM2...
call pm2 save
echo.

echo   Agente instalado e rodando.
echo.
echo   Comandos uteis:
echo     pm2 status
echo     pm2 logs coffee-print
echo     pm2 restart coffee-print
echo     pm2 stop coffee-print
echo.
echo   Importante: se o Windows pedir permissao de firewall para Node.js, permita na rede local.
echo.
pause

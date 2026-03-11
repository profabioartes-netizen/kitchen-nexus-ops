@echo off
echo.
echo   ☕ Coffee Thrones — Instalacao do Agente de Impressao
echo   ─────────────────────────────────────────────────────
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   ❌ Node.js nao encontrado. Instale em https://nodejs.org
    pause
    exit /b 1
)

echo   ✅ Node.js encontrado
echo.

:: Install dependencies
echo   📦 Instalando dependencias...
cd /d "%~dp0"
call npm install
echo.

:: Install PM2 globally
echo   📦 Instalando PM2 globalmente...
call npm install -g pm2
if %errorlevel% neq 0 (
    echo   ❌ Falha ao instalar PM2. Tente rodar como Administrador.
    pause
    exit /b 1
)
echo   ✅ PM2 instalado
echo.

:: Start agent with PM2
echo   🚀 Iniciando agente com PM2...
call pm2 delete coffee-print >nul 2>&1
call pm2 start agent.mjs --name "coffee-print" --cwd "%~dp0"
echo.

:: Save PM2 process list
echo   💾 Salvando lista de processos PM2...
call pm2 save
echo.

:: Setup PM2 startup (Windows)
echo   ⚙️  Configurando inicio automatico com Windows...
call pm2-startup install
echo.

echo   ─────────────────────────────────────────────────────
echo   ✅ Agente instalado e rodando!
echo.
echo   Comandos uteis:
echo     pm2 logs coffee-print    — Ver logs em tempo real
echo     pm2 restart coffee-print — Reiniciar agente
echo     pm2 stop coffee-print    — Parar agente
echo     pm2 status               — Ver status
echo.
pause

@echo off
REM ============================================================
REM HuskyPDV Print Agent - Instalador (Windows)
REM ============================================================
setlocal enabledelayedexpansion

echo.
echo ============================================
echo   HuskyPDV Print Agent - Instalacao
echo ============================================
echo.

cd /d "%~dp0"

REM 1. Verificar Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js nao encontrado.
  echo     Baixe e instale o Node.js 20+ em: https://nodejs.org/
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [ok] Node.js %%v

REM 2. Instalar dependencias
echo.
echo [*] Instalando dependencias (npm install)...
call npm install --silent
if errorlevel 1 ( echo [!] Falha no npm install & pause & exit /b 1 )

REM 3. Criar .env interativamente
if not exist .env (
  echo.
  echo [*] Configurando .env...
  copy /Y .env.example .env >nul
  echo.
  set /p SRK=  SUPABASE_SERVICE_ROLE_KEY: 
  set /p TID=  TENANT_ID (UUID do estabelecimento): 
  set /p STA=  STATION [Caixa]: 
  if "!STA!"=="" set STA=Caixa
  set /p DEV=  PRINTER_DEVICE (nome compartilhado, ex POS-80): 
  if "!DEV!"=="" set DEV=POS-80
  set /p W=  WIDTH [48]: 
  if "!W!"=="" set W=48

  powershell -Command "(Get-Content .env) -replace '^SUPABASE_SERVICE_ROLE_KEY=.*', 'SUPABASE_SERVICE_ROLE_KEY=!SRK!' | Set-Content .env"
  powershell -Command "(Get-Content .env) -replace '^TENANT_ID=.*', 'TENANT_ID=!TID!' | Set-Content .env"
  powershell -Command "(Get-Content .env) -replace '^STATION=.*', 'STATION=!STA!' | Set-Content .env"
  powershell -Command "(Get-Content .env) -replace '^PRINTER_DEVICE=.*', 'PRINTER_DEVICE=!DEV!' | Set-Content .env"
  powershell -Command "(Get-Content .env) -replace '^WIDTH=.*', 'WIDTH=!W!' | Set-Content .env"
  echo [ok] .env criado.
) else (
  echo [ok] .env ja existe - pulando.
)

REM 4. Instalar PM2
where pm2 >nul 2>nul
if errorlevel 1 (
  echo.
  echo [*] Instalando PM2...
  call npm install -g pm2
  call npm install -g pm2-windows-startup
  call pm2-startup install
)

REM 5. Registrar no PM2
echo.
echo [*] Registrando servico no PM2...
call pm2 delete coffee-print >nul 2>nul
call pm2 start coffee-print.js --name coffee-print
call pm2 save

echo.
echo ============================================
echo   Instalacao concluida!
echo ============================================
echo.
echo Comandos uteis:
echo   pm2 logs coffee-print     ^(ver logs ao vivo^)
echo   pm2 restart coffee-print  ^(reiniciar^)
echo   pm2 stop coffee-print     ^(parar^)
echo.
echo Teste agora: vá no PDV ^> Impressoras ^> clique em 'Testar'
echo.
pause

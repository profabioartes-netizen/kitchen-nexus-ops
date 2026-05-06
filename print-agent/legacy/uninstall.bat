@echo off
echo.
echo   ☕ Coffee Thrones — Desinstalacao do Agente
echo   ─────────────────────────────────────────────
echo.

call pm2 stop coffee-print >nul 2>&1
call pm2 delete coffee-print >nul 2>&1
call pm2 save
echo   ✅ Agente removido do PM2.
echo.
pause

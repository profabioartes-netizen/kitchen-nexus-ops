#!/usr/bin/env bash
# ============================================================
# HuskyPDV Print Agent — Instalador (Linux / macOS)
# ============================================================
set -e

echo ""
echo "============================================"
echo "  HuskyPDV Print Agent — Instalação"
echo "============================================"
echo ""

cd "$(dirname "$0")"

# 1. Verificar Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js não encontrado. Instalando via nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
fi

NODE_VERSION=$(node -v)
echo "[ok] Node.js $NODE_VERSION"

# 2. Instalar dependências
echo ""
echo "[*] Instalando dependências (npm install)..."
npm install --silent

# 3. Criar .env interativamente
if [ ! -f .env ]; then
  echo ""
  echo "[*] Configurando .env..."
  cp .env.example .env
  echo ""
  read -rp "  SUPABASE_SERVICE_ROLE_KEY: " SRK
  read -rp "  TENANT_ID (UUID do estabelecimento): " TID
  read -rp "  STATION [Caixa]: " STA
  STA=${STA:-Caixa}
  read -rp "  PRINTER_DEVICE [/dev/usb/lp0]: " DEV
  DEV=${DEV:-/dev/usb/lp0}
  read -rp "  WIDTH [48]: " W
  W=${W:-48}

  # sed in-place portátil (Linux + macOS)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    SED_INPLACE=(-i '')
  else
    SED_INPLACE=(-i)
  fi

  sed "${SED_INPLACE[@]}" "s|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=${SRK}|" .env
  sed "${SED_INPLACE[@]}" "s|^TENANT_ID=.*|TENANT_ID=${TID}|" .env
  sed "${SED_INPLACE[@]}" "s|^STATION=.*|STATION=${STA}|" .env
  sed "${SED_INPLACE[@]}" "s|^PRINTER_DEVICE=.*|PRINTER_DEVICE=${DEV}|" .env
  sed "${SED_INPLACE[@]}" "s|^WIDTH=.*|WIDTH=${W}|" .env
  echo "[ok] .env criado."
else
  echo "[ok] .env já existe — pulando."
fi

# 4. Permissão no device da impressora (Linux)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  DEVICE=$(grep '^PRINTER_DEVICE=' .env | cut -d= -f2)
  if [ -e "$DEVICE" ]; then
    sudo chmod 666 "$DEVICE" || echo "[!] Não foi possível ajustar permissão de $DEVICE — rode manualmente: sudo chmod 666 $DEVICE"
  fi
fi

# 5. Instalar PM2
if ! command -v pm2 >/dev/null 2>&1; then
  echo ""
  echo "[*] Instalando PM2..."
  npm install -g pm2
fi

# 6. Registrar no PM2
echo ""
echo "[*] Registrando serviço no PM2..."
pm2 delete coffee-print >/dev/null 2>&1 || true
pm2 start coffee-print.js --name coffee-print
pm2 save

# 7. Autostart no boot
echo ""
echo "[*] Configurando autostart no boot do sistema..."
pm2 startup | tail -n 1 | bash || echo "[!] Rode manualmente o comando que o PM2 sugerir acima."

echo ""
echo "============================================"
echo "  Instalação concluída!"
echo "============================================"
echo ""
echo "Comandos úteis:"
echo "  pm2 logs coffee-print     # ver logs ao vivo"
echo "  pm2 restart coffee-print  # reiniciar"
echo "  pm2 stop coffee-print     # parar"
echo ""
echo "Teste agora: vá no PDV > Impressoras > clique em 'Testar'"
echo ""

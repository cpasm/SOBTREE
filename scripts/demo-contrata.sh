#!/usr/bin/env bash
# Demo local del botón Contrata. No usa producción, no cobra y no envía correo.
# Levanta PHP (simulación de Stripe, calendario y n8n) y Astro con el flag encendido.
# Uso: npm run demo:contrata
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
BASE="$WORK/base"
MOCK="$WORK/mock"
mkdir -p "$BASE" "$MOCK"
PORT_PHP="${PORT_PHP:-8787}"
PORT_N8N="${PORT_N8N:-8788}"
PORT_ASTRO="${PORT_ASTRO:-4321}"
HMAC="$(openssl rand -hex 32)"
WHSEC="$(openssl rand -hex 24)"
cat > "$BASE/sobtree-secrets.php" <<PHP
<?php return [
  'CONTRATA_MODO' => 'simulacion',
  'CONTRATA_HMAC_SECRET' => '$HMAC',
  'STRIPE_WEBHOOK_SECRET' => '$WHSEC',
  'STRIPE_PRICE_DIAGNOSTICO' => 'price_test_diagnostico',
  'CONTRATA_N8N_WEBHOOK_URL' => 'http://127.0.0.1:$PORT_N8N/',
  'CONTRATA_PUBLIC_URL' => 'http://127.0.0.1:$PORT_ASTRO',
  'CONTRATA_CALENDAR_PROYECTOS_ID' => 'CONFIGURAR_ID_CALENDARIO_PROYECTOS',
  'CONTRATA_CALENDAR_BLOQUEOS_ID' => 'CONFIGURAR_ID_CALENDARIO_BLOQUEOS',
  'CONTRATA_CALENDAR_CUENTA' => 'info@sobtree.com',
];
PHP
export SOBTREE_BASE_DIR="$BASE" CONTRATA_MODO=simulacion CONTRATA_DISABLE_MAIL=1
export CONTRATA_ALLOW_HTTP_WEBHOOK=1 CONTRATA_SIN_LIMITE=1
export PUBLIC_CONTRATA_ACTIVO=1 CONTRATA_PHP_ORIGIN="http://127.0.0.1:$PORT_PHP"
export MOCK_SECRET="$HMAC" MOCK_DIR="$MOCK"
: > "$MOCK/received.jsonl"
echo 200 > "$MOCK/mode"
php -S "127.0.0.1:$PORT_N8N" "$ROOT/tests/contrata/mock-n8n.php" >"$WORK/n8n.log" 2>&1 &
N8N_PID=$!
php -S "127.0.0.1:$PORT_PHP" -t "$ROOT/public" >"$WORK/php.log" 2>&1 &
PHP_PID=$!
ASTRO_PID=""
limpiar() { kill $PHP_PID $N8N_PID $ASTRO_PID 2>/dev/null || true; rm -rf "$WORK"; }
trap limpiar EXIT INT TERM
listo=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if curl -sf "http://127.0.0.1:$PORT_PHP/api/contrata/disponibilidad.php" >/dev/null; then listo=1; break; fi
  sleep 0.2
done
if [ "$listo" != 1 ]; then echo "PHP no ha arrancado. Revisa $WORK/php.log" >&2; exit 1; fi
( cd "$ROOT" && php scripts/sembrar-disponibilidad.php )
echo "Demo Contrata en simulación (no cobra, no escribe en producción)."
echo "  Web:     http://127.0.0.1:$PORT_ASTRO/"
echo "  Tarjeta: 4242 4242 4242 4242"
echo "  Rechazo: 4000 0000 0000 0002"
echo "  3DS:     4000 0000 0000 3220"
echo "  Avisos simulados a n8n: $WORK/n8n.log"
echo "  Ctrl+C para parar."
cd "$ROOT"
npx astro dev --host 127.0.0.1 --port "$PORT_ASTRO" &
ASTRO_PID=$!
wait "$ASTRO_PID"

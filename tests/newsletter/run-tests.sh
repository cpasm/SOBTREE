#!/usr/bin/env bash
# Pruebas locales de la newsletter. No toca nada externo.
# Uso: bash tests/newsletter/run-tests.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"; BASE="$WORK/base"; MOCK="$WORK/mock"; mkdir -p "$BASE" "$MOCK" "$WORK/tmp"
SITE_PORT=18083; MOCK_PORT=18084
SECRET="test-secret-nl"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✔ $1"; }
ko()   { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
check(){ if eval "$2"; then ok "$1"; else ko "$1"; fi; }
TEXTO="Acepto recibir la newsletter de Sobtree por email y he leído la política de privacidad."

write_config() { # $1 = url de newsletter
  cat > "$BASE/sobtree-secrets.php" <<PHP
<?php return [
  'N8N_LEADS_WEBHOOK_URL' => 'https://sobtree.app.n8n.cloud/webhook/sobtree-lead',
  'N8N_LEADS_WEBHOOK_SECRET' => '$SECRET',
  'N8N_NEWSLETTER_WEBHOOK_URL' => '$1',
];
PHP
}

export SOBTREE_BASE_DIR="$BASE" LEADS_ALLOW_HTTP_WEBHOOK=1 TMPDIR="$WORK/tmp"
WEBHOOK="http://127.0.0.1:$MOCK_PORT/"
write_config "$WEBHOOK"
MOCK_DIR="$MOCK" MOCK_SECRET="$SECRET" php -S 127.0.0.1:$MOCK_PORT "$ROOT/tests/newsletter/mock-webhook.php" >"$WORK/mock.log" 2>&1 &
P1=$!
php -S 127.0.0.1:$SITE_PORT -t "$ROOT/public" >"$WORK/site.log" 2>&1 &
P2=$!
trap 'kill $P1 $P2 2>/dev/null; rm -rf "$WORK"' EXIT
sleep 0.4
URL="http://127.0.0.1:$SITE_PORT/api/newsletter.php"
ALTAS="$BASE/sobtree-newsletter/altas.jsonl"
ESTADO="$BASE/sobtree-newsletter/estado.jsonl"
RECV="$MOCK/received.jsonl"
unlock() { rm -rf "$WORK/tmp/sobtree_newsletter"; }
post() { unlock; curl -s -o "$WORK/out" -w '%{http_code}' -X POST "$URL" -H 'Content-Type: application/json' "$@"; }
lines() { [ -f "$1" ] && wc -l < "$1" | tr -d ' ' || echo 0; }
last_state() { grep "\"id\":\"$1\"" "$ESTADO" | tail -1 | sed -E 's/.*"estado":"([^"]+)".*/\1/'; }
last_id() { tail -1 "$ALTAS" | sed -E 's/.*"id":"([^"]+)".*/\1/'; }
BODY=$(printf '%s' "{\"email\":\"Ana@Example.com\",\"consentimiento\":\"si\",\"consent_text\":\"$TEXTO\",\"origen\":\"articulo:como-empezar-con-ia-en-tu-pyme\"}")

echo "1. Sintaxis y textos alineados"
for f in "$ROOT/public/api/newsletter.php" "$ROOT/public/lib/newsletter.php" "$ROOT/public/lib/reintentar-leads.php"; do
  check "php -l $(basename "$f")" 'php -l "$f" >/dev/null'
done
check "sin Zapier en el código de la newsletter" '! grep -Rni "zapier" "$ROOT/public" "$ROOT/src" "$ROOT/config" "$ROOT/integraciones" "$ROOT/README.md" "$ROOT/DESIGN.md"'
check "el texto de la casilla coincide en PHP, site.ts y el componente" \
  'grep -q "$TEXTO" "$ROOT/public/lib/newsletter.php" && grep -q "$TEXTO" "$ROOT/src/data/site.ts" && grep -q "política de privacidad" "$ROOT/src/components/Newsletter.astro"'
check "versión de la política en PHP y en site.ts" \
  'grep -q "2026-10-26" "$ROOT/public/lib/newsletter.php" && grep -q "2026-10-26" "$ROOT/src/data/site.ts"'

echo "2. Deducción de la URL"
DEDUCE="$WORK/deduce"; mkdir -p "$DEDUCE"
cat > "$DEDUCE/sobtree-secrets.php" <<'PHP'
<?php return [
  'N8N_LEADS_WEBHOOK_URL' => 'https://sobtree.app.n8n.cloud/webhook/sobtree-lead',
  'N8N_LEADS_WEBHOOK_SECRET' => 'abc',
];
PHP
OUT=$(SOBTREE_BASE_DIR="$DEDUCE" php -r "require '$ROOT/public/lib/newsletter.php'; echo newsletter_webhook_url(), PHP_EOL, json_encode(newsletter_estado_publico());")
check "sin URL propia, se deduce sobtree-newsletter" 'grep -q "https://sobtree.app.n8n.cloud/webhook/sobtree-newsletter" <<<"$OUT"'
check "estado ok cuando la deducción y el secreto están" 'grep -q "{\"ok\":true}" <<<"$OUT"'
BAD="$WORK/bad"; mkdir -p "$BAD"
cat > "$BAD/sobtree-secrets.php" <<'PHP'
<?php return [
  'N8N_NEWSLETTER_WEBHOOK_URL' => 'http://ejemplo.test/no-https',
  'N8N_LEADS_WEBHOOK_URL' => 'https://sobtree.app.n8n.cloud/webhook/sobtree-lead',
  'N8N_LEADS_WEBHOOK_SECRET' => 'abc',
];
PHP
BADOUT=$(LEADS_ALLOW_HTTP_WEBHOOK= SOBTREE_BASE_DIR="$BAD" php -r "require '$ROOT/public/lib/newsletter.php'; echo newsletter_webhook_url(), PHP_EOL, json_encode(newsletter_estado_publico());")
check "URL explícita no https no se sustituye por la deducida" '[ "$(head -1 <<<"$BADOUT")" = "" ]'
check "estado: webhook_no_valido" 'grep -q webhook_no_valido <<<"$BADOUT"'

echo "3. Validación"
echo 200 > "$MOCK/mode"
check "GET estado → ok" '[ "$(curl -s "$URL?estado")" = "{\"ok\":true}" ]'
check "honeypot → 200 y no se guarda" '[ "$(post -d "{\"email\":\"a@b.co\",\"consentimiento\":\"si\",\"consent_text\":\"$TEXTO\",\"origen\":\"portada\",\"web\":\"bot\"}")" = 200 ] && [ "$(lines "$ALTAS")" = 0 ]'
check "email inválido → 422" '[ "$(post -d "{\"email\":\"no-es\",\"consentimiento\":\"si\",\"consent_text\":\"$TEXTO\",\"origen\":\"portada\"}")" = 422 ]'
check "sin casilla → 422" '[ "$(post -d "{\"email\":\"a@b.co\",\"consentimiento\":\"no\",\"consent_text\":\"$TEXTO\",\"origen\":\"portada\"}")" = 422 ]'
check "texto distinto al de la casilla → 422" '[ "$(post -d "{\"email\":\"a@b.co\",\"consentimiento\":\"si\",\"consent_text\":\"otra cosa\",\"origen\":\"portada\"}")" = 422 ]'
check "origen desconocido → 422" '[ "$(post -d "{\"email\":\"a@b.co\",\"consentimiento\":\"si\",\"consent_text\":\"$TEXTO\",\"origen\":\"otra\"}")" = 422 ]'
AHORA=$(($(date +%s%3N)))
check "envío instantáneo → descartado" '[ "$(post -d "{\"email\":\"a@b.co\",\"consentimiento\":\"si\",\"consent_text\":\"$TEXTO\",\"origen\":\"portada\",\"t0\":$AHORA}")" = 200 ] && [ "$(lines "$ALTAS")" = 0 ]'

echo "4. Alta válida: se guarda, se firma y n8n confirma"
CODE=$(post -d "$BODY")
ID=$(last_id)
check "respuesta 200 y pedir confirmación" '[ "$CODE" = 200 ] && grep -q "\"confirmar\":true" "$WORK/out"'
check "guardada fuera de public_html" '[ "$(lines "$ALTAS")" = 1 ] && [[ "$ALTAS" != *public_html* ]]'
check "email, consentimiento, origen, texto y versión" 'grep -q "\"email\":\"ana@example.com\"" "$ALTAS" && grep -q "\"consentimiento\":true" "$ALTAS" && grep -q "\"origen\":\"articulo:como-empezar-con-ia-en-tu-pyme\"" "$ALTAS" && grep -q "\"version_politica\":\"2026-10-26\"" "$ALTAS"'
check "n8n recibió la firma válida" 'tail -1 "$RECV" | grep -q "\"valid_signature\":true" && tail -1 "$RECV" | grep -q "$ID"'
check "estado n8n = enviado" '[ "$(last_state "$ID" n8n)" = enviado ]'
check "límite de 30 s → 429" '[ "$(curl -s -o /dev/null -w %{http_code} -X POST "$URL" -H "Content-Type: application/json" -d "$BODY")" = 429 ]'
check "carpeta con .htaccess deny y registro 600" 'grep -q "Require all denied" "$BASE/sobtree-newsletter/.htaccess" && [ "$(stat -c %a "$ALTAS")" = 600 ]'

echo "5. n8n caído: éxito al visitante y reintento con el cron de leads"
echo 500 > "$MOCK/mode"
CODE=$(post -d "{\"email\":\"otra@example.com\",\"consentimiento\":\"si\",\"consent_text\":\"$TEXTO\",\"origen\":\"radar\"}")
ID=$(last_id)
check "respuesta 200 aunque n8n falle" '[ "$CODE" = 200 ] && grep -q "\"ok\":true" "$WORK/out"'
check "estado n8n = error" '[ "$(last_state "$ID" n8n)" = error ]'
php "$ROOT/public/lib/reintentar-leads.php" >"$WORK/retry-fail.out" 2>&1
check "el cron de leads también reintenta la newsletter" 'grep -q reintentar-newsletter "$WORK/retry-fail.out"'
check "sigue en error mientras n8n responde 500" '[ "$(last_state "$ID" n8n)" = error ]'
echo 200 > "$MOCK/mode"
php "$ROOT/public/lib/reintentar-leads.php" >"$WORK/retry.out" 2>&1
check "al volver n8n, el cron la envía" '[ "$(last_state "$ID" n8n)" = enviado ] && grep -q "\"enviados\":1" "$WORK/retry.out"'
php "$ROOT/public/lib/reintentar-leads.php" >"$WORK/retry2.out" 2>&1
check "un segundo cron no la duplica" 'grep "reintentar-newsletter" "$WORK/retry2.out" | grep -q "\"enviados\":0"'

echo "6. Flag de doble confirmación apagado en la respuesta de n8n"
echo 200-sin-confirmar > "$MOCK/mode"
CODE=$(post -d "{\"email\":\"sin@example.com\",\"consentimiento\":\"si\",\"consent_text\":\"$TEXTO\",\"origen\":\"portada\"}")
check "confirmar false cuando n8n lo dice" '[ "$CODE" = 200 ] && grep -q "\"confirmar\":false" "$WORK/out"'

echo "7. URL de un artículo se normaliza"
CODE=$(post -d "{\"email\":\"url@example.com\",\"consentimiento\":\"si\",\"consent_text\":\"$TEXTO\",\"origen\":\"https://sobtree.com/analisis/ley-de-ia-que-exige-a-tu-pyme/\"}")
check "la URL del artículo pasa a articulo:slug" '[ "$CODE" = 200 ] && grep -q "articulo:ley-de-ia-que-exige-a-tu-pyme" "$ALTAS"'

echo
echo "Resultado: $PASS correctas, $FAIL fallidas"
[ "$FAIL" = 0 ]

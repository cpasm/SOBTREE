#!/usr/bin/env bash
# Pruebas locales de la captura de leads. No toca nada externo: levanta dos servidores PHP en
# 127.0.0.1 (la web y un webhook n8n simulado) y usa una carpeta temporal para el registro.
# Uso: bash tests/leads/run-tests.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"; BASE="$WORK/base"; MOCK="$WORK/mock"; mkdir -p "$BASE" "$MOCK" "$WORK/tmp"
SITE_PORT=18081; MOCK_PORT=18082
SECRET="test-secret-$(date +%s)"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✔ $1"; }
ko()   { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
check(){ if eval "$2"; then ok "$1"; else ko "$1"; fi; }

write_config() { # $1 = url (vacío = sin webhook)
  cat > "$BASE/sobtree-secrets.php" <<PHP
<?php return ['N8N_LEADS_WEBHOOK_URL' => '$1', 'N8N_LEADS_WEBHOOK_SECRET' => '$SECRET'];
PHP
}
MAILLOG="$WORK/mails.log"; MAILFAIL="$WORK/mail-fail"; : > "$MAILLOG"
export SOBTREE_BASE_DIR="$BASE" LEADS_ALLOW_HTTP_WEBHOOK=1 LEADS_DISABLE_MAIL=1 LEADS_TEST_MAIL_LOG="$MAILLOG" LEADS_TEST_MAIL_FAIL_FILE="$MAILFAIL" TMPDIR="$WORK/tmp"
MOCK_DIR="$MOCK" MOCK_SECRET="$SECRET" php -S 127.0.0.1:$MOCK_PORT "$ROOT/tests/leads/mock-webhook.php" >"$WORK/mock.log" 2>&1 &
P1=$!
php -S 127.0.0.1:$SITE_PORT -t "$ROOT/public" >"$WORK/site.log" 2>&1 &
P2=$!
trap 'kill $P1 $P2 2>/dev/null; rm -rf "$WORK"' EXIT
sleep 1
URL="http://127.0.0.1:$SITE_PORT/contact.php"
WEBHOOK="http://127.0.0.1:$MOCK_PORT/"
LEADS="$BASE/sobtree-leads/leads.jsonl"; ESTADO="$BASE/sobtree-leads/estado.jsonl"; RECV="$MOCK/received.jsonl"
unlock() { rm -f "$WORK"/tmp/sobtree_contact_*; }
post() { unlock; curl -s -o "$WORK/out" -w '%{http_code}' -X POST "$URL" "$@"; }
VALID=(-d nombre=Ana%20Prueba -d cargo=Gerente -d telefono=%2B34%20600%20000%20000 -d empresa=Acme%20SL
       -d email=Ana@Example.com -d "tamano=10 a 49 personas" -d "interes=Primer caso de uso" -d mensaje=Hola
       -d consentimiento=si -d web= -d t0=1)
lines() { [ -f "$1" ] && wc -l < "$1" | tr -d ' ' || echo 0; }
last_state() { grep "\"id\":\"$1\"" "$ESTADO" | grep "\"canal\":\"$2\"" | tail -1 | sed -E 's/.*"estado":"([^"]+)".*/\1/'; }
mails_for() { grep -c "^$1 " "$MAILLOG"; }
correo_marks() { grep "\"id\":\"$1\"" "$ESTADO" | grep -c "\"canal\":\"correo\""; }
last_id() { tail -1 "$LEADS" | sed -E 's/.*"id":"([^"]+)".*/\1/'; }

echo "1. Sintaxis"
for f in "$ROOT/public/contact.php" "$ROOT/public/lib/leads.php" "$ROOT/public/lib/reintentar-leads.php"; do
  check "php -l $(basename "$f")" 'php -l "$f" >/dev/null'
done

echo "2. Validación y antispam"
write_config "$WEBHOOK"
check "GET → 405" '[ "$(curl -s -o /dev/null -w %{http_code} $URL)" = 405 ]'
check "honeypot → 200 y no se guarda" '[ "$(post "${VALID[@]}" -d web=bot)" = 200 ] && [ "$(lines "$LEADS")" = 0 ]'
check "envío instantáneo (t0 reciente) → descartado" '[ "$(post "${VALID[@]}" -d t0=$(($(date +%s%3N)-500)))" = 200 ] && [ "$(lines "$LEADS")" = 0 ]'
check "falta campo → 422" '[ "$(post -d nombre=Ana -d email=a@b.com -d consentimiento=si)" = 422 ]'
check "email inválido → 422" '[ "$(post "${VALID[@]}" -d email=no-es-email)" = 422 ]'
check "teléfono inválido → 422" '[ "$(post "${VALID[@]}" -d telefono=abc)" = 422 ]'
check "sin consentimiento → 422" '[ "$(post "${VALID[@]}" -d consentimiento=no)" = 422 ]'

echo "3. Lead válido: se guarda, se firma y se envía a n8n"
echo 200 > "$MOCK/mode"
CODE=$(post "${VALID[@]}" -d utm_source=linkedin -d utm_campaign=otono -d origen_pagina=https://sobtree.com/ -d origen_landing=https://sobtree.com/analisis/x/?utm_source=linkedin -d origen_referrer=https://www.linkedin.com/)
ID=$(last_id)
check "respuesta 200" '[ "$CODE" = 200 ]'
check "guardado en leads.jsonl" '[ "$(lines "$LEADS")" = 1 ]'
check "email normalizado y cargo/teléfono separados" 'grep -q "\"email\":\"ana@example.com\"" "$LEADS" && grep -q "\"cargo\":\"Gerente\"" "$LEADS" && grep -q "\"telefono\":\"+34 600 000 000\"" "$LEADS"'
check "UTM y origen guardados" 'grep -q "\"utm_source\":\"linkedin\"" "$LEADS" && grep -q "\"referrer\":\"https://www.linkedin.com/\"" "$LEADS"'
check "n8n recibió el lead con firma válida" 'tail -1 "$RECV" | grep -q "\"valid_signature\":true" && tail -1 "$RECV" | grep -q "$ID"'
check "estado n8n = enviado" '[ "$(last_state "$ID" n8n)" = enviado ]'
check "n8n OK → la web NO envía correo (el aviso principal es de n8n)" '[ "$(mails_for "$ID")" = 0 ] && [ "$(correo_marks "$ID")" = 0 ]'
check "payload indica respaldo_enviado=false" 'tail -1 "$RECV" | grep -q "\"respaldo_enviado\":false"'
check "límite por IP: segundo envío inmediato → 429" '[ "$(curl -s -o /dev/null -w %{http_code} -X POST "$URL" "${VALID[@]}")" = 429 ]'

echo "4. Calculadora y asistente"
post "${VALID[@]}" -d tipo_formulario=calculadora --data-urlencode 'datos_calculadora={"sector":"Servicios","personas":12,"horas":5,"coste":25,"areas":["Email"],"ahorro_min":5000,"ahorro_max":9000,"precio_min":1200,"precio_max":2000,"malicioso":"x"}' >/dev/null
check "tipo calculadora + datos estructurados (campo desconocido descartado)" 'tail -1 "$LEADS" | grep -q "\"tipo_formulario\":\"calculadora\"" && tail -1 "$LEADS" | grep -q "\"ahorro_max\":9000" && ! tail -1 "$LEADS" | grep -q malicioso'
post "${VALID[@]}" -d tipo_formulario=asistente -d "motivo_asistente=Automatizar presupuestos" >/dev/null
check "tipo asistente + motivo" 'tail -1 "$LEADS" | grep -q "\"tipo_formulario\":\"asistente\"" && tail -1 "$LEADS" | grep -q "Automatizar presupuestos"'
post "${VALID[@]}" -d tipo_formulario=hack >/dev/null
check "tipo desconocido → contacto" 'tail -1 "$LEADS" | grep -q "\"tipo_formulario\":\"contacto\""'

echo "5. n8n caído: OK al visitante, correo de RESPALDO una sola vez y reintento"
echo 500 > "$MOCK/mode"
CODE=$(post "${VALID[@]}"); ID=$(last_id)
check "respuesta 200 aunque n8n falle" '[ "$CODE" = 200 ]'
check "estado n8n = error" '[ "$(last_state "$ID" n8n)" = error ]'
check "correo de respaldo enviado (1) y marcado" '[ "$(mails_for "$ID")" = 1 ] && [ "$(last_state "$ID" correo)" = correo_ok ] && grep -q "respaldo: n8n_fallo" "$ESTADO"'
php "$ROOT/public/lib/reintentar-leads.php" >/dev/null 2>&1
check "cron con n8n aún caído: NO repite el respaldo" '[ "$(mails_for "$ID")" = 1 ] && [ "$(last_state "$ID" n8n)" = error ]'
echo 200 > "$MOCK/mode"
php "$ROOT/public/lib/reintentar-leads.php" >"$WORK/retry.out" 2>&1
check "reintento lo reenvía → enviado" '[ "$(last_state "$ID" n8n)" = enviado ]'
check "el reenvío avisa a n8n de que ya hubo respaldo (no duplica aviso)" 'tail -1 "$RECV" | grep -q "\"respaldo_enviado\":true"'
php "$ROOT/public/lib/reintentar-leads.php" >"$WORK/retry2.out" 2>&1
check "segundo reintento no duplica envíos ni correos" 'grep -q "\"enviados\":0" "$WORK/retry2.out" && [ "$(mails_for "$ID")" = 1 ]'

echo "5b. n8n recibe pero no puede enviar su aviso → respaldo de la web"
echo 200-sin-aviso > "$MOCK/mode"
post "${VALID[@]}" >/dev/null; ID=$(last_id)
check "n8n enviado + respaldo n8n_sin_aviso" '[ "$(last_state "$ID" n8n)" = enviado ] && [ "$(mails_for "$ID")" = 1 ] && grep "$ID" "$ESTADO" | grep -q "n8n_sin_aviso"'
echo 200 > "$MOCK/mode"

echo "5c. Falla el correo de respaldo → el cron lo reintenta una vez resuelto"
echo 500 > "$MOCK/mode"; touch "$MAILFAIL"
post "${VALID[@]}" >/dev/null; ID=$(last_id)
check "n8n error + correo_error" '[ "$(last_state "$ID" n8n)" = error ] && [ "$(last_state "$ID" correo)" = correo_error ]'
rm -f "$MAILFAIL"
php "$ROOT/public/lib/reintentar-leads.php" >/dev/null 2>&1
check "cron (n8n sigue caído) envía el respaldo pendiente" '[ "$(last_state "$ID" correo)" = correo_ok ] && [ "$(mails_for "$ID")" = 1 ]'
echo 200 > "$MOCK/mode"
php "$ROOT/public/lib/reintentar-leads.php" >/dev/null 2>&1
check "al volver n8n: enviado y sin más correos" '[ "$(last_state "$ID" n8n)" = enviado ] && [ "$(mails_for "$ID")" = 1 ]'

echo "6. n8n lento: timeout corto"
echo sleep > "$MOCK/mode"
T0=$(date +%s); post "${VALID[@]}" >/dev/null; T1=$(date +%s); ID=$(last_id)
check "termina en ≤ 12 s (timeout 10 s)" '[ $((T1-T0)) -le 12 ]'
check "estado n8n = error por timeout" '[ "$(last_state "$ID" n8n)" = error ]'
check "timeout → correo de respaldo" '[ "$(mails_for "$ID")" = 1 ]'
echo 200 > "$MOCK/mode"; sleep 5   # deja terminar al mock (servidor de un hilo)

echo "7. Sin webhook configurado: se guarda y se omite sin romper nada"
write_config ""
CODE=$(post "${VALID[@]}"); ID=$(last_id)
check "respuesta 200" '[ "$CODE" = 200 ]'
check "estado n8n = omitido" '[ "$(last_state "$ID" n8n)" = omitido ]'
check "sin webhook → correo de respaldo (webhook_no_configurado)" '[ "$(mails_for "$ID")" = 1 ] && grep "$ID" "$ESTADO" | grep -q webhook_no_configurado'
php "$ROOT/public/lib/reintentar-leads.php" >/dev/null 2>&1
check "cron sin webhook: no repite el respaldo" '[ "$(mails_for "$ID")" = 1 ]'
write_config "$WEBHOOK"
php "$ROOT/public/lib/reintentar-leads.php" >/dev/null 2>&1
check "al configurarlo, el reintento lo envía sin más correos" '[ "$(last_state "$ID" n8n)" = enviado ] && [ "$(mails_for "$ID")" = 1 ]'

echo "8. Protección del registro y de los scripts"
check "registro con permisos 600" '[ "$(stat -c %a "$LEADS")" = 600 ]'
check "carpeta de leads con .htaccess deny" 'grep -q "Require all denied" "$BASE/sobtree-leads/.htaccess"'
check "public/lib/.htaccess deny" 'grep -q "Require all denied" "$ROOT/public/lib/.htaccess"'
check "reintentar-leads.php vía web → 404" '[ "$(curl -s -o /dev/null -w %{http_code} http://127.0.0.1:$SITE_PORT/lib/reintentar-leads.php)" = 404 ]'
check "ningún secreto en el payload enviado a n8n" '! grep -q "$SECRET" "$RECV"'

echo "9. Firma: el mock rechaza una firma falsa"
check "firma inválida → 401" '[ "$(curl -s -o /dev/null -w %{http_code} -X POST -H "X-Sobtree-Timestamp: $(date +%s)" -H "X-Sobtree-Signature: sha256=00" -d "{}" $WEBHOOK)" = 401 ]'

echo "10. Remitente del correo de respaldo"
check "remitente por defecto = info@sobtree.com" '[ "$(php -r "require \"$ROOT/public/lib/leads.php\"; echo leads_config()[\"notify_from\"];")" = info@sobtree.com ]'
check "LEADS_NOTIFY_FROM lo sustituye" '[ "$(LEADS_NOTIFY_FROM=otro@sobtree.com php -r "require \"$ROOT/public/lib/leads.php\"; echo leads_config()[\"notify_from\"];")" = otro@sobtree.com ]'

echo; echo "Resultado: $PASS correctas, $FAIL fallidas"
[ "$FAIL" = 0 ]

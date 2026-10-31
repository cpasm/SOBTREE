#!/usr/bin/env bash
# Pruebas locales del envío doble n8n + Google Apps Script (leads y Contrata).
# No toca nada externo: servidores PHP en 127.0.0.1 (web, n8n simulados y Apps Script simulado),
# datos sintéticos (@ejemplo.test) y secretos generados al vuelo. No envía correo.
# Uso: bash tests/apps-script/run-tests.sh   (o npm run test:apps-script)
set -u
unset STRIPE_RESTRICTED_KEY STRIPE_WEBHOOK_SECRET APPS_SCRIPT_MODO
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"; BASE="$WORK/base"; mkdir -p "$BASE" "$WORK/tmp" "$WORK/am" "$WORK/nl" "$WORK/nc"
AM="$WORK/am"; NL="$WORK/nl"; NC="$WORK/nc"
P_AM=18091; P_NL=18092; P_NC=18093; P_SITE=18094
S_AL="al-$(openssl rand -hex 12)"   # secreto de Apps Script (el mismo valor para lead y contrata en estas pruebas)
S_NL="nl-$(openssl rand -hex 12)"; S_NC="nc-$(openssl rand -hex 12)"   # secretos de n8n
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✔ $1"; }
ko()   { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
check(){ if eval "$2"; then ok "$1"; else ko "$1"; fi; }

MAILLOG="$WORK/mails.log"; : > "$MAILLOG"
export SOBTREE_BASE_DIR="$BASE" LEADS_ALLOW_HTTP_WEBHOOK=1 CONTRATA_ALLOW_HTTP_WEBHOOK=1 APPS_SCRIPT_ALLOW_HTTP=1 APPS_SCRIPT_TEST_TIMEOUT=2 \
       LEADS_DISABLE_MAIL=1 LEADS_TEST_MAIL_LOG="$MAILLOG" CONTRATA_DISABLE_MAIL=1 TMPDIR="$WORK/tmp"
MOCK_DIR="$AM" MOCK_SECRET="$S_AL" MOCK_PORT=$P_AM php -S 127.0.0.1:$P_AM "$ROOT/tests/apps-script/mock-apps-script.php" >"$WORK/am.log" 2>&1 & PA=$!
MOCK_DIR="$NL" MOCK_SECRET="$S_NL" php -S 127.0.0.1:$P_NL "$ROOT/tests/leads/mock-webhook.php" >"$WORK/nl.log" 2>&1 & PB=$!
MOCK_DIR="$NC" MOCK_SECRET="$S_NC" php -S 127.0.0.1:$P_NC "$ROOT/tests/contrata/mock-n8n.php" >"$WORK/nc.log" 2>&1 & PC=$!
php -S 127.0.0.1:$P_SITE -t "$ROOT/public" >"$WORK/site.log" 2>&1 & PD=$!
trap 'kill $PA $PB $PC $PD 2>/dev/null; rm -rf "${WORK:?}"' EXIT
sleep 1

APPS_L="http://127.0.0.1:$P_AM/macros/s/AKfycbFICTICIO-lead/exec"
APPS_C="http://127.0.0.1:$P_AM/macros/s/AKfycbFICTICIO-contrata/exec"
cfg() { # $1 = valor de APPS_SCRIPT_MODO ('' = sin la clave), $2 = on|off (claves de Apps Script presentes)
  {
    echo "<?php return ["
    echo "'N8N_LEADS_WEBHOOK_URL'=>'http://127.0.0.1:$P_NL/','N8N_LEADS_WEBHOOK_SECRET'=>'$S_NL',"
    echo "'CONTRATA_N8N_WEBHOOK_URL'=>'http://127.0.0.1:$P_NC/','CONTRATA_HMAC_SECRET'=>'$S_NC',"
    if [ "$2" = on ]; then
      echo "'APPS_SCRIPT_LEADS_URL'=>'$APPS_L','APPS_SCRIPT_LEADS_HMAC_SECRET'=>'$S_AL',"
      echo "'APPS_SCRIPT_CONTRATA_URL'=>'$APPS_C','APPS_SCRIPT_CONTRATA_HMAC_SECRET'=>'$S_AL',"
    fi
    [ -n "$1" ] && echo "'APPS_SCRIPT_MODO'=>'$1',"
    echo "];"
  } > "$BASE/sobtree-secrets.php"
}
reset() {
  rm -rf "${BASE:?}/sobtree-leads" "${BASE:?}/sobtree-contrata"
  find "${WORK:?}/tmp" -maxdepth 1 -name 'sobtree_contact_*' -delete
  : > "$MAILLOG"; echo 200 > "$NL/mode"; echo 200 > "$NC/mode"; echo ok > "$AM/mode"
  : > "$AM/received.jsonl"; : > "$NL/received.jsonl"; : > "$NC/received.jsonl"; : > "$AM/result.json"
}
amode() { echo "$1" > "$AM/mode"; }
posts() { grep -c '"metodo":"POST"' "$AM/received.jsonl" 2>/dev/null || true; }
gets()  { grep -c '"metodo":"GET"' "$AM/received.jsonl" 2>/dev/null || true; }
nl_hits() { grep -c . "$NL/received.jsonl" 2>/dev/null || true; }
nc_hits() { grep -c . "$NC/received.jsonl" 2>/dev/null || true; }
LEADS="$BASE/sobtree-leads/leads.jsonl"; ESTADO="$BASE/sobtree-leads/estado.jsonl"; COLAE="$BASE/sobtree-contrata/cola-estado.jsonl"
last_id() { tail -1 "$LEADS" | sed -E 's/.*"id":"([^"]+)".*/\1/'; }
lstate() { grep "\"id\":\"$1\"" "$ESTADO" 2>/dev/null | grep "\"canal\":\"$2\"" | tail -1 | sed -E 's/.*"estado":"([^"]+)".*/\1/'; }
ldetalle() { grep "\"id\":\"$1\"" "$ESTADO" 2>/dev/null | grep "\"canal\":\"$2\"" | tail -1 | sed -E 's/.*"detalle":"([^"]*)".*/\1/'; }
lcount() { grep "\"id\":\"$1\"" "$ESTADO" 2>/dev/null | grep -c "\"canal\":\"$2\"" || true; }
mails() { grep -c . "$MAILLOG" 2>/dev/null || true; }
VALID=(-d nombre=Ana%20Prueba -d cargo=Gerente -d telefono=%2B34%20600%20000%20000 -d empresa=Acme%20SL -d email=ana@ejemplo.test
       -d "tamano=10 a 49 personas" -d "interes=Primer caso de uso" -d mensaje=Hola -d consentimiento=si -d web= -d t0=1)
post_lead() { find "${WORK:?}/tmp" -maxdepth 1 -name 'sobtree_contact_*' -delete; curl -s --noproxy '*' -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$P_SITE/contact.php" "${VALID[@]}"; }
espera_apps() { for _ in $(seq 1 40); do grep -q '"canal":"apps_script"' "$ESTADO" 2>/dev/null && return 0; sleep 0.25; done; return 1; }
cron_leads() { php "$ROOT/public/lib/reintentar-leads.php" 2>/dev/null | head -1; }
cron_leads_n() { for _ in $(seq 1 "$1"); do cron_leads >/dev/null; done; }
run_c() { php "$ROOT/tests/apps-script/escenario.php" "$@"; }
st_c() { run_c estado | php -r '$j=json_decode(stream_get_contents(STDIN),true); echo json_encode($j["estado"][0] ?? new stdClass), "\n";'; }
nif_c() { run_c estado | sed -E 's/.*"con_nif":([0-9]+).*/\1/'; }

echo "1. Sintaxis"
for f in public/lib/apps-script.php public/lib/leads.php public/lib/contrata.php public/lib/reintentar-leads.php tests/apps-script/mock-apps-script.php tests/apps-script/escenario.php; do
  check "php -l $f" 'php -l "$ROOT/$f" >/dev/null'
done

echo "2. Sobre, firma e interpretación (unitarias)"
U=$(php -r 'require "'"$ROOT"'/public/lib/apps-script.php"; $s=json_decode(apps_script_sobre("lead","{\"a\":1}","k-ficticia","1700000000"),true);
 echo json_encode([$s["ts"],$s["flujo"],$s["firma"]===("sha256=".hash_hmac("sha256","1700000000.lead.{\"a\":1}","k-ficticia")),$s["cuerpo"], array_keys($s), apps_script_modo(""),apps_script_modo("PRINCIPAL"),apps_script_modo("x"),apps_script_modo(" apagado ")]);')
check "sobre {ts,flujo,firma,cuerpo}; firma = sha256=HMAC(ts.flujo.cuerpo); modo por defecto sombra" '[ "$U" = "[\"1700000000\",\"lead\",true,\"{\\\"a\\\":1}\",[\"ts\",\"flujo\",\"firma\",\"cuerpo\"],\"sombra\",\"principal\",\"sombra\",\"apagado\"]" ]'
U=$(APPS_SCRIPT_ALLOW_HTTP=0 php -r 'require "'"$ROOT"'/public/lib/apps-script.php"; echo json_encode([apps_script_url_valida("http://script.google.com/x"),apps_script_url_valida("https://script.google.com/macros/s/X/exec"),apps_script_destino_redireccion("https://evil.example/x","https://script.google.com/a"),apps_script_destino_redireccion("https://script.googleusercontent.com/macros/echo?x=1","https://script.google.com/a"),apps_script_destino_redireccion("http://script.googleusercontent.com/x","https://script.google.com/a"),apps_script_destino_redireccion("https://script.googleusercontent.com.evil.com/x","https://script.google.com/a")],JSON_UNESCAPED_SLASHES);')
check "solo https; la redirección solo a dominios de Google (no http, no sufijos falsos)" '[ "$U" = "[\"\",\"https://script.google.com/macros/s/X/exec\",\"\",\"https://script.googleusercontent.com/macros/echo?x=1\",\"\",\"\"]" ]'
check "timeout por defecto 30 s (≥30)" '[ "$(env -u APPS_SCRIPT_TEST_TIMEOUT php -r "require \"$ROOT/public/lib/apps-script.php\"; echo apps_script_timeout();")" = 30 ]'
U=$(php -r 'require "'"$ROOT"'/public/lib/apps-script.php"; echo json_encode([apps_script_interpretar(200,"{\"status\":200}")[0],apps_script_interpretar(200,"{\"status\":502,\"motivo\":\"hoja\"}")[1],apps_script_interpretar(200,"{\"ok\":true}")[1],apps_script_interpretar(200,"no json")[1],apps_script_interpretar(500,"{\"status\":200}")[1],apps_script_interpretar(200,"{\"status\":\"200\"}")[0],apps_script_interpretar(200,"{\"status\":199}")[0],apps_script_interpretar(200,"{\"status\":503,\"motivo\":\"Empresa X ana@e.test\"}")[1]]);')
check "solo status 2xx entrega; sin status/JSON roto/HTTP≠2xx = fallo; motivo fuera de vocabulario no se copia" '[ "$U" = "[\"enviado\",\"status_502 hoja\",\"sin_status\",\"json_invalido\",\"http_500\",\"enviado\",\"error\",\"status_503\"]" ]'

U=$(APPS_SCRIPT_ALLOW_HTTP=0 php -r 'require "'"$ROOT"'/public/lib/apps-script.php"; $a="https://script.google.com/a"; foreach (["https://x.google.com:9999/","https://x.google.com:443/ok","https://x.google.com/ok","https://google.com/x","https://evil.google.com.evil.com/","https://user@x.google.com/","https://x.google.com\\@evil.com/","https://x.google.com;evil/","https://x.goo%67le.com/","https://x_y.google.com/","https://x.google.com/a b","https://X.GoogleUserContent.com/macros/echo?u=1","//evil.com/x","https://127.0.0.1/x","https://[::1]/x","https://x.google.com./x"] as $l) echo apps_script_destino_redireccion($l,$a)===""?"0":"1";')
check "anti-SSRF estricto: puerto 9999, usuario, \\, ;, %, _, espacios, IP, host raíz y sufijos falsos = rechazados; :443 y mayúsculas válidas" '[ "$U" = "0110000000010000" ]'

echo "3. LEADS · sombra (por defecto): n8n sigue siendo el principal"
reset; cfg "" on; amode ok
CODE=$(post_lead); ID=$(last_id); espera_apps
check "sin APPS_SCRIPT_MODO el modo es sombra: respuesta 200 al visitante" '[ "$CODE" = 200 ]'
check "n8n recibió el lead y quedó enviado" '[ "$(lstate "$ID" n8n)" = enviado ] && [ "$(nl_hits)" = 1 ]'
check "Apps Script: UN POST firmado (flujo lead) y UN GET a la redirección (no se reenvía el POST)" '[ "$(posts)" = 1 ] && [ "$(gets)" = 1 ] && grep -q "\"firma_valida\":true" "$AM/received.jsonl" && grep -q "\"flujo\":\"lead\"" "$AM/received.jsonl" && grep -q "\"flujo_query\":\"lead\"" "$AM/received.jsonl"'
check "Apps Script entregado: canal apps_script = enviado" '[ "$(lstate "$ID" apps_script)" = enviado ]'
check "sin correo de respaldo" '[ "$(mails)" = 0 ] && [ -z "$(lstate "$ID" correo)" ]'
check "el sobre lleva el mismo lead (mismo id) que recibió n8n" 'grep -q "\"id\":\"$ID\"" "$AM/received.jsonl" && grep -q "$ID" "$NL/received.jsonl"'
check "el cron no repite nada (idempotencia)" 'cron_leads_n 2; [ "$(posts)" = 1 ] && [ "$(nl_hits)" = 1 ] && [ "$(lcount "$ID" apps_script)" = 1 ]'

echo "4. LEADS · fallos de Apps Script no cambian n8n ni el correo (sombra)"
for M in 502 503 json-roto sin-status timeout http500 401; do
  reset; cfg sombra on; amode $M
  CODE=$(post_lead); ID=$(last_id); espera_apps
  case $M in 502) D=status_502;; 503) D=status_503;; json-roto) D=json_invalido;; sin-status) D=sin_status;; timeout) D=timeout;; http500) D=http_500;; 401) D=status_401;; esac
  check "$M: visitante 200; n8n = enviado; sin correo de respaldo" '[ "$CODE" = 200 ] && [ "$(lstate "$ID" n8n)" = enviado ] && [ "$(mails)" = 0 ] && [ -z "$(lstate "$ID" correo)" ]'
  check "$M: canal apps_script = error con detalle «$D…»" '[ "$(lstate "$ID" apps_script)" = error ] && ldetalle "$ID" apps_script | grep -q "^$D"'
  [ "$M" = timeout ] && sleep 4   # el mock (un solo hilo) sigue dormido unos segundos
done
echo "   n8n caído: el respaldo por correo lo decide SOLO n8n"
reset; cfg sombra on; amode ok; echo 500 > "$NL/mode"
CODE=$(post_lead); ID=$(last_id); espera_apps
check "n8n error + Apps Script enviado: un correo de respaldo (como hoy)" '[ "$(lstate "$ID" n8n)" = error ] && [ "$(lstate "$ID" correo)" = correo_ok ] && [ "$(mails)" = 1 ] && [ "$(lstate "$ID" apps_script)" = enviado ]'
reset; cfg sombra on; amode 502; echo 500 > "$NL/mode"
CODE=$(post_lead); ID=$(last_id); espera_apps
check "n8n y Apps Script caídos a la vez: un solo correo y cada canal con su estado" '[ "$CODE" = 200 ] && [ "$(mails)" = 1 ] && [ "$(lstate "$ID" n8n)" = error ] && [ "$(lstate "$ID" apps_script)" = error ]'

echo "5. LEADS · reintento de Apps Script con contador propio (máx. 8)"
reset; cfg sombra on; amode 502
post_lead >/dev/null; ID=$(last_id); espera_apps
amode ok; cron_leads_n 1
check "el cron reintenta SOLO Apps Script: enviado; n8n no se reenvía (1 entrega)" '[ "$(lstate "$ID" apps_script)" = enviado ] && [ "$(nl_hits)" = 1 ] && [ "$(lcount "$ID" n8n)" = 1 ]'
check "ya entregado: más crons no envían nada (idempotente)" 'P=$(posts); cron_leads_n 2; [ "$(posts)" = "$P" ]'
reset; cfg sombra on; amode 503
post_lead >/dev/null; ID=$(last_id); espera_apps
cron_leads_n 12
check "tras 8 fallos no hay más POST (8 intentos en total) aunque n8n esté bien" '[ "$(posts)" = 8 ] && [ "$(grep "\"id\":\"$ID\"" "$ESTADO" | grep "\"canal\":\"apps_script\"" | grep -c "\"estado\":\"error\"")" = 8 ]'
check "el agotamiento de Apps Script no toca n8n ni el correo" '[ "$(lstate "$ID" n8n)" = enviado ] && [ "$(nl_hits)" = 1 ] && [ "$(mails)" = 0 ]'
reset; cfg sombra off; post_lead >/dev/null; sleep 0.5
LINE=$(tail -1 "$LEADS"); echo "$LINE" | sed -E 's/"fecha":"[^"]*"/"fecha":"2026-10-30T10:00:00+00:00"/' > "$LEADS"
cfg sombra on; : > "$AM/received.jsonl"; cron_leads_n 1
check "lead antiguo (>24 h) sin intento previo en Apps Script: 0 envíos (no hay recuperación en bloque)" '[ "$(posts)" = 0 ]'

echo "6. LEADS · modos apagado, sin claves y principal"
reset; cfg apagado on; amode ok; post_lead >/dev/null; ID=$(last_id); sleep 1
check "apagado: 0 peticiones a Apps Script y n8n igual" '[ "$(posts)" = 0 ] && [ "$(lstate "$ID" n8n)" = enviado ] && [ -z "$(lstate "$ID" apps_script)" ]'
reset; cfg principal off; amode ok; post_lead >/dev/null; ID=$(last_id); sleep 1
check "sin claves (aunque el modo sea principal): se omite en silencio y n8n sigue de principal" '[ "$(posts)" = 0 ] && [ "$(lstate "$ID" n8n)" = enviado ] && [ -z "$(lstate "$ID" apps_script)" ] && [ "$(mails)" = 0 ]'
reset; cfg principal on; amode ok; post_lead >/dev/null; ID=$(last_id); espera_apps
check "principal + Apps Script OK: entrega por Apps Script; n8n NO se llama; sin correo" '[ "$(lstate "$ID" apps_script)" = enviado ] && [ "$(nl_hits)" = 0 ] && [ -z "$(lstate "$ID" n8n)" ] && [ "$(mails)" = 0 ]'
reset; cfg principal on; amode 502; post_lead >/dev/null; ID=$(last_id); espera_apps; sleep 0.5
check "principal + Apps Script 502: n8n pasa a respaldo y entrega; sin correo" '[ "$(lstate "$ID" apps_script)" = error ] && [ "$(lstate "$ID" n8n)" = enviado ] && [ "$(mails)" = 0 ]'
amode ok; cron_leads_n 1
check "principal: el cron reintenta Apps Script y lo deja enviado (n8n no se repite)" '[ "$(lstate "$ID" apps_script)" = enviado ] && [ "$(nl_hits)" = 1 ]'
reset; cfg principal on; amode 503; echo 500 > "$NL/mode"; post_lead >/dev/null; ID=$(last_id); espera_apps; sleep 0.5
check "principal + los dos caídos: un solo correo de respaldo" '[ "$(mails)" = 1 ] && [ "$(lstate "$ID" correo)" = correo_ok ]'
cron_leads_n 2
check "principal: los reintentos no duplican el correo" '[ "$(mails)" = 1 ]'

echo "7. CONTRATA · sombra"
reset; cfg "" on; amode ok
run_c enviar evt_test_1 >/dev/null
check "sin APPS_SCRIPT_MODO (sombra): n8n enviado y Apps Script enviado, cada uno con su estado" 'st_c | grep -q "\"ultimo\":\"enviado\"" && st_c | grep -q "\"apps_ultimo\":\"enviado\""'
check "Apps Script recibió el sobre firmado (flujo contrata) con 1 POST y 1 GET; n8n recibió 1 aviso" '[ "$(posts)" = 1 ] && [ "$(gets)" = 1 ] && grep -q "\"flujo\":\"contrata\"" "$AM/received.jsonl" && grep -q "\"firma_valida\":true" "$AM/received.jsonl" && [ "$(nc_hits)" = 1 ]'
check "entregado por los dos canales: el NIF se purga de la cola" '[ "$(nif_c)" = 0 ]'
run_c cron >/dev/null
check "idempotencia: el cron no vuelve a enviar a ninguno" '[ "$(posts)" = 1 ] && [ "$(nc_hits)" = 1 ]'
for M in 502 503 json-roto sin-status timeout; do
  reset; cfg "" on; amode $M
  run_c enviar evt_test_1 >/dev/null
  case $M in 502) D=status_502;; 503) D=status_503;; json-roto) D=json_invalido;; sin-status) D=sin_status;; timeout) D=timeout;; esac
  check "$M: n8n queda enviado y sin cambios (1 aviso); Apps Script = error registrado" 'st_c | grep -q "\"ultimo\":\"enviado\"" && st_c | grep -q "\"apps_ultimo\":\"error\"" && [ "$(nc_hits)" = 1 ]'
  check "$M: detalle «$D…» sin datos personales" 'grep "\"canal\":\"apps_script\"" "$COLAE" | grep -q "\"detalle\":\"$D" && ! grep -E "Empresa|ejemplo|B1234" "$COLAE"'
  check "$M: el NIF se conserva solo mientras Apps Script aún lo necesita" '[ "$(nif_c)" = 1 ]'
  [ "$M" = timeout ] && sleep 4
done
echo "   reintento de Apps Script (cola propia, máx. 8)"
reset; cfg "" on; amode 503; run_c enviar evt_test_1 >/dev/null
amode ok; run_c cron >/dev/null
check "el cron reenvía a Apps Script, no a n8n, y lo deja enviado; NIF purgado" 'st_c | grep -q "\"apps_ultimo\":\"enviado\"" && [ "$(nc_hits)" = 1 ] && [ "$(nif_c)" = 0 ]'
reset; cfg "" on; amode 503; run_c enviar evt_test_1 >/dev/null
for _ in $(seq 1 12); do run_c cron >/dev/null; done
check "8 intentos en total y se detiene; n8n sigue enviado; el NIF se purga al agotarse" '[ "$(posts)" = 8 ] && st_c | grep -q "\"apps_intentos\":8" && [ "$(nc_hits)" = 1 ] && [ "$(nif_c)" = 0 ]'
echo "   n8n caído y Apps Script correcto (contadores independientes)"
reset; cfg "" on; amode ok; echo 500 > "$NC/mode"; run_c enviar evt_test_1 >/dev/null
check "n8n = error (se reintentará) y Apps Script = enviado; el NIF se conserva para n8n" 'st_c | grep -q "\"ultimo\":\"error\"" && st_c | grep -q "\"apps_ultimo\":\"enviado\"" && [ "$(nif_c)" = 1 ]'
echo 200 > "$NC/mode"; run_c cron >/dev/null; run_c cron >/dev/null
check "el cron reenvía a n8n y NO repite Apps Script (1 POST); NIF purgado" 'st_c | grep -q "\"ultimo\":\"enviado\"" && [ "$(posts)" = 1 ] && [ "$(nif_c)" = 0 ]'
echo "   apagado, sin claves, URL inválida, destino caído"
reset; cfg apagado on; run_c enviar evt_test_1 >/dev/null
check "apagado: 0 peticiones a Apps Script; n8n igual" '[ "$(posts)" = 0 ] && [ "$(nc_hits)" = 1 ] && ! st_c | grep -q apps_ && [ "$(nif_c)" = 0 ]'
reset; cfg principal off; run_c enviar evt_test_1 >/dev/null
check "sin claves: se omite en silencio y n8n sigue de principal" '[ "$(posts)" = 0 ] && [ "$(nc_hits)" = 1 ]'
reset; cfg sombra on; sed -i "s#$APPS_C#http://script.google.com/inseguro#" "$BASE/sobtree-secrets.php"; OUT=$(APPS_SCRIPT_ALLOW_HTTP=0 run_c enviar evt_test_1)
check "URL no https = se ignora sin romper nada" '[ "$(posts)" = 0 ] && [ "$(nc_hits)" = 1 ] && echo "$OUT" | grep -q diferidos'
reset; cfg sombra on; sed -i "s#127.0.0.1:$P_AM/macros/s/AKfycbFICTICIO-contrata#127.0.0.1:1/macros/s/AKfycbFICTICIO-contrata#" "$BASE/sobtree-secrets.php"; OUT=$(run_c enviar evt_test_1 2>"$WORK/err.txt")
check "destino inalcanzable: sin excepción, n8n enviado, Apps Script = error curl_N (sin URL)" 'echo "$OUT" | grep -q diferidos && st_c | grep -q "\"ultimo\":\"enviado\"" && grep "\"canal\":\"apps_script\"" "$COLAE" | grep -Eq "\"detalle\":\"curl_[0-9]+\"" && ! grep -q "127.0.0.1:1" "$COLAE" "$WORK/err.txt"'
reset; cfg sombra on; amode redir-externa; run_c enviar evt_test_1 >/dev/null
check "redirección a un dominio que no es de Google: no se sigue" 'grep "\"canal\":\"apps_script\"" "$COLAE" | grep -q redireccion_no_permitida && [ "$(gets)" = 0 ]'
reset; cfg sombra on; amode ok-directo; run_c enviar evt_test_1 >/dev/null
check "respuesta 200 directa (sin 302) con status 2xx también vale" 'st_c | grep -q "\"apps_ultimo\":\"enviado\"" && [ "$(gets)" = 0 ]'

echo "   B-1: la cola histórica no se reenvía al poner las claves"
reset; cfg "" off; run_c enviar-historica 3 >/dev/null
cfg "" on; : > "$AM/received.jsonl"; OUT=$(run_c cron)
check "3 ventas antiguas ya entregadas a n8n + activación de las claves: 0 POST a Apps Script" '[ "$(posts)" = 0 ] && echo "$OUT" | grep -q "\"apps_enviados\":0"'
reset; cfg "" off; run_c enviar evt_pre >/dev/null; cfg "" on; : > "$AM/received.jsonl"; run_c cron >/dev/null
check "una venta reciente (<24 h) entregada a n8n antes de activar sí se envía una vez a Apps Script" '[ "$(posts)" = 1 ]'
run_c cron >/dev/null
check "y no se repite" '[ "$(posts)" = 1 ]'
reset; cfg "" on; amode 503; run_c enviar evt_old >/dev/null; run_c envejecer 30 >/dev/null; : > "$AM/received.jsonl"
for _ in 1 2 3; do run_c cron >/dev/null; done
check "un error de Apps Script en una fila de más de 24 h ya no se reintenta (0 POST)" '[ "$(posts)" = 0 ]'
echo "   B-2: tope temporal duro del NIF (24 h)"
reset; cfg "" on; amode 503; run_c enviar evt_nif >/dev/null
check "Apps Script caído y n8n entregado: el NIF se retiene mientras la fila es reciente" '[ "$(nif_c)" = 1 ]'
run_c envejecer 30 >/dev/null
check "pasadas 24 h sin que corra el cron, el barrido lo purga (acción independiente del estado de Apps Script)" 'run_c barrer | grep -q "\"purgadas\":1" && [ "$(nif_c)" = 0 ]'
reset; cfg "" on; amode 503; run_c enviar evt_nif >/dev/null; run_c envejecer 30 >/dev/null; run_c enviar evt_siguiente >/dev/null
check "una venta nueva (sin cron) también dispara el barrido de la fila antigua; la nueva conserva su NIF" '[ "$(nif_c)" = 1 ]'
reset; cfg "" on; amode ok; echo 500 > "$NC/mode"; run_c enviar evt_n8n_caido >/dev/null; run_c envejecer 30 >/dev/null; run_c barrer >/dev/null
check "si n8n aún no ha entregado, el NIF se conserva para n8n (comportamiento anterior intacto)" '[ "$(nif_c)" = 1 ]'
echo "   B-3: filas de canal desconocido se ignoran"
reset; cfg "" off; run_c enviar evt_x >/dev/null
ID=$(php -r 'foreach (file(getenv("SOBTREE_BASE_DIR")."/sobtree-contrata/cola.jsonl") as $l){$r=json_decode($l,true);echo $r["id"];}')
echo "{\"id\":\"$ID\",\"estado\":\"enviado\",\"canal\":\"futuro\",\"fecha\":\"2026-10-31T00:00:00+00:00\"}" >> "$COLAE"
check "una fila de un canal desconocido no cuenta como entrega de n8n ni de Apps Script" 'run_c estado | grep -q "\"ultimo\":\"enviado\"" && ! run_c estado | grep -q "apps_"'

echo "8. CONTRATA · principal"
reset; cfg principal on; amode ok; run_c enviar evt_test_1 >/dev/null
check "Apps Script OK: decide la entrega; n8n NO se llama; NIF purgado" 'st_c | grep -q "\"apps_ultimo\":\"enviado\"" && [ "$(nc_hits)" = 0 ] && [ "$(nif_c)" = 0 ]'
reset; cfg principal on; amode 502; run_c enviar evt_test_1 >/dev/null
check "Apps Script 502: n8n entra como respaldo y entrega" 'st_c | grep -q "\"apps_ultimo\":\"error\"" && st_c | grep -q "\"ultimo\":\"enviado\"" && [ "$(nc_hits)" = 1 ]'
amode ok; run_c cron >/dev/null; run_c cron >/dev/null
check "el cron reintenta Apps Script (enviado) sin repetir n8n" 'st_c | grep -q "\"apps_ultimo\":\"enviado\"" && [ "$(nc_hits)" = 1 ] && [ "$(posts)" = 2 ] && [ "$(nif_c)" = 0 ]'
reset; cfg principal on; amode 503; echo 500 > "$NC/mode"; run_c enviar evt_test_1 >/dev/null
check "los dos caídos: ambos en error, aviso en cola para reintento" 'st_c | grep -q "\"apps_ultimo\":\"error\"" && st_c | grep -q "\"ultimo\":\"error\"" && [ "$(nif_c)" = 1 ]'
echo 200 > "$NC/mode"; amode ok; run_c cron >/dev/null
check "recuperación: el cron entrega por Apps Script y no necesita n8n" 'st_c | grep -q "\"apps_ultimo\":\"enviado\"" && [ "$(nif_c)" = 0 ]'

echo "9. Formulario no roto por Apps Script y sin secretos en registros"
reset; cfg sombra on; amode timeout
T0=$(date +%s); CODE=$(post_lead); T1=$(date +%s)
check "con Apps Script en timeout el visitante recibe 200 (el cierre anticipado de la respuesta es de FPM/LiteSpeed; php -S no lo imita)" '[ "$CODE" = 200 ] && [ "$(lstate "$(last_id)" n8n)" = enviado ]'
espera_apps; sleep 5
for M in 502 json-roto; do amode $M; post_lead >/dev/null; espera_apps; sleep 0.5; cron_leads_n 1; done
: > "$WORK/phperr.txt"
run_c enviar evt_test_9 >/dev/null 2>>"$WORK/phperr.txt"; amode 502; run_c enviar evt_test_10 >/dev/null 2>>"$WORK/phperr.txt"
check "los secretos de Apps Script y n8n no aparecen en estados, cola, errores PHP ni logs" '! grep -rqE "$S_AL|$S_NL|$S_NC" "$ESTADO" "$COLAE" "$BASE/sobtree-contrata/auditoria.jsonl" "$WORK/phperr.txt" "$WORK/site.log" 2>/dev/null'
check "ni la URL del despliegue ni datos personales (nombre, email, empresa, NIF) en estados ni logs" '! grep -rqE "AKfycbFICTICIO|ana@ejemplo|Ana Prueba|Empresa Ficticia|B12345674" "$ESTADO" "$COLAE" "$WORK/phperr.txt" "$WORK/site.log" 2>/dev/null'
check "los secretos de Apps Script no viajan en el cuerpo enviado a n8n" '! grep -q "$S_AL" "$NL/received.jsonl" "$NC/received.jsonl"'

echo
echo "Resultado: $PASS correctas, $FAIL fallidas"
[ "$FAIL" = 0 ]

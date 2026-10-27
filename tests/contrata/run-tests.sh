#!/usr/bin/env bash
# Las 15 pruebas del diseño de Contrata, con simulación local.
# No llama a Stripe, Google, HubSpot ni n8n reales. No cobra y no envía correo.
# Uso: npm run test:contrata
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
BASE="$WORK/base"
MOCK="$WORK/mock"
DIR="$BASE/sobtree-contrata"
mkdir -p "$BASE" "$MOCK"
SITE="${CONTRATA_TEST_PHP_PORT:-18083}"
MOCKP="${CONTRATA_TEST_N8N_PORT:-18084}"
ASTRO="${CONTRATA_TEST_ASTRO_PORT:-4322}"
HOY="2026-10-27"
SEMANA_A="2026-11-02"
SEMANA_B="2026-11-09"
SEMANA_C="2026-11-16"
HMAC="$(openssl rand -hex 32)"
WHSEC="$(openssl rand -hex 24)"
PASS=0
FAIL=0
RESULTADOS="$WORK/resultados.tsv"
: > "$RESULTADOS"
: > "$MOCK/received.jsonl"
echo 200 > "$MOCK/mode"

cat > "$BASE/sobtree-secrets.php" <<PHP
<?php return [
  'CONTRATA_MODO' => 'simulacion',
  'CONTRATA_HMAC_SECRET' => '$HMAC',
  'STRIPE_WEBHOOK_SECRET' => '$WHSEC',
  'STRIPE_PRICE_DIAGNOSTICO' => 'price_test_diagnostico',
  'CONTRATA_N8N_WEBHOOK_URL' => 'http://127.0.0.1:$MOCKP/',
  'CONTRATA_PUBLIC_URL' => 'http://127.0.0.1:$ASTRO',
  'CONTRATA_CALENDAR_PROYECTOS_ID' => 'CONFIGURAR_ID_CALENDARIO_PROYECTOS',
  'CONTRATA_CALENDAR_BLOQUEOS_ID' => 'CONFIGURAR_ID_CALENDARIO_BLOQUEOS',
  'CONTRATA_CALENDAR_CUENTA' => 'info@sobtree.com',
];
PHP

export SOBTREE_BASE_DIR="$BASE" CONTRATA_MODO=simulacion CONTRATA_HOY="$HOY"
export CONTRATA_DISABLE_MAIL=1 CONTRATA_ALLOW_HTTP_WEBHOOK=1 CONTRATA_SIN_LIMITE=1
export MOCK_SECRET="$HMAC" MOCK_DIR="$MOCK"
unset CONTRATA_AHORA || true

ok() { PASS=$((PASS + 1)); echo "    ✔ $1"; }
ko() { FAIL=$((FAIL + 1)); echo "    ✘ $1"; }
check() { if eval "$2"; then ok "$1"; else ko "$1"; fi; }
fila() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$RESULTADOS"; echo "  [$3] $1. $2"; }
cerrar() {
  local n="$1" nombre="$2" previsto="$3" nota="$4" antes="$5"
  if [ "$FAIL" = "$antes" ]; then fila "$n" "$nombre" "$previsto" "$nota"; else fila "$n" "$nombre" "falla" "$nota"; fi
}

php_s() { php -d opcache.enable=0 -d opcache.enable_cli=0 "$@"; }
json() { php -r '$j=json_decode(stream_get_contents(STDIN), true); $p=explode(".", $argv[1]); foreach ($p as $k) { if ($k==="") continue; if (!is_array($j) || !array_key_exists($k, $j)) exit(2); $j=$j[$k]; } if (is_bool($j)) echo $j ? "true" : "false"; elseif (is_array($j) || is_object($j)) echo json_encode($j, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES); else echo $j;' "$1"; }

API="http://127.0.0.1:$SITE"
DISP="$API/api/contrata/disponibilidad.php"
CREAR="$API/api/contrata/crear-sesion.php"
WH="$API/api/contrata/stripe-webhook.php"

reset_estado() {
  rm -f "$DIR/retenciones.json" "$DIR/sesiones.json" "$DIR/eventos.jsonl" "$DIR/cola.jsonl" "$DIR/cola-estado.jsonl"
}
sembrar() {
  if [ -n "${1:-}" ]; then php_s "$ROOT/scripts/sembrar-disponibilidad.php" "$1"; else php_s "$ROOT/scripts/sembrar-disponibilidad.php"; fi
}
disp() { curl -s "$DISP"; }
csrf() { disp | json csrf; }
crear() {
  local semana="$1" nif="${2:-B12345674}" extra="${3:-}"
  local token body
  token="$(csrf)"
  body="$(php -r 'echo json_encode([
    "csrf"=>$argv[1], "producto"=>"diagnostico", "empresa"=>"Acme SL",
    "email"=>"facturas@example.com", "nif"=>$argv[2], "condiciones"=>"si", "semana"=>$argv[3]
  ], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);' "$token" "$nif" "$semana")"
  if [ -n "$extra" ]; then body="$(php -r '$a=json_decode($argv[1], true); $b=json_decode($argv[2], true); echo json_encode(array_merge($a,$b), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);' "$body" "$extra")"; fi
  curl -s -D "$WORK/hdr" -o "$WORK/body" -w '%{http_code}' -X POST "$CREAR" \
    -H 'Content-Type: application/json' -H "Origin: http://127.0.0.1:$ASTRO" --data "$body"
}
campo() { json "$1" < "$WORK/body"; }
pagar() {
  curl -s -D "$WORK/payhdr" -o "$WORK/paybody" -w '%{http_code}' -X POST \
    "$API/api/contrata/sim/checkout.php?sesion=$1" \
    --data-urlencode "sesion=$1" --data-urlencode "numero=${2:-}" --data-urlencode "accion=$3"
}
estado_ret() {
  php -r '$j=json_decode(file_get_contents($argv[1]), true); $id=$argv[2]; foreach (($j["retenciones"]??[]) as $r) if (($r["sesion"]??"")===$id || ($r["id"]??"")===$id) { echo $r["estado"]??""; exit; }' \
    "$DIR/retenciones.json" "$1"
}
libres() { disp | php -r '$j=json_decode(stream_get_contents(STDIN), true); foreach ($j["semanas"] as $s) if ($s["lunes"]===$argv[1]) { echo $s["libres"]; exit; } echo "no";' "$1"; }
params_ok() {
  php -r '$j=json_decode(file_get_contents($argv[1]), true); $p=$j["sesiones"][$argv[2]]["params"]; exit((($p["tax_id_collection"]["required"] ?? "")==="if_supported" && ($p["consent_collection"]["terms_of_service"] ?? "")==="required" && !isset($p["invoice_creation"])) ? 0 : 1);' "$1" "$2"
}
nif_de_ok() {
  php -r '$j=json_decode(file_get_contents($argv[1]), true); $n=$j["sesiones"][$argv[2]]["cliente"]["nif"]; $m=$j["sesiones"][$argv[2]]["params"]["metadata"]; exit(($n["pais"]==="DE" && $n["verificado"]===false && ($m["nif_verificado"] ?? "")==="0") ? 0 : 1);' "$1" "$2"
}
semana_bloqueada() {
  php -r '$j=json_decode(stream_get_contents(STDIN), true); foreach ($j["semanas"] as $s) if ($s["lunes"]==="2026-11-16") exit(($s["libres"]===0 && $s["bloqueada"]===true && $s["texto_plazas"]===null) ? 0 : 1); exit(1);'
}
firmar() { php_s "$ROOT/tests/contrata/firmar-evento.php" "$1" "$2" "${3:-}" "$WORK/payload.json" "$WORK/stripe.sig"; }
webhook() {
  curl -s -D "$WORK/whhdr" -o "$WORK/whbody" -w '%{http_code}' -X POST "$WH" \
    -H "Stripe-Signature: $(cat "$WORK/stripe.sig")" --data-binary @"$WORK/payload.json"
}
recibidos() { [ -f "$MOCK/received.jsonl" ] && wc -l < "$MOCK/received.jsonl" | tr -d ' ' || echo 0; }
lineas_evento() { grep -c "\"event_id\":\"$1\"" "$MOCK/received.jsonl" 2>/dev/null || true; }

php -S "127.0.0.1:$MOCKP" "$ROOT/tests/contrata/mock-n8n.php" >"$WORK/n8n.log" 2>&1 &
P_N8N=$!
php -S "127.0.0.1:$SITE" -t "$ROOT/public" >"$WORK/php.log" 2>&1 &
P_PHP=$!
P_ASTRO=""
limpiar() {
  kill $P_N8N $P_PHP 2>/dev/null || true
  if [ -n "${P_ASTRO:-}" ]; then kill "$P_ASTRO" 2>/dev/null || true; fi
  if [ -f "${RESULTADOS:-}" ]; then cp "$RESULTADOS" /tmp/contrata-resultados.tsv || true; fi
  rm -rf "$WORK"
}
trap limpiar EXIT
sleep 0.4

cd "$ROOT"
echo "0. Sintaxis, unidad y lógica"
for f in public/lib/contrata.php public/lib/reintentar-contrata.php public/api/contrata/disponibilidad.php public/api/contrata/crear-sesion.php public/api/contrata/stripe-webhook.php public/api/contrata/sim/checkout.php scripts/sembrar-disponibilidad.php tests/contrata/unit.php tests/contrata/abrir.php tests/contrata/firmar-evento.php tests/contrata/clave-live.php; do
  check "php -l $(basename "$f")" 'php -l "$ROOT/$f" >/dev/null'
done
check "unit.php" 'php_s tests/contrata/unit.php >/dev/null'
check "lógica JS = PHP" 'node tests/contrata/test-logica.mjs >/dev/null'
check "botón en cerrado" 'node --input-type=module -e "import { estadoBoton } from \"./src/data/contrata-logica.mjs\"; const e = estadoBoton({ok:false}); if (e.href !== \"/#contacto\" || e.nota !== null || !e.texto.startsWith(\"Reserva\")) process.exit(1);"'

if ! sembrar >/dev/null; then echo "No se ha podido sembrar la disponibilidad" >&2; exit 1; fi

echo "1. Camino feliz (simulado)"
A=$(FAIL)
reset_estado
CODE=$(crear "$SEMANA_A")
SESION=$(campo sesion || true)
check "abre sesión de test" '[ "$CODE" = 200 ] && [[ "$SESION" == cs_test_* ]]'
check "total 592,90 €" '[ "$(campo total_centimos || true)" = 59290 ]'
check "la URL es el simulador local" 'campo url | grep -q "/api/contrata/sim/checkout.php?sesion=cs_test_"'
check "pide NIF y condiciones, sin factura automática" 'params_ok "$DIR/sesiones.json" "$SESION"'
PAY=$(pagar "$SESION" 4242424242424242 pagar)
check "pagar redirige a gracias" '[ "$PAY" = 303 ] && grep -qi "^Location:.*gracias" "$WORK/payhdr"'
check "la plaza baja a 0" '[ "$(libres "$SEMANA_A")" = 0 ]'
check "la siguiente semana sigue libre" '[ "$(libres "$SEMANA_B")" = 1 ]'
check "un aviso de pago firmado" '[ "$(grep -c checkout.session.completed "$MOCK/received.jsonl")" = 1 ]'
ULT=$(tail -1 "$MOCK/received.jsonl")
check "el aviso lleva firma válida" 'echo "$ULT" | grep -q "\"ok\":true"'
cerrar 1 "Camino feliz" simulada "Sesión, webhook firmado, plaza −1 y cola. No hay recibo, deal, evento ni correo reales." "$A"

echo "2. 3D Secure simulado"
A=$(FAIL)
reset_estado
: > "$MOCK/received.jsonl"
CODE=$(crear "$SEMANA_B")
S3=$(campo sesion)
R3=$(pagar "$S3" 4000000000003220 pagar)
check "pide autenticación simulada" '[ "$R3" = 200 ] && grep -q "Autenticación simulada" "$WORK/paybody"'
check "la retención sigue" '[ "$(estado_ret "$S3")" = retenida ]'
F3=$(pagar "$S3" "" 3ds_fail)
check "el fallo no cobra" '[ "$F3" = 200 ] && grep -q "No se ha cobrado nada" "$WORK/paybody" && [ "$(estado_ret "$S3")" = retenida ]'
CODE=$(crear "$SEMANA_A")
S4=$(campo sesion)
pagar "$S4" 4000000000003220 pagar >/dev/null
O3=$(pagar "$S4" "" 3ds_ok)
check "el éxito simulado marca pagada" '[ "$O3" = 303 ] && [ "$(estado_ret "$S4")" = pagada ]'
cerrar 2 "3D Secure" simulada "Éxito y fallo con eventos firmados. No es un reto 3DS de un banco." "$A"

echo "3. Tarjeta rechazada"
A=$(FAIL)
reset_estado
: > "$MOCK/received.jsonl"
CODE=$(crear "$SEMANA_A")
SR=$(campo sesion)
EXPIRA=$(campo expira)
D1=$(pagar "$SR" 4000000000000002 pagar)
check "0002 no cobra y conserva la retención" '[ "$D1" = 200 ] && grep -q "Tarjeta rechazada" "$WORK/paybody" && [ "$(estado_ret "$SR")" = retenida ]'
CODE=$(crear "$SEMANA_B")
SR2=$(campo sesion)
D2=$(pagar "$SR2" 4000000000009995 pagar)
check "9995 tampoco cobra" '[ "$D2" = 200 ] && [ "$(estado_ret "$SR2")" = retenida ]'
CONTRATA_AHORA=$(( $(date +%s) + 2000 )) php_s "$ROOT/public/lib/reintentar-contrata.php" >"$WORK/cron-rechazo.txt"
unset CONTRATA_AHORA || true
check "el barrido suelta las dos" '[ "$(estado_ret "$SR")" = liberada ] && [ "$(estado_ret "$SR2")" = liberada ]'
check "no hubo aviso de pago" '[ "$(grep -c checkout.session.completed "$MOCK/received.jsonl" || true)" = 0 ]'
cerrar 3 "Tarjeta rechazada" pasa "Rechazo simulado y barrido por reloj del cron. No es una tarjeta real." "$A"

echo "4. Expiración"
A=$(FAIL)
reset_estado
CODE=$(crear "$SEMANA_A")
SE=$(campo sesion)
EX=$(pagar "$SE" "" abandonar)
check "abandonar libera" '[ "$EX" = 303 ] && grep -qi cancelado "$WORK/payhdr" && [ "$(estado_ret "$SE")" = liberada ]'
check "la plaza vuelve" '[ "$(libres "$SEMANA_A")" = 1 ]'
cerrar 4 "Expiración" pasa "checkout.session.expired firmado en local. No se ha expirado desde el Dashboard." "$A"

echo "5. Última plaza en concurrencia"
A=$(FAIL)
reset_estado
TOKEN=$(csrf)
php -r 'echo json_encode(["csrf"=>$argv[1],"producto"=>"diagnostico","empresa"=>"Acme SL","email"=>"facturas@example.com","nif"=>"B12345674","condiciones"=>"si","semana"=>$argv[2]], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);' "$TOKEN" "$SEMANA_A" > "$WORK/paralelo.json"
php_s "$ROOT/tests/contrata/abrir.php" < "$WORK/paralelo.json" > "$WORK/p1.json" &
php_s "$ROOT/tests/contrata/abrir.php" < "$WORK/paralelo.json" > "$WORK/p2.json" &
wait
OKN=$(grep -h '"ok":true' "$WORK/p1.json" "$WORK/p2.json" | wc -l | tr -d ' ')
COMP=$(grep -h 'semana_completa' "$WORK/p1.json" "$WORK/p2.json" | wc -l | tr -d ' ')
check "uno entra y el otro ve la semana completa" '[ "$OKN" = 1 ] && [ "$COMP" = 1 ]'
RETS=$(php -r '$j=json_decode(file_get_contents($argv[1]), true); $n=0; foreach ($j["retenciones"] as $r) if (($r["estado"]??"")==="retenida") $n++; echo $n;' "$DIR/retenciones.json")
check "solo una retención activa" '[ "$RETS" = 1 ]'
cerrar 5 "Última plaza en concurrencia" pasa "Dos procesos CLI y flock. php -S es de un solo hilo; no es concurrencia HTTP." "$A"

echo "6. Webhook duplicado"
A=$(FAIL)
reset_estado
: > "$MOCK/received.jsonl"
CODE=$(crear "$SEMANA_B")
SD=$(campo sesion)
firmar "$SD" checkout.session.completed evt_test_duplicado_fijo
W1=$(webhook)
W2=$(webhook)
check "el primero entra y el segundo es duplicado" '[ "$W1" = 200 ] && [ "$W2" = 200 ] && grep -q "\"duplicado\":true" "$WORK/whbody"'
check "un solo aviso a n8n" '[ "$(lineas_evento evt_test_duplicado_fijo)" = 1 ]'
NCOLA=$(grep -c evt_test_duplicado_fijo "$DIR/cola.jsonl" || true)
check "una sola fila en la cola" '[ "$NCOLA" = 1 ]'
cerrar 6 "Webhook duplicado" simulada "El PHP deduplica por event.id. No se ha creado un deal en HubSpot." "$A"

echo "7. Firma no válida"
A=$(FAIL)
EV_ANTES=$(wc -l < "$DIR/eventos.jsonl" | tr -d ' ')
COLA_ANTES=$(wc -l < "$DIR/cola.jsonl" | tr -d ' ')
echo '{"id":"evt_test_mala","object":"event","type":"checkout.session.completed","data":{"object":{}}}' > "$WORK/payload.json"
echo 't=1,v1=00' > "$WORK/stripe.sig"
WM=$(webhook)
check "firma mala → 400" '[ "$WM" = 400 ]'
check "no procesa nada" '[ "$(wc -l < "$DIR/eventos.jsonl" | tr -d " ")" = "$EV_ANTES" ] && [ "$(wc -l < "$DIR/cola.jsonl" | tr -d " ")" = "$COLA_ANTES" ]'
cerrar 7 "Firma no válida" pasa "400 y sin cambios en eventos ni en la cola." "$A"

echo "8. n8n caído"
A=$(FAIL)
reset_estado
: > "$MOCK/received.jsonl"
echo 500 > "$MOCK/mode"
CODE=$(crear "$SEMANA_A")
SN=$(campo sesion)
firmar "$SN" checkout.session.completed evt_test_n8n_caido
WN=$(webhook)
check "el pago se guarda aunque n8n falle" '[ "$WN" = 200 ] && [ "$(estado_ret "$SN")" = pagada ]'
check "la cola marca error" 'grep -q "\"estado\":\"error\"" "$DIR/cola-estado.jsonl"'
echo 200 > "$MOCK/mode"
php_s "$ROOT/public/lib/reintentar-contrata.php" >"$WORK/cron-n8n.txt"
check "el cron reenvía" 'grep evt_test_n8n_caido "$DIR/cola-estado.jsonl" | grep -q "\"estado\":\"enviado\""'
check "dos entregas del mismo id, no un alta nueva" '[ "$(lineas_evento evt_test_n8n_caido)" = 2 ] && [ "$(grep -c evt_test_n8n_caido "$DIR/cola.jsonl")" = 1 ]'
cerrar 8 "n8n caído" pasa "El mock responde 500 y luego 200. El cron reintenta el mismo aviso." "$A"

echo "9. Fallo en cerrado"
A=$(FAIL)
cp "$DIR/disponibilidad.json" "$WORK/disp-buena.json"
php -r '$j=json_decode(file_get_contents($argv[1]), true); $j["generado"]=gmdate("c", time()-4*3600); file_put_contents($argv[1], json_encode($j, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));' "$DIR/disponibilidad.json"
HUELLA=$(sha256sum "$DIR/disponibilidad.json" | awk '{print $1}')
CERR=$(disp)
check "datos viejos: fallo en cerrado" 'echo "$CERR" | json fallo | grep -qx cerrado'
check "sin fechas ni escasez" '! echo "$CERR" | grep -q "2026-11" && ! echo "$CERR" | grep -q Quedan && ! echo "$CERR" | grep -q "Queda "'
check "hay texto de reserva" 'echo "$CERR" | grep -q "Reserva tu diagnóstico"'
curl -s -o "$WORK/mala.txt" -w '%{http_code}' -X POST "$DISP" -H 'X-Sobtree-Timestamp: 1' -H 'X-Sobtree-Signature: sha256=00' --data '{"generado":"x"}' > "$WORK/mala.code"
check "firma mala no sustituye" '[ "$(cat "$WORK/mala.code")" = 401 ] && [ "$(sha256sum "$DIR/disponibilidad.json" | cut -d" " -f1)" = "$HUELLA" ]'
rm -f "$DIR/alerta-frescura"
: > "$WORK/alerta.txt"
CONTRATA_TEST_MAIL_LOG="$WORK/alerta.txt" php_s "$ROOT/public/lib/reintentar-contrata.php" >/dev/null
check "el cron deja constancia, sin correo real" 'grep -q "más de 3 horas" "$WORK/alerta.txt" && ! grep -q "@" "$WORK/alerta.txt"'
cp "$WORK/disp-buena.json" "$DIR/disponibilidad.json"
check "al restaurar vuelve la disponibilidad" '[ "$(disp | json ok)" = true ]'
cerrar 9 "Fallo en cerrado" pasa "JSON de más de 3 h y firma mala. El botón, en la lógica compartida, va al formulario. La alerta no se ha enviado por correo." "$A"

echo "10. Bloqueo"
A=$(FAIL)
reset_estado
cat > "$WORK/fixture.json" <<'JSON'
{"proyectos":[],"bloqueos":[{"inicio":"2026-11-16","fin":"2026-11-21"}]}
JSON
sembrar "$WORK/fixture.json" >/dev/null
BLOQ=$(disp)
check "la semana bloqueada tiene 0 y sin escasez" 'echo "$BLOQ" | semana_bloqueada'
check "otra semana sigue en 1" '[ "$(libres "$SEMANA_B")" = 1 ]'
sembrar >/dev/null
cerrar 10 "Bloqueo" pasa "Publicación firmada con un bloqueo de calendario. Google no se ha llamado." "$A"

echo "11. Reembolso"
A=$(FAIL)
reset_estado
: > "$MOCK/received.jsonl"
CODE=$(crear "$SEMANA_A")
SREF=$(campo sesion)
firmar "$SREF" checkout.session.completed evt_test_antes_reembolso
webhook >/dev/null
check "ocupa la plaza" '[ "$(libres "$SEMANA_A")" = 0 ]'
firmar "$SREF" charge.refunded evt_test_reembolso
WR=$(webhook)
check "queda reembolsada y la plaza vuelve" '[ "$WR" = 200 ] && [ "$(estado_ret "$SREF")" = reembolsada ] && [ "$(libres "$SEMANA_A")" = 1 ]'
check "n8n simulado recibe el reembolso" 'grep -q charge.refunded "$MOCK/received.jsonl"'
cerrar 11 "Reembolso" simulada "charge.refunded firmado actualiza el PHP. No se ha reembolsado en el Dashboard ni borrado un evento." "$A"

echo "12. NIF-IVA UE"
A=$(FAIL)
reset_estado
CODE=$(crear "$SEMANA_A" "123")
check "NIF mal formado → 422" '[ "$CODE" = 422 ]'
CODE=$(crear "$SEMANA_B" "DE123456789")
SDE=$(campo sesion)
check "acepta el formato DE y cobra el 21 %" '[ "$CODE" = 200 ] && [ "$(campo total_centimos)" = 59290 ]'
check "no marca verificado" 'nif_de_ok "$DIR/sesiones.json" "$SDE"'
: > "$MOCK/received.jsonl"
firmar "$SDE" checkout.session.completed evt_test_iva_de
webhook >/dev/null
check "alerta de facturar y sin llamada a VIES" 'grep -q revisar_antes_de_facturar "$DIR/cola.jsonl" && ! grep -q "ec.europa.eu" "$ROOT/public/lib/contrata.php"'
cerrar 12 "NIF-IVA UE" pasa "Formato y 21 % con alerta. VIES no se ha llamado." "$A"

echo "13. Separación de calendarios"
A=$(FAIL)
check "JSON y nodos Code" 'node tests/contrata/test-n8n.mjs'
cerrar 13 "Separación de calendarios" simulada "Revisión estática: dos IDs placeholder, nodos de Google deshabilitados y workflow inactivo. La ejecución real en n8n queda pendiente de cuenta." "$A"

echo "14. Accesibilidad y móvil"
A=$(FAIL)
if [ ! -d /tmp/contrata-pptr/node_modules/puppeteer-core ]; then
  mkdir -p /tmp/contrata-pptr
  ( cd /tmp/contrata-pptr && npm init -y >/dev/null 2>&1 && npm install --silent puppeteer-core >/dev/null )
fi
export PUBLIC_CONTRATA_ACTIVO=1 CONTRATA_PHP_ORIGIN="http://127.0.0.1:$SITE"
npx astro dev --host 127.0.0.1 --port "$ASTRO" >"$WORK/astro.log" 2>&1 &
P_ASTRO=$!
listo=0
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:$ASTRO/" >/dev/null; then listo=1; break; fi
  sleep 0.5
done
check "Astro en marcha" '[ "$listo" = 1 ]'
if [ "$listo" = 1 ]; then
  check "teclado a 360 px" 'PPTR_ROOT=/tmp/contrata-pptr node tests/contrata/a11y.mjs "http://127.0.0.1:$ASTRO"'
fi
ASTRO_PID="$P_ASTRO"
kill "$ASTRO_PID" 2>/dev/null || true
P_ASTRO=""
wait "$ASTRO_PID" 2>/dev/null || true
cerrar 14 "Accesibilidad y móvil" pasa "Teclado y 360 px hasta el pago simulado. Hay empresa, email y NIF antes de Stripe: no son tres clics literales." "$A"

echo "15. Contenido del build"
A=$(FAIL)
unset PUBLIC_CONTRATA_ACTIVO || true
env -u PUBLIC_CONTRATA_ACTIVO npm run build >"$WORK/build.log" 2>&1
BUILD_OK=$?
check "build de producción" '[ "$BUILD_OK" = 0 ]'
check "dist sin /contratar/" '! grep -RIn --binary-files=without-match "/contratar/" "$ROOT/dist"'
check "dist sin el botón" '! grep -RIn --binary-files=without-match "id=\"contrata-boton\"" "$ROOT/dist"'
check "dist sin claves" '! grep -RInE --binary-files=without-match "sk_|rk_|whsec_" "$ROOT/dist"'
check "sitemap sin contratar" '! grep -RIn contratar "$ROOT/dist" --include="sitemap*.xml"'
check "clave live rechazada en otro proceso" 'php_s tests/contrata/clave-live.php >/dev/null'
cerrar 15 "Contenido de dist" pasa "Build con el flag apagado. Precio contrastado en unit.php (490 € + 21 % = 592,90 €). La regla CSS #contrata-boton puede quedar en la hoja y no pinta el botón." "$A"

echo
echo "Resultados"
printf '%s\t%s\t%s\t%s\n' "n" "nombre" "resultado" "nota"
cat "$RESULTADOS"
echo
echo "aserciones ok=$PASS fallos=$FAIL"
cp "$RESULTADOS" /tmp/contrata-resultados.tsv
if [ "$FAIL" != 0 ]; then exit 1; fi

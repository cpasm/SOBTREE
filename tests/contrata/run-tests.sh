#!/usr/bin/env bash
# Las 15 pruebas del diseño de Contrata, con simulación local.
# No llama a Stripe, Google ni n8n reales. No cobra y no envía correo.
# Uso: npm run test:contrata
set -u
# Las pruebas y la demo nunca usan claves reales: se descartan las del entorno antes de empezar.
unset STRIPE_RESTRICTED_KEY STRIPE_PREP_KEY STRIPE_WEBHOOK_SECRET STRIPE_KEY STRIPE_PRICE_DIAGNOSTICO STRIPE_TAX_RATE_IVA21 CONTRATA_HMAC_SECRET CONTRATA_N8N_WEBHOOK_URL
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
  php -r '$j=json_decode(file_get_contents($argv[1]), true); $p=$j["sesiones"][$argv[2]]["params"];
    $ok = ($p["invoice_creation"]["enabled"] ?? "")==="true"
      && ($p["billing_address_collection"] ?? "")==="required"
      && ($p["customer_update"]["address"] ?? "")==="auto"
      && !empty($p["customer"]) && !isset($p["customer_email"])
      && !isset($p["tax_id_collection"])
      && preg_match("/^txr_/", $p["line_items"][0]["tax_rates"][0] ?? "")===1
      && ($p["consent_collection"]["terms_of_service"] ?? "")==="required"
      && str_contains($p["custom_text"]["terms_of_service_acceptance"]["message"] ?? "", "/condiciones/")
      && str_contains($p["custom_text"]["submit"]["message"] ?? "", "máximo 10 días laborables.");
    exit($ok ? 0 : 1);' "$1" "$2"
}
semana_bloqueada() {
  php -r '$j=json_decode(stream_get_contents(STDIN), true); foreach ($j["semanas"] as $s) if ($s["lunes"]==="2026-11-16") exit(($s["libres"]===0 && $s["bloqueada"]===true && $s["texto_plazas"]===null) ? 0 : 1); exit(1);'
}
firmar() {
  local extra="${4:-}"
  [ -n "$extra" ] || extra='{}'
  php_s "$ROOT/tests/contrata/firmar-evento.php" "$1" "$2" "${3:-}" "$WORK/payload.json" "$WORK/stripe.sig" "$extra"
}
webhook() {
  curl -s -D "$WORK/whhdr" -o "$WORK/whbody" -w '%{http_code}' -X POST "$WH" \
    -H "Stripe-Signature: $(cat "$WORK/stripe.sig")" --data-binary @"$WORK/payload.json"
}
recibidos() { [ -f "$MOCK/received.jsonl" ] && wc -l < "$MOCK/received.jsonl" | tr -d ' ' || echo 0; }
lineas_evento() { grep -c "\"event_id\":\"$1\"" "$MOCK/received.jsonl" 2>/dev/null || true; }
cola_enviada() {
  php -r '$evento=$argv[1]; $id=""; foreach (file($argv[2], FILE_IGNORE_NEW_LINES) as $l) { $j=json_decode($l, true); if (($j["event_id"] ?? "")===$evento) $id=$j["id"] ?? ""; } $u=""; foreach (file($argv[3], FILE_IGNORE_NEW_LINES) as $l) { $j=json_decode($l, true); if (($j["id"] ?? "")===$id) $u=$j["estado"] ?? ""; } exit($id!=="" && $u==="enviado" ? 0 : 1);' "$1" "$2" "$3"
}

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
for f in public/lib/contrata.php public/lib/reintentar-contrata.php public/api/contrata/disponibilidad.php public/api/contrata/crear-sesion.php public/api/contrata/stripe-webhook.php public/api/contrata/sim/checkout.php scripts/sembrar-disponibilidad.php tests/contrata/unit.php tests/contrata/abrir.php tests/contrata/firmar-evento.php tests/contrata/clave-live.php tests/contrata/stripe-mock.php tests/contrata/mock-stripe.php scripts/stripe-preparar.php; do
  check "php -l $(basename "$f")" 'php -l "$ROOT/$f" >/dev/null'
done
check "unit.php" 'php_s tests/contrata/unit.php >/dev/null'
check "lógica JS = PHP" 'node tests/contrata/test-logica.mjs >/dev/null'
check "botón en cerrado" 'node --input-type=module -e "import { estadoBoton } from \"./src/data/contrata-logica.mjs\"; const e = estadoBoton({ok:false}); if (e.href !== \"/#contacto\" || e.nota !== null || !e.texto.startsWith(\"Reserva\")) process.exit(1);"'

if ! sembrar >/dev/null; then echo "No se ha podido sembrar la disponibilidad" >&2; exit 1; fi

echo "1. Camino feliz (simulado)"
A=$FAIL
reset_estado
CODE=$(crear "$SEMANA_A")
SESION=$(campo sesion || true)
check "abre sesión de test" '[ "$CODE" = 200 ] && [[ "$SESION" == cs_test_* ]]'
check "total 592,90 €" '[ "$(campo total_centimos || true)" = 59290 ]'
check "la URL es el simulador local" 'campo url | grep -q "/api/contrata/sim/checkout.php?sesion=cs_test_"'
check "factura automática, dirección obligatoria, IVA 21 % incluido, cliente con NIF y condiciones" 'params_ok "$DIR/sesiones.json" "$SESION"'
PAY=$(pagar "$SESION" 4242424242424242 pagar)
check "pagar redirige a gracias" '[ "$PAY" = 303 ] && grep -qi "^Location:.*gracias" "$WORK/payhdr"'
check "la plaza baja a 0" '[ "$(libres "$SEMANA_A")" = 0 ]'
check "la siguiente semana sigue libre" '[ "$(libres "$SEMANA_B")" = 1 ]'
check "un aviso de pago firmado" '[ "$(grep -c checkout.session.completed "$MOCK/received.jsonl")" = 1 ]'
ULT=$(tail -1 "$MOCK/received.jsonl")
check "el aviso lleva firma válida" 'echo "$ULT" | grep -q "\"ok\":true"'
cerrar 1 "Camino feliz" simulada "Sesión, webhook firmado, plaza −1 y cola. No hay recibo, fila en la hoja de Ventas, evento ni correo reales." "$A"

echo "2. 3D Secure simulado"
A=$FAIL
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
A=$FAIL
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
A=$FAIL
reset_estado
CODE=$(crear "$SEMANA_A")
SE=$(campo sesion)
EX=$(pagar "$SE" "" abandonar)
check "abandonar libera" '[ "$EX" = 303 ] && grep -qi cancelado "$WORK/payhdr" && [ "$(estado_ret "$SE")" = liberada ]'
check "la plaza vuelve" '[ "$(libres "$SEMANA_A")" = 1 ]'
cerrar 4 "Expiración" pasa "checkout.session.expired firmado en local. No se ha expirado desde el Dashboard." "$A"

echo "5. Última plaza en concurrencia"
A=$FAIL
reset_estado
TOKEN=$(csrf)
php -r 'echo json_encode(["csrf"=>$argv[1],"producto"=>"diagnostico","empresa"=>"Acme SL","email"=>"facturas@example.com","nif"=>"B12345674","condiciones"=>"si","semana"=>$argv[2]], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);' "$TOKEN" "$SEMANA_A" > "$WORK/paralelo.json"
php_s "$ROOT/tests/contrata/abrir.php" < "$WORK/paralelo.json" > "$WORK/p1.json" &
P1=$!
php_s "$ROOT/tests/contrata/abrir.php" < "$WORK/paralelo.json" > "$WORK/p2.json" &
P2=$!
wait "$P1" "$P2"
OKN=$(grep -h '"ok":true' "$WORK/p1.json" "$WORK/p2.json" | wc -l | tr -d ' ')
COMP=$(grep -h 'semana_completa' "$WORK/p1.json" "$WORK/p2.json" | wc -l | tr -d ' ')
check "uno entra y el otro ve la semana completa" '[ "$OKN" = 1 ] && [ "$COMP" = 1 ]'
RETS=$(php -r '$j=json_decode(file_get_contents($argv[1]), true); $n=0; foreach ($j["retenciones"] as $r) if (($r["estado"]??"")==="retenida") $n++; echo $n;' "$DIR/retenciones.json")
check "solo una retención activa" '[ "$RETS" = 1 ]'
cerrar 5 "Última plaza en concurrencia" pasa "Dos procesos CLI y flock. php -S es de un solo hilo; no es concurrencia HTTP." "$A"

echo "6. Webhook duplicado"
A=$FAIL
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
cerrar 6 "Webhook duplicado" simulada "El PHP deduplica por event.id. No se ha escrito en la hoja de Ventas." "$A"

echo "7. Firma no válida"
A=$FAIL
EV_ANTES=$(wc -l < "$DIR/eventos.jsonl" | tr -d ' ')
COLA_ANTES=$(wc -l < "$DIR/cola.jsonl" | tr -d ' ')
echo '{"id":"evt_test_mala","object":"event","type":"checkout.session.completed","data":{"object":{}}}' > "$WORK/payload.json"
echo 't=1,v1=00' > "$WORK/stripe.sig"
WM=$(webhook)
check "firma mala → 400" '[ "$WM" = 400 ]'
check "no procesa nada" '[ "$(wc -l < "$DIR/eventos.jsonl" | tr -d " ")" = "$EV_ANTES" ] && [ "$(wc -l < "$DIR/cola.jsonl" | tr -d " ")" = "$COLA_ANTES" ]'
cerrar 7 "Firma no válida" pasa "400 y sin cambios en eventos ni en la cola." "$A"

echo "8. n8n caído"
A=$FAIL
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
check "el cron reenvía" 'cola_enviada evt_test_n8n_caido "$DIR/cola.jsonl" "$DIR/cola-estado.jsonl"'
check "dos entregas del mismo id, no un alta nueva" '[ "$(lineas_evento evt_test_n8n_caido)" = 2 ] && [ "$(grep -c evt_test_n8n_caido "$DIR/cola.jsonl")" = 1 ]'
cerrar 8 "n8n caído" pasa "El mock responde 500 y luego 200. El cron reintenta el mismo aviso." "$A"

echo "9. Fallo en cerrado"
A=$FAIL
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
A=$FAIL
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

echo "10b. Proyecto con sesión live en el calendario (publicación y retención)"
A=$FAIL
reset_estado
CODE=$(crear "$SEMANA_A")
SLV=$(campo sesion)
check "retención de la semana A abierta (la plaza está ocupada)" '[ "$CODE" = 200 ] && [ "$(libres "$SEMANA_A")" = 0 ]'
cat > "$WORK/fixture-live.json" <<'JSON'
{"proyectos":[{"inicio":"2026-11-02","fin":"2026-11-07","sesion":"cs_live_Ab12Cd34Ef56Gh78Ij90"}],"bloqueos":[]}
JSON
SEM_LIVE=$(sembrar "$WORK/fixture-live.json"); SEM_LIVE_RC=$?
check "la publicación con un proyecto cs_live_ se acepta" '[ "$SEM_LIVE_RC" = 0 ] && echo "$SEM_LIVE" | json ok | grep -qx true'
check "la semana A sigue en 0 y el resto no se ve afectado" '[ "$(libres "$SEMANA_A")" = 0 ] && [ "$(libres "$SEMANA_B")" = 1 ]'
php -r '$f=$argv[1]; $j=json_decode(file_get_contents($f), true); foreach ($j["retenciones"] as &$r) $r["sesion"]="cs_live_Ab12Cd34Ef56Gh78Ij90"; file_put_contents($f, json_encode($j));' "$DIR/retenciones.json"
check "con la retención casada por la misma sesión cs_live_ no se cuenta doble (0, no negativo; sigue siendo 0 y no cierra)" '[ "$(libres "$SEMANA_A")" = 0 ] && [ "$(disp | json ok)" = true ]'
php -r '$f=$argv[1]; $j=json_decode(file_get_contents($f), true); foreach ($j["retenciones"] as &$r) $r["sesion"]="cs_live_OtraSesion"; file_put_contents($f, json_encode($j));' "$DIR/retenciones.json"
cat > "$WORK/fixture-live2.json" <<'JSON'
{"proyectos":[],"bloqueos":[]}
JSON
sembrar "$WORK/fixture-live2.json" >/dev/null
check "sin el proyecto en el calendario, la retención sigue ocupando la plaza" '[ "$(libres "$SEMANA_A")" = 0 ]'
sembrar >/dev/null
cerrar "10b" "Sesión live en el calendario" pasa "Se siembra una publicación firmada con un proyecto cs_live_. Antes de este cambio el PHP la rechazaba (400) y la disponibilidad se quedaba vieja." "$A"

echo "11. Reembolso"
A=$FAIL
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

echo "12. Solo España: NIF/CIF español, NIF-IVA UE rechazado"
A=$FAIL
reset_estado
CODE=$(crear "$SEMANA_A" "123")
check "NIF mal formado → 422" '[ "$CODE" = 422 ]'
CODE=$(crear "$SEMANA_B" "DE123456789")
check "un NIF-IVA de otro país no abre el pago (422, fuera_de_espana)" '[ "$CODE" = 422 ] && [ "$(campo motivo)" = fuera_de_espana ]'
check "y no deja ninguna plaza retenida" '[ ! -f "$DIR/retenciones.json" ] || [ "$(grep -c "\"estado\":\"retenida\"" "$DIR/retenciones.json" || true)" = 0 ]'
check "la web no llama a VIES" '! grep -q "ec.europa.eu" "$ROOT/public/lib/contrata.php"'
CODE=$(crear "$SEMANA_B" "ESB12345674")
SES=$(campo sesion)
check "un NIF-IVA español (prefijo ES) sí entra" '[ "$CODE" = 200 ]'
cerrar 12 "Solo España" pasa "El NIF-IVA UE se rechaza con mensaje de contacto: sin inversión del sujeto pasivo automática. VIES no se llama." "$A"

echo "12b. NIF hasta la fila de Ventas, sin logs"
A=$FAIL
reset_estado
: > "$MOCK/received.jsonl"
CODE=$(crear "$SEMANA_A" "B12345674")
SNI=$(campo sesion)
check "la retención guarda el NIF solo hasta el pago" 'grep -q "B12345674" "$DIR/retenciones.json"'
pagar "$SNI" 4242424242424242 pagar >/dev/null
ULT=$(tail -1 "$MOCK/received.jsonl")
check "el aviso a n8n lleva el NIF, coincide con Stripe y no hay alerta" 'echo "$ULT" | php -r '"'"'$j=json_decode(stream_get_contents(STDIN), true); exit(($j["nif"]==="B12345674" && $j["nif_coincide"]===true && $j["alerta"]==="") ? 0 : 1);'"'"''
check "entregado el aviso, el NIF desaparece de la retención y de la cola" '! grep -q "B12345674" "$DIR/retenciones.json" && ! grep -q "B12345674" "$DIR/cola.jsonl"'
check "ni en la auditoría, ni en el estado de la cola, ni en el log de PHP" '! grep -rq "B12345674" "$DIR/auditoria.jsonl" "$DIR/cola-estado.jsonl" "$DIR/eventos.jsonl" "$WORK/php.log" 2>/dev/null'
CODE=$(crear "$SEMANA_B" "B12345674")
SDIS=$(campo sesion)
: > "$MOCK/received.jsonl"
firmar "$SDIS" checkout.session.completed evt_test_nif_distinto '{"customer_details":{"email":"facturas@example.com","address":{"country":"ES","postal_code":"28001"},"tax_ids":[{"type":"es_cif","value":"A58818501"}]}}'
webhook >/dev/null
ULT=$(tail -1 "$MOCK/received.jsonl")
check "si Stripe guarda otro NIF, el aviso lo marca nif_distinto y la fila irá a revisar" 'echo "$ULT" | php -r '"'"'$j=json_decode(stream_get_contents(STDIN), true); exit(($j["nif_coincide"]===false && $j["alerta"]==="nif_distinto") ? 0 : 1);'"'"''
CODE=$(crear "$SEMANA_C" "B12345674")
SCAN=$(campo sesion)
: > "$MOCK/received.jsonl"
firmar "$SCAN" checkout.session.completed evt_test_canarias '{"customer_details":{"email":"facturas@example.com","address":{"country":"ES","postal_code":"35001"},"tax_ids":[]}}'
webhook >/dev/null
ULT=$(tail -1 "$MOCK/received.jsonl")
check "dirección de Canarias: alerta territorio_sin_iva" 'echo "$ULT" | grep -q "\"alerta\":\"territorio_sin_iva\""'
CODE=$(crear "$SEMANA_A" "B12345674")
SNP=$(campo sesion)
: > "$MOCK/received.jsonl"
firmar "$SNP" checkout.session.completed evt_test_no_pagado '{"payment_status":"unpaid"}'
webhook >/dev/null
check "un checkout.session.completed sin pago (unpaid) no crea venta ni aviso" '[ "$(lineas_evento evt_test_no_pagado)" = 0 ]'
cerrar 12b "NIF a Ventas" simulada "El NIF viaja en el aviso firmado y se cruza con el tax_id de Stripe. No se escribe en logs ni se guarda tras entregarlo." "$A"

echo "19. Selector de servicio: solo valen los ids de la lista"
A=$FAIL
reset_estado
check "disponibilidad publica la lista de servicios con importes (diagnóstico 490 + IVA = 592,90)" 'disp | php -r '"'"'$j=json_decode(stream_get_contents(STDIN), true); $s=$j["servicios"][0] ?? []; exit((count($j["servicios"])===1 && $s["id"]==="diagnostico" && $s["base_centimos"]===49000 && $s["total_centimos"]===59290 && $s["dias_bloqueo"]===5) ? 0 : 1);'"'"''
for malo in proyecto Diagnostico "diagnostico " "../diagnostico" ""; do
  CODE=$(crear "$SEMANA_A" B12345674 "$(php -r 'echo json_encode(["producto"=>$argv[1]]);' "$malo")")
  check "producto «$malo» → 422 y sin plaza retenida" '[ "$CODE" = 422 ] && { [ ! -f "$DIR/retenciones.json" ] || [ "$(grep -c "\"estado\":\"retenida\"" "$DIR/retenciones.json" || true)" = 0 ]; }'
done
CODE=$(crear "$SEMANA_A" B12345674 '{"producto":["diagnostico"]}')
check "un producto que no es texto → 422" '[ "$CODE" = 422 ]'
CODE=$(crear "$SEMANA_A" B12345674)
SSV=$(campo sesion)
check "diagnóstico: sesión abierta, servicio en la respuesta, en la retención y en los metadatos de Stripe" '[ "$CODE" = 200 ] && [ "$(campo servicio)" = diagnostico ] && grep -qE "\"servicio\": ?\"diagnostico\"" "$DIR/retenciones.json" && php -r '"'"'$j=json_decode(file_get_contents($argv[1]), true); $p=$j["sesiones"][$argv[2]]["params"]; exit((($p["metadata"]["producto"] ?? "")==="diagnostico" && ($p["metadata"]["importe_total_centimos"] ?? "")==="59290") ? 0 : 1);'"'"' "$DIR/sesiones.json" "$SSV"'
: > "$MOCK/received.jsonl"
pagar "$SSV" 4242424242424242 pagar >/dev/null
ULT=$(tail -1 "$MOCK/received.jsonl")
check "el aviso a n8n (Ventas y calendario) lleva el servicio, su nombre y los días de bloqueo" 'echo "$ULT" | php -r '"'"'$j=json_decode(stream_get_contents(STDIN), true); exit(($j["producto"]==="diagnostico" && $j["servicio_nombre"]==="Diagnóstico de implantación de IA" && $j["dias_bloqueo"]===5 && $j["alerta"]==="") ? 0 : 1);'"'"''
CODE=$(crear "$SEMANA_B" B12345674)
SSD=$(campo sesion)
RETD=$(php -r '$j=json_decode(file_get_contents($argv[1]), true); foreach ($j["retenciones"] as $r) if (($r["sesion"]??"")===$argv[2]) echo $r["id"];' "$DIR/retenciones.json" "$SSD")
: > "$MOCK/received.jsonl"
firmar "$SSD" checkout.session.completed evt_test_servicio_raro "$(php -r 'echo json_encode(["metadata"=>["producto"=>"proyecto","retencion_id"=>$argv[1],"semana_lunes"=>$argv[2]]]);' "$RETD" "$SEMANA_B")"
webhook >/dev/null
ULT=$(tail -1 "$MOCK/received.jsonl")
check "un pago de Stripe con un servicio que no está en la lista no se da por bueno: alerta servicio_desconocido y fila a revisar" 'echo "$ULT" | php -r '"'"'$j=json_decode(stream_get_contents(STDIN), true); exit(($j["alerta"]==="servicio_desconocido" && $j["producto"]==="") ? 0 : 1);'"'"''
cerrar 19 "Selector de servicio" simulada "Lista de servicios cerrada en el PHP; el id viaja en la retención, los metadatos de Stripe, el aviso y la fila de Ventas. Hoy solo hay diagnóstico." "$A"

echo "16. Stripe de pruebas (simulado): factura, IVA, NIF y modo test"
A=$FAIL
MS_PORT="${CONTRATA_TEST_STRIPE_PORT:-18085}"
MSD="$WORK/mock-stripe"
mkdir -p "$MSD"
LIVE_K="rk_$(echo live)_mockclave1234abcd"
TEST_K="rk_test_mockclave1234abcd"
export CONTRATA_STRIPE_API_BASE="http://127.0.0.1:$MS_PORT"
MOCK_STRIPE_DIR="$MSD" php -S "127.0.0.1:$MS_PORT" "$ROOT/tests/contrata/mock-stripe.php" >"$WORK/mock-stripe.log" 2>&1 &
P_MS=$!
sleep 0.4
caso() { # nombre modo clave [extra secrets] -> base propia, secretos por fichero
  local nombre="$1" modo="$2" clave="$3" extra="${4:-}"
  local b="$WORK/base-$nombre"
  mkdir -p "$b"
  cat > "$b/sobtree-secrets.php" <<PHP
<?php return [
  'CONTRATA_MODO' => '$modo',
  'STRIPE_RESTRICTED_KEY' => '$clave',
  'STRIPE_PRICE_DIAGNOSTICO' => 'price_mock_1',
  'STRIPE_TAX_RATE_IVA21' => 'txr_mock_1',
  'CONTRATA_HMAC_SECRET' => '$HMAC',
  'CONTRATA_N8N_WEBHOOK_URL' => 'https://127.0.0.1:9/webhook/sobtree-contrata',
  'CONTRATA_PUBLIC_URL' => 'https://sobtree.com',
  $extra
];
PHP
  echo "$b"
}
prep_mock() { # modo(test|live): crea price y tax rate en el mock y devuelve sus ids vía archivos
  local k="$1" modo="$2"
  curl -s -X POST "http://127.0.0.1:$MS_PORT/v1/prices" -H "Authorization: Bearer $k" --data "currency=eur&unit_amount=59290&product=prod_x&lookup_key=mock_$modo" >/dev/null
  curl -s -X POST "http://127.0.0.1:$MS_PORT/v1/tax_rates" -H "Authorization: Bearer $k" --data "display_name=IVA&percentage=21&inclusive=true&country=ES" >/dev/null
}
fijar_ids() { # sustituye price_mock_1 y txr_mock_1 por los ids reales del mock en esa base
  local b="$1" modo="$2"
  php -r '$e=json_decode(file_get_contents($argv[1]), true); $pr=""; $tx=""; foreach ($e["prices"] as $p) if ($p["livemode"]===($argv[3]==="live")) $pr=$p["id"]; foreach ($e["tax_rates"] as $t) if ($t["livemode"]===($argv[3]==="live")) $tx=$t["id"]; $f=$argv[2]."/sobtree-secrets.php"; file_put_contents($f, str_replace(["price_mock_1","txr_mock_1"], [$pr,$tx], file_get_contents($f)));' "$MSD/estado.json" "$b" "$modo"
}
correr() { # base modo-caso
  SOBTREE_BASE_DIR="$1" MOCK_STRIPE_DIR="$MSD" TEST_CASO="$2" php_s "$ROOT/tests/contrata/stripe-mock.php"
}
prep_mock "$TEST_K" test
prep_mock "$LIVE_K" live
WH_T="whsec_$(openssl rand -hex 12)"
WH_L="whsec_$(openssl rand -hex 12)"
B_T=$(caso test stripe_test "$TEST_K" "'STRIPE_WEBHOOK_SECRET' => '$WH_T',")
B_L=$(caso live stripe_live "$LIVE_K" "'STRIPE_WEBHOOK_SECRET' => '$WH_L',")
fijar_ids "$B_T" test
fijar_ids "$B_L" live
: > "$MSD/requests.jsonl"
check "stripe_test: cliente con NIF, factura, IVA 21 % incluido, dirección y eventos" 'correr "$B_T" normal'
echo "17. Cambio a live (simulado): la misma lógica con clave, sesiones y eventos live"
A2=$FAIL
: > "$MSD/requests.jsonl"
check "stripe_live: todo en modo live y los eventos de test se ignoran" 'correr "$B_L" normal'
B_X=$(caso desajuste stripe_test "$LIVE_K" "'STRIPE_WEBHOOK_SECRET' => '$WH_T',")
B_Y=$(caso desajuste2 stripe_live "$TEST_K" "'STRIPE_WEBHOOK_SECRET' => '$WH_L',")
B_Z=$(caso incompleto stripe_live "$LIVE_K" "")
rm -f "$MSD/requests.jsonl"
check "clave live en modo test, clave test en modo live y live sin webhook secret: no abre el pago ni llama a Stripe" 'correr "$B_X" desajuste && correr "$B_Y" desajuste && correr "$B_Z" incompleto'
cerrar 17 "Cambio a live" simulada "Stripe simulado con modo live: no se ha cobrado nada ni se ha tocado la cuenta real. Falta la prueba con la cuenta live del fundador." "$A2"

echo "18. Script de preparación de Stripe (idempotente)"
A3=$FAIL
export STRIPE_PREP_ALLOW_LOCAL=1 STRIPE_PREP_BASE="http://127.0.0.1:$MS_PORT" STRIPE_WEBHOOK_URL="https://sobtree.example/api/contrata/stripe-webhook.php"
rm -rf "$MSD"; mkdir -p "$MSD"
SF="$WORK/whsec-prep.txt"
prep() { STRIPE_PREP_KEY="$1" php_s "$ROOT/scripts/stripe-preparar.php" "${@:2}"; }
check "sin --live y con clave live se niega (2)" '! STRIPE_PREP_KEY="$LIVE_K" php_s "$ROOT/scripts/stripe-preparar.php" --dry-run >/dev/null 2>&1'
check "con clave test y --live se niega" '! prep "$TEST_K" --live --dry-run >/dev/null 2>&1'
check "dry-run no crea nada" 'prep "$TEST_K" --dry-run > "$WORK/prep0.txt" && grep -q "crearía" "$WORK/prep0.txt" && ! grep -q "\"POST\"" "$MSD/requests.jsonl"'
check "sin --secret-file se niega antes de crear nada" '! prep "$TEST_K" >/dev/null 2>&1 && ! grep -q "\"metodo\":\"POST\"" "$MSD/requests.jsonl"'
check "primera ejecución crea Product, Price, tax rate y webhook" 'prep "$TEST_K" --secret-file="$SF" > "$WORK/prep1.txt" && grep -q "Product creado" "$WORK/prep1.txt" && grep -q "Price creado" "$WORK/prep1.txt" && grep -q "Tax rate creado" "$WORK/prep1.txt" && grep -q "Webhook creado" "$WORK/prep1.txt"'
check "el secreto del webhook queda en un fichero 0600 y no sale por pantalla" '[ "$(stat -c %a "$SF")" = 600 ] && grep -q "^whsec_" "$SF" && ! grep -q "whsec_" "$WORK/prep1.txt" && ! grep -q "$TEST_K" "$WORK/prep1.txt"'
POSTS1=$(grep -c "\"metodo\":\"POST\"" "$MSD/requests.jsonl")
check "segunda ejecución no crea nada (idempotente)" 'prep "$TEST_K" --secret-file="$WORK/otro.txt" > "$WORK/prep2.txt" && grep -q "Product ya existe" "$WORK/prep2.txt" && grep -q "Price ya existe" "$WORK/prep2.txt" && grep -q "Tax rate ya existe" "$WORK/prep2.txt" && grep -q "Webhook ya existe" "$WORK/prep2.txt" && [ "$(grep -c "\"metodo\":\"POST\"" "$MSD/requests.jsonl")" = "$POSTS1" ] && [ ! -e "$WORK/otro.txt" ]'
check "imprime los ids para sobtree-secrets.php" 'grep -q "STRIPE_PRICE_DIAGNOSTICO.*price_test_" "$WORK/prep2.txt" && grep -q "STRIPE_TAX_RATE_IVA21.*txr_test_" "$WORK/prep2.txt"'
check "con clave live y --live funciona igual, en el modo live" 'prep "$LIVE_K" --live --secret-file="$WORK/whsec-live.txt" > "$WORK/prep3.txt" && grep -q "LIVE" "$WORK/prep3.txt" && grep -q "price_live_" "$WORK/prep3.txt"'
# Cuenta live con Product, Price y webhook ya creados a mano (IDs reales, sin tax rate): solo se crea el tax rate.
rm -f "$MSD/estado.json" "$MSD/requests.jsonl"
php -r '$u="https://sobtree.example/api/contrata/stripe-webhook.php"; echo json_encode(["products"=>["prod_sobtree_diagnostico"=>["id"=>"prod_sobtree_diagnostico","livemode"=>true,"active"=>true]],
  "prices"=>["price_1UV8OoB7dFxWyrJoJrOXjEy2"=>["id"=>"price_1UV8OoB7dFxWyrJoJrOXjEy2","unit_amount"=>59290,"currency"=>"eur","product"=>"prod_sobtree_diagnostico","lookup_key"=>"sobtree_diagnostico_ia_v1","livemode"=>true,"active"=>true]],
  "webhook_endpoints"=>["we_1UV8P3B7dFxWyrJoZH2bcxkg"=>["id"=>"we_1UV8P3B7dFxWyrJoZH2bcxkg","url"=>$u,"enabled_events"=>["checkout.session.completed","checkout.session.expired","charge.refunded"],"livemode"=>true]]]);' > "$MSD/estado.json"
check "cuenta live ya preparada a mano: reconoce Product, Price (lookup_key) y webhook (URL) y crea solo el tax rate" 'prep "$LIVE_K" --live --dry-run > "$WORK/prep4d.txt" && grep -q "Product ya existe: prod_sobtree_diagnostico" "$WORK/prep4d.txt" && grep -q "Price ya existe: price_1UV8OoB7dFxWyrJoJrOXjEy2" "$WORK/prep4d.txt" && grep -q "Webhook ya existe: we_1UV8P3B7dFxWyrJoZH2bcxkg" "$WORK/prep4d.txt" && grep -q "crearía el tax rate" "$WORK/prep4d.txt" && ! grep -q "\"metodo\":\"POST\"" "$MSD/requests.jsonl"'
check "y al ejecutarlo hace un único POST (el tax rate IVA 21 % incluido, ES) y no escribe el secreto del webhook" 'prep "$LIVE_K" --live > "$WORK/prep4.txt" && [ "$(grep -c "\"metodo\":\"POST\"" "$MSD/requests.jsonl")" = 1 ] && grep "\"metodo\":\"POST\"" "$MSD/requests.jsonl" | grep -q "tax_rates" && grep -q "Tax rate creado: txr_live_" "$WORK/prep4.txt" && grep -q "STRIPE_PRICE_DIAGNOSTICO.*price_1UV8OoB7dFxWyrJoJrOXjEy2" "$WORK/prep4.txt" && ! grep -q "$LIVE_K" "$WORK/prep4.txt"'
rm -f "$MSD/estado.json" "$MSD/requests.jsonl"
php -r 'echo json_encode(["prices"=>["price_1UV8OoB7dFxWyrJoJrOXjEy2"=>["id"=>"price_1UV8OoB7dFxWyrJoJrOXjEy2","unit_amount"=>59290,"currency"=>"eur","product"=>"prod_sobtree_diagnostico","lookup_key"=>null,"livemode"=>true,"active"=>true]],"products"=>["prod_sobtree_diagnostico"=>["id"=>"prod_sobtree_diagnostico","livemode"=>true]]]);' > "$MSD/estado.json"
check "un Price sin lookup_key se reconoce con --price-id y no se duplica" 'prep "$LIVE_K" --live --dry-run --price-id=price_1UV8OoB7dFxWyrJoJrOXjEy2 > "$WORK/prep5.txt" && grep -q "Price ya existe: price_1UV8OoB7dFxWyrJoJrOXjEy2" "$WORK/prep5.txt" && ! grep -q "crearía un Price" "$WORK/prep5.txt"'
cerrar 18 "Script de preparación" simulada "Probado contra Stripe simulado en test y live. Con la cuenta real lo ejecuta el fundador." "$A3"
kill $P_MS 2>/dev/null || true
unset CONTRATA_STRIPE_API_BASE STRIPE_PREP_ALLOW_LOCAL STRIPE_PREP_BASE STRIPE_WEBHOOK_URL
cerrar 16 "Stripe de pruebas (factura, IVA, NIF)" simulada "Stripe simulado: se comprueba la forma de las peticiones (cliente es_cif, invoice_creation, tax rate inclusive, dirección). La primera factura real se verifica en el Dashboard." "$A"

echo "13. Separación de calendarios"
A=$FAIL
check "JSON y nodos Code" 'node tests/contrata/test-n8n.mjs'
cerrar 13 "Separación de calendarios" simulada "Revisión estática y ejecución local de los nodos Code: un solo ID de calendario (marcador), clasificación CONTRATA/BLOQUEO, workflows inactivos. La ejecución real en n8n queda pendiente de cuenta." "$A"

echo "14. Accesibilidad y móvil"
A=$FAIL
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
A=$FAIL
unset PUBLIC_CONTRATA_ACTIVO || true
env -u PUBLIC_CONTRATA_ACTIVO npm run build >"$WORK/build.log" 2>&1
BUILD_OK=$?
check "build de producción" '[ "$BUILD_OK" = 0 ]'
check "dist sin /contratar/" '! grep -RIn --binary-files=without-match "/contratar/" "$ROOT/dist"'
check "dist sin el botón" '! grep -RIn --binary-files=without-match "id=\"contrata-boton\"" "$ROOT/dist"'
check "dist sin claves" '! grep -RInE --binary-files=without-match "sk_|rk_|whsec_" "$ROOT/dist"'
check "sitemap sin contratar" '! grep -RIn contratar "$ROOT/dist" --include="sitemap*.xml"'
check "dist sin /condiciones/ ni enlaces a las condiciones (el marcador solo existe con el flag)" '[ ! -e "$ROOT/dist/condiciones" ] && ! grep -RIn --binary-files=without-match "/condiciones/" "$ROOT/dist"'
check "dist sin «1 semana», «una semana» ni «7 días» de entrega del diagnóstico" '! grep -RInE --binary-files=without-match "(1|una) semana|7 días" "$ROOT/dist" --include="*.html" --include="*.txt" --include="*.json"'
check "clave live rechazada en otro proceso" 'php_s tests/contrata/clave-live.php >/dev/null'
PUBLIC_CONTRATA_ACTIVO=1 npx astro build --outDir "$WORK/dist-on" >"$WORK/build-on.log" 2>&1
check "build con el flag encendido: /condiciones/ pública, indexable (canónica, sin noindex), firmada por Sobtree Holding y sin marcadores pendientes" '[ -f "$WORK/dist-on/condiciones/index.html" ] && ! grep -q "name=\"robots\" content=\"noindex\"" "$WORK/dist-on/condiciones/index.html" && grep -q "rel=\"canonical\" href=\"https://sobtree.com/condiciones/\"" "$WORK/dist-on/condiciones/index.html" && grep -q "Sobtree Holding, S.L." "$WORK/dist-on/condiciones/index.html" && ! grep -qE "PENDIENTE|PROPUESTA|BORRADOR" "$WORK/dist-on/condiciones/index.html" && grep -q "Madrid (España)" "$WORK/dist-on/condiciones/index.html"'
check "con el flag, /contratar/ y /condiciones/ están en el sitemap; la confirmación de pago, no" 'grep -q "<loc>https://sobtree.com/contratar/</loc>" "$WORK"/dist-on/sitemap-0.xml && grep -q "<loc>https://sobtree.com/condiciones/</loc>" "$WORK"/dist-on/sitemap-0.xml && ! grep -q "contratar/gracias" "$WORK"/dist-on/sitemap-0.xml'
check "con el flag, la portada tiene el botón y /contratar/ el selector de servicio (texto fijo con un solo servicio) y el enlace a /condiciones/" 'grep -q "id=\"contrata-boton\"" "$WORK/dist-on/index.html" && grep -q "id=\"contrata-servicio\"" "$WORK/dist-on/contratar/index.html" && grep -q "href=\"/condiciones/\"" "$WORK/dist-on/contratar/index.html" && ! grep -q "name=\"robots\" content=\"noindex\"" "$WORK/dist-on/contratar/index.html"'
check "con el flag, el CTA blanco y la cabecera dicen «Contrata y empieza a ahorrar» y van a /contratar/" 'grep -q "btn-primary\" href=\"/contratar/\" data-contrata-cta" "$WORK/dist-on/index.html" && grep -q "btn-ghost\" href=\"/calculadora/\">Calcula tu ahorro" "$WORK/dist-on/index.html" && grep -q "Prefiero hablar antes" "$WORK/dist-on/index.html" && grep -q "Diagnóstico IA exprés: por aquí se empieza" "$WORK/dist-on/index.html" && grep -q "header-cta\" href=\"/contratar/\"" "$WORK/dist-on/index.html"'
check "con el flag, el bloque de oferta está en el hero y llms.txt apunta a /contratar/" 'python3 "$ROOT/tests/contrata/oferta-en-hero.py" "$WORK/dist-on/index.html" && grep -q "Contrata y empieza a ahorrar: https://sobtree.com/contratar/" "$WORK/dist-on/llms.txt"'
check "sin el flag, el CTA sigue siendo «Reservar 25 min» al formulario y la oferta está en #servicios" 'grep -q "Reservar 25 min" "$ROOT/dist/index.html" && ! grep -q "Contrata y empieza a ahorrar" "$ROOT/dist/index.html" && ! grep -q "foco-contrata" "$ROOT/dist/index.html" && grep -q "Reservar diagnóstico: https://sobtree.com/#contacto" "$ROOT/dist/llms.txt"'
check "con el flag, el build no lleva claves (sk_, rk_, whsec_) ni el simulador de pago" '! grep -RInE --binary-files=without-match "sk_|rk_|whsec_" "$WORK/dist-on" && [ ! -e "$WORK/dist-on/api/contrata/sim" ] && ! grep -RIn --binary-files=without-match "Pago simulado" "$WORK/dist-on"'
check "con el flag, los endpoints de Contrata están y .htaccess deniega sim/ y todo lo demás de api/" '[ -f "$WORK/dist-on/api/contrata/stripe-webhook.php" ] && grep -q "contrata/(disponibilidad|crear-sesion|stripe-webhook)" "$WORK/dist-on/api/.htaccess" && grep -q "RewriteRule ^ - \[F,L\]" "$WORK/dist-on/api/.htaccess" && grep -q "Require all denied" "$WORK/dist-on/lib/.htaccess"'
check "con el flag siguen los 301 y 410 del .htaccess raíz" 'grep -q "RewriteRule ^diagnostico/?\$ https://sobtree.com/#servicios \[R=301" "$WORK/dist-on/.htaccess" && grep -q "invest/?\$ - \[G,L,NC\]" "$WORK/dist-on/.htaccess" && cmp -s "$ROOT/public/.htaccess" "$WORK/dist-on/.htaccess"'
check "las páginas del resto del sitio son las mismas con y sin el flag (solo cambian la portada, la privacidad, los sitemaps y las dos páginas nuevas)" 'python3 "$ROOT/tests/contrata/comparar-dist.py" "$ROOT/dist" "$WORK/dist-on" > "$WORK/cmp.txt"; [ ! -s "$WORK/cmp.txt" ] || { head -5 "$WORK/cmp.txt"; false; }'
check "el flag encendido dice «máximo 10 días laborables» en Contrata y en gracias" 'grep -q "máximo 10 días laborables" "$WORK/dist-on/contratar/index.html" && grep -q "máximo 10 días laborables" "$WORK/dist-on/contratar/gracias/index.html"'
cerrar 15 "Contenido de dist" pasa "Build con el flag apagado. Precio contrastado en unit.php (490 € + 21 % = 592,90 €). La regla CSS #contrata-boton puede quedar en la hoja y no pinta el botón." "$A"

echo
echo "Resultados"
printf '%s\t%s\t%s\t%s\n' "n" "nombre" "resultado" "nota"
cat "$RESULTADOS"
echo
echo "aserciones ok=$PASS fallos=$FAIL"
cp "$RESULTADOS" /tmp/contrata-resultados.tsv
if [ "$FAIL" != 0 ]; then exit 1; fi

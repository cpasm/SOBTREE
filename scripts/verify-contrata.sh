#!/usr/bin/env bash
# Comprobación de solo lectura de Contrata en producción. No paga, no crea sesiones, no escribe nada.
# Uso: bash scripts/verify-contrata.sh [https://sobtree.com]
# Sale con 0 si todo está bien y con 1 si algo falla. No necesita claves.
set -u
BASE="${1:-https://sobtree.com}"
BASE="${BASE%/}"
PASS=0; FAIL=0
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
ok() { PASS=$((PASS+1)); echo "  ✔ $1"; }
ko() { FAIL=$((FAIL+1)); echo "  ✘ $1${2:+ — $2}"; }
check() { if eval "$2"; then ok "$1"; else ko "$1" "${3:-}"; fi; }
# get: sin seguir redirecciones (devuelve el código tal cual). getf: sigue redirecciones (/contratar → /contratar/).
code() { local c; c="$(curl -s "$@" 2>/dev/null)"; echo "${c:-000}"; }
get() { code -o "$T/$1" -w '%{http_code}' --max-time 20 "$BASE$2"; }
getf() { code -L -o "$T/$1" -w '%{http_code}' --max-time 20 "$BASE$2"; }

echo "Verificando $BASE (solo lectura)"
echo "1. Páginas"
C=$(getf contratar /contratar/);  check "/contratar/ responde 200" '[ "$C" = 200 ]' "HTTP $C"
check "/contratar/ tiene el formulario, el enlace a las condiciones y no está en noindex" 'grep -q "contrata-form" "$T/contratar" && grep -q "href=\"/condiciones/\"" "$T/contratar" && ! grep -q "name=\"robots\" content=\"noindex\"" "$T/contratar"'
check "/contratar/ muestra el servicio y el total 592,90 €" 'grep -q "id=\"contrata-servicio\"" "$T/contratar" && grep -q "592,90" "$T/contratar"'
C=$(getf condiciones /condiciones/); check "/condiciones/ responde 200" '[ "$C" = 200 ]' "HTTP $C"
check "/condiciones/ es indexable, está firmada por Sobtree Holding, S.L. y sin marcas de borrador" 'grep -q "Sobtree Holding, S.L." "$T/condiciones" && ! grep -q "name=\"robots\" content=\"noindex\"" "$T/condiciones" && ! grep -qE "PENDIENTE|PROPUESTA|BORRADOR" "$T/condiciones"'
C=$(getf home /); check "la portada responde 200 y tiene el botón Contrata" '[ "$C" = 200 ] && grep -q "id=\"contrata-boton\"" "$T/home"' "HTTP $C"
C=$(getf priv /privacidad/); check "/privacidad/ sin HubSpot y con la versión 2026-11-01" '[ "$C" = 200 ] && ! grep -qi hubspot "$T/priv" && grep -q "2026-11-01" "$T/priv"'
C=$(getf sm /sitemap-0.xml); check "el sitemap incluye /contratar/ y /condiciones/ y no la confirmación de pago" '[ "$C" = 200 ] && grep -q "<loc>https://sobtree.com/contratar/</loc>" "$T/sm" && grep -q "<loc>https://sobtree.com/condiciones/</loc>" "$T/sm" && ! grep -q "contratar/gracias" "$T/sm"'

C=$(getf kit /kit-asesorias/); check "/kit-asesorias/ responde 200 con el formulario y 47,19 €" '[ "$C" = 200 ] && grep -q "id=\"kit-form\"" "$T/kit" && grep -q "47,19" "$T/kit"' "HTTP $C"
C=$(getf kitc /kit-asesorias/condiciones/); check "/kit-asesorias/condiciones/ responde 200 sin marcas de borrador" '[ "$C" = 200 ] && ! grep -qE "REVISAR|PENDIENTE|BORRADOR" "$T/kitc"' "HTTP $C"
check "el sitemap incluye /kit-asesorias/ y no su página de gracias" 'grep -q "<loc>https://sobtree.com/kit-asesorias/</loc>" "$T/sm" && ! grep -q "kit-asesorias/gracias" "$T/sm"'

echo "2. API"
C=$(getf disp /api/contrata/disponibilidad.php); check "la disponibilidad responde 200 con JSON" '[ "$C" = 200 ] && php -r "exit(is_array(json_decode(file_get_contents(\$argv[1]), true)) ? 0 : 1);" "$T/disp"' "HTTP $C"
check "o bien está cerrada (bloqueos no válidos: el botón lleva al formulario de contacto), o publica 59290 y el servicio diagnóstico" 'php -r "\$j=json_decode(file_get_contents(\$argv[1]), true); if ((\$j[\"ok\"] ?? null)===false) exit(0); exit((\$j[\"precio\"][\"total_centimos\"] ?? 0)===59290 && ((\$j[\"servicios\"][0][\"id\"] ?? \"\")===\"diagnostico\") ? 0 : 1);" "$T/disp"' 
C=$(getf kitd "/api/contrata/disponibilidad.php?producto=kit_asesorias"); check "el estado del kit responde JSON: cerrado o 4719 céntimos" '[ "$C" = 200 ] && php -r "\$j=json_decode(file_get_contents(\$argv[1]), true); if ((\$j[\"ok\"] ?? null)===false) exit(0); exit((\$j[\"producto\"][\"total_centimos\"] ?? 0)===4719 ? 0 : 1);" "$T/kitd"' "HTTP $C"
C=$(code -o /dev/null -w '%{http_code}' --max-time 20 "$BASE/api/contrata/descargar.php?sesion=cs_live_inventada0000&comprobar=1")
check "la descarga con una sesión inventada responde 404" '[ "$C" = 404 ]' "HTTP $C"
C=$(code -o "$T/wh" -w '%{http_code}' --max-time 20 -X POST -H 'Content-Type: application/json' -H 'Stripe-Signature: t=1,v1=00' --data '{}' "$BASE/api/contrata/stripe-webhook.php")
check "el webhook rechaza una firma falsa con 400" '[ "$C" = 400 ]' "HTTP $C"
C=$(code -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H 'Content-Type: application/json' --data '{}' "$BASE/api/contrata/crear-sesion.php")
check "crear-sesion sin token ni origen no abre ningún pago (4xx)" '[ "$C" -ge 400 ] 2>/dev/null && [ "$C" -lt 500 ]' "HTTP $C"

echo "3. Cosas que no deben estar"
for r in /api/contrata/sim/checkout.php /api/contrata/sim/ /lib/contrata.php /lib/reintentar-contrata.php /datos/bloqueos.json /lib/kits/kit-asesorias.zip /lib/kits/; do
  C=$(get x "$r"); check "$r denegado ($C)" '[ "$C" = 403 ] || [ "$C" = 404 ]'
done
C=$(get env /sobtree-secrets.php); check "sobtree-secrets.php no se sirve ($C)" '[ "$C" = 403 ] || [ "$C" = 404 ]'
for f in contratar home condiciones; do
  check "$f: sin claves de Stripe ni secretos en el HTML" '! grep -qE "(rk|sk)_(live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}" "$T/$f"'
done
check "el HTML de /contratar/ no ofrece el modo simulación" '! grep -q "api/contrata/sim" "$T/contratar" && ! grep -qi "pago simulado" "$T/contratar"'

echo "4. Redirecciones y 410 que ya existían"
C=$(get r1 /diagnostico/); check "/diagnostico/ → 301 a la portada (#servicios)" '[ "$C" = 301 ]' "HTTP $C"
C=$(get r2 /invest/); check "/invest/ → 410" '[ "$C" = 410 ]' "HTTP $C"
C=$(code -o /dev/null -w '%{http_code}' --max-time 20 "https://www.sobtree.com/"); check "https://www.sobtree.com → 301" '[ "$C" = 301 ]' "HTTP $C"

echo
echo "ok=$PASS fallos=$FAIL"
[ "$FAIL" = 0 ]

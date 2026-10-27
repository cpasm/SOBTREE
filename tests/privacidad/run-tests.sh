#!/usr/bin/env bash
# Política de privacidad sin HubSpot: texto, versión y coherencia con la web y el PHP.
# Uso: bash tests/privacidad/run-tests.sh   (hace dos builds en directorios temporales)
set -u
unset STRIPE_RESTRICTED_KEY STRIPE_PREP_KEY STRIPE_WEBHOOK_SECRET
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASS=0; FAIL=0
check() { if eval "$2"; then PASS=$((PASS+1)); echo "  ✔ $1"; else FAIL=$((FAIL+1)); echo "  ✘ $1"; fi; }

V_SITE=$(grep -oE 'POLITICA_VERSION = "[^"]+"' src/data/site.ts | cut -d'"' -f2)
V_LEADS=$(grep -oE "LEADS_POLITICA_VERSION = '[^']+'" public/lib/leads.php | cut -d"'" -f2)
check "la versión de la política es 2026-10-27 y coincide en site.ts y leads.php" '[ "$V_SITE" = 2026-10-27 ] && [ "$V_SITE" = "$V_LEADS" ]'
check "la fecha visible es la de la versión" 'grep -q "POLITICA_FECHA = \"27 de octubre de 2026\"" src/data/site.ts'

env -u PUBLIC_CONTRATA_ACTIVO npx astro build --outDir "$WORK/off" >"$WORK/off.log" 2>&1
check "build con el flag apagado" '[ -f "$WORK/off/privacidad/index.html" ]'
PUBLIC_CONTRATA_ACTIVO=1 npx astro build --outDir "$WORK/on" >"$WORK/on.log" 2>&1
check "build con el flag encendido" '[ -f "$WORK/on/privacidad/index.html" ]'
for d in off on; do
  check "[$d] /privacidad/ no menciona a HubSpot" '! grep -qi "hubspot" "$WORK/$d/privacidad/index.html"'
  check "[$d] la web publicada no menciona HubSpot (páginas, llms, corpus)" '! grep -RIli --binary-files=without-match "hubspot" "$WORK/$d" --include="*.html" --include="*.txt" --include="*.json" | grep -q .'
  check "[$d] cita Google (Workspace y Sheets) y n8n, y muestra la versión 2026-10-27" 'grep -q "Google Sheets" "$WORK/$d/privacidad/index.html" && grep -q "Google Workspace" "$WORK/$d/privacidad/index.html" && grep -q "n8n GmbH" "$WORK/$d/privacidad/index.html" && grep -q "Versión 2026-10-27" "$WORK/$d/privacidad/index.html"'
done
check "[off] sin Contrata no se describe Stripe ni el pago, ni se enlaza /condiciones/ (la página no existe)" '! grep -q "Stripe" "$WORK/off/privacidad/index.html" && ! grep -q "/condiciones/" "$WORK/off/privacidad/index.html"'
check "[on] con Contrata aparece Stripe como proveedor de pago, la base legal y el enlace a /condiciones/" 'grep -q "Stripe Payments Europe, Limited" "$WORK/on/privacidad/index.html" && grep -q "art. 6.1.b del RGPD" "$WORK/on/privacidad/index.html" && grep -q "href=\"/condiciones/\"" "$WORK/on/privacidad/index.html"'
check "el código del formulario y de las plantillas no cita a HubSpot como destino (comentarios aparte)" '! grep -rIl "hubspot" src/pages src/components src/data | grep -q .'
echo
echo "aserciones ok=$PASS fallos=$FAIL"
[ "$FAIL" = 0 ]

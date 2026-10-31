#!/usr/bin/env bash
# Pruebas locales de la captura de leads. No toca nada externo: levanta la web con PHP en
# 127.0.0.1, usa una carpeta temporal para el registro y ningún correo sale de la máquina
# (LEADS_DISABLE_MAIL=1 escribe cada correo como una línea JSON en un log temporal).
# Las pruebas finas de E-02 (horario, cola, frenos, filtros) están en tests/leads/test-avisos.php.
# Uso: bash tests/leads/run-tests.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"; BASE="$WORK/base"; mkdir -p "$BASE" "$WORK/tmp"
SITE_PORT="${LEADS_TEST_PORT:-18081}"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✔ $1"; }
ko()   { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
check(){ if eval "$2"; then ok "$1"; else ko "$1"; fi; }

MAILLOG="$WORK/mails.jsonl"; MAILFAIL="$WORK/mail-fail"; : > "$MAILLOG"
madrid() { php -r 'echo (new DateTimeImmutable($argv[1], new DateTimeZone("Europe/Madrid")))->getTimestamp();' "$1"; }
EN_HORA=$(madrid "2026-11-04 10:00")      # miércoles
FUERA=$(madrid "2026-11-07 11:00")        # sábado
LUNES=$(madrid "2026-11-10 09:05")    # martes: el lunes 9-nov es festivo (La Almudena)
export SOBTREE_BASE_DIR="$BASE" LEADS_DISABLE_MAIL=1 LEADS_TEST_MAIL_LOG="$MAILLOG" LEADS_TEST_MAIL_FAIL_FILE="$MAILFAIL" TMPDIR="$WORK/tmp"
P2=""
arrancar() { # $1 = LEADS_AHORA del servidor
  [ -n "$P2" ] && { kill "$P2" 2>/dev/null; wait "$P2" 2>/dev/null; }
  LEADS_AHORA="$1" php -S 127.0.0.1:$SITE_PORT -t "$ROOT/public" >>"$WORK/site.log" 2>&1 &
  P2=$!
  for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$SITE_PORT/contact.php" && break; sleep 0.1; done
}
trap 'kill $P2 2>/dev/null; rm -rf "$WORK"' EXIT
arrancar "$EN_HORA"
URL="http://127.0.0.1:$SITE_PORT/contact.php"
LEADS="$BASE/sobtree-leads/leads.jsonl"; ESTADO="$BASE/sobtree-leads/estado.jsonl"
unlock() { rm -f "$WORK"/tmp/sobtree_contact_*; }
post() { unlock; curl -s -o "$WORK/out" -w '%{http_code}' -X POST "$URL" "$@"; }
VALID=(-d nombre=Luc%C3%ADa%20Mart%C3%ADn -d cargo=Gerente -d telefono=%2B34%20600%20000%20000 -d empresa=Talleres%20Sint%C3%A9ticos%20SL
       -d email=Lucia@Talleres-Sinteticos.es -d "tamano=10 a 49 personas" -d "interes=Primer caso de uso" -d mensaje=Hola
       -d consentimiento=si -d web= -d t0=1)
lines() { [ -f "$1" ] && wc -l < "$1" | tr -d ' ' || echo 0; }
last_state() { grep "\"id\":\"$1\"" "$ESTADO" | grep "\"canal\":\"$2\"" | tail -1 | sed -E 's/.*"estado":"([^"]+)".*/\1/'; }
mails() { # $1 id, $2 tipo → número de correos
  php -r '$n=0; foreach (file($argv[1], FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $l) { $j=json_decode($l, true); if ($j["id"]===$argv[2] && $j["tipo"]===$argv[3]) $n++; } echo $n;' "$MAILLOG" "$1" "$2"; }
mail_field() { # $1 id, $2 tipo, $3 campo → valor del último
  php -r '$v=""; foreach (file($argv[1], FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $l) { $j=json_decode($l, true); if ($j["id"]===$argv[2] && $j["tipo"]===$argv[3]) $v=$j[$argv[4]]; } echo $v;' "$MAILLOG" "$1" "$2" "$3"; }
last_id() { tail -1 "$LEADS" | sed -E 's/.*"id":"([^"]+)".*/\1/'; }
cron() { LEADS_AHORA="$1" php "$ROOT/public/lib/reintentar-leads.php" 2>&1; }

echo "1. Sintaxis"
for f in "$ROOT/public/contact.php" "$ROOT/public/lib/leads.php" "$ROOT/public/lib/reintentar-leads.php" "$ROOT/tests/leads/test-avisos.php"; do
  check "php -l $(basename "$f")" 'php -l "$f" >/dev/null'
done

echo "2. Validación y antispam"
check "GET → 405" '[ "$(curl -s -o /dev/null -w %{http_code} $URL)" = 405 ]'
check "honeypot → 200, no se guarda ni se envía nada" '[ "$(post "${VALID[@]}" -d web=bot)" = 200 ] && [ "$(lines "$LEADS")" = 0 ] && [ "$(lines "$MAILLOG")" = 0 ]'
check "envío instantáneo (t0 reciente) → descartado" '[ "$(post "${VALID[@]}" -d t0=$(($(date +%s%3N)-500)))" = 200 ] && [ "$(lines "$LEADS")" = 0 ]'
check "falta campo → 422" '[ "$(post -d nombre=Ana -d email=a@b.com -d consentimiento=si)" = 422 ]'
check "email inválido → 422" '[ "$(post "${VALID[@]}" -d email=no-es-email)" = 422 ]'
check "teléfono inválido → 422" '[ "$(post "${VALID[@]}" -d telefono=abc)" = 422 ]'
check "sin consentimiento → 422" '[ "$(post "${VALID[@]}" -d consentimiento=no)" = 422 ]'

echo "3. Lead de contacto en horario: se guarda, aviso a info@ y respuesta E-02"
CODE=$(post "${VALID[@]}" -d utm_source=linkedin -d utm_campaign=otono -d origen_pagina=https://sobtree.com/ -d origen_landing=https://sobtree.com/analisis/x/?utm_source=linkedin -d origen_referrer=https://www.linkedin.com/)
sleep 0.3; ID=$(last_id)
check "respuesta 200" '[ "$CODE" = 200 ]'
check "guardado en leads.jsonl" '[ "$(lines "$LEADS")" = 1 ]'
check "email normalizado y cargo/teléfono separados" 'grep -q "\"email\":\"lucia@talleres-sinteticos.es\"" "$LEADS" && grep -q "\"cargo\":\"Gerente\"" "$LEADS" && grep -q "\"telefono\":\"+34 600 000 000\"" "$LEADS"'
check "UTM y origen guardados" 'grep -q "\"utm_source\":\"linkedin\"" "$LEADS" && grep -q "\"referrer\":\"https://www.linkedin.com/\"" "$LEADS"'
check "un aviso a info@ con asunto «[Sobtree] Nuevo contacto <id>»" '[ "$(mails "$ID" aviso)" = 1 ] && [ "$(mail_field "$ID" aviso subject)" = "[Sobtree] Nuevo contacto $ID" ] && [ "$(mail_field "$ID" aviso to)" = info@sobtree.com ]'
check "el aviso lleva origen y utm_*" 'mail_field "$ID" aviso body | grep -q "utm_source:   linkedin" && mail_field "$ID" aviso body | grep -q "utm_campaign: otono" && mail_field "$ID" aviso body | grep -q "Referrer:     https://www.linkedin.com/"'
check "estado del aviso = correo_ok" '[ "$(last_state "$ID" correo)" = correo_ok ]'
check "una respuesta E-02 al visitante (en horario)" '[ "$(mails "$ID" e02)" = 1 ] && [ "$(mail_field "$ID" e02 to)" = lucia@talleres-sinteticos.es ] && [ "$(last_state "$ID" e02)" = enviado ]'
check "la respuesta firma «El equipo de Sobtree» y es texto plano" 'mail_field "$ID" e02 body | tail -1 | grep -qx "El equipo de Sobtree" && mail_field "$ID" e02 headers | grep -q "text/plain"'
check "límite por IP: segundo envío inmediato → 429" '[ "$(curl -s -o /dev/null -w %{http_code} -X POST "$URL" "${VALID[@]}")" = 429 ]'
cron "$EN_HORA" >/dev/null
check "el cron no repite ni el aviso ni la E-02" '[ "$(mails "$ID" aviso)" = 1 ] && [ "$(mails "$ID" e02)" = 1 ]'

echo "4. Mismo email otra vez (7 días): aviso sí, E-02 no"
post "${VALID[@]}" >/dev/null; sleep 0.3; ID2=$(last_id)
check "aviso del segundo lead y E-02 descartada" '[ "$(mails "$ID2" aviso)" = 1 ] && [ "$(mails "$ID2" e02)" = 0 ] && [ "$(last_state "$ID2" e02)" = descartado ] && grep "$ID2" "$ESTADO" | grep -q ya_respondido_7_dias'

echo "5. Calculadora y asistente: aviso sí, E-02 no"
post "${VALID[@]}" -d email=calc@talleres-sinteticos.es -d tipo_formulario=calculadora --data-urlencode 'datos_calculadora={"sector":"Servicios","personas":12,"horas":5,"coste":25,"areas":["Email"],"ahorro_min":5000,"ahorro_max":9000,"precio_min":1200,"precio_max":2000,"malicioso":"x"}' >/dev/null
sleep 0.3; IDC=$(last_id)
check "tipo calculadora + datos estructurados (campo desconocido descartado)" 'tail -1 "$LEADS" | grep -q "\"tipo_formulario\":\"calculadora\"" && tail -1 "$LEADS" | grep -q "\"ahorro_max\":9000" && ! tail -1 "$LEADS" | grep -q malicioso'
check "calculadora: aviso con los datos y sin E-02" '[ "$(mails "$IDC" aviso)" = 1 ] && mail_field "$IDC" aviso body | grep -q "Calculadora:" && [ "$(mails "$IDC" e02)" = 0 ]'
post "${VALID[@]}" -d email=asis@talleres-sinteticos.es -d tipo_formulario=asistente -d "motivo_asistente=Automatizar presupuestos" >/dev/null
sleep 0.3; IDA=$(last_id)
check "asistente: motivo en registro y aviso, sin E-02" 'tail -1 "$LEADS" | grep -q "Automatizar presupuestos" && mail_field "$IDA" aviso body | grep -q "Motivo (asistente): Automatizar presupuestos" && [ "$(mails "$IDA" e02)" = 0 ]'
post "${VALID[@]}" -d email=hack@talleres-sinteticos.es -d tipo_formulario=hack >/dev/null
check "tipo desconocido → contacto" 'tail -1 "$LEADS" | grep -q "\"tipo_formulario\":\"contacto\""'

echo "6. Fuera de horario: E-02 en cola y la manda el cron en la siguiente ventana"
arrancar "$FUERA"
post "${VALID[@]}" -d email=sabado@talleres-sinteticos.es >/dev/null; sleep 0.3; IDS=$(last_id)
check "sábado: aviso sí, E-02 pendiente y sin enviar" '[ "$(mails "$IDS" aviso)" = 1 ] && [ "$(last_state "$IDS" e02)" = pendiente ] && [ "$(mails "$IDS" e02)" = 0 ]'
cron "$FUERA" >/dev/null
check "cron del sábado: sigue en cola" '[ "$(mails "$IDS" e02)" = 0 ]'
cron "$LUNES" > "$WORK/cron-lunes.out"
check "cron del martes 9:05: la envía una vez" '[ "$(mails "$IDS" e02)" = 1 ] && [ "$(last_state "$IDS" e02)" = enviado ] && grep -q "\"e02_enviados\":1" "$WORK/cron-lunes.out"'
arrancar "$EN_HORA"

echo "7. Falla el correo: OK al visitante y el cron reintenta solo lo que falló"
touch "$MAILFAIL"
CODE=$(post "${VALID[@]}" -d email=fallo@talleres-sinteticos.es); sleep 0.3; IDF=$(last_id)
check "respuesta 200 aunque falle el correo" '[ "$CODE" = 200 ]'
check "aviso correo_error y E-02 error" '[ "$(last_state "$IDF" correo)" = correo_error ] && [ "$(last_state "$IDF" e02)" = error ]'
rm -f "$MAILFAIL"
cron "$EN_HORA" >/dev/null
check "cron: un aviso y una E-02" '[ "$(mails "$IDF" aviso)" = 1 ] && [ "$(mails "$IDF" e02)" = 1 ] && [ "$(last_state "$IDF" correo)" = correo_ok ]'
cron "$EN_HORA" >/dev/null
check "segundo cron: sin duplicados" '[ "$(mails "$IDF" aviso)" = 1 ] && [ "$(mails "$IDF" e02)" = 1 ]'

echo "8. Protección del registro y de los scripts"
check "registro con permisos 600" '[ "$(stat -c %a "$LEADS")" = 600 ]'
check "carpeta de leads con .htaccess deny" 'grep -q "Require all denied" "$BASE/sobtree-leads/.htaccess"'
check "public/lib/.htaccess deny" 'grep -q "Require all denied" "$ROOT/public/lib/.htaccess"'
check "reintentar-leads.php vía web → 404" '[ "$(curl -s -o /dev/null -w %{http_code} http://127.0.0.1:$SITE_PORT/lib/reintentar-leads.php)" = 404 ]'
check "la captura de leads no llama a ningún servicio externo (sin curl en contact.php ni leads.php)" '! grep -qE "curl_|fsockopen" "$ROOT/public/contact.php" "$ROOT/public/lib/leads.php" "$ROOT/public/lib/reintentar-leads.php"'

echo "9. Remitente"
check "remitente por defecto = info@sobtree.com" '[ "$(php -r "require \"$ROOT/public/lib/leads.php\"; echo leads_config()[\"notify_from\"];")" = info@sobtree.com ]'
check "LEADS_NOTIFY_FROM lo sustituye" '[ "$(LEADS_NOTIFY_FROM=otro@sobtree.com php -r "require \"$ROOT/public/lib/leads.php\"; echo leads_config()[\"notify_from\"];")" = otro@sobtree.com ]'

echo "10. Consentimiento comercial (opcional)"
TEXTO_CC='Quiero recibir comunicaciones comerciales de Sobtree (novedades, análisis y ofertas) por email. Puedes darte de baja cuando quieras.'
check "texto y versión coinciden con la política (site.ts)" '[ "$(php -r "require \"$ROOT/public/lib/leads.php\"; echo LEADS_COMERCIAL_TEXTO;")" = "$TEXTO_CC" ] && grep -q "POLITICA_VERSION = \"$(php -r "require \"$ROOT/public/lib/leads.php\"; echo LEADS_POLITICA_VERSION;")\"" "$ROOT/src/data/site.ts" && grep -Fq "$TEXTO_CC" "$ROOT/src/data/site.ts"'
CODE=$(post "${VALID[@]}" -d email=cc@talleres-sinteticos.es -d consentimiento_comercial=si); sleep 0.3; IDCC=$(last_id)
check "casilla marcada → 200" '[ "$CODE" = 200 ]'
check "marcada: booleano true, texto, fecha ISO y versión en el registro" 'tail -1 "$LEADS" | TEXTO_CC="$TEXTO_CC" php -r "
\$j=json_decode(stream_get_contents(STDIN), true); \$c=\$j[\"consentimiento_comercial\"] ?? null;
\$ok=is_array(\$c) && \$c[\"acepta\"]===true && \$c[\"texto\"]===getenv(\"TEXTO_CC\")
  && preg_match(\"/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/\", (string)(\$c[\"fecha\"] ?? \"\"))
  && \$c[\"version_politica\"]===\"2026-10-31\";
exit(\$ok ? 0 : 1);"'
check "marcada: el aviso a info@ lo dice con el texto aceptado" 'mail_field "$IDCC" aviso body | grep -q "Comunicaciones comerciales: sí" && mail_field "$IDCC" aviso body | grep -Fq "Texto aceptado: $TEXTO_CC"'
CODE=$(post "${VALID[@]}" -d email=nocc@talleres-sinteticos.es); sleep 0.3; IDNC=$(last_id)
check "sin marcar → 200, acepta false y el aviso dice «no»" '[ "$CODE" = 200 ] && tail -1 "$LEADS" | grep -q "\"acepta\":false" && mail_field "$IDNC" aviso body | grep -q "Comunicaciones comerciales: no"'
NLEADS=$(lines "$LEADS")
CODE=$(post "${VALID[@]}" -d consentimiento_comercial=quizas)
check "valor inválido → 422 y no se guarda" '[ "$CODE" = 422 ] && [ "$(lines "$LEADS")" = "$NLEADS" ]'
CODE=$(post "${VALID[@]}" --data-urlencode "consentimiento_comercial[]=si")
check "valor no escalar → 422 y no se guarda" '[ "$CODE" = 422 ] && [ "$(lines "$LEADS")" = "$NLEADS" ]'
OLD=$(php -r "
require \"$ROOT/public/lib/leads.php\";
\$lead=json_decode(trim(stream_get_contents(STDIN)), true);
unset(\$lead[\"consentimiento_comercial\"]);
\$lead[\"id\"]=leads_uuid();
\$lead[\"fecha\"]=gmdate(\"c\", time()-1200);
\$lead[\"email\"]=\"antiguo@talleres-sinteticos.es\";
if (!leads_save(\$lead)) exit(1);
echo \$lead[\"id\"];
" < <(tail -1 "$LEADS"))
cron "$(date +%s)" >/dev/null
check "lead antiguo en cola (sin estado y sin el campo) → el cron envía el aviso" '[ -n "$OLD" ] && [ "$(last_state "$OLD" correo)" = correo_ok ] && [ "$(mails "$OLD" aviso)" = 1 ]'
check "el aviso de un lead antiguo no inventa la casilla comercial" '! mail_field "$OLD" aviso body | grep -q "Comunicaciones comerciales"'

echo; echo "Resultado: $PASS correctas, $FAIL fallidas"
[ "$FAIL" = 0 ]

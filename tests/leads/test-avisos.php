<?php
// Pruebas sin red de la captura de leads (D-116): aviso a info@ y respuesta automática E-02
// (horario, cola, idempotencia, frenos y filtros). Datos sintéticos; ningún correo sale de la máquina:
// LEADS_DISABLE_MAIL=1 escribe cada correo como una línea JSON en un log temporal.
// Uso: php tests/leads/test-avisos.php   (también: npm run test:leads-hoja)
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
$ROOT = dirname(__DIR__, 2);
$WORK = sys_get_temp_dir() . '/sobtree-test-avisos-' . bin2hex(random_bytes(4));
mkdir("$WORK/base", 0700, true);
$LOG = "$WORK/correos.jsonl";
$FAIL = "$WORK/mail-fail";
foreach (['SOBTREE_BASE_DIR' => "$WORK/base", 'LEADS_DIR' => "$WORK/leads", 'LEADS_DISABLE_MAIL' => '1',
          'LEADS_TEST_MAIL_LOG' => $LOG, 'LEADS_TEST_MAIL_FAIL_FILE' => $FAIL, 'CONTRATA_MODO' => ''] as $k => $v) putenv("$k=$v");
putenv('LEADS_AUTORESPUESTA');
require "$ROOT/public/lib/leads.php";

$ok = 0; $ko = 0;
function t(string $n, bool $c): void { global $ok, $ko; $c ? $ok++ : $ko++; echo ($c ? '  ✔ ' : '  ✘ ') . $n . "\n"; }
function madrid(string $local): int { return (new DateTimeImmutable($local, new DateTimeZone('Europe/Madrid')))->getTimestamp(); }
function ahora(int $ts): void { putenv("LEADS_AHORA=$ts"); }
function correos(?string $tipo = null, ?string $id = null): array {
    global $LOG;
    if (!is_file($LOG)) return [];
    $o = [];
    foreach (file($LOG, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $l) {
        $j = json_decode($l, true);
        if (($tipo === null || $j['tipo'] === $tipo) && ($id === null || $j['id'] === $id)) $o[] = $j;
    }
    return $o;
}
function estado(string $id, string $canal): ?string { return leads_load_state()["$id|$canal"]['ultimo'] ?? null; }
function detalle(string $id, string $canal): string {
    $d = '';
    foreach (file(leads_status_file(), FILE_IGNORE_NEW_LINES) as $l) { $j = json_decode($l, true); if ($j['id'] === $id && $j['canal'] === $canal) $d = $j['detalle']; }
    return $d;
}
$n = 0;
function lead(array $over = [], ?int $ts = null): array {
    global $n; $n++;
    $ts = $ts ?? (int)getenv('LEADS_AHORA');
    $l = [
        'v' => 1, 'id' => leads_uuid(), 'fecha' => gmdate('c', $ts - 60), 'tipo_formulario' => 'contacto',
        'nombre' => 'Lucía Martín', 'cargo' => 'Gerente', 'telefono' => '+34 600 000 000', 'empresa' => 'Talleres Sintéticos SL',
        'email' => "lucia$n@talleres-sinteticos.es", 'tamano' => '10 a 49 personas', 'interes' => 'Primer caso de uso',
        'mensaje' => 'Queremos automatizar los presupuestos.',
        'consentimiento' => ['acepta' => true, 'texto' => 'Acepto la política de privacidad…', 'fecha' => gmdate('c', $ts)],
        'consentimiento_comercial' => leads_consentimiento_comercial(true),
        'origen' => ['pagina' => 'https://sobtree.com/', 'landing' => 'https://sobtree.com/analisis/x/?utm_source=linkedin', 'referrer' => 'https://www.linkedin.com/',
                     'utm' => ['utm_source' => 'linkedin', 'utm_medium' => '', 'utm_campaign' => 'otono', 'utm_term' => '', 'utm_content' => '']],
        'calculadora' => [], 'asistente' => ['motivo' => ''], 'meta' => ['ip_hash' => 'x', 'user_agent' => 'test'],
    ];
    $l = array_replace($l, $over);
    leads_save($l);
    return $l;
}
function cron(int $ts, array $env = []): string {
    global $ROOT;
    $pre = "LEADS_AHORA=$ts ";
    foreach ($env as $k => $v) $pre .= "$k=" . escapeshellarg($v) . ' ';
    return (string)shell_exec($pre . 'php ' . escapeshellarg("$ROOT/public/lib/reintentar-leads.php") . ' 2>&1');
}

$MIE_10 = madrid('2026-11-04 10:00');
$SAB_11 = madrid('2026-11-07 11:00');
$LUN_905 = madrid('2026-11-09 09:05');

echo "1. Horario de E-02 (L-V 9:00-19:00 Europe/Madrid, festivos nacionales de la lista)\n";
t('miércoles 10:00 → sí', leads_e02_en_horario($MIE_10));
t('miércoles 08:59 → no', !leads_e02_en_horario(madrid('2026-11-04 08:59')));
t('miércoles 09:00 → sí (incluida)', leads_e02_en_horario(madrid('2026-11-04 09:00')));
t('miércoles 18:59 → sí', leads_e02_en_horario(madrid('2026-11-04 18:59')));
t('miércoles 19:00 → no (excluida)', !leads_e02_en_horario(madrid('2026-11-04 19:00')));
t('sábado y domingo → no', !leads_e02_en_horario($SAB_11) && !leads_e02_en_horario(madrid('2026-11-08 12:00')));
t('festivo 8-dic (martes) → no', !leads_e02_en_horario(madrid('2026-12-08 10:00')));
t('horario de verano: lunes 29-mar-2027 09:30 CEST → sí; 07:30 UTC en noviembre (08:30 CET) → no',
  leads_e02_en_horario(madrid('2027-03-29 09:30')) && !leads_e02_en_horario(gmmktime(7, 30, 0, 11, 2, 2026)));

echo "2. Filtros conservadores (prueba, desechable, spam)\n";
ahora($MIE_10);
$base = ['tipo_formulario' => 'contacto', 'nombre' => 'Lucía Martín', 'empresa' => 'Talleres Sintéticos SL', 'email' => 'lucia@talleres-sinteticos.es', 'mensaje' => 'Hola, queremos información.'];
$f = fn(array $o) => leads_e02_filtro(array_replace($base, $o));
t('lead normal → se responde', $f([]) === null);
t('calculadora y asistente → tipo', $f(['tipo_formulario' => 'calculadora']) === 'tipo' && $f(['tipo_formulario' => 'asistente']) === 'tipo');
t('email no válido → email', $f(['email' => 'no-es-email']) === 'email');
t('example.com, *.test, *.invalid → prueba', $f(['email' => 'a@example.com']) === 'prueba' && $f(['email' => 'a@empresa.test']) === 'prueba' && $f(['email' => 'a@x.invalid']) === 'prueba');
t('campo prueba/es_prueba = true → prueba', $f(['prueba' => true]) === 'prueba' && $f(['es_prueba' => true]) === 'prueba');
t('«Prueba» o «test» sueltos en nombre/empresa → prueba', $f(['nombre' => 'Ana Prueba']) === 'prueba' && $f(['empresa' => 'TEST']) === 'prueba');
t('«Testing SL» o «Protestas» no son prueba', $f(['empresa' => 'Testing SL']) === null && $f(['nombre' => 'Protestas Gómez']) === null);
t('dominio desechable y subdominio → desechable', $f(['email' => 'a@mailinator.com']) === 'desechable' && $f(['email' => 'a@x.yopmail.com']) === 'desechable');
t('enlace en nombre o empresa → spam', $f(['nombre' => 'Gana dinero https://x.example']) === 'spam' && $f(['empresa' => 'www.casino.example']) === 'spam');
t('2 enlaces en el mensaje → spam; 1 enlace no', $f(['mensaje' => 'Mira https://a.es y https://b.es']) === 'spam' && $f(['mensaje' => 'Nuestra web es https://a.es']) === null);
t('nombre, empresa y mensaje idénticos → spam', $f(['nombre' => 'qwerty asd', 'empresa' => 'qwerty asd', 'mensaje' => 'QWERTY  asd']) === 'spam');
t('nombre sin vocales (≥4 letras) → spam; «Brynn» no', $f(['nombre' => 'Xkcdq Zzrt']) === 'spam' && $f(['nombre' => 'Brynn']) === null);
t('cirílico o CJK en el mensaje → spam', $f(['mensaje' => 'Привет, купить']) === 'spam' && $f(['mensaje' => '你好']) === 'spam');
t('palabra de 30+ caracteres en el nombre → spam', $f(['nombre' => str_repeat('ab', 16)]) === 'spam');

echo "3. Aviso a info@ (principal, siempre) y E-02 en horario\n";
ahora($MIE_10);
$L = lead();
$r = leads_deliver($L);
$av = correos('aviso', $L['id']);
t('un aviso con asunto estable «[Sobtree] Nuevo contacto <id>» a info@', count($av) === 1 && $av[0]['subject'] === '[Sobtree] Nuevo contacto ' . $L['id'] && $av[0]['to'] === 'info@sobtree.com');
$b = $av[0]['body'] ?? '';
t('el aviso lleva todos los campos útiles', str_contains($b, 'Nombre:      Lucía Martín') && str_contains($b, 'Teléfono:    +34 600 000 000') && str_contains($b, 'Empresa:     Talleres Sintéticos SL')
  && str_contains($b, 'Email:       ' . $L['email']) && str_contains($b, 'Cargo:       Gerente') && str_contains($b, 'Tamaño:      10 a 49 personas') && str_contains($b, 'Interés:     Primer caso de uso')
  && str_contains($b, "Mensaje:\nQueremos automatizar los presupuestos.") && str_contains($b, 'Formulario:  contacto') && str_contains($b, 'ID:          ' . $L['id']));
t('el aviso lleva origen y cada utm_* (vacío = —)', str_contains($b, 'utm_source:   linkedin') && str_contains($b, 'utm_medium:   —') && str_contains($b, 'utm_campaign: otono')
  && str_contains($b, 'utm_term:     —') && str_contains($b, 'utm_content:  —') && str_contains($b, 'Referrer:     https://www.linkedin.com/') && str_contains($b, 'Página:       https://sobtree.com/'));
t('el aviso lleva el consentimiento comercial y la previsión de E-02', str_contains($b, 'Comunicaciones comerciales: sí') && str_contains($b, 'Se envía ahora'));
t('Reply-To del aviso = email del lead; remitente info@', str_contains($av[0]['headers'], 'Reply-To: ' . $L['email']) && str_contains($av[0]['headers'], 'From: Sobtree Web <info@sobtree.com>'));
t('estado correo_ok y e02 enviado', $r['correo'] === 'correo_ok' && $r['e02'] === 'enviado' && estado($L['id'], 'e02') === 'enviado');
$e = correos('e02', $L['id']);
t('una respuesta E-02 al email del lead', count($e) === 1 && $e[0]['to'] === $L['email']);
t('asunto «Hemos recibido tu mensaje · Sobtree» (UTF-8)', ($e[0]['subject'] ?? '') === '=?UTF-8?B?' . base64_encode('Hemos recibido tu mensaje · Sobtree') . '?=');
t('remitente info@sobtree.com, texto plano y Auto-Submitted', str_contains($e[0]['headers'], 'From: Sobtree <info@sobtree.com>') && str_contains($e[0]['headers'], 'Content-Type: text/plain; charset=UTF-8') && str_contains($e[0]['headers'], 'Auto-Submitted: auto-replied'));
$esperado = "Hola Lucía Martín:\n\nGracias por escribirnos desde sobtree.com. Hemos recibido tu mensaje y nos gustaría entender mejor qué tarea de Talleres Sintéticos SL os quita más tiempo.\n\n¿Te viene bien una llamada de 25 minutos esta semana? Dinos dos o tres horarios y nos adaptamos. Con lo que nos cuentes te diremos con sinceridad si un diagnóstico tiene sentido para vosotros.\n\nEl Diagnóstico IA exprés cuesta 490 € + IVA y el informe se entrega en un máximo de 10 días laborables desde la fecha de inicio. Las condiciones están en https://sobtree.com/condiciones/.\n\nSi prefieres contarnos algo por escrito antes de la llamada, también vale: ¿qué te frenaría a la hora de dar el paso?\n\nEl equipo de Sobtree";
t('cuerpo = texto fijo aprobado (E-02 v2), firma «El equipo de Sobtree»', ($e[0]['body'] ?? '') === $esperado);
$site = (string)file_get_contents("$ROOT/src/data/site.ts");
t('el precio (490) y el plazo del texto coinciden con src/data/site.ts', preg_match('/precio:\s*490\b/', $site) === 1 && str_contains($site, 'PLAZO_DIAGNOSTICO = "máximo 10 días laborables"'));
leads_deliver($L, 'correo_ok');
leads_e02_procesar($L, 5);
t('volver a entregar el mismo lead no repite ni aviso ni E-02 (idempotente por id)', count(correos('aviso', $L['id'])) === 1 && count(correos('e02', $L['id'])) === 1);

echo "4. Idempotencia por email en 7 días\n";
$L2 = lead(['email' => $L['email']]);
leads_deliver($L2);
t('otro lead con el mismo email → aviso sí, E-02 descartado (ya_respondido_7_dias)', count(correos('aviso', $L2['id'])) === 1 && count(correos('e02', $L2['id'])) === 0 && estado($L2['id'], 'e02') === 'descartado' && detalle($L2['id'], 'e02') === 'ya_respondido_7_dias');
ahora($MIE_10 + 8 * 86400); // jueves 12-nov, 10:00
$L3 = lead(['email' => strtoupper($L['email'])]);
leads_deliver($L3);
t('pasados 7 días, el mismo email (en mayúsculas) vuelve a recibir una (primera de esa nueva solicitud)', count(correos('e02', $L3['id'])) === 1 && correos('e02', $L3['id'])[0]['to'] === $L['email']);

echo "5. Calculadora, asistente y filtros: aviso sí, E-02 no\n";
ahora($MIE_10);
foreach ([['tipo_formulario' => 'calculadora'], ['tipo_formulario' => 'asistente'], ['email' => 'p@example.com'], ['email' => 'x@mailinator.com']] as $o) {
    $X = lead($o);
    leads_deliver($X);
    t('«' . json_encode($o, JSON_UNESCAPED_UNICODE) . '» → aviso con «No se envía (descartado…)» y sin E-02', count(correos('aviso', $X['id'])) === 1 && str_contains(correos('aviso', $X['id'])[0]['body'], 'No se envía (descartado') && count(correos('e02', $X['id'])) === 0 && estado($X['id'], 'e02') === 'descartado');
}

echo "6. Fuera de horario: en cola y la manda el cron en la siguiente ventana\n";
ahora($SAB_11);
$Q = lead();
leads_deliver($Q);
t('sábado: aviso sí («En cola»), E-02 pendiente', count(correos('aviso', $Q['id'])) === 1 && str_contains(correos('aviso', $Q['id'])[0]['body'], 'En cola') && estado($Q['id'], 'e02') === 'pendiente' && count(correos('e02', $Q['id'])) === 0);
$out = cron($SAB_11 + 900);
t('cron del sábado: sigue en cola y no envía', estado($Q['id'], 'e02') === 'pendiente' && count(correos('e02', $Q['id'])) === 0 && str_contains($out, '"e02_pendientes":1'));
$out = cron($LUN_905);
t('cron del lunes 9:05: la envía', estado($Q['id'], 'e02') === 'enviado' && count(correos('e02', $Q['id'])) === 1 && str_contains($out, '"e02_enviados":1'));
$out = cron($LUN_905 + 900);
t('cron siguiente: nada más (ni avisos ni E-02 repetidos)', count(correos('e02', $Q['id'])) === 1 && count(correos('aviso', $Q['id'])) === 1 && str_contains($out, '"e02_enviados":0') && str_contains($out, '"avisos":0'));

echo "7. Freno de 5 envíos por ejecución del cron (los más antiguos primero)\n";
$ids = [];
for ($i = 0; $i < 7; $i++) { ahora($SAB_11 + $i * 60); $X = lead(); leads_deliver($X); $ids[] = $X['id']; }
t('7 leads del sábado en cola', count(array_filter($ids, fn($id) => estado($id, 'e02') === 'pendiente')) === 7);
cron($LUN_905 + 1800);
$env = array_map(fn($id) => estado($id, 'e02'), $ids);
t('primer cron en horario: 5 enviados, los 5 más antiguos', $env === ['enviado', 'enviado', 'enviado', 'enviado', 'enviado', 'pendiente', 'pendiente']);
cron($LUN_905 + 2700);
t('segundo cron: los 2 restantes', count(array_filter($ids, fn($id) => estado($id, 'e02') === 'enviado')) === 7 && count(array_filter($ids, fn($id) => count(correos('e02', $id)) === 1)) === 7);

echo "8. Freno global de 20 por hora (contact.php + cron)\n";
ahora(madrid('2026-11-06 11:00'));
for ($i = 0; $i < 20; $i++) leads_mark('relleno-' . $i, 'e02', 'enviado', "relleno$i@talleres-sinteticos.es");
$H = lead();
leads_deliver($H);
t('con 20 enviados en la última hora, el siguiente queda pendiente (freno)', estado($H['id'], 'e02') === 'pendiente' && detalle($H['id'], 'e02') === 'freno');
ahora(madrid('2026-11-06 12:05'));
leads_e02_procesar($H, 1);
t('una hora después sale', estado($H['id'], 'e02') === 'enviado');

echo "9. Fallos de correo: el cron reintenta solo lo que falló\n";
ahora(madrid('2026-11-10 10:00'));
touch($FAIL);
$F = lead();
leads_deliver($F);
t('aviso correo_error y E-02 error, sin correos', estado($F['id'], 'correo') === 'correo_error' && estado($F['id'], 'e02') === 'error' && count(correos(null, $F['id'])) === 0);
unlink($FAIL);
cron(madrid('2026-11-10 10:15'));
t('cron: un aviso y una E-02, una sola vez', count(correos('aviso', $F['id'])) === 1 && count(correos('e02', $F['id'])) === 1 && estado($F['id'], 'correo') === 'correo_ok' && estado($F['id'], 'e02') === 'enviado');
cron(madrid('2026-11-10 10:30'));
t('cron siguiente: sin duplicados', count(correos('aviso', $F['id'])) === 1 && count(correos('e02', $F['id'])) === 1);
touch($FAIL);
$G = lead();
leads_deliver($G);
leads_e02_procesar($G, 1);
leads_e02_procesar($G, 1);
leads_e02_procesar($G, 1);
t('tras 3 fallos de E-02 se deja de intentar (descartado: errores_de_envio)', estado($G['id'], 'e02') === 'descartado' && detalle($G['id'], 'e02') === 'errores_de_envio');
unlink($FAIL);

echo "10. Ante la duda no se repite; caducados; interruptor\n";
$C = lead();
leads_mark($C['id'], 'correo', 'correo_ok', 'aviso');
leads_mark($C['id'], 'e02', 'enviando', $C['email']); // el proceso murió entre la marca y mail()
cron(madrid('2026-11-10 10:45'));
t('«enviando» sin confirmar cuenta como enviado: el cron no lo reenvía', count(correos('e02', $C['id'])) === 0 && estado($C['id'], 'e02') === 'enviando');
$V = lead([], madrid('2026-11-02 10:00'));
leads_mark($V['id'], 'correo', 'correo_ok', 'aviso');
leads_e02_procesar($V, 1);
t('un lead de hace 8 días ya no se responde (caducado)', estado($V['id'], 'e02') === 'descartado' && detalle($V['id'], 'e02') === 'caducado');
$K = lead();
$salida = (string)shell_exec('LEADS_AUTORESPUESTA=0 LEADS_AHORA=' . madrid('2026-11-10 11:00') . ' php -r ' . escapeshellarg(
    'require "' . $ROOT . '/public/lib/leads.php"; $l = json_decode($argv[1], true); echo json_encode(leads_deliver($l));') . ' ' . escapeshellarg(json_encode($K)));
t('LEADS_AUTORESPUESTA=0: aviso sí (dice «apagada»), E-02 no', str_contains($salida, '"e02":null') && count(correos('e02', $K['id'])) === 0 && str_contains(correos('aviso', $K['id'])[0]['body'] ?? '', 'apagada'));

echo "11. Saneado del texto y ausencia de red\n";
$S = ['nombre' => "<b>Ana</b>\u{202E}\r\nBcc: x@y.es " . str_repeat('a', 80), 'empresa' => ''];
$cuerpo = leads_e02_cuerpo($S);
t('sin < >, sin controles ni bidi; nombre recortado a 60; empresa vacía → «vuestra empresa»',
  !preg_match('/[<>\x{202E}\r]/u', $cuerpo) && str_starts_with($cuerpo, 'Hola bAna/b Bcc: x@y.es ') && mb_strlen(explode(':', explode("\n", $cuerpo)[0])[0]) <= 65 && str_contains($cuerpo, 'qué tarea de vuestra empresa os quita'));
@mkdir("$WORK/www/lib", 0700, true);
copy("$ROOT/public/lib/leads.php", "$WORK/www/lib/leads.php");
file_put_contents("$WORK/www/index.html", '<html></html>');
$sinCond = (string)shell_exec('php -r ' . escapeshellarg('require "' . $WORK . '/www/lib/leads.php"; echo leads_e02_cuerpo(["nombre" => "Ana", "empresa" => "X SL"]);'));
@mkdir("$WORK/www/condiciones", 0700, true);
file_put_contents("$WORK/www/condiciones/index.html", '<html></html>');
$conCond = (string)shell_exec('php -r ' . escapeshellarg('require "' . $WORK . '/www/lib/leads.php"; echo leads_e02_cuerpo(["nombre" => "Ana", "empresa" => "X SL"]);'));
t('web desplegada sin /condiciones/ (flag apagado): se omite solo la frase del enlace; con la página, va entera',
  !str_contains($sinCond, 'condiciones') && str_contains($sinCond, 'desde la fecha de inicio.' . "\n\nSi prefieres") && str_contains($conCond, 'Las condiciones están en https://sobtree.com/condiciones/.'));
t('leads.php no abre conexiones (sin curl ni sockets)', !preg_match('/curl_|fsockopen|stream_socket_client|file_get_contents\(\s*[\'"]https?:/', (string)file_get_contents("$ROOT/public/lib/leads.php")));
t('registro y estado con permisos 600', substr(sprintf('%o', fileperms(leads_file())), -3) === '600' && substr(sprintf('%o', fileperms(leads_status_file())), -3) === '600');

shell_exec('rm -rf ' . escapeshellarg($WORK));
echo "\nResultado: $ok correctas, $ko fallidas\n";
exit($ko === 0 ? 0 : 1);

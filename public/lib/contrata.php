<?php
// Librería del botón «Contrata» (disponibilidad, retenciones y Checkout en modo test).
// La usan public/api/contrata/*.php y public/lib/reintentar-contrata.php.
//
// Secretos: solo en sobtree-secrets.php (fuera de public_html) o en el entorno.
// Nunca claves live de Stripe: se descartan en contrata_marca_live().
// Modo por defecto: apagado. «simulacion» no llama a Stripe, Google ni n8n reales.
declare(strict_types=1);

const CONTRATA_PRECIO_BASE_EUR = 490;          // tiene que coincidir con DIAGNOSTICO.precio en src/data/site.ts
const CONTRATA_IVA_PORCIENTO = 21;
const CONTRATA_DIAS_DESCUENTO = 30;            // DIAGNOSTICO.dias
const CONTRATA_POLITICA_VERSION = '2026-10-26'; // POLITICA_VERSION en src/data/site.ts
const CONTRATA_CONDICIONES_VERSION = '2026-10-27'; // CONDICIONES_VERSION en src/data/site.ts
const CONTRATA_MAX_PROYECTOS = 1;
const CONTRATA_PLAZO_LABORABLES = 3;
const CONTRATA_SEMANAS_VISIBLES = 4;
const CONTRATA_RETENCION_SEG = 1800;
const CONTRATA_FRESCURA_SEG = 3 * 3600;
const CONTRATA_FIRMA_VENTANA = 300;
const CONTRATA_CSRF_VENTANA = 7200;
const CONTRATA_MAX_INTENTOS = 8;
const CONTRATA_WEBHOOK_TIMEOUT = 10;
const CONTRATA_MSG_PAGO = 'No hemos podido abrir el pago; inténtalo en un minuto o escríbenos.';
const CONTRATA_MSG_RESERVA = 'Reserva tu diagnóstico; te confirmamos la fecha en 1 día laborable';
const CONTRATA_MSG_SEMANA = 'Esa semana ya está completa. Elige otra.';
const CONTRATA_PLAZO_TEXTO = 'máximo 10 días laborables';   // PLAZO_DIAGNOSTICO en src/data/site.ts
const CONTRATA_MSG_FECHA = 'La fecha de inicio se confirma por email en 1 día laborable; si no fuera posible, te ofrecemos otra semana o el reembolso íntegro. El informe del diagnóstico se entrega en un ' . CONTRATA_PLAZO_TEXTO . '.';
const CONTRATA_MSG_SIN_PLAZAS = 'No hay plazas en las próximas 4 semanas.';
const CONTRATA_PRICE_TEST = 'price_test_diagnostico';
const CONTRATA_PRODUCTO_DEFECTO = 'diagnostico';
const CONTRATA_DIAS_BLOQUEO_MAX = 5;           // la disponibilidad es por semana (lunes a viernes): un servicio no puede bloquear más
/**
 * Servicios que se pueden contratar online. Es la lista que el PHP acepta; la copia de textos del front
 * está en SERVICIOS de src/data/contrata.ts y una prueba comprueba que coinciden (id, nombre, base, días).
 * El ID de Price de cada servicio NO está aquí: viene de sobtree-secrets.php (clave env_price).
 */
const CONTRATA_SERVICIOS = [
    'diagnostico' => [
        'nombre' => 'Diagnóstico de implantación de IA',
        'base_eur' => CONTRATA_PRECIO_BASE_EUR,
        'dias_bloqueo' => 5,
        'env_price' => 'STRIPE_PRICE_DIAGNOSTICO',
    ],
];
const CONTRATA_TAX_RATE_TEST = 'txr_test_iva21';

function contrata_base_dirs(): array {
    $publicDir = dirname(__DIR__);
    return array_values(array_unique(array_filter([
        getenv('SOBTREE_BASE_DIR') ?: null,
        dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? '')) ?: null,
        dirname($publicDir),
        ($real = realpath($publicDir)) ? dirname($real) : null,
        getenv('HOME') ? getenv('HOME') . '/domains/sobtree.com' : null,
    ], fn($d) => is_string($d) && $d !== '' && $d !== '.' && $d !== '/')));
}

/** Prefijo live, partido para que el build no publique una cadena de clave. */
function contrata_marca_live(string $tipo): string {
    return $tipo . implode('', ['_', 'l', 'i', 'v', 'e', '_']);
}

function contrata_clave_prohibida(string $key): bool {
    return str_starts_with($key, contrata_marca_live('sk')) || str_starts_with($key, contrata_marca_live('rk'));
}

function contrata_config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $secrets = [];
    $baseFound = null;
    foreach (contrata_base_dirs() as $base) {
        if (is_file("$base/sobtree-secrets.php")) {
            $secrets = (array)(require "$base/sobtree-secrets.php");
            $baseFound = $base;
            break;
        }
    }
    $get = function (string $k, string $default = '') use ($secrets): string {
        if (array_key_exists($k, $secrets) && $secrets[$k] !== null && $secrets[$k] !== false) {
            return trim((string)$secrets[$k]);
        }
        $v = getenv($k);
        return trim((string)($v === false ? $default : $v));
    };
    $dir = $get('CONTRATA_DIR');
    if ($dir === '') {
        $base = $baseFound ?? (contrata_base_dirs()[0] ?? null);
        $dir = $base ? "$base/sobtree-contrata" : dirname(__DIR__) . '/_contrata';
    }
    $key = $get('STRIPE_RESTRICTED_KEY');
    $modo = $get('CONTRATA_MODO');
    if (!in_array($modo, ['simulacion', 'stripe_test', 'stripe_live'], true)) $modo = 'apagado';
    // Una clave live solo sirve en stripe_live; una clave test no sirve en stripe_live.
    $esLive = $key !== '' && contrata_clave_prohibida($key);
    $prohibida = $key !== '' && (($esLive && $modo !== 'stripe_live') || (!$esLive && $modo === 'stripe_live'));
    if ($prohibida) {
        error_log('contrata: la clave de Stripe no corresponde al modo; no se usará');
        $key = '';
    }
    $wh = $get('STRIPE_WEBHOOK_SECRET');
    if ($wh !== '' && (str_contains($wh, contrata_marca_live('sk')) || str_contains($wh, contrata_marca_live('rk')))) {
        error_log('contrata: secreto de webhook con clave live; rechazado');
        $wh = '';
        $prohibida = true;
    }
    $prices = [];
    foreach (CONTRATA_SERVICIOS as $sid => $sdef) $prices[$sid] = $get($sdef['env_price']);
    $public = rtrim($get('CONTRATA_PUBLIC_URL', 'https://sobtree.com'), '/');
    $httpLocal = (bool)preg_match('#^http://(127\.0\.0\.1|localhost)(:\d+)?$#', $public);
    if (!preg_match('#^https://[a-z0-9.-]+$#i', $public) && !($modo === 'simulacion' && $httpLocal)) {
        $public = 'https://sobtree.com';
    }
    $n8n = $get('CONTRATA_N8N_WEBHOOK_URL');
    $n8nOk = preg_match('#^https://#', $n8n) || ($n8n !== '' && getenv('CONTRATA_ALLOW_HTTP_WEBHOOK') === '1' && preg_match('#^http://#', $n8n));
    $cfg = [
        'dir' => rtrim($dir, '/'),
        'modo' => $modo,
        'stripe_key' => $key,
        'clave_prohibida' => $prohibida,
        'webhook_secret' => $wh,
        'stripe_price' => $get('STRIPE_PRICE_DIAGNOSTICO'),
        'stripe_prices' => $prices,
        'stripe_tax_rate' => $get('STRIPE_TAX_RATE_IVA21'),
        'live' => $modo === 'stripe_live',
        'hmac_secret' => $get('CONTRATA_HMAC_SECRET'),
        'n8n_url' => $n8nOk ? $n8n : '',
        'public_url' => $public,
        'cal_proyectos' => $get('CONTRATA_CALENDAR_PROYECTOS_ID'),
        'cal_bloqueos' => $get('CONTRATA_CALENDAR_BLOQUEOS_ID'),
        'cal_cuenta' => $get('CONTRATA_CALENDAR_CUENTA', 'info@sobtree.com'),
        'notify_to' => $get('CONTRATA_NOTIFY_TO', 'info@sobtree.com'),
        'notify_from' => $get('CONTRATA_NOTIFY_FROM', 'info@sobtree.com'),
    ];
    return $cfg;
}

function contrata_modo(): string { return contrata_config()['modo']; }

/** Los eventos, sesiones y Prices de Stripe tienen que ser live solo en stripe_live. */
function contrata_livemode_esperado(): bool { return contrata_config()['live']; }

function contrata_stripe_utilizable(): bool {
    $c = contrata_config();
    if ($c['clave_prohibida']) return false;
    if ($c['modo'] === 'simulacion') return true;
    $comun = preg_match('/^txr_[A-Za-z0-9_]+$/', $c['stripe_tax_rate']) === 1;
    // Cada servicio de la lista necesita su Price; si falta alguno no se abre el pago.
    foreach (contrata_servicios() as $sid => $_) {
        if (preg_match('/^price_[A-Za-z0-9_]+$/', (string)($c['stripe_prices'][$sid] ?? '')) !== 1) $comun = false;
    }
    if ($c['modo'] === 'stripe_test') return $comun && preg_match('/^(rk|sk)_test_/', $c['stripe_key']) === 1;
    if ($c['modo'] === 'stripe_live') {
        // Para cobrar de verdad hace falta todo: clave live, webhook firmado, aviso a n8n firmado y web en https.
        return $comun && contrata_clave_prohibida($c['stripe_key'])
            && str_starts_with($c['webhook_secret'], 'whsec' . '_')
            && $c['n8n_url'] !== '' && str_starts_with($c['n8n_url'], 'https://')
            && $c['hmac_secret'] !== ''
            && str_starts_with($c['public_url'], 'https://');
    }
    return false;
}

function contrata_ensure_dir(): string {
    $dir = contrata_config()['dir'];
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException('No se puede crear la carpeta de contrata');
    }
    if (!is_file("$dir/.htaccess")) @file_put_contents("$dir/.htaccess", "Require all denied\n");
    if (!is_file("$dir/index.html")) @file_put_contents("$dir/index.html", '');
    return $dir;
}

function contrata_ahora(): int {
    if (contrata_modo() === 'simulacion') {
        $h = (string)($_SERVER['HTTP_X_CONTRATA_AHORA'] ?? '');
        if ($h !== '' && ctype_digit($h)) return (int)$h;
        $e = getenv('CONTRATA_AHORA');
        if (is_string($e) && ctype_digit($e)) return (int)$e;
    }
    return time();
}

function contrata_hoy(): string {
    if (contrata_modo() === 'simulacion') {
        $h = (string)($_SERVER['HTTP_X_CONTRATA_HOY'] ?? '');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $h)) return $h;
        $e = getenv('CONTRATA_HOY');
        if (is_string($e) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $e)) return $e;
    }
    return (new DateTimeImmutable('now', new DateTimeZone('Europe/Madrid')))->format('Y-m-d');
}

function contrata_fecha(string $iso): DateTimeImmutable {
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $iso, new DateTimeZone('UTC'));
    if (!$d || $d->format('Y-m-d') !== $iso) throw new InvalidArgumentException('fecha');
    return $d;
}

function contrata_iso(DateTimeImmutable $d): string { return $d->format('Y-m-d'); }

function contrata_sumar_dias(string $iso, int $n): string {
    return contrata_iso(contrata_fecha($iso)->modify(($n >= 0 ? '+' : '') . $n . ' days'));
}

function contrata_es_laborable(string $iso): bool { return (int)contrata_fecha($iso)->format('N') <= 5; }

function contrata_es_lunes(string $iso): bool { return (int)contrata_fecha($iso)->format('N') === 1; }

function contrata_sumar_laborables(string $iso, int $n): string {
    $d = $iso;
    $rest = $n;
    while ($rest > 0) {
        $d = contrata_sumar_dias($d, 1);
        if (contrata_es_laborable($d)) $rest--;
    }
    return $d;
}

function contrata_siguiente_lunes(string $iso): string {
    $n = (int)contrata_fecha($iso)->format('N');
    if ($n === 1) return $iso;
    return contrata_sumar_dias($iso, 8 - $n);
}

function contrata_primer_lunes(string $hoy, int $plazo = CONTRATA_PLAZO_LABORABLES): string {
    return contrata_siguiente_lunes(contrata_sumar_laborables($hoy, $plazo));
}

function contrata_solapa(string $aIni, string $aFin, string $bIni, string $bFin): bool {
    return $aIni < $bFin && $aFin > $bIni;
}

/** @param list<array{inicio:string,fin:string,sesion?:string}> $proyectos @param list<array{inicio:string,fin:string}> $bloqueos */
function contrata_calcular_semanas(string $hoy, array $proyectos, array $bloqueos, int $max = CONTRATA_MAX_PROYECTOS, int $plazo = CONTRATA_PLAZO_LABORABLES, int $visibles = CONTRATA_SEMANAS_VISIBLES): array {
    $primero = contrata_primer_lunes($hoy, $plazo);
    $semanas = [];
    for ($i = 0; $i < $visibles; $i++) {
        $lunes = contrata_sumar_dias($primero, $i * 7);
        $fin = contrata_sumar_dias($lunes, 5);
        $eventos = [];
        foreach ($proyectos as $p) {
            if (!isset($p['inicio'], $p['fin'])) throw new InvalidArgumentException('proyecto');
            if (contrata_solapa($p['inicio'], $p['fin'], $lunes, $fin)) $eventos[] = $p;
        }
        $bloqueada = false;
        foreach ($bloqueos as $b) {
            if (!isset($b['inicio'], $b['fin'])) throw new InvalidArgumentException('bloqueo');
            if (contrata_solapa($b['inicio'], $b['fin'], $lunes, $fin)) $bloqueada = true;
        }
        $plazas = $bloqueada ? 0 : max(0, $max - count($eventos));
        $sesiones = [];
        foreach ($eventos as $e) if (!empty($e['sesion'])) $sesiones[] = (string)$e['sesion'];
        $semanas[] = [
            'lunes' => $lunes,
            'plazas' => $plazas,
            'bloqueada' => $bloqueada,
            'proyectos' => count($eventos),
            'sesiones' => $sesiones,
        ];
    }
    return $semanas;
}

function contrata_meses(): array {
    return [1 => 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
}

function contrata_fecha_larga(string $iso, ?string $hoy = null): string {
    $hoy = $hoy ?? $iso;
    $d = contrata_fecha($iso);
    $meses = contrata_meses();
    $txt = (int)$d->format('j') . ' de ' . $meses[(int)$d->format('n')];
    if ($d->format('Y') !== contrata_fecha($hoy)->format('Y')) $txt .= ' de ' . $d->format('Y');
    return $txt;
}

function contrata_texto_plazas(int $n, string $lunes, int $max, string $hoy): ?string {
    if ($n < 1 || $n > $max) return null;
    $fecha = contrata_fecha_larga($lunes, $hoy);
    if ($n === 1) return "Queda 1 plaza para la semana del $fecha";
    return "Quedan $n plazas para la semana del $fecha";
}

function contrata_texto_proxima(string $lunes, string $hoy): string {
    return 'Nuestros agentes pueden empezar a partir del lunes ' . contrata_fecha_larga($lunes, $hoy);
}

/** Servicios de la lista con datos coherentes (id con letras minúsculas, base entera > 0, 1 a 5 días de bloqueo). */
function contrata_servicios(): array {
    $out = [];
    foreach (CONTRATA_SERVICIOS as $id => $d) {
        if (!is_string($id) || preg_match('/^[a-z][a-z0-9_]{0,31}$/', $id) !== 1) continue;
        if (!is_int($d['base_eur'] ?? null) || $d['base_eur'] < 1) continue;
        $dias = $d['dias_bloqueo'] ?? 0;
        if (!is_int($dias) || $dias < 1 || $dias > CONTRATA_DIAS_BLOQUEO_MAX) continue;
        $out[$id] = ['id' => $id] + $d;
    }
    return $out;
}

/** El servicio solo existe si su id está en la lista; cualquier otro valor (también «Diagnostico» o con espacios) da null. */
function contrata_servicio(string $id): ?array {
    return contrata_servicios()[$id] ?? null;
}

function contrata_price_de(string $servicio): string {
    return (string)(contrata_config()['stripe_prices'][$servicio] ?? '');
}

function contrata_importes(string $servicio = CONTRATA_PRODUCTO_DEFECTO): array {
    $def = contrata_servicio($servicio);
    if ($def === null) throw new InvalidArgumentException('servicio');
    $baseEur = (int)$def['base_eur'];
    $base = $baseEur * 100;
    $iva = intdiv($base * CONTRATA_IVA_PORCIENTO, 100);
    $total = $base + $iva;
    return [
        'base_eur' => $baseEur,
        'iva_porcentaje' => CONTRATA_IVA_PORCIENTO,
        'base_centimos' => $base,
        'iva_centimos' => $iva,
        'total_centimos' => $total,
        'base_texto' => contrata_euros($base),
        'iva_texto' => contrata_euros($iva),
        'total_texto' => contrata_euros($total),
    ];
}

/** Ruta de la página, partida para que el build con el flag apagado no publique el literal. */
function contrata_ruta(string $cola = ''): string {
    return '/' . 'contratar' . '/' . $cola;
}

/** Ruta de las condiciones (marcador hasta que Nexus entregue el texto aprobado). Partida, como contrata_ruta. */
function contrata_ruta_condiciones(): string {
    return '/' . 'condiciones' . '/';
}

function contrata_euros(int $centimos): string {
    $signo = $centimos < 0 ? '-' : '';
    $centimos = abs($centimos);
    $entero = number_format(intdiv($centimos, 100), 0, ',', '.');
    return $signo . $entero . ',' . str_pad((string)($centimos % 100), 2, '0', STR_PAD_LEFT) . ' €';
}

function contrata_price_coincide(int $unitAmount, string $currency, bool $livemode, string $servicio = CONTRATA_PRODUCTO_DEFECTO): bool {
    return $livemode === contrata_livemode_esperado() && strtolower($currency) === 'eur' && $unitAmount === contrata_importes($servicio)['total_centimos'];
}

function contrata_texto_descuento(): string {
    return 'Si contratas el proyecto en los ' . CONTRATA_DIAS_DESCUENTO
        . ' días siguientes a la entrega del informe, te descontamos los ' . CONTRATA_PRECIO_BASE_EUR
        . ' €. Se aplica solo a proyectos (no a formación, acompañamiento ni licencias), uno por empresa, no es acumulable y no se devuelve en dinero.';
}

function contrata_uuid(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

function contrata_append(string $file, array $row): bool {
    $line = json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($line === false) return false;
    $line .= "\n";
    $fh = @fopen($file, 'ab');
    if (!$fh) return false;
    $ok = false;
    if (flock($fh, LOCK_EX)) {
        $ok = fwrite($fh, $line) === strlen($line);
        fflush($fh);
        flock($fh, LOCK_UN);
    }
    fclose($fh);
    @chmod($file, 0600);
    return $ok;
}

function contrata_guardar_json(string $file, array $data): void {
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) throw new RuntimeException('json');
    $tmp = $file . '.tmp.' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, $json) === false) throw new RuntimeException('escritura');
    @chmod($tmp, 0600);
    if (!rename($tmp, $file)) {
        @unlink($tmp);
        throw new RuntimeException('rename');
    }
}

function contrata_leer_json(string $file, array $defecto): array {
    if (!is_file($file)) return $defecto;
    $j = json_decode((string)file_get_contents($file), true);
    return is_array($j) ? $j : $defecto;
}

function contrata_auditar(string $tipo, array $detalle): void {
    contrata_append(contrata_ensure_dir() . '/auditoria.jsonl', [
        'fecha' => gmdate('c'),
        'tipo' => $tipo,
        'detalle' => $detalle,
    ]);
}

function contrata_con_bloqueo(callable $fn): mixed {
    $dir = contrata_ensure_dir();
    $fh = fopen($dir . '/.estado.lock', 'c');
    if (!$fh || !flock($fh, LOCK_EX)) {
        if ($fh) fclose($fh);
        throw new RuntimeException('No se pudo bloquear el estado');
    }
    try {
        return $fn();
    } finally {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

function contrata_sign(string $secret, string $timestamp, string $body): string {
    return hash_hmac('sha256', $timestamp . '.' . $body, $secret);
}

function contrata_csrf_emitir(): string {
    $secret = contrata_config()['hmac_secret'];
    if ($secret === '') return '';
    $ts = (string)contrata_ahora();
    $nonce = bin2hex(random_bytes(16));
    return $ts . '.' . $nonce . '.' . contrata_sign($secret, $ts, $nonce);
}

function contrata_csrf_validar(string $token): bool {
    $secret = contrata_config()['hmac_secret'];
    if ($secret === '' || !preg_match('/^(\d+)\.([a-f0-9]{32})\.([a-f0-9]{64})$/', $token, $m)) return false;
    $esperada = contrata_sign($secret, $m[1], $m[2]);
    if (!hash_equals($esperada, $m[3])) return false;
    $edad = abs(contrata_ahora() - (int)$m[1]);
    return $edad <= CONTRATA_CSRF_VENTANA;
}

function contrata_firma_ok(string $secret, string $ts, string $firma, string $body): bool {
    if ($secret === '' || !preg_match('/^\d+$/', $ts)) return false;
    if (abs(contrata_ahora() - (int)$ts) > CONTRATA_FIRMA_VENTANA) return false;
    $esperada = 'sha256=' . contrata_sign($secret, $ts, $body);
    $dada = trim($firma);
    return strlen($esperada) === strlen($dada) && hash_equals($esperada, $dada);
}

function contrata_validar_nif(string $nif): bool {
    if (!preg_match('/^\d{8}[A-Z]$/', $nif)) return false;
    $letras = 'TRWAGMYFPDXBNJZSQVHLCKE';
    return $letras[(int)substr($nif, 0, 8) % 23] === $nif[8];
}

function contrata_validar_nie(string $nie): bool {
    if (!preg_match('/^[XYZ]\d{7}[A-Z]$/', $nie)) return false;
    $map = ['X' => '0', 'Y' => '1', 'Z' => '2'];
    $num = $map[$nie[0]] . substr($nie, 1, 7);
    $letras = 'TRWAGMYFPDXBNJZSQVHLCKE';
    return $letras[(int)$num % 23] === $nie[8];
}

function contrata_validar_cif(string $cif): bool {
    if (!preg_match('/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/', $cif)) return false;
    $sum = 0;
    for ($i = 0; $i < 7; $i++) {
        $n = (int)$cif[$i + 1];
        if ($i % 2 === 0) {
            $n *= 2;
            $sum += intdiv($n, 10) + ($n % 10);
        } else {
            $sum += $n;
        }
    }
    $digit = (10 - ($sum % 10)) % 10;
    $letter = 'JABCDEFGHI'[$digit];
    $control = $cif[8];
    $tipo = $cif[0];
    if (str_contains('PQRSNW', $tipo)) return $control === $letter;
    if (str_contains('ABEH', $tipo)) return $control === (string)$digit;
    return $control === (string)$digit || $control === $letter;
}

function contrata_documento_es(string $doc): ?array {
    $doc = strtoupper((string)preg_replace('/[\s\-\.]/', '', $doc));
    if (contrata_validar_nif($doc)) return ['pais' => 'ES', 'tipo' => 'nif', 'normalizado' => $doc];
    if (contrata_validar_nie($doc)) return ['pais' => 'ES', 'tipo' => 'nie', 'normalizado' => $doc];
    if (contrata_validar_cif($doc)) return ['pais' => 'ES', 'tipo' => 'cif', 'normalizado' => $doc];
    return null;
}

/** Formato de NIF/CIF español o NIF-IVA de la UE. Nunca marca verificado: no consultamos VIES. */
function contrata_validar_identificacion(string $raw): ?array {
    $id = strtoupper((string)preg_replace('/[\s\-\.]/', '', $raw));
    if ($id === '') return null;
    $base = ['verificado' => false, 'alerta' => 'revisar_antes_de_facturar'];
    if (str_starts_with($id, 'ES') && strlen($id) > 2) {
        $es = contrata_documento_es(substr($id, 2));
        if (!$es) return null;
        return $base + $es + ['normalizado' => 'ES' . $es['normalizado'], 'iva_ue' => true];
    }
    $es = contrata_documento_es($id);
    if ($es) return $base + $es + ['iva_ue' => false];
    $patrones = [
        'AT' => '/^U\d{8}$/', 'BE' => '/^\d{10}$/', 'BG' => '/^\d{9,10}$/', 'CY' => '/^\d{8}[A-Z]$/',
        'CZ' => '/^\d{8,10}$/', 'DE' => '/^\d{9}$/', 'DK' => '/^\d{8}$/', 'EE' => '/^\d{9}$/',
        'EL' => '/^\d{9}$/', 'FI' => '/^\d{8}$/', 'FR' => '/^[A-Z0-9]{2}\d{9}$/', 'HR' => '/^\d{11}$/',
        'HU' => '/^\d{8}$/', 'IE' => '/^[A-Z0-9]{8,9}$/', 'IT' => '/^\d{11}$/', 'LT' => '/^\d{9}(\d{3})?$/',
        'LU' => '/^\d{8}$/', 'LV' => '/^\d{11}$/', 'MT' => '/^\d{8}$/', 'NL' => '/^\d{9}B\d{2}$/',
        'PL' => '/^\d{10}$/', 'PT' => '/^\d{9}$/', 'RO' => '/^\d{2,10}$/', 'SE' => '/^\d{12}$/',
        'SI' => '/^\d{8}$/', 'SK' => '/^\d{10}$/', 'XI' => '/^(\d{9}|\d{12}|(GD|HA)\d{3})$/',
    ];
    if (!preg_match('/^([A-Z]{2})([A-Z0-9]{2,14})$/', $id, $m) || !isset($patrones[$m[1]])) return null;
    if (!preg_match($patrones[$m[1]], $m[2])) return null;
    return $base + ['pais' => $m[1], 'tipo' => 'iva_ue', 'normalizado' => $id, 'iva_ue' => true];
}

function contrata_file_pub(): string { return contrata_ensure_dir() . '/disponibilidad.json'; }
function contrata_file_ret(): string { return contrata_ensure_dir() . '/retenciones.json'; }
function contrata_file_ses(): string { return contrata_ensure_dir() . '/sesiones.json'; }
function contrata_file_eventos(): string { return contrata_ensure_dir() . '/eventos.jsonl'; }
function contrata_file_cola(): string { return contrata_ensure_dir() . '/cola.jsonl'; }
function contrata_file_cola_estado(): string { return contrata_ensure_dir() . '/cola-estado.jsonl'; }

function contrata_cargar_publicacion(): ?array {
    $j = contrata_leer_json(contrata_file_pub(), []);
    if (!isset($j['generado'], $j['cuerpo']) || !is_array($j['cuerpo'])) return null;
    return $j;
}

function contrata_publicacion_fresca(?array $pub, ?int $ahora = null): bool {
    if (!$pub) return false;
    $ts = strtotime((string)$pub['generado']);
    if ($ts === false) return false;
    $ahora = $ahora ?? contrata_ahora();
    $edad = $ahora - $ts;
    return $edad >= -CONTRATA_FIRMA_VENTANA && $edad <= CONTRATA_FRESCURA_SEG;
}

/** @return array{http:int,body:array} */
function contrata_post_disponibilidad(string $raw, array $server): array {
    if (strlen($raw) > 100000) return ['http' => 413, 'body' => ['ok' => false, 'error' => 'Cuerpo demasiado grande.']];
    if (str_contains($raw, '@')) return ['http' => 400, 'body' => ['ok' => false, 'error' => 'La publicación no puede llevar datos personales.']];
    $secret = contrata_config()['hmac_secret'];
    $ts = (string)($server['HTTP_X_SOBTREE_TIMESTAMP'] ?? '');
    $firma = (string)($server['HTTP_X_SOBTREE_SIGNATURE'] ?? '');
    if (!contrata_firma_ok($secret, $ts, $firma, $raw)) {
        contrata_auditar('publicacion_rechazada', ['motivo' => 'firma']);
        return ['http' => 401, 'body' => ['ok' => false, 'error' => 'Firma no válida.']];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) return ['http' => 400, 'body' => ['ok' => false, 'error' => 'JSON no válido.']];
    $err = contrata_validar_cuerpo_publicado($data);
    if ($err !== null) return ['http' => 400, 'body' => ['ok' => false, 'error' => $err]];
    $generado = (string)$data['generado'];
    $gts = strtotime($generado);
    $ahora = contrata_ahora();
    if ($gts === false || $ahora - $gts > CONTRATA_FRESCURA_SEG || $gts - $ahora > CONTRATA_FIRMA_VENTANA) {
        return ['http' => 400, 'body' => ['ok' => false, 'error' => 'La marca de tiempo de la publicación no es válida.']];
    }
    contrata_con_bloqueo(function () use ($data, $raw, $generado) {
        contrata_guardar_json(contrata_file_pub(), [
            'recibido' => gmdate('c'),
            'generado' => $generado,
            'huella' => hash('sha256', $raw),
            'cuerpo' => $data,
        ]);
    });
    contrata_auditar('publicacion', [
        'generado' => $generado,
        'semanas' => count($data['semanas']),
        'huella' => hash('sha256', $raw),
    ]);
    return ['http' => 200, 'body' => ['ok' => true]];
}

function contrata_validar_cuerpo_publicado(array $data): ?string {
    $permitidas = ['generado', 'max_proyectos_simultaneos', 'semanas'];
    foreach (array_keys($data) as $k) if (!in_array($k, $permitidas, true)) return 'Campo no permitido.';
    if (!isset($data['generado']) || !is_string($data['generado'])) return 'Falta generado.';
    if (($data['max_proyectos_simultaneos'] ?? null) !== CONTRATA_MAX_PROYECTOS) return 'La capacidad no coincide.';
    if (!isset($data['semanas']) || !is_array($data['semanas']) || count($data['semanas']) !== CONTRATA_SEMANAS_VISIBLES) return 'Hacen falta 4 semanas.';
    $hoy = contrata_hoy();
    $esperada = contrata_primer_lunes($hoy);
    foreach ($data['semanas'] as $i => $s) {
        if (!is_array($s)) return 'Semana no válida.';
        foreach (array_keys($s) as $k) if (!in_array($k, ['lunes', 'plazas', 'bloqueada', 'proyectos', 'sesiones'], true)) return 'Campo de semana no permitido.';
        $lunes = (string)($s['lunes'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $lunes) || !contrata_es_lunes($lunes)) return 'El inicio tiene que ser un lunes.';
        if ($lunes !== contrata_sumar_dias($esperada, $i * 7)) return 'La semana no sigue el calendario de publicación.';
        $bloqueada = (bool)($s['bloqueada'] ?? false);
        $proyectos = $s['proyectos'] ?? null;
        $plazas = $s['plazas'] ?? null;
        if (!is_int($proyectos) || $proyectos < 0 || !is_int($plazas) || $plazas < 0) return 'Plazas no válidas.';
        $calculadas = $bloqueada ? 0 : max(0, CONTRATA_MAX_PROYECTOS - $proyectos);
        if ($plazas !== $calculadas) return 'Las plazas no cuadran con la fórmula.';
        if ($bloqueada && $plazas !== 0) return 'Una semana bloqueada tiene 0 plazas.';
        $sesiones = $s['sesiones'] ?? [];
        if (!is_array($sesiones)) return 'Sesiones no válidas.';
        foreach ($sesiones as $sid) {
            if (!is_string($sid) || !preg_match('/^cs_test_[A-Za-z0-9_]+$/', $sid)) return 'Identificador de sesión no permitido.';
        }
    }
    return null;
}

function contrata_leer_retenciones(): array {
    $j = contrata_leer_json(contrata_file_ret(), ['retenciones' => []]);
    if (!isset($j['retenciones']) || !is_array($j['retenciones'])) return ['retenciones' => []];
    return $j;
}

function contrata_retencion_cuenta(array $r, string $semana, array $sesionesYaEnCalendario, int $ahora): bool {
    if (($r['semana'] ?? '') !== $semana) return false;
    $estado = $r['estado'] ?? '';
    $sesion = (string)($r['sesion'] ?? '');
    if ($sesion !== '' && in_array($sesion, $sesionesYaEnCalendario, true)) return false;
    if ($estado === 'pagada') return true;
    if ($estado === 'retenida' && (int)($r['expira'] ?? 0) > $ahora) return true;
    return false;
}

function contrata_estado_publico(): array {
    $pub = contrata_cargar_publicacion();
    $cerrado = function (string $motivo): array {
        return [
            'ok' => false,
            'fallo' => 'cerrado',
            'motivo' => $motivo,
            'reserva' => ['href' => '/#contacto', 'texto' => CONTRATA_MSG_RESERVA],
        ];
    };
    if (!$pub) return $cerrado('sin_datos');
    if (!contrata_publicacion_fresca($pub)) return $cerrado('antiguo');
    $cuerpo = $pub['cuerpo'];
    if (contrata_validar_cuerpo_publicado($cuerpo) !== null) return $cerrado('firma');
    $ahora = contrata_ahora();
    $hoy = contrata_hoy();
    $rets = contrata_leer_retenciones()['retenciones'];
    $semanas = [];
    $proxima = null;
    foreach ($cuerpo['semanas'] as $s) {
        $sesiones = $s['sesiones'] ?? [];
        $activas = 0;
        foreach ($rets as $r) if (contrata_retencion_cuenta($r, $s['lunes'], $sesiones, $ahora)) $activas++;
        $libres = max(0, (int)$s['plazas'] - $activas);
        $texto = contrata_texto_plazas($libres, $s['lunes'], CONTRATA_MAX_PROYECTOS, $hoy);
        $fila = [
            'lunes' => $s['lunes'],
            'libres' => $libres,
            'plazas_publicadas' => (int)$s['plazas'],
            'bloqueada' => (bool)$s['bloqueada'],
            'texto_plazas' => $texto,
        ];
        $semanas[] = $fila;
        if ($proxima === null && $libres >= 1) {
            $proxima = ['lunes' => $s['lunes'], 'texto' => contrata_texto_proxima($s['lunes'], $hoy)];
        }
    }
    $precio = contrata_importes();
    unset($precio['base_eur']);
    $servicios = [];
    foreach (contrata_servicios() as $sid => $sdef) {
        $im = contrata_importes($sid);
        $servicios[] = [
            'id' => $sid,
            'nombre' => $sdef['nombre'],
            'base_centimos' => $im['base_centimos'],
            'total_centimos' => $im['total_centimos'],
            'total_texto' => $im['total_texto'],
            'dias_bloqueo' => (int)$sdef['dias_bloqueo'],
        ];
    }
    $out = [
        'ok' => true,
        'generado' => $pub['generado'],
        'max_proyectos_simultaneos' => CONTRATA_MAX_PROYECTOS,
        'precio' => $precio,
        'servicios' => $servicios,
        'proxima' => $proxima,
        'semanas' => $semanas,
        'csrf' => contrata_csrf_emitir(),
        'retencion_minutos' => (int)(CONTRATA_RETENCION_SEG / 60),
        'condiciones' => contrata_texto_descuento(),
        'aviso_fecha' => CONTRATA_MSG_FECHA,
    ];
    if ($proxima === null) $out['sin_plazas_texto'] = CONTRATA_MSG_SIN_PLAZAS;
    return $out;
}

function contrata_barrer(int $ahora = 0): int {
    $ahora = $ahora ?: contrata_ahora();
    return (int)contrata_con_bloqueo(function () use ($ahora) {
        $data = contrata_leer_retenciones();
        $n = 0;
        foreach ($data['retenciones'] as &$r) {
            if (($r['estado'] ?? '') === 'retenida' && (int)($r['expira'] ?? 0) <= $ahora) {
                $r['estado'] = 'liberada';
                $r['liberada'] = gmdate('c', $ahora);
                $r['motivo'] = 'caducada';
                unset($r['nif']);
                $n++;
            }
        }
        unset($r);
        if ($n > 0) contrata_guardar_json(contrata_file_ret(), $data);
        return $n;
    });
}

function contrata_origen_ok(): bool {
    $hosts = ['sobtree.com', 'www.sobtree.com'];
    $h = parse_url(contrata_config()['public_url'], PHP_URL_HOST);
    if (is_string($h) && $h !== '') $hosts[] = $h;
    if (contrata_modo() === 'simulacion') array_push($hosts, '127.0.0.1', 'localhost');
    $hosts = array_unique($hosts);
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    $referer = (string)($_SERVER['HTTP_REFERER'] ?? '');
    $candidato = $origin !== '' ? $origin : $referer;
    if ($candidato !== '') {
        $host = parse_url($candidato, PHP_URL_HOST);
        return is_string($host) && in_array($host, $hosts, true);
    }
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    return contrata_modo() === 'simulacion' && in_array($ip, ['127.0.0.1', '::1'], true);
}

function contrata_rate_ok(string $ip): bool {
    if (contrata_modo() === 'simulacion' && getenv('CONTRATA_SIN_LIMITE') === '1') return true;
    $lock = sys_get_temp_dir() . '/sobtree_contrata_' . hash('sha256', $ip);
    if (is_file($lock) && (time() - filemtime($lock)) < 10) return false;
    @touch($lock);
    return true;
}

/** @return array{http:int,body:array} */
function contrata_abrir_sesion(array $in, array $ctx = []): array {
    if (!empty($in['web'])) return ['http' => 200, 'body' => ['ok' => true]];
    if (!empty($in['_too_big'])) return ['http' => 413, 'body' => ['ok' => false, 'error' => 'Cuerpo demasiado grande.']];
    $cfg = contrata_config();
    if ($cfg['clave_prohibida'] || !contrata_stripe_utilizable()) {
        return ['http' => 503, 'body' => ['ok' => false, 'error' => CONTRATA_MSG_PAGO, 'motivo' => 'pago_no_disponible']];
    }
    if (empty($ctx['cli']) && !contrata_origen_ok()) {
        return ['http' => 403, 'body' => ['ok' => false, 'error' => 'Origen no permitido.']];
    }
    if (!contrata_csrf_validar((string)($in['csrf'] ?? ''))) {
        return ['http' => 400, 'body' => ['ok' => false, 'error' => 'La sesión del formulario ha caducado. Vuelve a cargar la página.']];
    }
    $producto = (string)($in['producto'] ?? '');
    $servicio = contrata_servicio($producto);
    if ($servicio === null) {
        return ['http' => 422, 'body' => ['ok' => false, 'error' => 'Ese producto no se puede contratar online.']];
    }
    $empresa = trim((string)($in['empresa'] ?? ''));
    $empresa = str_replace(["\r", "\n", "\0"], ' ', $empresa);
    if ($empresa === '' || mb_strlen($empresa) > 200) {
        return ['http' => 422, 'body' => ['ok' => false, 'error' => 'Indica el nombre de la empresa.']];
    }
    $email = mb_strtolower(trim((string)($in['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
        return ['http' => 422, 'body' => ['ok' => false, 'error' => 'El email no es válido.']];
    }
    $nif = contrata_validar_identificacion((string)($in['nif'] ?? ''));
    if ($nif === null) {
        return ['http' => 422, 'body' => ['ok' => false, 'error' => 'El NIF o CIF no tiene un formato válido. Solo vendemos a empresas y autónomos.']];
    }
    if (($nif['pais'] ?? '') !== 'ES') {
        return ['http' => 422, 'body' => ['ok' => false, 'motivo' => 'fuera_de_espana', 'error' => 'Por ahora solo cobramos online a empresas y autónomos con NIF o CIF español. Si tu empresa está en otro país, escríbenos a info@sobtree.com y te preparamos la factura sin IVA español cuando corresponda.']];
    }
    if (($in['condiciones'] ?? '') !== 'si') {
        return ['http' => 422, 'body' => ['ok' => false, 'error' => 'Hay que aceptar las condiciones y la política de privacidad.']];
    }
    $semana = (string)($in['semana'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $semana) || !contrata_es_lunes($semana)) {
        return ['http' => 422, 'body' => ['ok' => false, 'error' => 'Elige un lunes de inicio.']];
    }
    $estado = contrata_estado_publico();
    if (($estado['ok'] ?? false) !== true) {
        return ['http' => 409, 'body' => ['ok' => false, 'fallo' => 'cerrado', 'error' => CONTRATA_MSG_RESERVA]];
    }
    $fila = null;
    foreach ($estado['semanas'] as $s) if ($s['lunes'] === $semana) $fila = $s;
    if ($fila === null) return ['http' => 409, 'body' => ['ok' => false, 'error' => 'Esa semana no está disponible.']];
    if ((int)$fila['libres'] < 1) return ['http' => 409, 'body' => ['ok' => false, 'error' => CONTRATA_MSG_SEMANA, 'motivo' => 'semana_completa']];
    $ip = (string)($ctx['ip'] ?? ($_SERVER['REMOTE_ADDR'] ?? 'cli'));
    if (!contrata_rate_ok($ip)) {
        return ['http' => 429, 'body' => ['ok' => false, 'error' => 'Acabas de abrir un pago. Espera unos segundos.']];
    }

    $utm = [];
    foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as $k) {
        $v = trim((string)($in[$k] ?? ''));
        $v = str_replace(["\r", "\n", "\0"], '', $v);
        if ($v !== '') $utm[$k] = mb_substr($v, 0, 150);
    }
    $leadId = trim((string)($in['lead_id'] ?? ''));
    if ($leadId !== '' && !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $leadId)) $leadId = '';

    $ret = null;
    try {
        $ret = contrata_con_bloqueo(function () use ($semana, $producto) {
            $ahora = contrata_ahora();
            $pub = contrata_cargar_publicacion();
            if (!contrata_publicacion_fresca($pub, $ahora)) return null;
            $cuerpoSem = null;
            foreach ($pub['cuerpo']['semanas'] as $s) if ($s['lunes'] === $semana) $cuerpoSem = $s;
            if ($cuerpoSem === null) return ['fuera' => true];
            $data = contrata_leer_retenciones();
            foreach ($data['retenciones'] as &$r) {
                if (($r['estado'] ?? '') === 'retenida' && (int)$r['expira'] <= $ahora) {
                    $r['estado'] = 'liberada';
                    $r['motivo'] = 'caducada';
                    unset($r['nif']);
                }
            }
            unset($r);
            $activas = 0;
            foreach ($data['retenciones'] as $r) {
                if (contrata_retencion_cuenta($r, $semana, $cuerpoSem['sesiones'] ?? [], $ahora)) $activas++;
            }
            if ((int)$cuerpoSem['plazas'] - $activas < 1) {
                contrata_guardar_json(contrata_file_ret(), $data);
                return ['completa' => true];
            }
            $id = 'ret_' . bin2hex(random_bytes(8));
            $expira = $ahora + CONTRATA_RETENCION_SEG;
            $data['retenciones'][] = [
                'id' => $id,
                'semana' => $semana,
                'expira' => $expira,
                'estado' => 'retenida',
                'sesion' => '',
                'servicio' => $producto,
                'creada' => gmdate('c', $ahora),
            ];
            contrata_guardar_json(contrata_file_ret(), $data);
            return ['id' => $id, 'semana' => $semana, 'expira' => $expira, 'servicio' => $producto];
        });
    } catch (Throwable $e) {
        error_log('contrata retener: ' . $e->getMessage());
        return ['http' => 503, 'body' => ['ok' => false, 'error' => CONTRATA_MSG_PAGO]];
    }
    if (!is_array($ret) || isset($ret['completa']) || isset($ret['fuera']) || $ret === null) {
        $msg = (is_array($ret) && isset($ret['completa'])) ? CONTRATA_MSG_SEMANA : (($ret === null) ? CONTRATA_MSG_RESERVA : 'Esa semana no está disponible.');
        $code = ($ret === null) ? 409 : 409;
        $body = ['ok' => false, 'error' => $msg];
        if (is_array($ret) && isset($ret['completa'])) $body['motivo'] = 'semana_completa';
        if ($ret === null) $body['fallo'] = 'cerrado';
        return ['http' => $code, 'body' => $body];
    }

    $cliente = ['email' => $email, 'empresa' => $empresa, 'nif' => $nif, 'utm' => $utm, 'lead_id' => $leadId];
    try {
        $sesion = contrata_stripe_crear_sesion($ret, $cliente);
    } catch (Throwable $e) {
        error_log('contrata stripe: ' . $e->getMessage());
        contrata_marcar_retencion($ret['id'], ['estado' => 'liberada', 'motivo' => 'stripe_error', 'liberada' => gmdate('c'), 'nif' => null]);
        return ['http' => 502, 'body' => ['ok' => false, 'error' => CONTRATA_MSG_PAGO]];
    }
    // El NIF se guarda solo en la retención (fuera de la web, 0600) hasta que llega el pago; ahí se usa y se borra.
    contrata_marcar_retencion($ret['id'], ['sesion' => $sesion['id'], 'nif' => contrata_nif_normal((string)$nif['normalizado'])]);
    $imp = contrata_importes($producto);
    return ['http' => 200, 'body' => [
        'ok' => true,
        'servicio' => $producto,
        'url' => $sesion['url'],
        'sesion' => $sesion['id'],
        'expira' => $ret['expira'],
        'total_centimos' => $imp['total_centimos'],
        'total_texto' => $imp['total_texto'],
    ]];
}

function contrata_marcar_retencion(string $id, array $cambios): void {
    contrata_con_bloqueo(function () use ($id, $cambios) {
        $data = contrata_leer_retenciones();
        foreach ($data['retenciones'] as &$r) {
            if (($r['id'] ?? '') === $id) {
                foreach ($cambios as $k => $v) $r[$k] = $v;
            }
        }
        unset($r);
        contrata_guardar_json(contrata_file_ret(), $data);
    });
}

/** NIF/CIF sin el prefijo ES y sin separadores, que es como lo guarda Stripe en un tax_id es_cif. */
function contrata_nif_normal(string $v): string {
    $v = strtoupper((string)preg_replace('/[^A-Za-z0-9]/', '', $v));
    return str_starts_with($v, 'ES') && strlen($v) === 11 ? substr($v, 2) : $v;
}

/**
 * Parámetros de Checkout. Cliente creado antes (con su NIF como tax_id), dirección de facturación obligatoria,
 * IVA 21 % incluido en el Price (tax rate manual inclusive) y factura automática tras el pago.
 * $nifEnFactura: solo si Stripe no aceptó el NIF como tax_id; entonces va como campo personalizado de la factura.
 */
function contrata_parametros_sesion(array $ret, array $cliente, string $customerId = '', bool $nifEnFactura = false): array {
    $servicioId = (string)($ret['servicio'] ?? CONTRATA_PRODUCTO_DEFECTO);
    $servicio = contrata_servicio($servicioId);
    if ($servicio === null) throw new RuntimeException('servicio');
    $imp = contrata_importes($servicioId);
    $cfg = contrata_config();
    $price = contrata_price_de($servicioId);
    if ($price === '') {
        if (contrata_modo() !== 'simulacion') throw new RuntimeException('sin price');
        $price = CONTRATA_PRICE_TEST;
    }
    if (!preg_match('/^price_[A-Za-z0-9_]+$/', $price)) throw new RuntimeException('price');
    $tax = $cfg['stripe_tax_rate'];
    if ($tax === '') {
        if (contrata_modo() !== 'simulacion') throw new RuntimeException('sin tax rate');
        $tax = CONTRATA_TAX_RATE_TEST;
    }
    if (!preg_match('/^txr_[A-Za-z0-9_]+$/', $tax)) throw new RuntimeException('tax rate');
    if ($customerId === '') {
        if (contrata_modo() !== 'simulacion') throw new RuntimeException('sin cliente');
        $customerId = 'cus_test_simulado';
    }
    $semanaTxt = 'lunes ' . contrata_fecha_larga($ret['semana'], contrata_hoy());
    $mensaje = 'Semana de inicio: ' . $semanaTxt . '. '
        . contrata_texto_descuento() . ' Total a pagar: ' . $imp['total_texto']
        . ' (' . $imp['base_texto'] . ' + IVA ' . CONTRATA_IVA_PORCIENTO . ' %: ' . $imp['iva_texto'] . '). '
        . CONTRATA_MSG_FECHA;
    if (mb_strlen($mensaje) > 1100) $mensaje = mb_substr($mensaje, 0, 1100);
    $meta = [
        'producto' => $servicioId,
        'semana_lunes' => $ret['semana'],
        'retencion_id' => $ret['id'],
        'politica_version' => CONTRATA_POLITICA_VERSION,
        'condiciones_version' => CONTRATA_CONDICIONES_VERSION,
        'importe_base_centimos' => (string)$imp['base_centimos'],
        'iva_porcentaje' => (string)CONTRATA_IVA_PORCIENTO,
        'importe_total_centimos' => (string)$imp['total_centimos'],
        'price_id' => $price,
        'nif_pais' => $cliente['nif']['pais'],
        'nif_tipo' => $cliente['nif']['tipo'],
        'nif_verificado' => '0',
        'empresa' => mb_substr($cliente['empresa'], 0, 200),
    ];
    foreach ($cliente['utm'] as $k => $v) $meta[$k] = $v;
    if ($cliente['lead_id'] !== '') $meta['lead_id'] = $cliente['lead_id'];
    $base = $cfg['public_url'];
    $datosFactura = [
        'description' => $servicio['nombre'] . '. Semana de inicio: ' . $semanaTxt . '.',
        'metadata' => ['retencion_id' => $ret['id'], 'semana_lunes' => $ret['semana'], 'producto' => $servicioId],
    ];
    if ($nifEnFactura) {
        $datosFactura['custom_fields'] = [['name' => 'NIF/CIF', 'value' => contrata_nif_normal((string)$cliente['nif']['normalizado'])]];
    }
    return [
        'mode' => 'payment',
        'line_items' => [[
            'price' => $price,
            'quantity' => 1,
            'tax_rates' => [$tax],
        ]],
        'expires_at' => $ret['expira'],
        'success_url' => $base . contrata_ruta('gracias/?sesion={CHECKOUT_SESSION_ID}'),
        'cancel_url' => $base . contrata_ruta('?cancelado=1'),
        'customer' => $customerId,
        'customer_update' => ['address' => 'auto'],
        'billing_address_collection' => 'required',
        'invoice_creation' => ['enabled' => 'true', 'invoice_data' => $datosFactura],
        'locale' => 'es',
        'consent_collection' => ['terms_of_service' => 'required'],
        'custom_text' => [
            'submit' => ['message' => $mensaje],
            // La casilla de Stripe enlaza nuestras condiciones. La URL de condiciones también va en Dashboard → Ajustes → Datos públicos.
            'terms_of_service_acceptance' => ['message' => 'Acepto las [condiciones de contratación](' . $base . contrata_ruta_condiciones() . ') y la [política de privacidad](' . $base . '/privacidad/) (versión ' . CONTRATA_POLITICA_VERSION . ').'],
        ],
        'metadata' => $meta,
        'payment_method_types' => ['card', 'link'],
    ];
}

function contrata_stripe_crear_sesion(array $ret, array $cliente): array {
    $servicioId = (string)($ret['servicio'] ?? CONTRATA_PRODUCTO_DEFECTO);
    $imp = contrata_importes($servicioId);
    $live = contrata_livemode_esperado();
    if (contrata_modo() === 'simulacion') {
        $params = contrata_parametros_sesion($ret, $cliente);
        if (!contrata_price_coincide($imp['total_centimos'], 'eur', false, $servicioId)) {
            throw new RuntimeException('importe');
        }
        $id = 'cs_test_' . bin2hex(random_bytes(12));
        $url = contrata_config()['public_url'] . '/api/contrata/sim/checkout.php?sesion=' . rawurlencode($id);
        if (!contrata_url_pago_permitida($url)) throw new RuntimeException('url');
        $sesion = [
            'id' => $id,
            'livemode' => false,
            'currency' => 'eur',
            'amount_total' => $imp['total_centimos'],
            'status' => 'open',
            'url' => $url,
            'params' => $params,
            'payment_intent' => 'pi_test_' . bin2hex(random_bytes(10)),
            'cliente' => [
                'email' => $cliente['email'],
                'empresa' => $cliente['empresa'],
                'nif' => $cliente['nif'],
            ],
            'retencion_id' => $ret['id'],
            'creada' => contrata_ahora(),
        ];
        contrata_con_bloqueo(function () use ($id, $sesion) {
            $all = contrata_leer_json(contrata_file_ses(), ['sesiones' => []]);
            $all['sesiones'][$id] = $sesion;
            contrata_guardar_json(contrata_file_ses(), $all);
        });
        return ['id' => $id, 'url' => $url];
    }
    $cfg = contrata_config();
    $price = contrata_stripe_leer_price(contrata_price_de($servicioId));
    if (!contrata_price_coincide((int)($price['unit_amount'] ?? 0), (string)($price['currency'] ?? ''), (bool)($price['livemode'] ?? false), $servicioId)) {
        throw new RuntimeException('El Price de Stripe no coincide con el servicio (base + IVA) o su modo (test/live) no es el configurado.');
    }
    $tr = contrata_stripe_request('GET', '/v1/tax_rates/' . rawurlencode($cfg['stripe_tax_rate']));
    if (!(abs((float)($tr['percentage'] ?? 0) - CONTRATA_IVA_PORCIENTO) < 0.0001 && ($tr['inclusive'] ?? null) === true
        && ($tr['active'] ?? null) === true && (bool)($tr['livemode'] ?? false) === $live)) {
        throw new RuntimeException('El tax rate de Stripe no es el IVA 21 % incluido, activo y del modo configurado.');
    }
    // 1) Cliente con su NIF como tax_id. Si Stripe no lo acepta, el cliente se crea sin él y el NIF va en la factura.
    $idem = 'contrata-' . $ret['id'];
    $formCliente = [
        'name' => $cliente['empresa'],
        'email' => $cliente['email'],
        'metadata' => ['origen' => 'contrata', 'retencion_id' => $ret['id']],
    ];
    $nifEnFactura = false;
    try {
        $cus = contrata_stripe_request('POST', '/v1/customers', contrata_form_aplanar($formCliente + [
            'tax_id_data' => [['type' => 'es_cif', 'value' => contrata_nif_normal((string)$cliente['nif']['normalizado'])]],
        ]), $idem . '-cus');
    } catch (RuntimeException $e) {
        if ($e->getMessage() !== 'stripe_http_400') throw $e;
        $nifEnFactura = true;
        $cus = contrata_stripe_request('POST', '/v1/customers', contrata_form_aplanar($formCliente), $idem . '-cus-sin-nif');
        contrata_auditar('nif_sin_tax_id', ['retencion' => $ret['id']]);
    }
    $customerId = (string)($cus['id'] ?? '');
    if (!preg_match('/^cus_[A-Za-z0-9_]+$/', $customerId) || (bool)($cus['livemode'] ?? false) !== $live) {
        throw new RuntimeException('cliente de Stripe no aceptado');
    }
    // 2) Sesión de Checkout.
    $params = contrata_parametros_sesion($ret, $cliente, $customerId, $nifEnFactura);
    $resp = contrata_stripe_request('POST', '/v1/checkout/sessions', contrata_form_aplanar($params), $idem . '-ses');
    if ((bool)($resp['livemode'] ?? false) !== $live) throw new RuntimeException('modo de la sesión no coincide');
    $url = (string)($resp['url'] ?? '');
    $id = (string)($resp['id'] ?? '');
    $prefijo = $live ? 'cs_' . 'live_' : 'cs_test_';
    if (!str_starts_with($id, $prefijo) || !contrata_url_pago_permitida($url)) {
        throw new RuntimeException('respuesta de Stripe no aceptada');
    }
    return ['id' => $id, 'url' => $url];
}

function contrata_url_pago_permitida(string $url): bool {
    $p = parse_url($url);
    if (!is_array($p) || empty($p['host'])) return false;
    if (contrata_modo() === 'simulacion') {
        $base = parse_url(contrata_config()['public_url']);
        $path = $p['path'] ?? '';
        return ($p['host'] === ($base['host'] ?? ''))
            && (int)($p['port'] ?? ($p['scheme'] === 'https' ? 443 : 80)) === (int)($base['port'] ?? ($base['scheme'] === 'https' ? 443 : 80))
            && $path === '/api/contrata/sim/checkout.php'
            && str_contains((string)($p['query'] ?? ''), 'sesion=cs_test_');
    }
    return ($p['scheme'] ?? '') === 'https' && strtolower((string)$p['host']) === 'checkout.stripe.com';
}

function contrata_form_aplanar(array $data, string $prefix = ''): array {
    $out = [];
    foreach ($data as $k => $v) {
        $key = $prefix === '' ? (string)$k : $prefix . '[' . $k . ']';
        if (is_array($v)) $out += contrata_form_aplanar($v, $key);
        else $out[$key] = (string)$v;
    }
    return $out;
}

function contrata_stripe_leer_price(string $priceId): array {
    return contrata_stripe_request('GET', '/v1/prices/' . rawurlencode($priceId));
}

function contrata_stripe_request(string $method, string $path, array $form = [], string $idempotencia = ''): array {
    $c = contrata_config();
    $reClave = $c['live'] ? '/^(rk|sk)_' . 'live_/' : '/^(rk|sk)_test_/';
    if ($c['clave_prohibida'] || !in_array($c['modo'], ['stripe_test', 'stripe_live'], true) || !preg_match($reClave, $c['stripe_key'])) {
        throw new RuntimeException('clave de Stripe no utilizable');
    }
    if (!function_exists('curl_init')) throw new RuntimeException('curl');
    $baseEnv = getenv('CONTRATA_STRIPE_API_BASE');
    $base = 'https://api.stripe.com';
    if (is_string($baseEnv) && preg_match('#^https://api\.stripe\.com$#', $baseEnv)) {
        $base = $baseEnv;
    } elseif (is_string($baseEnv) && getenv('CONTRATA_ALLOW_HTTP_WEBHOOK') === '1' && preg_match('#^http://127\.0\.0\.1:\d+$#', $baseEnv)) {
        $base = $baseEnv;
    }
    $ch = curl_init($base . $path);
    $cabeceras = [
        'Authorization: Bearer ' . $c['stripe_key'],
        'Content-Type: application/x-www-form-urlencoded',
    ];
    if ($idempotencia !== '' && $method === 'POST') $cabeceras[] = 'Idempotency-Key: ' . substr($idempotencia, 0, 200);
    $opts = [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $cabeceras,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_FOLLOWLOCATION => false,
    ];
    if ($method !== 'GET') $opts[CURLOPT_POSTFIELDS] = http_build_query($form);
    curl_setopt_array($ch, $opts);
    $resp = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if (!is_string($resp) || $status < 200 || $status >= 300) {
        throw new RuntimeException($err !== '' ? 'stripe_red' : 'stripe_http_' . $status);
    }
    $json = json_decode($resp, true);
    if (!is_array($json)) throw new RuntimeException('stripe_json');
    return $json;
}

function contrata_verificar_firma_stripe(string $payload, string $header, string $secret): array {
    if ($secret === '' || str_contains($secret, contrata_marca_live('sk')) || str_contains($secret, contrata_marca_live('rk'))) {
        throw new RuntimeException('secreto');
    }
    $t = '';
    $v1 = [];
    foreach (explode(',', $header) as $part) {
        $part = trim($part);
        if (str_starts_with($part, 't=')) $t = substr($part, 2);
        elseif (str_starts_with($part, 'v1=')) $v1[] = substr($part, 3);
    }
    if (!preg_match('/^\d+$/', $t) || abs(contrata_ahora() - (int)$t) > CONTRATA_FIRMA_VENTANA) {
        throw new RuntimeException('timestamp');
    }
    $esperada = hash_hmac('sha256', $t . '.' . $payload, $secret);
    $ok = false;
    foreach ($v1 as $firma) {
        if (strlen($firma) === strlen($esperada) && hash_equals($esperada, $firma)) $ok = true;
    }
    if (!$ok) throw new RuntimeException('firma');
    $event = json_decode($payload, true);
    if (!is_array($event) || !isset($event['id'], $event['type']) || !is_string($event['id'])) {
        throw new RuntimeException('evento');
    }
    return $event;
}

function contrata_evento_nuevo(string $id): bool {
    return (bool)contrata_con_bloqueo(function () use ($id) {
        $f = contrata_file_eventos();
        if (is_file($f)) {
            foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $row = json_decode($line, true);
                if (is_array($row) && ($row['id'] ?? '') === $id) return false;
            }
        }
        return contrata_append($f, ['id' => $id, 'fecha' => gmdate('c')]);
    });
}

/** @return array{http:int,body:array} */
function contrata_recibir_webhook(string $raw, string $header): array {
    try {
        $event = contrata_verificar_firma_stripe($raw, $header, contrata_config()['webhook_secret']);
    } catch (Throwable $e) {
        contrata_auditar('webhook_rechazado', ['motivo' => 'firma']);
        return ['http' => 400, 'body' => ['ok' => false, 'error' => 'Firma no válida.']];
    }
    if ((bool)($event['livemode'] ?? false) !== contrata_livemode_esperado()) {
        // Un evento de otro modo (test en live o live en test) se acusa sin tocar nada.
        contrata_auditar('webhook_modo_distinto', ['tipo' => (string)($event['type'] ?? '')]);
        return ['http' => 200, 'body' => ['ok' => true, 'ignorado' => 'livemode']];
    }
    if (!contrata_evento_nuevo((string)$event['id'])) {
        return ['http' => 200, 'body' => ['ok' => true, 'duplicado' => true]];
    }
    $tipo = (string)$event['type'];
    $obj = $event['data']['object'] ?? [];
    if (!is_array($obj)) $obj = [];
    if ($tipo === 'checkout.session.completed') {
        contrata_aplicar_pago($obj, (string)$event['id']);
    } elseif ($tipo === 'checkout.session.expired') {
        contrata_aplicar_expiracion($obj);
    } elseif ($tipo === 'charge.refunded') {
        contrata_aplicar_reembolso($obj, (string)$event['id']);
    } else {
        contrata_auditar('webhook_ignorado', ['tipo' => $tipo]);
    }
    return ['http' => 200, 'body' => ['ok' => true]];
}

function contrata_meta(array $obj): array {
    $m = $obj['metadata'] ?? [];
    return is_array($m) ? $m : [];
}

/** Alerta de territorio con otro régimen de IVA (Canarias, Ceuta y Melilla) o dirección fuera de España. */
function contrata_alerta_territorio(array $detalles): string {
    $dir = is_array($detalles['address'] ?? null) ? $detalles['address'] : [];
    $pais = strtoupper((string)($dir['country'] ?? ''));
    if ($pais === '') return '';
    if ($pais !== 'ES') return 'direccion_fuera_de_espana';
    $cp = (string)($dir['postal_code'] ?? '');
    if (preg_match('/^(35|38|51|52)\d{3}$/', $cp)) return 'territorio_sin_iva';
    return '';
}

function contrata_aplicar_pago(array $obj, string $eventId): void {
    $meta = contrata_meta($obj);
    $retId = (string)($meta['retencion_id'] ?? '');
    $sesion = (string)($obj['id'] ?? '');
    if (($obj['payment_status'] ?? '') !== 'paid') {
        // Solo un pago confirmado crea venta, plaza y aviso.
        contrata_auditar('pago_no_confirmado', ['estado' => (string)($obj['payment_status'] ?? '')]);
        return;
    }
    $fuera = false;
    $nifGuardado = '';
    $pi = (string)($obj['payment_intent'] ?? '');
    contrata_con_bloqueo(function () use ($retId, $sesion, $pi, &$fuera, &$nifGuardado) {
        $data = contrata_leer_retenciones();
        $tocada = false;
        foreach ($data['retenciones'] as &$r) {
            $match = ($retId !== '' && ($r['id'] ?? '') === $retId) || ($sesion !== '' && ($r['sesion'] ?? '') === $sesion);
            if (!$match) continue;
            if (($r['estado'] ?? '') === 'liberada') $fuera = true;
            if (($r['estado'] ?? '') !== 'reembolsada') $r['estado'] = 'pagada';
            if ($sesion !== '') $r['sesion'] = $sesion;
            if ($pi !== '') $r['payment_intent'] = $pi;
            $r['pagada'] = gmdate('c');
            if (isset($r['nif']) && is_string($r['nif'])) $nifGuardado = $r['nif'];
            unset($r['nif']); // ya no hace falta fuera del aviso a n8n
            $tocada = true;
        }
        unset($r);
        if ($tocada) contrata_guardar_json(contrata_file_ret(), $data);
    });
    if (contrata_modo() === 'simulacion' && $sesion !== '') {
        contrata_con_bloqueo(function () use ($sesion) {
            $all = contrata_leer_json(contrata_file_ses(), ['sesiones' => []]);
            if (isset($all['sesiones'][$sesion])) $all['sesiones'][$sesion]['status'] = 'paid';
            contrata_guardar_json(contrata_file_ses(), $all);
        });
    }
    $servicioId = (string)($meta['producto'] ?? CONTRATA_PRODUCTO_DEFECTO);
    $servicio = contrata_servicio($servicioId);
    $imp = contrata_importes($servicio !== null ? $servicioId : CONTRATA_PRODUCTO_DEFECTO);
    $detalles = is_array($obj['customer_details'] ?? null) ? $obj['customer_details'] : [];
    // NIF: el de la retención (lo que validó la web) y el tax_id que guarda Stripe tienen que coincidir.
    $nifStripe = '';
    foreach ((is_array($detalles['tax_ids'] ?? null) ? $detalles['tax_ids'] : []) as $t) {
        if (is_array($t) && ($t['type'] ?? '') === 'es_cif' && is_string($t['value'] ?? null)) { $nifStripe = contrata_nif_normal($t['value']); break; }
    }
    $nif = $nifGuardado !== '' ? contrata_nif_normal($nifGuardado) : $nifStripe;
    $coincide = ($nifGuardado !== '' && $nifStripe !== '') ? ($nifStripe === contrata_nif_normal($nifGuardado)) : null;
    $alerta = '';
    if ($servicio === null) {
        $alerta = 'servicio_desconocido';
    } elseif ((int)($obj['amount_total'] ?? $imp['total_centimos']) !== $imp['total_centimos'] || strtolower((string)($obj['currency'] ?? 'eur')) !== 'eur') {
        $alerta = 'importe_inesperado';
    } elseif ($coincide === false) {
        $alerta = 'nif_distinto';
    } elseif (($obj['consent']['terms_of_service'] ?? '') !== 'accepted') {
        $alerta = 'condiciones_sin_aceptar';
    } elseif ($nif === '') {
        $alerta = 'nif_ausente';
    } else {
        $alerta = contrata_alerta_territorio($detalles);
    }
    if ($alerta !== '') contrata_auditar('pago_con_alerta', ['alerta' => $alerta]);
    $email = (string)($detalles['email'] ?? $obj['customer_email'] ?? '');
    contrata_encolar_y_enviar([
        'tipo' => 'checkout.session.completed',
        'event_id' => $eventId,
        'cuerpo' => [
            'sesion' => $sesion,
            'retencion_id' => $retId,
            'producto' => $servicio !== null ? $servicioId : '',
            'servicio_nombre' => $servicio !== null ? (string)$servicio['nombre'] : '',
            'dias_bloqueo' => $servicio !== null ? (int)$servicio['dias_bloqueo'] : CONTRATA_DIAS_BLOQUEO_MAX,
            'semana_lunes' => (string)($meta['semana_lunes'] ?? ''),
            'importe_base_centimos' => $imp['base_centimos'],
            'iva_porcentaje' => CONTRATA_IVA_PORCIENTO,
            'importe_total_centimos' => (int)($obj['amount_total'] ?? $imp['total_centimos']),
            'empresa' => (string)($meta['empresa'] ?? ''),
            'email' => $email,
            'nif' => $nif,
            'nif_coincide' => $coincide,
            'nif_pais' => (string)($meta['nif_pais'] ?? ''),
            'nif_tipo' => (string)($meta['nif_tipo'] ?? ''),
            'nif_verificado' => false,
            'condiciones_aceptadas' => ($obj['consent']['terms_of_service'] ?? '') === 'accepted',
            'alerta_facturacion' => $alerta,
            'factura' => (string)($obj['invoice'] ?? ''),
            'politica_version' => (string)($meta['politica_version'] ?? ''),
            'lead_id' => (string)($meta['lead_id'] ?? ''),
            'fuera_de_orden' => $fuera,
            'livemode' => contrata_livemode_esperado(),
        ],
    ]);
}

function contrata_aplicar_expiracion(array $obj): void {
    $meta = contrata_meta($obj);
    $retId = (string)($meta['retencion_id'] ?? '');
    $sesion = (string)($obj['id'] ?? '');
    contrata_con_bloqueo(function () use ($retId, $sesion) {
        $data = contrata_leer_retenciones();
        foreach ($data['retenciones'] as &$r) {
            $match = ($retId !== '' && ($r['id'] ?? '') === $retId) || ($sesion !== '' && ($r['sesion'] ?? '') === $sesion);
            if (!$match) continue;
            if (($r['estado'] ?? '') === 'retenida') {
                $r['estado'] = 'liberada';
                $r['motivo'] = 'checkout_expired';
                $r['liberada'] = gmdate('c');
                unset($r['nif']);
            }
        }
        unset($r);
        contrata_guardar_json(contrata_file_ret(), $data);
    });
    contrata_auditar('expiracion', ['sesion' => $sesion !== '' ? 'presente' : 'ausente']);
}

function contrata_aplicar_reembolso(array $obj, string $eventId): void {
    $meta = contrata_meta($obj);
    $sesion = (string)($meta['checkout_session_id'] ?? '');
    $retId = (string)($meta['retencion_id'] ?? '');
    $pi = (string)($obj['payment_intent'] ?? '');
    $amount = (int)($obj['amount'] ?? 0);
    $devuelto = (int)($obj['amount_refunded'] ?? $amount);
    // Un reembolso parcial no libera la plaza ni cierra la venta.
    $total = array_key_exists('refunded', $obj) ? ($obj['refunded'] === true) : ($amount === 0 || $devuelto >= $amount);
    $semana = (string)($meta['semana_lunes'] ?? '');
    $encontrada = false;
    $servicioRet = '';
    contrata_con_bloqueo(function () use (&$retId, &$sesion, &$semana, $pi, $total, &$encontrada, &$servicioRet) {
        $data = contrata_leer_retenciones();
        foreach ($data['retenciones'] as &$r) {
            $match = ($retId !== '' && ($r['id'] ?? '') === $retId) || ($sesion !== '' && ($r['sesion'] ?? '') === $sesion)
                || ($pi !== '' && ($r['payment_intent'] ?? '') === $pi);
            if (!$match) continue;
            $encontrada = true;
            $servicioRet = (string)($r['servicio'] ?? '');
            if ($retId === '') $retId = (string)($r['id'] ?? '');
            if ($sesion === '') $sesion = (string)($r['sesion'] ?? '');
            if ($semana === '') $semana = (string)($r['semana'] ?? '');
            if ($total) {
                $r['estado'] = 'reembolsada';
                $r['reembolsada'] = gmdate('c');
            }
        }
        unset($r);
        contrata_guardar_json(contrata_file_ret(), $data);
    });
    if (!$encontrada) contrata_auditar('reembolso_sin_retencion', ['pi' => $pi !== '' ? 'presente' : 'ausente']);
    contrata_encolar_y_enviar([
        'tipo' => 'charge.refunded',
        'event_id' => $eventId,
        'cuerpo' => [
            'sesion' => $sesion,
            'retencion_id' => $retId,
            'semana_lunes' => $semana,
            'producto' => contrata_servicio($servicioRet) !== null ? $servicioRet : CONTRATA_PRODUCTO_DEFECTO,
            'estado' => $total ? 'reembolsada' : 'reembolso_parcial',
            'importe_reembolsado_centimos' => $devuelto,
            'livemode' => contrata_livemode_esperado(),
        ],
    ]);
}

function contrata_encolar_y_enviar(array $evento): array {
    $row = [
        'id' => contrata_uuid(),
        'fecha' => gmdate('c'),
        'tipo' => $evento['tipo'],
        'event_id' => $evento['event_id'],
        'cuerpo' => $evento['cuerpo'],
    ];
    if (!contrata_append(contrata_file_cola(), $row)) {
        error_log('contrata: no se pudo encolar ' . $evento['event_id']);
        return ['error', 'cola'];
    }
    return contrata_entregar($row);
}

function contrata_entregar(array $row): array {
    [$estado, $detalle] = contrata_enviar_webhook($row);
    contrata_marcar_cola($row['id'], $estado, $detalle);
    if ($estado === 'error') error_log('contrata: n8n falló para ' . $row['id'] . ': ' . $detalle);
    return [$estado, $detalle];
}

function contrata_marcar_cola(string $id, string $estado, string $detalle = ''): void {
    contrata_append(contrata_file_cola_estado(), [
        'id' => $id,
        'estado' => $estado,
        'detalle' => mb_substr($detalle, 0, 300),
        'fecha' => gmdate('c'),
    ]);
    if ($estado === 'enviado') contrata_purgar_nif_cola($id);
}

/** Entregado el aviso, el NIF deja de guardarse en la cola. */
function contrata_purgar_nif_cola(string $id): void {
    contrata_con_bloqueo(function () use ($id) {
        $f = contrata_file_cola();
        if (!is_file($f)) return;
        $out = [];
        $cambio = false;
        foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $row = json_decode($line, true);
            if (is_array($row) && ($row['id'] ?? '') === $id && isset($row['cuerpo']['nif']) && $row['cuerpo']['nif'] !== '') {
                $row['cuerpo']['nif'] = '';
                $line = (string)json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $cambio = true;
            }
            $out[] = $line;
        }
        if ($cambio) {
            $tmp = $f . '.tmp';
            if (@file_put_contents($tmp, implode("\n", $out) . "\n", LOCK_EX) !== false) @rename($tmp, $f);
        }
    });
}

function contrata_enviar_webhook(array $row): array {
    $c = contrata_config();
    if ($c['n8n_url'] === '' || $c['hmac_secret'] === '') return ['omitido', 'webhook_no_configurado'];
    if (!function_exists('curl_init')) return ['error', 'curl_no_disponible'];
    $body = json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($body === false) return ['error', 'json'];
    $ts = (string)contrata_ahora();
    $ch = curl_init($c['n8n_url']);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'User-Agent: sobtree-contrata/1',
            'X-Sobtree-Contrata-Id: ' . $row['id'],
            'X-Sobtree-Timestamp: ' . $ts,
            'X-Sobtree-Signature: sha256=' . contrata_sign($c['hmac_secret'], $ts, $body),
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => CONTRATA_WEBHOOK_TIMEOUT,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    $resp = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($status >= 200 && $status < 300) return ['enviado', 'http_' . $status];
    return ['error', $err !== '' ? $err : 'http_' . $status];
}

function contrata_cargar_cola(): array {
    $items = [];
    $f = contrata_file_cola();
    if (is_file($f)) {
        foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $row = json_decode($line, true);
            if (is_array($row) && isset($row['id'])) $items[$row['id']] = $row;
        }
    }
    $state = [];
    $s = contrata_file_cola_estado();
    if (is_file($s)) {
        foreach (file($s, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $row = json_decode($line, true);
            if (!is_array($row) || !isset($row['id'])) continue;
            $state[$row['id']]['ultimo'] = $row['estado'];
            if (($row['estado'] ?? '') === 'error') $state[$row['id']]['intentos'] = ($state[$row['id']]['intentos'] ?? 0) + 1;
        }
    }
    return [$items, $state];
}

function contrata_reintentar_cola(bool $dry = false): array {
    $stats = ['revisados' => 0, 'enviados' => 0, 'errores' => 0, 'agotados' => 0];
    if (!is_file(contrata_file_cola())) return $stats;
    [$items, $state] = contrata_cargar_cola();
    $ready = contrata_config()['n8n_url'] !== '' && contrata_config()['hmac_secret'] !== '';
    foreach ($items as $id => $row) {
        $prev = $state[$id]['ultimo'] ?? null;
        if ($prev === 'enviado') continue;
        $stats['revisados']++;
        $intentos = $state[$id]['intentos'] ?? 0;
        if ($intentos >= CONTRATA_MAX_INTENTOS) {
            $stats['agotados']++;
            continue;
        }
        if (!$ready || $dry) continue;
        [$estado] = contrata_entregar($row);
        if ($estado === 'enviado') $stats['enviados']++;
        elseif ($estado === 'error') $stats['errores']++;
    }
    return $stats;
}

function contrata_disponibilidad_estancada(): bool {
    $cfg = contrata_config();
    $f = $cfg['dir'] . '/disponibilidad.json';
    if (!is_file($f)) return $cfg['modo'] !== 'apagado';
    $pub = contrata_leer_json($f, []);
    return !contrata_publicacion_fresca($pub ?: null);
}

function contrata_enviar_alerta(string $texto): bool {
    $c = contrata_config();
    $bloqueado = getenv('CONTRATA_DISABLE_MAIL') === '1' || getenv('LEADS_DISABLE_MAIL') === '1';
    if ($bloqueado) {
        if ($log = getenv('CONTRATA_TEST_MAIL_LOG')) @file_put_contents($log, $texto . "\n", FILE_APPEND | LOCK_EX);
        return true;
    }
    $subject = '=?UTF-8?B?' . base64_encode('Contrata: disponibilidad sin actualizar') . '?=';
    $body = $texto . "\n\nNo se muestran fechas ni se abre el pago mientras los datos tengan más de 3 horas.\n";
    $h = "From: Sobtree Web <{$c['notify_from']}>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    return @mail($c['notify_to'], $subject, $body, $h);
}

function contrata_alertar_estancada(): bool {
    if (!contrata_disponibilidad_estancada()) return false;
    $marker = contrata_ensure_dir() . '/alerta-frescura';
    if (is_file($marker) && (time() - filemtime($marker)) < 86400) return false;
    $ok = contrata_enviar_alerta('La disponibilidad de Contrata lleva más de 3 horas sin una publicación válida.');
    if ($ok) @touch($marker);
    return $ok;
}

function contrata_mantenimiento(bool $dry = false): array {
    $stats = ['revisados' => 0, 'enviados' => 0, 'errores' => 0, 'agotados' => 0, 'liberadas' => 0, 'alerta' => 0];
    $cfg = contrata_config();
    $dir = $cfg['dir'];
    $hay = is_file($dir . '/disponibilidad.json') || is_file($dir . '/cola.jsonl') || is_file($dir . '/retenciones.json');
    if ($cfg['modo'] === 'apagado' && !$hay) return $stats;
    if ($dry) return $stats;
    try {
        $stats['liberadas'] = contrata_barrer();
        $re = contrata_reintentar_cola(false);
        foreach (['revisados', 'enviados', 'errores', 'agotados'] as $k) $stats[$k] = $re[$k];
        if (contrata_disponibilidad_estancada()) $stats['alerta'] = contrata_alertar_estancada() ? 1 : 0;
    } catch (Throwable $e) {
        error_log('contrata mantenimiento: ' . $e->getMessage());
    }
    return $stats;
}

function contrata_leer_sesion_sim(string $id): ?array {
    if (!preg_match('/^cs_test_[A-Za-z0-9_]+$/', $id)) return null;
    $all = contrata_leer_json(contrata_file_ses(), ['sesiones' => []]);
    $s = $all['sesiones'][$id] ?? null;
    return is_array($s) ? $s : null;
}

function contrata_firmar_evento_stripe(array $event): array {
    $payload = json_encode($event, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($payload === false) throw new RuntimeException('json');
    $t = (string)contrata_ahora();
    $secret = contrata_config()['webhook_secret'];
    if ($secret === '') throw new RuntimeException('sin secreto de webhook');
    $sig = hash_hmac('sha256', $t . '.' . $payload, $secret);
    return [$payload, 't=' . $t . ',v1=' . $sig];
}

/**
 * Evento de prueba firmado, sin procesarlo. $eventId fijo sirve para reenviar el mismo aviso.
 * Solo en simulación.
 * @return array{0:string,1:string} payload y cabecera Stripe-Signature
 */
function contrata_evento_firmado_sim(string $sesionId, string $tipo, array $extra = [], ?string $eventId = null): array {
    if (contrata_modo() !== 'simulacion') throw new RuntimeException('no simulacion');
    $ses = contrata_leer_sesion_sim($sesionId);
    if (!$ses) throw new RuntimeException('sesion');
    $meta = $ses['params']['metadata'];
    $meta['checkout_session_id'] = $sesionId;
    if ($tipo === 'checkout.session.completed' || $tipo === 'checkout.session.expired') {
        $obj = [
            'id' => $sesionId,
            'object' => 'checkout.session',
            'payment_status' => $tipo === 'checkout.session.completed' ? 'paid' : 'unpaid',
            'mode' => 'payment',
            'livemode' => false,
            'currency' => 'eur',
            'amount_total' => $ses['amount_total'],
            'customer_email' => null,
            'customer_details' => [
                'email' => $ses['cliente']['email'],
                'name' => $ses['cliente']['empresa'],
                'address' => ['country' => 'ES', 'postal_code' => '28001'],
                'tax_ids' => [['type' => 'es_cif', 'value' => contrata_nif_normal((string)$ses['cliente']['nif']['normalizado'])]],
            ],
            'payment_intent' => $ses['payment_intent'] ?? null,
            'consent' => ['terms_of_service' => 'accepted'],
            'invoice' => 'in_test_' . substr(md5($sesionId), 0, 12),
            'metadata' => $meta,
        ];
    } else {
        unset($meta['checkout_session_id']);
        $obj = [
            'id' => 'ch_test_' . bin2hex(random_bytes(6)),
            'object' => 'charge',
            'livemode' => false,
            'payment_intent' => $ses['payment_intent'] ?? null,
            'amount' => $ses['amount_total'],
            'amount_refunded' => $ses['amount_total'],
            'refunded' => true,
            'metadata' => [],
        ];
    }
    foreach ($extra as $k => $v) $obj[$k] = $v;
    $event = [
        'id' => $eventId ?: ('evt_test_' . bin2hex(random_bytes(8))),
        'object' => 'event',
        'type' => $tipo,
        'livemode' => false,
        'data' => ['object' => $obj],
    ];
    return contrata_firmar_evento_stripe($event);
}

/** Construye y aplica un evento firmado de la sesión simulada. Solo en simulación. */
function contrata_sim_evento(string $sesionId, string $tipo, array $extra = []): array {
    [$payload, $header] = contrata_evento_firmado_sim($sesionId, $tipo, $extra);
    return contrata_recibir_webhook($payload, $header);
}

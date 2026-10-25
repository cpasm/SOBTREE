<?php
// Librería de captura de leads de sobtree.com (la usan contact.php y reintentar-leads.php).
//
// Principio: el lead se GUARDA PRIMERO en un registro local (JSONL, con bloqueo de escritura)
// y solo después se avisa por correo y se reenvía al webhook de n8n. Así ningún lead se pierde
// aunque falle el correo, n8n o HubSpot.
//
// Configuración (nunca en el repositorio): en domains/sobtree.com/sobtree-secrets.php
// (fuera de public_html; ver config/sobtree-secrets.example.php) o en variables de entorno:
//   N8N_LEADS_WEBHOOK_URL     URL https del webhook de n8n (si falta, el reenvío se omite)
//   N8N_LEADS_WEBHOOK_SECRET  secreto compartido para la firma HMAC-SHA256
//   LEADS_DIR                 carpeta del registro (por defecto domains/sobtree.com/sobtree-leads)
//   LEADS_NOTIFY_TO           destinatario del aviso por correo (por defecto info@sobtree.com)
//   LEADS_NOTIFY_FROM         remitente del aviso (por defecto web@sobtree.com)
declare(strict_types=1);

const LEADS_SCHEMA_VERSION = 1;
const LEADS_WEBHOOK_TIMEOUT = 6;        // segundos en total (el visitante ya tiene su respuesta)
const LEADS_WEBHOOK_CONNECT_TIMEOUT = 2;
const LEADS_MAX_ATTEMPTS = 8;           // intentos máximos de reenvío a n8n por lead

/** Carpeta base candidata a domains/sobtree.com (misma lógica que asistente.php). */
function leads_base_dirs(): array {
    $publicDir = dirname(__DIR__); // public_html
    return array_values(array_unique(array_filter([
        getenv('SOBTREE_BASE_DIR') ?: null,
        dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? '')) ?: null,
        dirname($publicDir),
        ($real = realpath($publicDir)) ? dirname($real) : null,
        getenv('HOME') ? getenv('HOME') . '/domains/sobtree.com' : null,
    ], fn($d) => is_string($d) && $d !== '' && $d !== '.' && $d !== '/')));
}

/** Lee sobtree-secrets.php (si existe) y completa con variables de entorno. */
function leads_config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $secrets = [];
    $baseFound = null;
    foreach (leads_base_dirs() as $base) {
        if (is_file("$base/sobtree-secrets.php")) {
            $secrets = (array)(require "$base/sobtree-secrets.php");
            $baseFound = $base;
            break;
        }
    }
    $get = function (string $k, string $default = '') use ($secrets): string {
        $v = $secrets[$k] ?? getenv($k);
        return trim((string)($v === false || $v === null ? $default : $v));
    };
    $dir = $get('LEADS_DIR');
    if ($dir === '') {
        $base = $baseFound ?? (leads_base_dirs()[0] ?? null);
        $dir = $base ? "$base/sobtree-leads" : dirname(__DIR__) . '/_leads';
    }
    $url = $get('N8N_LEADS_WEBHOOK_URL');
    $cfg = [
        'dir' => rtrim($dir, '/'),
        'webhook_url' => preg_match('#^https://#', $url) || getenv('LEADS_ALLOW_HTTP_WEBHOOK') === '1' ? $url : '',
        'webhook_secret' => $get('N8N_LEADS_WEBHOOK_SECRET'),
        'notify_to' => $get('LEADS_NOTIFY_TO', 'info@sobtree.com'),
        'notify_from' => $get('LEADS_NOTIFY_FROM', 'web@sobtree.com'),
    ];
    return $cfg;
}

function leads_webhook_ready(): bool {
    $c = leads_config();
    return $c['webhook_url'] !== '' && $c['webhook_secret'] !== '';
}

/** Crea la carpeta del registro y la protege por si quedara dentro del webroot. */
function leads_ensure_dir(): string {
    $dir = leads_config()['dir'];
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException("No se puede crear la carpeta de leads: $dir");
    }
    if (!is_file("$dir/.htaccess")) @file_put_contents("$dir/.htaccess", "Require all denied\n");
    if (!is_file("$dir/index.html")) @file_put_contents("$dir/index.html", '');
    return $dir;
}

/** Añade una línea JSON a un fichero con bloqueo exclusivo. Devuelve false si no se pudo escribir. */
function leads_append(string $file, array $row): bool {
    $line = json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
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

function leads_file(): string { return leads_ensure_dir() . '/leads.jsonl'; }
function leads_status_file(): string { return leads_ensure_dir() . '/estado.jsonl'; }

function leads_uuid(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

/** Guarda el lead. Es lo PRIMERO que se hace, antes de cualquier envío. */
function leads_save(array $lead): bool {
    return leads_append(leads_file(), $lead);
}

/** Registra un cambio de estado (append-only): enviado | error | omitido | correo_ok | correo_error. */
function leads_mark(string $id, string $canal, string $estado, string $detalle = ''): void {
    leads_append(leads_status_file(), [
        'id' => $id, 'canal' => $canal, 'estado' => $estado,
        'detalle' => mb_substr($detalle, 0, 300), 'fecha' => gmdate('c'),
    ]);
}

/** Firma: hex(HMAC-SHA256(secreto, "<timestamp>.<cuerpo>")). */
function leads_sign(string $secret, string $timestamp, string $body): string {
    return hash_hmac('sha256', $timestamp . '.' . $body, $secret);
}

/** Reenvía el lead a n8n. Devuelve [estado, detalle] sin lanzar excepciones. */
function leads_send_webhook(array $lead): array {
    if (!leads_webhook_ready()) return ['omitido', 'webhook_no_configurado'];
    if (!function_exists('curl_init')) return ['error', 'curl_no_disponible'];
    $c = leads_config();
    $body = json_encode($lead, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $ts = (string)time();
    $ch = curl_init($c['webhook_url']);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'User-Agent: sobtree-leads/1',
            'X-Sobtree-Lead-Id: ' . $lead['id'],
            'X-Sobtree-Timestamp: ' . $ts,
            'X-Sobtree-Signature: sha256=' . leads_sign($c['webhook_secret'], $ts, $body),
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => LEADS_WEBHOOK_CONNECT_TIMEOUT,
        CURLOPT_TIMEOUT => LEADS_WEBHOOK_TIMEOUT,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($status >= 200 && $status < 300) return ['enviado', "http_$status"];
    return ['error', $err !== '' ? $err : "http_$status"];
}

/** Aviso por correo a info@sobtree.com (se mantiene como antes, ahora con el origen). */
function leads_send_mail(array $lead): bool {
    $c = leads_config();
    $one = fn(string $s): string => str_replace(["\r", "\n"], ' ', $s);
    $tipo = $lead['tipo_formulario'];
    $subject = '=?UTF-8?B?' . base64_encode('Nuevo lead web (' . $tipo . ') — ' . $one($lead['empresa']) . ' (' . $one($lead['interes']) . ')') . '?=';
    $o = $lead['origen'];
    $b  = "Nueva solicitud desde la web\n\n";
    $b .= "Nombre:    {$lead['nombre']}\n";
    $b .= "Cargo:     " . ($lead['cargo'] !== '' ? $lead['cargo'] : '—') . "\n";
    $b .= "Teléfono:  {$lead['telefono']}\n";
    $b .= "Empresa:   {$lead['empresa']}\n";
    $b .= "Email:     {$lead['email']}\n";
    $b .= "Tamaño:    {$lead['tamano']}\n";
    $b .= "Interés:   {$lead['interes']}\n\n";
    $b .= "Mensaje:\n{$lead['mensaje']}\n\n";
    $b .= "— Origen —\n";
    $b .= "Formulario: $tipo\n";
    $b .= "Página:     " . ($o['pagina'] ?: '—') . "\n";
    $b .= "Entrada:    " . ($o['landing'] ?: '—') . "\n";
    $b .= "Referrer:   " . ($o['referrer'] ?: '—') . "\n";
    $utm = array_filter($o['utm']);
    $b .= 'UTM:        ' . ($utm ? implode(' · ', array_map(fn($k, $v) => "$k=$v", array_keys($utm), $utm)) : '—') . "\n";
    if ($lead['asistente']['motivo'] !== '') $b .= "Motivo (asistente): {$lead['asistente']['motivo']}\n";
    if ($lead['calculadora']) $b .= 'Calculadora: ' . json_encode($lead['calculadora'], JSON_UNESCAPED_UNICODE) . "\n";
    $b .= "\nID: {$lead['id']}\nFecha: {$lead['fecha']}\n";

    $h  = "From: Sobtree Web <{$c['notify_from']}>\r\n";
    $h .= 'Reply-To: ' . $one($lead['email']) . "\r\n";
    $h .= "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    if (getenv('LEADS_DISABLE_MAIL') === '1') return true; // solo para pruebas locales
    return @mail($c['notify_to'], $subject, $b, $h);
}

/** Lee todos los leads y su último estado por canal. */
function leads_load_all(): array {
    $leads = [];
    $f = leads_file();
    if (is_file($f)) {
        foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $row = json_decode($line, true);
            if (is_array($row) && isset($row['id'])) $leads[$row['id']] = $row;
        }
    }
    $state = [];
    $s = leads_status_file();
    if (is_file($s)) {
        foreach (file($s, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $row = json_decode($line, true);
            if (!is_array($row) || !isset($row['id'], $row['canal'])) continue;
            $k = $row['id'] . '|' . $row['canal'];
            $state[$k]['ultimo'] = $row['estado'];
            if ($row['canal'] === 'n8n' && $row['estado'] === 'error') $state[$k]['intentos'] = ($state[$k]['intentos'] ?? 0) + 1;
        }
    }
    return [$leads, $state];
}

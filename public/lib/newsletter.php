<?php
// Alta a la newsletter de sobtree.com (la usan api/newsletter.php y reintentar-leads.php).
//
// Mismo principio que los leads: se GUARDA PRIMERO en un registro local (JSONL, fuera de
// public_html) y después se reenvía al webhook de n8n firmado con la MISMA HMAC que los
// leads (leads_sign + N8N_LEADS_WEBHOOK_SECRET). No hay secreto distinto.
//
// Si n8n no responde, el visitante ya tiene el éxito y el cron de reintentar-leads.php
// vuelve a enviar la alta. No hace falta un cron nuevo.
//
// Configuración (nunca en el repositorio), en domains/sobtree.com/sobtree-secrets.php:
//   N8N_NEWSLETTER_WEBHOOK_URL  URL https del webhook sobtree-newsletter. Si falta, se deduce
//                               de N8N_LEADS_WEBHOOK_URL cambiando el último tramo de la ruta.
//   N8N_LEADS_WEBHOOK_SECRET    el mismo secreto que firma los leads.
// El texto de la casilla y la versión de la política tienen que coincidir con src/data/site.ts.
declare(strict_types=1);

require_once __DIR__ . '/leads.php';

const NEWSLETTER_SCHEMA_VERSION = 1;
const NEWSLETTER_POLITICA_VERSION = '2026-10-26';
const NEWSLETTER_CONSENT_TEXT = 'Acepto recibir la newsletter de Sobtree por email y he leído la política de privacidad.';
// Igual que DOBLE_CONFIRMACION del flujo n8n: si n8n no llega a responder, el mensaje al
// visitante asume la doble confirmación, que es el modo por defecto.
const NEWSLETTER_DOBLE_POR_DEFECTO = true;
const NEWSLETTER_WEBHOOK_TIMEOUT = 10;
const NEWSLETTER_WEBHOOK_CONNECT_TIMEOUT = 2;
const NEWSLETTER_MAX_ATTEMPTS = 8;
const NEWSLETTER_LIMIT_PER_IP_HOUR = 5;
const NEWSLETTER_LIMIT_PER_DAY = 300;
const NEWSLETTER_MIN_INTERVAL_S = 30;
const NEWSLETTER_MIN_FILL_MS = 3000;

function newsletter_setting(string $key, string $default = ''): string {
    static $secrets = null;
    if ($secrets === null) {
        $secrets = [];
        foreach (leads_base_dirs() as $base) {
            if (is_file("$base/sobtree-secrets.php")) {
                $loaded = require "$base/sobtree-secrets.php";
                $secrets = is_array($loaded) ? $loaded : [];
                break;
            }
        }
    }
    $v = $secrets[$key] ?? getenv($key);
    return trim((string)($v === false || $v === null ? $default : $v));
}

function newsletter_scheme_ok(string $url): bool {
    if ($url === '') return false;
    if (preg_match('#^https://#', $url)) return true;
    return getenv('LEADS_ALLOW_HTTP_WEBHOOK') === '1' && preg_match('#^http://#', $url);
}

/** Cambia el último tramo de la ruta de la URL de leads por sobtree-newsletter. */
function newsletter_deduce_url(string $leadsUrl): string {
    $parts = parse_url($leadsUrl);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) return '';
    $path = $parts['path'] ?? '';
    if ($path === '' || $path === '/') $path = '/sobtree-newsletter';
    else $path = (string)preg_replace('#/[^/]+$#', '/sobtree-newsletter', $path);
    $url = $parts['scheme'] . '://' . $parts['host'];
    if (isset($parts['port'])) $url .= ':' . $parts['port'];
    $url .= $path;
    if (!empty($parts['query'])) $url .= '?' . $parts['query'];
    return $url;
}

function newsletter_webhook_url(): string {
    $explicit = newsletter_setting('N8N_NEWSLETTER_WEBHOOK_URL');
    if ($explicit !== '') return newsletter_scheme_ok($explicit) ? $explicit : '';
    $leads = leads_config()['webhook_url'];
    if ($leads === '') return '';
    $deduced = newsletter_deduce_url($leads);
    return newsletter_scheme_ok($deduced) ? $deduced : '';
}

/** Lo que ve el formulario en GET ?estado. No incluye la URL ni el secreto. */
function newsletter_estado_publico(): array {
    $explicit = newsletter_setting('N8N_NEWSLETTER_WEBHOOK_URL');
    if ($explicit !== '' && !newsletter_scheme_ok($explicit)) {
        return ['ok' => false, 'falta' => 'webhook_no_valido'];
    }
    if (newsletter_webhook_url() === '') return ['ok' => false, 'falta' => 'webhook'];
    if (leads_config()['webhook_secret'] === '') return ['ok' => false, 'falta' => 'secreto'];
    return ['ok' => true];
}

function newsletter_ready(): bool {
    return newsletter_webhook_url() !== '' && leads_config()['webhook_secret'] !== '';
}

/** Carpeta hermana de sobtree-leads, fuera de public_html. */
function newsletter_storage_dir(): string {
    return dirname(leads_config()['dir']) . '/sobtree-newsletter';
}

function newsletter_ensure_dir(): string {
    $dir = newsletter_storage_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException("No se puede crear la carpeta de newsletter: $dir");
    }
    if (!is_file("$dir/.htaccess")) @file_put_contents("$dir/.htaccess", "Require all denied\n");
    if (!is_file("$dir/index.html")) @file_put_contents("$dir/index.html", '');
    return $dir;
}

function newsletter_file(): string { return newsletter_ensure_dir() . '/altas.jsonl'; }
function newsletter_status_file(): string { return newsletter_ensure_dir() . '/estado.jsonl'; }

function newsletter_save(array $alta): bool {
    return leads_append(newsletter_file(), $alta);
}

function newsletter_mark(string $id, string $estado, string $detalle = ''): void {
    leads_append(newsletter_status_file(), [
        'id' => $id, 'canal' => 'n8n', 'estado' => $estado,
        'detalle' => mb_substr($detalle, 0, 300), 'fecha' => gmdate('c'),
    ]);
}

/**
 * Normaliza el origen a portada, radar o articulo:<slug>.
 * Acepta ese token o una URL de sobtree.com (portada, /radar/ o artículo).
 */
function newsletter_origen(string $raw): ?string {
    $raw = strtolower(trim($raw));
    if (preg_match('/^(portada|radar|articulo:[a-z0-9-]{1,120})$/', $raw)) return $raw;
    $path = parse_url($raw, PHP_URL_PATH);
    if (!is_string($path)) return null;
    $path = '/' . trim(strtolower($path), '/');
    if ($path === '/') return 'portada';
    if ($path === '/radar') return 'radar';
    if (preg_match('#^/(?:analisis|radar)/([a-z0-9-]{1,120})$#', $path, $m)) return 'articulo:' . $m[1];
    return null;
}

/** null si se puede seguir; si no, el mensaje de error (429). */
function newsletter_rate_limit(string $ip): ?string {
    $dir = sys_get_temp_dir() . '/sobtree_newsletter';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $lock = "$dir/lock_" . md5($ip);
    if (is_file($lock) && (time() - filemtime($lock)) < NEWSLETTER_MIN_INTERVAL_S) {
        return 'Acabas de apuntarte. Espera unos segundos.';
    }
    $hourFile = "$dir/ip_" . hash('sha256', $ip . gmdate('Y-m-d'));
    if (!newsletter_bump($hourFile, 3600, NEWSLETTER_LIMIT_PER_IP_HOUR)
        || !newsletter_bump("$dir/day_" . gmdate('Y-m-d'), 86400, NEWSLETTER_LIMIT_PER_DAY)) {
        return 'Demasiados intentos. Vuelve a probar en un rato.';
    }
    @touch($lock);
    return null;
}

function newsletter_bump(string $file, int $window, int $max): bool {
    $fh = @fopen($file, 'c+');
    if (!$fh) return true;
    $ok = true;
    if (flock($fh, LOCK_EX)) {
        $data = json_decode((string)stream_get_contents($fh), true) ?: ['t' => time(), 'n' => 0];
        if (time() - (int)$data['t'] >= $window) $data = ['t' => time(), 'n' => 0];
        $ok = (int)$data['n'] < $max;
        if ($ok) $data['n'] = (int)$data['n'] + 1;
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($data));
        fflush($fh);
        flock($fh, LOCK_UN);
    }
    fclose($fh);
    return $ok;
}

/**
 * Reenvía el alta a n8n. Devuelve [estado, detalle, confirmar|null].
 * confirmar es el flag del flujo (doble confirmación) cuando n8n responde 2xx.
 */
function newsletter_send_webhook(array $alta): array {
    if (!newsletter_ready()) return ['omitido', 'webhook_no_configurado', null];
    if (!function_exists('curl_init')) return ['error', 'curl_no_disponible', null];
    $secret = leads_config()['webhook_secret'];
    $body = json_encode($alta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $ts = (string)time();
    $ch = curl_init(newsletter_webhook_url());
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'User-Agent: sobtree-newsletter/1',
            'X-Sobtree-Newsletter-Id: ' . $alta['id'],
            'X-Sobtree-Timestamp: ' . $ts,
            'X-Sobtree-Signature: sha256=' . leads_sign($secret, $ts, $body),
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => NEWSLETTER_WEBHOOK_CONNECT_TIMEOUT,
        CURLOPT_TIMEOUT => NEWSLETTER_WEBHOOK_TIMEOUT,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    $resp = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($status >= 200 && $status < 300) {
        $json = is_string($resp) ? json_decode($resp, true) : null;
        $confirmar = null;
        if (is_array($json) && array_key_exists('confirmar', $json)) $confirmar = $json['confirmar'] === true;
        return ['enviado', "http_$status", $confirmar];
    }
    return ['error', $err !== '' ? $err : "http_$status", null];
}

/** Entrega un alta YA GUARDADA. No envía correo de respaldo: la cola es el respaldo. */
function newsletter_deliver(array $alta): array {
    [$estado, $detalle, $confirmar] = newsletter_send_webhook($alta);
    newsletter_mark($alta['id'], $estado, $detalle);
    if ($estado === 'error') error_log("newsletter: n8n falló para {$alta['id']}: $detalle (se reintentará)");
    return [$estado, $detalle, $confirmar];
}

function newsletter_load_all(): array {
    $altas = [];
    $f = newsletter_storage_dir() . '/altas.jsonl';
    if (is_file($f)) {
        foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $row = json_decode($line, true);
            if (is_array($row) && isset($row['id'])) $altas[$row['id']] = $row;
        }
    }
    $state = [];
    $s = newsletter_storage_dir() . '/estado.jsonl';
    if (is_file($s)) {
        foreach (file($s, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $row = json_decode($line, true);
            if (!is_array($row) || !isset($row['id'])) continue;
            $state[$row['id']]['ultimo'] = $row['estado'];
            if (($row['estado'] ?? '') === 'error') $state[$row['id']]['intentos'] = ($state[$row['id']]['intentos'] ?? 0) + 1;
        }
    }
    return [$altas, $state];
}

/**
 * Reintenta las altas que no llegaron a n8n. Lo llama reintentar-leads.php (el cron que ya existe).
 * Devuelve contadores. No crea la carpeta si todavía no hay ninguna alta.
 */
function newsletter_retry(bool $dry, int $maxDays): array {
    $stats = ['revisados' => 0, 'enviados' => 0, 'errores' => 0, 'agotados' => 0, 'pendientes_sin_webhook' => 0];
    if (!is_file(newsletter_storage_dir() . '/altas.jsonl')) return $stats;
    [$altas, $state] = newsletter_load_all();
    $ready = newsletter_ready();
    $limit = time() - $maxDays * 86400;
    foreach ($altas as $id => $alta) {
        if (strtotime($alta['fecha'] ?? '') < $limit) continue;
        $stats['revisados']++;
        $previo = $state[$id]['ultimo'] ?? null;
        if ($previo === 'enviado') continue;
        $stale = strtotime($alta['fecha'] ?? '') < time() - 600;
        if ($previo === null && !$stale) continue;
        $agotado = ($state[$id]['intentos'] ?? 0) >= NEWSLETTER_MAX_ATTEMPTS;
        if ($agotado) { $stats['agotados']++; continue; }
        if (!$ready) {
            $stats['pendientes_sin_webhook']++;
            if (!$dry && $previo !== 'omitido') newsletter_mark($id, 'omitido', 'webhook_no_configurado');
            continue;
        }
        if ($dry) { echo "[dry-run] newsletter revisaría $id (n8n=" . ($previo ?? '—') . ")\n"; continue; }
        [$estado, $detalle, ] = newsletter_send_webhook($alta);
        newsletter_mark($id, $estado, $detalle);
        if ($estado === 'enviado') $stats['enviados']++;
        elseif ($estado === 'error') $stats['errores']++;
    }
    return $stats;
}

<?php
// Cliente de Google Apps Script (migración desde n8n). Lo usan leads.php y contrata.php.
// Ver docs/migracion-apps-script.md. Sin dependencias de las otras librerías: recibe URL y secreto.
//
// Contrato (integraciones/apps-script/README.md en cpasm/SOBTREE-AGENTS):
//   POST <URL>?flujo=lead|contrata  con el sobre JSON {ts, flujo, firma, cuerpo}
//   firma = "sha256=" . HMAC-SHA256(secreto, ts . "." . flujo . "." . cuerpo)
//   Apps Script responde 302; se sigue con GET a la Location (el POST no se reenvía).
//   HTTP 200 siempre; el resultado real es el campo «status» del JSON: solo 2xx = entregado.
//
// Nunca lanza excepciones, nunca devuelve ni registra la URL, el secreto, el cuerpo de la respuesta
// ni datos personales: el «detalle» sale de un vocabulario cerrado.
declare(strict_types=1);

const APPS_SCRIPT_TIMEOUT = 30;          // segundos por petición (arranque en frío + waitLock de 20 s)
const APPS_SCRIPT_CONNECT_TIMEOUT = 5;
const APPS_SCRIPT_MAX_INTENTOS = 8;      // contador propio, independiente del de n8n
const APPS_SCRIPT_MAX_REDIRECCIONES = 3;
const APPS_SCRIPT_MODOS = ['sombra', 'principal', 'apagado'];

/** Modo de operación. Cualquier valor desconocido o vacío = «sombra» (n8n sigue siendo el principal). */
function apps_script_modo(string $valor): string {
    $v = strtolower(trim($valor));
    return in_array($v, APPS_SCRIPT_MODOS, true) ? $v : 'sombra';
}

/** Solo https (http únicamente con el gancho de pruebas locales APPS_SCRIPT_ALLOW_HTTP=1). */
function apps_script_url_valida(string $url): string {
    $url = trim($url);
    if ($url === '') return '';
    if (preg_match('#^https://[^\s]+$#i', $url)) return $url;
    if (getenv('APPS_SCRIPT_ALLOW_HTTP') === '1' && preg_match('#^http://(127\.0\.0\.1|localhost)(:\d+)?(/\S*)?$#', $url)) return $url;
    return '';
}

function apps_script_firma(string $secreto, string $ts, string $flujo, string $cuerpo): string {
    return 'sha256=' . hash_hmac('sha256', $ts . '.' . $flujo . '.' . $cuerpo, $secreto);
}

/** Sobre JSON listo para enviar. $cuerpo es el JSON crudo del evento (el mismo que va a n8n). */
function apps_script_sobre(string $flujo, string $cuerpo, string $secreto, ?string $ts = null): string {
    $ts = $ts ?? (string)time();
    return (string)json_encode([
        'ts' => $ts,
        'flujo' => $flujo,
        'firma' => apps_script_firma($secreto, $ts, $flujo, $cuerpo),
        'cuerpo' => $cuerpo,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/** Timeout efectivo: nunca menos de 30 s salvo el gancho de pruebas APPS_SCRIPT_TEST_TIMEOUT. */
function apps_script_timeout(): int {
    $t = getenv('APPS_SCRIPT_TEST_TIMEOUT');
    if ($t !== false && ctype_digit($t) && (int)$t >= 1) return (int)$t;
    return APPS_SCRIPT_TIMEOUT;
}

/**
 * La Location de una redirección solo puede ir a dominios de Google (anti-SSRF): https, puerto 443 (o ausente),
 * sin credenciales ni caracteres de control/espacios/barras invertidas, y host que cumpla el patrón estricto
 * ^[a-z0-9-]+(\.[a-z0-9-]+)*\.(google\.com|googleusercontent\.com)$. Devuelve la URL absoluta o ''.
 */
function apps_script_destino_redireccion(string $location, string $actual): string {
    $location = trim($location);
    if ($location === '' || preg_match('/[\x00-\x20\x7f\\\\]/', $location)) return '';
    if (str_starts_with($location, '/') && !str_starts_with($location, '//')) {
        $p = parse_url($actual);
        if (!is_array($p) || !isset($p['scheme'], $p['host'])) return '';
        $location = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '') . $location;
    }
    $p = parse_url($location);
    if (!is_array($p) || !isset($p['scheme'], $p['host']) || isset($p['user']) || isset($p['pass'])) return '';
    $host = strtolower($p['host']);
    if (getenv('APPS_SCRIPT_ALLOW_HTTP') === '1' && in_array($host, ['127.0.0.1', 'localhost'], true) && in_array($p['scheme'], ['http', 'https'], true)) return $location;
    if ($p['scheme'] !== 'https') return '';
    if (isset($p['port']) && (int)$p['port'] !== 443) return '';
    if (!preg_match('/^[a-z0-9-]+(\.[a-z0-9-]+)*\.(google\.com|googleusercontent\.com)$/', $host)) return '';
    return $location;
}

/** Código de error de cURL sin texto (el texto de cURL puede contener la URL del despliegue). */
function apps_script_detalle_curl(int $errno): string {
    return $errno === 28 ? 'timeout' : 'curl_' . $errno;
}

/**
 * Interpreta la respuesta final. Entregado SOLO si HTTP 2xx y JSON con «status» entero 2xx.
 * Devuelve [estado, detalle, aviso]. «aviso»: bool|null (campo «aviso» del JSON, solo flujo lead).
 */
function apps_script_interpretar(int $http, string $resp): array {
    if ($http < 200 || $http >= 300) return ['error', "http_$http", null];
    $json = json_decode($resp, true);
    if (!is_array($json)) return ['error', 'json_invalido', null];
    if (!array_key_exists('status', $json)) return ['error', 'sin_status', null];
    $st = $json['status'];
    if (is_string($st) && ctype_digit($st)) $st = (int)$st;
    if (!is_int($st)) return ['error', 'status_invalido', null];
    if ($st < 200 || $st >= 300) {
        // «motivo» solo si es del vocabulario del contrato (letras minúsculas y guion bajo).
        $m = isset($json['motivo']) && is_string($json['motivo']) && preg_match('/^[a-z_]{1,30}$/', $json['motivo']) ? ' ' . $json['motivo'] : '';
        return ['error', "status_$st$m", null];
    }
    $aviso = array_key_exists('aviso', $json) && is_bool($json['aviso']) ? $json['aviso'] : null;
    return ['enviado', "status_$st" . ($aviso === false ? ' sin_aviso' : ''), $aviso];
}

/**
 * Envía el evento a Apps Script. Devuelve [estado, detalle, aviso] con estado enviado|error|omitido.
 * $url y $secreto vacíos => 'omitido' (silencioso). Sin excepciones.
 */
function apps_script_enviar(string $flujo, string $cuerpo, string $url, string $secreto): array {
    try {
        $url = apps_script_url_valida($url);
        if ($url === '' || $secreto === '') return ['omitido', 'no_configurado', null];
        if (!in_array($flujo, ['lead', 'contrata'], true)) return ['error', 'flujo', null];
        if (!function_exists('curl_init')) return ['error', 'curl_no_disponible', null];
        $sobre = apps_script_sobre($flujo, $cuerpo, $secreto);
        $destino = $url . (str_contains($url, '?') ? '&' : '?') . 'flujo=' . $flujo;
        $timeout = apps_script_timeout();
        $post = true;
        for ($i = 0; $i <= APPS_SCRIPT_MAX_REDIRECCIONES; $i++) {
            $ch = curl_init($destino);
            $opts = [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => APPS_SCRIPT_CONNECT_TIMEOUT,
                CURLOPT_TIMEOUT => $timeout,
                CURLOPT_FOLLOWLOCATION => false, // las redirecciones se siguen a mano: siempre con GET
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'User-Agent: sobtree-apps-script/1'],
            ];
            if ($post) {
                $opts[CURLOPT_POST] = true;
                $opts[CURLOPT_POSTFIELDS] = $sobre;
            } else {
                $opts[CURLOPT_HTTPGET] = true;
            }
            curl_setopt_array($ch, $opts);
            $resp = curl_exec($ch);
            $http = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $errno = curl_errno($ch);
            $location = (string)curl_getinfo($ch, CURLINFO_REDIRECT_URL);
            curl_close($ch);
            if ($resp === false || $errno !== 0) return ['error', apps_script_detalle_curl($errno), null];
            if (in_array($http, [301, 302, 303, 307, 308], true)) {
                $destino = apps_script_destino_redireccion($location, $destino);
                if ($destino === '') return ['error', 'redireccion_no_permitida', null];
                $post = false; // el doPost ya se ejecutó: nunca se reenvía el POST
                continue;
            }
            return apps_script_interpretar($http, (string)$resp);
        }
        return ['error', 'demasiadas_redirecciones', null];
    } catch (Throwable $e) {
        return ['error', 'excepcion', null];
    }
}

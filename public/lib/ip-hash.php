<?php
// Resumen de la dirección IP para antiabuso. La clave vive solo en sobtree-secrets.php
// (fuera de public_html; ver config/sobtree-secrets.example.php) o en la variable de entorno
// IP_HASH_SECRET. Si no está definida, no se calcula ningún hash: no se vuelve a un hash sin clave.
declare(strict_types=1);

/** Lee sobtree-secrets.php (si existe). Misma búsqueda de carpetas que lib/leads.php. */
function sobtree_secrets(): array {
    static $secrets = null;
    if ($secrets !== null) return $secrets;
    $secrets = [];
    $publicDir = dirname(__DIR__); // public_html
    $candidates = array_values(array_unique(array_filter([
        getenv('SOBTREE_BASE_DIR') ?: null,
        dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? '')) ?: null,
        dirname($publicDir),
        ($real = realpath($publicDir)) ? dirname($real) : null,
        getenv('HOME') ? getenv('HOME') . '/domains/sobtree.com' : null,
    ], fn($d) => is_string($d) && $d !== '' && $d !== '.' && $d !== '/')));
    foreach ($candidates as $base) {
        if (is_file("$base/sobtree-secrets.php")) {
            $secrets = (array)(require "$base/sobtree-secrets.php");
            break;
        }
    }
    return $secrets;
}

function sobtree_secret(string $key): string {
    $secrets = sobtree_secrets();
    $v = $secrets[$key] ?? getenv($key);
    return trim((string)($v === false || $v === null ? '' : $v));
}

/**
 * HMAC-SHA256 de "ip|fecha" con IP_HASH_SECRET.
 * null si la clave no está definida: el formulario sigue y no se guarda un hash sin secreto.
 * $fecha es el día (Y-m-d). Por defecto, UTC.
 */
function sobtree_ip_hash(string $ip, ?string $fecha = null): ?string {
    $secret = sobtree_secret('IP_HASH_SECRET');
    if ($secret === '') return null;
    $fecha = $fecha ?? gmdate('Y-m-d');
    $hash = hash_hmac('sha256', $ip . '|' . $fecha, $secret);
    return is_string($hash) && $hash !== '' ? $hash : null;
}

<?php
// Suscripción a la newsletter. Guarda el alta fuera de public_html y la reenvía firmada a n8n
// (webhook sobtree-newsletter). La firma es la misma HMAC que los leads: no se duplica.
// Si n8n no está disponible, el visitante recibe éxito igualmente y el cron reintenta.
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

require __DIR__ . '/../lib/newsletter.php';

function reply(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['estado'])) {
    reply(200, newsletter_estado_publico());
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(405, ['ok' => false, 'error' => 'Método no permitido.']);
}

$decoded = json_decode((string)file_get_contents('php://input'), true);
$in = is_array($decoded) ? $decoded : $_POST;

// Trampa para bots: se descarta en silencio, sin guardar.
if (!empty($in['web'])) reply(200, ['ok' => true]);

// Envíos en menos de 3 s desde que se cargó el formulario: casi seguro un bot (solo si el dato viene).
$t0 = (int)($in['t0'] ?? 0);
if ($t0 > 0 && (int)(microtime(true) * 1000) - $t0 < NEWSLETTER_MIN_FILL_MS) {
    reply(200, ['ok' => true]);
}

$email = trim((string)($in['email'] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 254) {
    reply(422, ['ok' => false, 'error' => 'Revisa el email: no parece válido.']);
}
$consentRaw = $in['consentimiento'] ?? null;
$acepta = $consentRaw === true || $consentRaw === 'si' || $consentRaw === 1 || $consentRaw === '1';
$texto = trim((string)($in['consent_text'] ?? ''));
if (!$acepta || $texto !== NEWSLETTER_CONSENT_TEXT) {
    reply(422, ['ok' => false, 'error' => 'Necesitamos tu consentimiento para enviarte la newsletter.']);
}
$origen = newsletter_origen((string)($in['origen'] ?? ''));
if ($origen === null) {
    reply(422, ['ok' => false, 'error' => 'No hemos podido identificar desde qué página te apuntas.']);
}

$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
if ($msg = newsletter_rate_limit($ip)) {
    reply(429, ['ok' => false, 'error' => $msg]);
}

$ahora = gmdate('c');
$alta = [
    'v' => NEWSLETTER_SCHEMA_VERSION,
    'id' => leads_uuid(),
    'fecha' => $ahora,
    'email' => mb_strtolower($email),
    'consentimiento' => true,
    'consent_timestamp' => $ahora,
    'origen' => $origen,
    'consent_text' => NEWSLETTER_CONSENT_TEXT,
    'version_politica' => NEWSLETTER_POLITICA_VERSION,
    'meta' => [
        'ip_hash' => hash('sha256', $ip . gmdate('Y-m-d')),
        'user_agent' => mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200),
    ],
];

$saved = false;
try { $saved = newsletter_save($alta); } catch (Throwable $e) { error_log('newsletter: ' . $e->getMessage()); }
if (!$saved) {
    reply(500, ['ok' => false, 'error' => 'No hemos podido apuntarte ahora mismo. Escríbenos a info@sobtree.com.']);
}

// Aunque n8n falle o no esté configurado, el alta ya está en la cola.
[, , $confirmar] = newsletter_deliver($alta);
reply(200, ['ok' => true, 'confirmar' => $confirmar ?? NEWSLETTER_DOBLE_POR_DEFECTO]);

<?php
// n8n simulado: comprueba el HMAC y responde. No llama a Google Sheets, Google Calendar ni Gmail.
// php -S 127.0.0.1:PUERTO tests/contrata/mock-n8n.php
// MOCK_SECRET, MOCK_DIR. MOCK_DIR/mode = 200 | 500 | sleep
declare(strict_types=1);
$secret = getenv('MOCK_SECRET') ?: '';
$dir = getenv('MOCK_DIR') ?: sys_get_temp_dir();
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$raw = file_get_contents('php://input') ?: '';
$ts = (string)($_SERVER['HTTP_X_SOBTREE_TIMESTAMP'] ?? '');
$firma = (string)($_SERVER['HTTP_X_SOBTREE_SIGNATURE'] ?? '');
$mode = trim((string)@file_get_contents($dir . '/mode'));
if ($mode === '') $mode = '200';
if ($mode === 'sleep') sleep(12);
$esperada = 'sha256=' . hash_hmac('sha256', $ts . '.' . $raw, $secret);
$ok = $secret !== '' && preg_match('/^\d+$/', $ts) && abs(time() - (int)$ts) <= 300
    && strlen($firma) === strlen($esperada) && hash_equals($esperada, $firma);
$decoded = json_decode($raw, true);
@file_put_contents($dir . '/received.jsonl', json_encode([
    'ok' => $ok,
    'tipo' => is_array($decoded) ? ($decoded['tipo'] ?? '') : '',
    'id' => is_array($decoded) ? ($decoded['id'] ?? '') : '',
    'event_id' => is_array($decoded) ? ($decoded['event_id'] ?? '') : '',
    'nif' => is_array($decoded) ? ($decoded['cuerpo']['nif'] ?? null) : null,
    'nif_coincide' => is_array($decoded) ? ($decoded['cuerpo']['nif_coincide'] ?? null) : null,
    'alerta' => is_array($decoded) ? ($decoded['cuerpo']['alerta_facturacion'] ?? null) : null,
    'estado' => is_array($decoded) ? ($decoded['cuerpo']['estado'] ?? null) : null,
], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
header('Content-Type: application/json');
if (!$ok) { http_response_code(401); echo '{"ok":false}'; exit; }
if ($mode === '500') { http_response_code(500); echo '{"ok":false}'; exit; }
http_response_code(200);
echo '{"ok":true,"simulado":true,"aviso":true}';

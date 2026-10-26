<?php
// Webhook simulado de n8n para la newsletter. Solo pruebas locales (php -S).
// Modo en $MOCK_DIR/mode: "200" (confirmar true), "200-sin-confirmar", "500" o "sleep".
declare(strict_types=1);
$dir = getenv('MOCK_DIR') ?: sys_get_temp_dir();
$secret = getenv('MOCK_SECRET') ?: '';
$mode = is_file("$dir/mode") ? trim((string)file_get_contents("$dir/mode")) : '200';
$body = (string)file_get_contents('php://input');
$ts = $_SERVER['HTTP_X_SOBTREE_TIMESTAMP'] ?? '';
$sig = $_SERVER['HTTP_X_SOBTREE_SIGNATURE'] ?? '';
$valid = $ts !== '' && abs(time() - (int)$ts) <= 300
    && hash_equals('sha256=' . hash_hmac('sha256', $ts . '.' . $body, $secret), $sig);
file_put_contents("$dir/received.jsonl", json_encode([
    'valid_signature' => $valid,
    'id' => $_SERVER['HTTP_X_SOBTREE_NEWSLETTER_ID'] ?? '',
    'mode' => $mode,
    'body' => json_decode($body, true),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
if ($mode === 'sleep') sleep(14);
if (!$valid) { http_response_code(401); echo '{"ok":false}'; exit; }
if ($mode === '500') { http_response_code(500); echo '{"ok":false}'; exit; }
$confirmar = $mode !== '200-sin-confirmar';
echo json_encode(['ok' => true, 'confirmar' => $confirmar], JSON_UNESCAPED_UNICODE);

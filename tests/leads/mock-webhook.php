<?php
// Webhook simulado de n8n para pruebas LOCALES (php -S). Verifica la firma HMAC y guarda lo recibido.
// Modo de respuesta en $MOCK_DIR/mode: "200" (defecto), "500" o "sleep".
declare(strict_types=1);
$dir = getenv('MOCK_DIR') ?: sys_get_temp_dir();
$secret = getenv('MOCK_SECRET') ?: '';
$mode = is_file("$dir/mode") ? trim(file_get_contents("$dir/mode")) : '200';
$body = file_get_contents('php://input');
$ts = $_SERVER['HTTP_X_SOBTREE_TIMESTAMP'] ?? '';
$sig = $_SERVER['HTTP_X_SOBTREE_SIGNATURE'] ?? '';
$valid = $ts !== '' && abs(time() - (int)$ts) <= 300
    && hash_equals('sha256=' . hash_hmac('sha256', $ts . '.' . $body, $secret), $sig);
file_put_contents("$dir/received.jsonl", json_encode([
    'valid_signature' => $valid, 'lead_id' => $_SERVER['HTTP_X_SOBTREE_LEAD_ID'] ?? '', 'mode' => $mode, 'body' => json_decode($body, true),
], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
if ($mode === 'sleep') sleep(10);
if (!$valid) { http_response_code(401); echo '{"ok":false}'; exit; }
http_response_code($mode === '500' ? 500 : 200);
echo '{"ok":true}';

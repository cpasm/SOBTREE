<?php
// Webhook simulado de n8n para pruebas LOCALES (php -S). Verifica la firma HMAC y guarda lo recibido.
// Modo de respuesta en $MOCK_DIR/mode: "200" (defecto, n8n envió su aviso), "200-sin-aviso",
// "500" o "sleep".
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
if ($mode === 'sleep') sleep(14);
if (!$valid) { http_response_code(401); echo '{"ok":false}'; exit; }
if ($mode === '500') { http_response_code(500); echo '{"ok":false}'; exit; }
$lead = json_decode($body, true);
$respaldo = !empty($lead['envio']['respaldo_enviado']);
// Como el workflow real: si la web ya mandó el respaldo, n8n no repite el aviso.
echo json_encode(['ok' => true, 'aviso' => $mode !== '200-sin-aviso' && !$respaldo]);

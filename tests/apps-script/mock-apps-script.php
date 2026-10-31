<?php
// Apps Script simulado para pruebas LOCALES (php -S). No llama a Google.
// Imita el comportamiento real del web app: el POST responde 302 a una URL «de contenido» y el
// resultado se lee con GET (nunca se reenvía el POST). HTTP 200 con «status» dentro del JSON.
// Variables: MOCK_DIR (estado), MOCK_SECRET (secreto HMAC del flujo), MOCK_PORT.
// MOCK_DIR/mode: ok | ok-directo | 502 | 503 | 401 | json-roto | sin-status | timeout | http500 | redir-externa
//   (por defecto «ok»). Registro en MOCK_DIR/received.jsonl: una línea por petición (POST o GET).
declare(strict_types=1);
$dir = getenv('MOCK_DIR') ?: sys_get_temp_dir();
$secret = getenv('MOCK_SECRET') ?: '';
$port = getenv('MOCK_PORT') ?: '18091';
$mode = is_file("$dir/mode") ? trim((string)file_get_contents("$dir/mode")) : 'ok';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$log = function (array $r) use ($dir) {
    file_put_contents("$dir/received.jsonl", json_encode($r, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
};

if ($method === 'GET' && $path === '/echo') {
    // Segundo paso: contenido del resultado calculado en el POST.
    $log(['metodo' => 'GET', 'ruta' => '/echo']);
    $res = is_file("$dir/result.json") ? (string)file_get_contents("$dir/result.json") : '{"ok":false,"status":500,"motivo":"interno"}';
    if ($mode === 'timeout') sleep(5);
    header('Content-Type: application/json');
    if ($mode === 'json-roto') { echo '<html>{"status":200'; exit; }
    if ($mode === 'http500') { http_response_code(500); echo $res; exit; }
    echo $res;
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$sobre = json_decode($raw, true);
$flujoQ = (string)($_GET['flujo'] ?? '');
$valida = false; $cuerpo = null; $flujo = '';
if (is_array($sobre) && isset($sobre['ts'], $sobre['flujo'], $sobre['firma'], $sobre['cuerpo'])) {
    $flujo = (string)$sobre['flujo'];
    $esperada = 'sha256=' . hash_hmac('sha256', $sobre['ts'] . '.' . $flujo . '.' . $sobre['cuerpo'], $secret);
    $valida = $secret !== '' && $flujo === $flujoQ && preg_match('/^\d+$/', (string)$sobre['ts']) && abs(time() - (int)$sobre['ts']) <= 300
        && hash_equals($esperada, (string)$sobre['firma']);
    $cuerpo = json_decode((string)$sobre['cuerpo'], true);
}
$id = is_array($cuerpo) ? (string)($cuerpo['id'] ?? '') : '';
$log(['metodo' => $method, 'ruta' => (string)$path, 'flujo' => $flujo, 'flujo_query' => $flujoQ, 'firma_valida' => $valida, 'id' => $id, 'modo' => $mode]);

// Resultado que daría el doPost de Apps Script.
if (!$valida) $res = ['ok' => false, 'status' => 401, 'motivo' => 'firma'];
elseif ($mode === '502') $res = ['ok' => false, 'status' => 502, 'motivo' => 'hoja', 'detalle' => 'Empresa Ficticia SL ana@ejemplo.test'];
elseif ($mode === '503') $res = ['ok' => false, 'status' => 503, 'motivo' => 'ocupado'];
elseif ($mode === '401') $res = ['ok' => false, 'status' => 401, 'motivo' => 'timestamp'];
elseif ($mode === 'sin-status') $res = ['ok' => true];
elseif ($flujo === 'lead') $res = ['ok' => true, 'status' => 200, 'aviso' => true, 'lead_id' => $id];
else $res = ['ok' => true, 'status' => 200, 'accion' => 'venta', 'sesion' => 'cs_test_ficticia', 'evento_calendario' => 'creado', 'aviso' => true];
file_put_contents("$dir/result.json", json_encode($res));

if ($mode === 'ok-directo') { header('Content-Type: application/json'); echo json_encode($res); exit; }
if ($mode === 'redir-externa') { header('Location: https://example.com/echo', true, 302); exit; }
header("Location: http://127.0.0.1:$port/echo?user_content_key=ficticia", true, 302);
echo '<HTML><BODY>Moved</BODY></HTML>';

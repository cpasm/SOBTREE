<?php
// GET: semanas y plazas libres (publicado − retenciones). Sin datos personales.
// POST: lo llama n8n con HMAC para guardar la publicación. Si falta, es vieja o
// la firma no vale, el GET responde fallo en cerrado: sin fechas ni escasez.
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
require dirname(__DIR__, 2) . '/lib/contrata.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
try {
    if ($method === 'GET') {
        $body = contrata_estado_publico();
        http_response_code(200);
    } elseif ($method === 'POST') {
        $raw = file_get_contents('php://input') ?: '';
        $r = contrata_post_disponibilidad($raw, $_SERVER);
        http_response_code($r['http']);
        $body = $r['body'];
    } else {
        http_response_code(405);
        $body = ['ok' => false, 'error' => 'Método no permitido.'];
    }
} catch (Throwable $e) {
    error_log('contrata disponibilidad: fallo');
    http_response_code(500);
    $body = ['ok' => false, 'fallo' => 'cerrado', 'motivo' => 'error', 'reserva' => ['href' => '/#contacto', 'texto' => CONTRATA_MSG_RESERVA]];
}
echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

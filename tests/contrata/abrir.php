<?php
// Abre una sesión desde CLI para la prueba de concurrencia (dos procesos, un flock).
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__, 2) . '/public/lib/contrata.php';
$in = json_decode(stream_get_contents(STDIN), true);
if (!is_array($in)) exit(1);
$r = contrata_abrir_sesion($in, ['cli' => true, 'ip' => getenv('CONTRATA_TEST_IP') ?: 'cli-paralelo']);
echo json_encode($r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

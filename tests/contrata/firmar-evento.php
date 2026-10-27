<?php
// Escribe un evento de Stripe firmado (simulación) sin procesarlo.
// Uso: php tests/contrata/firmar-evento.php SESION TIPO [EVENT_ID] PAYLOAD HEADER
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__, 2) . '/public/lib/contrata.php';
$sesion = $argv[1] ?? '';
$tipo = $argv[2] ?? '';
$eventId = $argv[3] ?? '';
$outP = $argv[4] ?? '';
$outH = $argv[5] ?? '';
if ($sesion === '' || $tipo === '' || $outP === '' || $outH === '') exit(1);
[$payload, $header] = contrata_evento_firmado_sim($sesion, $tipo, [], $eventId !== '' ? $eventId : null);
file_put_contents($outP, $payload);
file_put_contents($outH, $header);

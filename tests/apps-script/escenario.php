<?php
// Utilidad de pruebas (CLI) para Contrata + Apps Script con datos sintéticos. Sin red salvo los mocks locales.
//   php escenario.php enviar <event_id>   encola y entrega un aviso sintético (como el webhook de Stripe)
//   php escenario.php cron                reintenta la cola (como reintentar-contrata.php)
//   php escenario.php estado              resumen JSON del estado de la cola por canal
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__, 2) . '/public/lib/contrata.php';
$accion = $argv[1] ?? '';
if ($accion === 'enviar') {
    $r = contrata_encolar_y_enviar([
        'tipo' => 'checkout.session.completed',
        'event_id' => $argv[2] ?? 'evt_test_1',
        'cuerpo' => [
            'sesion' => 'cs_test_ficticia', 'producto' => 'diagnostico', 'empresa' => 'Empresa Ficticia SL',
            'email' => 'ana@ejemplo.test', 'nif' => 'B12345674', 'semana_lunes' => '2026-11-09', 'livemode' => false,
        ],
    ]);
    $n = contrata_apps_ejecutar_diferidos(); // en producción corre tras responder a Stripe (shutdown)
    echo json_encode(['resultado' => $r, 'diferidos' => $n]) . "\n";
} elseif ($accion === 'cron') {
    echo json_encode(contrata_reintentar_cola(false)) . "\n";
} elseif ($accion === 'estado') {
    [$items, $state] = contrata_cargar_cola();
    $nif = 0;
    foreach ($items as $row) if (($row['cuerpo']['nif'] ?? '') !== '') $nif++;
    echo json_encode(['items' => count($items), 'estado' => array_values($state), 'con_nif' => $nif]) . "\n";
}

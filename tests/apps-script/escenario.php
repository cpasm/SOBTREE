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
} elseif ($accion === 'envejecer') {
    // Test: retrasa la fecha de todas las filas de la cola N horas (simula tiempo transcurrido).
    $h = (int)($argv[2] ?? 48);
    $f = contrata_file_cola();
    $out = [];
    foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $l) {
        $r = json_decode($l, true);
        $r['fecha'] = gmdate('c', time() - $h * 3600);
        $out[] = json_encode($r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    file_put_contents($f, implode("\n", $out) . "\n");
} elseif ($accion === 'barrer') {
    echo json_encode(['purgadas' => contrata_purgar_nif_antiguos(true)]) . "\n";
} elseif ($accion === 'enviar-historica') {
    // Test B-1: n filas ya entregadas a n8n (sin Apps Script) y antiguas, tal como estarían antes de poner las claves.
    $n = (int)($argv[2] ?? 3);
    for ($i = 1; $i <= $n; $i++) {
        $row = ['id' => contrata_uuid(), 'fecha' => gmdate('c', time() - 5 * 86400), 'tipo' => 'checkout.session.completed', 'event_id' => "evt_hist_$i",
                'cuerpo' => ['sesion' => "cs_test_hist_$i", 'empresa' => 'Empresa Ficticia SL', 'email' => 'ana@ejemplo.test', 'nif' => '', 'livemode' => false]];
        contrata_append(contrata_file_cola(), $row);
        contrata_marcar_cola($row['id'], 'enviado', 'http_200');
    }
} elseif ($accion === 'estado') {
    [$items, $state] = contrata_cargar_cola();
    $nif = 0;
    foreach ($items as $row) if (($row['cuerpo']['nif'] ?? '') !== '') $nif++;
    echo json_encode(['items' => count($items), 'estado' => array_values($state), 'con_nif' => $nif]) . "\n";
}

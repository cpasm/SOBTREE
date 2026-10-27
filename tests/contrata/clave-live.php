<?php
// Proceso aparte: una clave live se descarta y no abre ninguna sesión.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
$marca = 'rk' . implode('', ['_', 'l', 'i', 'v', 'e', '_']);
putenv('STRIPE_RESTRICTED_KEY=' . $marca . 'no-usar');
require dirname(__DIR__, 2) . '/public/lib/contrata.php';
$antes = is_file(contrata_config()['dir'] . '/retenciones.json')
    ? hash('sha256', (string)file_get_contents(contrata_config()['dir'] . '/retenciones.json'))
    : '';
$c = contrata_config();
$fail = 0;
if (!$c['clave_prohibida'] || $c['stripe_key'] !== '') {
    fwrite(STDERR, "la clave live no se ha descartado\n");
    $fail++;
}
$r = contrata_abrir_sesion([
    'producto' => 'diagnostico',
    'empresa' => 'Acme SL',
    'email' => 'facturas@example.com',
    'nif' => 'B12345674',
    'condiciones' => 'si',
    'semana' => '2026-11-02',
    'csrf' => 'no-hace-falta',
], ['cli' => true, 'ip' => 'clave-live']);
if (($r['http'] ?? 0) !== 503) {
    fwrite(STDERR, "se esperaba 503 y ha llegado " . ($r['http'] ?? 0) . "\n");
    $fail++;
}
$despues = is_file(contrata_config()['dir'] . '/retenciones.json')
    ? hash('sha256', (string)file_get_contents(contrata_config()['dir'] . '/retenciones.json'))
    : '';
if ($antes !== $despues) {
    fwrite(STDERR, "la clave live ha tocado las retenciones\n");
    $fail++;
}
if ($fail > 0) exit(1);
echo "ok\n";

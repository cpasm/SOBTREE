<?php
// Publica una disponibilidad firmada en local. Solo con CONTRATA_MODO=simulacion.
// Uso: php scripts/sembrar-disponibilidad.php [fixture.json]
// El fixture, si se pasa, es {"proyectos":[{"inicio","fin","sesion"}],"bloqueos":[{"inicio","fin"}]}.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__) . '/public/lib/contrata.php';
if (contrata_modo() !== 'simulacion') {
    fwrite(STDERR, "Solo se siembra en simulación.\n");
    exit(1);
}
$fixture = ['proyectos' => [], 'bloqueos' => []];
if (!empty($argv[1])) {
    if (!is_file($argv[1])) { fwrite(STDERR, "No está el fixture.\n"); exit(1); }
    $fixture = json_decode((string)file_get_contents($argv[1]), true);
    if (!is_array($fixture)) { fwrite(STDERR, "Fixture no válido.\n"); exit(1); }
}
$semanas = contrata_calcular_semanas(contrata_hoy(), $fixture['proyectos'] ?? [], $fixture['bloqueos'] ?? []);
$cuerpo = [
    'generado' => gmdate('c', contrata_ahora()),
    'max_proyectos_simultaneos' => CONTRATA_MAX_PROYECTOS,
    'semanas' => $semanas,
];
$raw = json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($raw === false) exit(1);
$ts = (string)contrata_ahora();
$r = contrata_post_disponibilidad($raw, [
    'HTTP_X_SOBTREE_TIMESTAMP' => $ts,
    'HTTP_X_SOBTREE_SIGNATURE' => 'sha256=' . contrata_sign(contrata_config()['hmac_secret'], $ts, $raw),
]);
echo json_encode($r['body'], JSON_UNESCAPED_UNICODE) . "\n";
exit($r['http'] === 200 ? 0 : 1);

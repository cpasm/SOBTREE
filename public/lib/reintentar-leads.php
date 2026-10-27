<?php
// Reintento y reconciliación de leads (para cron). Solo por línea de comandos.
//
// Reenvía a n8n los leads del registro local cuyo último estado en el canal n8n sea
// «error», «omitido» (si ahora el webhook ya está configurado) o que no tengan estado
// (p. ej. si el proceso se cortó tras guardar). Si el lead sigue sin llegar a n8n y aún no
// salió el correo de respaldo (o falló), lo envía; la marca en estado.jsonl evita duplicados.
// n8n debe ser idempotente por id de lead (cabecera X-Sobtree-Lead-Id): HubSpot hace upsert por email.
//
// Uso:   php reintentar-leads.php [--dry-run] [--max-edad-dias=30]
// Cron (hPanel → Avanzado → Cron Jobs), cada 15 min:
//   /usr/bin/php /home/<usuario>/domains/sobtree.com/public_html/lib/reintentar-leads.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require __DIR__ . '/leads.php';

$dry = in_array('--dry-run', $argv, true);
$maxDays = 30;
foreach ($argv as $a) if (preg_match('/^--max-edad-dias=(\d+)$/', $a, $m)) $maxDays = (int)$m[1];

// Un único proceso a la vez.
$lockFh = fopen(leads_ensure_dir() . '/.reintento.lock', 'c');
if (!$lockFh || !flock($lockFh, LOCK_EX | LOCK_NB)) { fwrite(STDERR, "Otro reintento en curso.\n"); exit(0); }

[$leads, $state] = leads_load_all();
$ready = leads_webhook_ready();
$stats = ['revisados' => 0, 'enviados' => 0, 'errores' => 0, 'agotados' => 0, 'respaldos' => 0, 'pendientes_sin_webhook' => 0];
$limit = time() - $maxDays * 86400;

foreach ($leads as $id => $lead) {
    if (strtotime($lead['fecha'] ?? '') < $limit) continue;
    $stats['revisados']++;

    $n8nPrevio = $state["$id|n8n"]['ultimo'] ?? null;
    $correoPrevio = $state["$id|correo"]['ultimo'] ?? null;
    $stale = strtotime($lead['fecha'] ?? '') < time() - 600;
    // Ya en n8n y sin respaldo fallido pendiente: nada que hacer.
    if ($n8nPrevio === 'enviado' && $correoPrevio !== 'correo_error') continue;
    // Recién llegado y sin estado: contact.php puede estar entregándolo ahora mismo.
    if ($n8nPrevio === null && $correoPrevio === null && !$stale) continue;

    $agotado = ($state["$id|n8n"]['intentos'] ?? 0) >= LEADS_MAX_ATTEMPTS;
    if ($agotado) $stats['agotados']++;
    if (!$ready && $n8nPrevio !== 'enviado') $stats['pendientes_sin_webhook']++;

    if ($dry) { echo "[dry-run] revisaría $id (n8n=" . ($n8nPrevio ?? '—') . ", correo=" . ($correoPrevio ?? '—') . ")\n"; continue; }
    $r = leads_deliver($lead, $n8nPrevio, $correoPrevio, $ready && !$agotado);
    if ($r['n8n'] === 'enviado' && $n8nPrevio !== 'enviado') $stats['enviados']++;
    elseif ($r['n8n'] === 'error') $stats['errores']++;
    if ($r['correo'] !== $correoPrevio && $r['correo'] === 'correo_ok') $stats['respaldos']++;
}

$line = gmdate('c') . ' reintentar-leads ' . json_encode($stats);
echo $line . "\n";
if ($stats['errores'] || $stats['agotados']) error_log($line);

// El mismo cron barre retenciones caducadas de Contrata y reintenta su cola.
// Si Contrata no está configurado, no crea carpetas ni envía correo.
try {
    require_once __DIR__ . '/contrata.php';
    contrata_mantenimiento($dry);
} catch (Throwable $e) {
    error_log('contrata: ' . $e->getMessage());
}

exit($stats['agotados'] > 0 ? 2 : 0);

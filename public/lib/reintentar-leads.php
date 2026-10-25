<?php
// Reintento y reconciliación de leads (para cron). Solo por línea de comandos.
//
// Reenvía a n8n los leads del registro local cuyo último estado en el canal n8n sea
// «error», «omitido» (si ahora el webhook ya está configurado) o que no tengan estado
// (p. ej. si el proceso se cortó tras guardar). Reenvía también el correo si falló.
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
$stats = ['revisados' => 0, 'enviados' => 0, 'errores' => 0, 'agotados' => 0, 'correos' => 0, 'pendientes_sin_webhook' => 0];
$limit = time() - $maxDays * 86400;

foreach ($leads as $id => $lead) {
    if (strtotime($lead['fecha'] ?? '') < $limit) continue;
    $stats['revisados']++;

    // Correo: si consta un fallo, o si no hay rastro de aviso pasados 10 min (proceso cortado).
    $mailState = $state["$id|correo"]['ultimo'] ?? null;
    $stale = strtotime($lead['fecha'] ?? '') < time() - 600;
    if ($mailState === 'correo_error' || ($mailState === null && $stale)) {
        $ok = $dry ? true : leads_send_mail($lead);
        if (!$dry) leads_mark($id, 'correo', $ok ? 'correo_ok' : 'correo_error', 'reintento');
        if ($ok) $stats['correos']++;
    }

    $n8n = $state["$id|n8n"] ?? [];
    $last = $n8n['ultimo'] ?? null;
    if ($last === 'enviado') continue;
    if ($last === null && !$stale) continue; // contact.php puede estar enviándolo ahora mismo
    if (!$ready) { $stats['pendientes_sin_webhook']++; continue; }
    if (($n8n['intentos'] ?? 0) >= LEADS_MAX_ATTEMPTS) { $stats['agotados']++; continue; }

    if ($dry) { echo "[dry-run] reenviaría $id ({$lead['email']})\n"; continue; }
    [$estado, $detalle] = leads_send_webhook($lead);
    leads_mark($id, 'n8n', $estado, "reintento: $detalle");
    $estado === 'enviado' ? $stats['enviados']++ : $stats['errores']++;
}

$line = gmdate('c') . ' reintentar-leads ' . json_encode($stats);
echo $line . "\n";
if ($stats['errores'] || $stats['agotados']) error_log($line);
exit($stats['agotados'] > 0 ? 2 : 0);

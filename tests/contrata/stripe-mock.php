<?php
// Contrata contra el Stripe SIMULADO (tests/contrata/mock-stripe.php), en modo stripe_test o stripe_live.
// Comprueba qué se pide a Stripe (cliente con NIF, factura, IVA, dirección), los eventos firmados y el cambio test→live.
// Uso (entorno preparado por run-tests.sh): TEST_CASO=normal|desajuste|incompleto php tests/contrata/stripe-mock.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__, 2) . '/public/lib/contrata.php';
$fail = 0;
$t = function (string $n, bool $ok) use (&$fail) { if (!$ok) { $fail++; fwrite(STDERR, "✘ $n\n"); } };
$caso = getenv('TEST_CASO') ?: 'normal';
$live = contrata_livemode_esperado();
$mdir = (string)getenv('MOCK_STRIPE_DIR');
$entrada = fn(string $semana, string $nif = 'B12345674') => [
    'csrf' => contrata_csrf_emitir(), 'producto' => 'diagnostico', 'empresa' => 'Acme SL',
    'email' => 'facturas@example.com', 'nif' => $nif, 'condiciones' => 'si', 'semana' => $semana,
];
$abrir = fn(array $in) => contrata_abrir_sesion($in, ['cli' => true, 'ip' => 'stripe-mock-' . bin2hex(random_bytes(3))]);

if ($caso === 'desajuste' || $caso === 'incompleto') {
    $t('no se puede usar', contrata_stripe_utilizable() === false);
    $r = $abrir($entrada('2026-11-02'));
    $t('no abre el pago (503)', ($r['http'] ?? 0) === 503);
    $t('no se ha llamado a Stripe', !is_file($mdir . '/requests.jsonl'));
    if ($fail > 0) exit(1);
    echo "ok\n";
    exit(0);
}

$t('utilizable', contrata_stripe_utilizable() === true);
// Publicación de disponibilidad firmada (lo que haría n8n), para poder abrir pagos.
$cuerpo = ['generado' => gmdate('c', contrata_ahora()), 'max_proyectos_simultaneos' => CONTRATA_MAX_PROYECTOS,
    'semanas' => contrata_calcular_semanas(contrata_hoy(), [], [])];
$rawDisp = (string)json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$tsDisp = (string)contrata_ahora();
$pub = contrata_post_disponibilidad($rawDisp, ['HTTP_X_SOBTREE_TIMESTAMP' => $tsDisp, 'HTTP_X_SOBTREE_SIGNATURE' => 'sha256=' . contrata_sign(contrata_config()['hmac_secret'], $tsDisp, $rawDisp)]);
$t('disponibilidad publicada', $pub['http'] === 200);
$t('modo coherente', contrata_config()['live'] === (contrata_modo() === 'stripe_live'));
$leerPeticiones = function () use ($mdir): array {
    $o = [];
    foreach (file($mdir . '/requests.jsonl', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $l) $o[] = json_decode($l, true);
    return $o;
};
$r = $abrir($entrada('2026-11-02'));
$t('abre sesión (200)', ($r['http'] ?? 0) === 200 && ($r['body']['ok'] ?? false) === true);
if (($r['http'] ?? 0) !== 200) fwrite(STDERR, json_encode($r) . "\n");
$sid = (string)($r['body']['sesion'] ?? '');
$t('id de sesión del modo correcto', str_starts_with($sid, $live ? 'cs_' . 'live_' : 'cs_test_'));
$t('la URL es la de Stripe', str_starts_with((string)($r['body']['url'] ?? ''), 'https://checkout.stripe.com/c/pay/'));
$reqs = $leerPeticiones();
$t('todas las llamadas con la clave del modo', count($reqs) >= 4 && count(array_filter($reqs, fn($q) => $q['live'] !== $live)) === 0);
$cus = array_values(array_filter($reqs, fn($q) => $q['metodo'] === 'POST' && $q['ruta'] === '/v1/customers'))[0] ?? null;
$t('cliente con el NIF como tax_id es_cif', $cus && ($cus['form']['tax_id_data'][0]['type'] ?? '') === 'es_cif' && ($cus['form']['tax_id_data'][0]['value'] ?? '') === 'B12345674' && ($cus['form']['name'] ?? '') === 'Acme SL');
$t('petición con clave de idempotencia', $cus && !empty($cus['idem']));
$ses = array_values(array_filter($reqs, fn($q) => $q['metodo'] === 'POST' && $q['ruta'] === '/v1/checkout/sessions'))[0] ?? null;
$f = $ses['form'] ?? [];
$t('factura automática', ($f['invoice_creation']['enabled'] ?? '') === 'true');
$t('dirección de facturación obligatoria y guardada en el cliente', ($f['billing_address_collection'] ?? '') === 'required' && ($f['customer_update']['address'] ?? '') === 'auto');
$t('IVA 21 % incluido por tax rate manual en la línea', preg_match('/^txr_/', (string)($f['line_items'][0]['tax_rates'][0] ?? '')) === 1 && ($f['line_items'][0]['quantity'] ?? '') === '1');
$t('sin tax_id_collection ni customer_email (el NIF ya está en el cliente)', !isset($f['tax_id_collection']) && !isset($f['customer_email']));
$t('la sesión usa el cliente creado', preg_match('/^cus_/', (string)($f['customer'] ?? '')) === 1);
$t('la casilla de Stripe enlaza las condiciones y la privacidad', str_contains((string)($f['custom_text']['terms_of_service_acceptance']['message'] ?? ''), '](https://sobtree.com/condiciones/)') && str_contains((string)($f['custom_text']['terms_of_service_acceptance']['message'] ?? ''), '/privacidad/)') && ($f['consent_collection']['terms_of_service'] ?? '') === 'required');
$t('el texto de pago dice «máximo 10 días laborables» entero (sin cortar) y no una semana de entrega', str_contains((string)($f['custom_text']['submit']['message'] ?? ''), 'máximo 10 días laborables.') && !preg_match('/1 semana|una semana de entrega|7 días/i', (string)($f['custom_text']['submit']['message'] ?? '')));
$t('la factura lleva la descripción del diagnóstico sin plazo de una semana', !preg_match('/1 semana|7 días/i', json_encode($f['invoice_creation'] ?? [])));
$t('el NIF no va en metadata', !str_contains(json_encode($f['metadata'] ?? []), 'B12345674'));
$t('se validó el tax rate y el price antes', count(array_filter($reqs, fn($q) => str_starts_with($q['ruta'], '/v1/tax_rates/'))) === 1 && count(array_filter($reqs, fn($q) => str_starts_with($q['ruta'], '/v1/prices/'))) === 1);

// Pago confirmado → aviso con NIF.
$ret = array_values(array_filter(contrata_leer_retenciones()['retenciones'], fn($x) => ($x['sesion'] ?? '') === $sid))[0] ?? [];
$meta = $f['metadata'] ?? [];
$evento = function (string $tipo, array $obj, ?bool $livemode = null, ?string $id = null) use ($live) {
    return contrata_firmar_evento_stripe(['id' => $id ?? ('evt_' . ($live ? 'x' : 'test') . '_' . bin2hex(random_bytes(6))), 'object' => 'event', 'type' => $tipo, 'livemode' => $livemode ?? $live, 'data' => ['object' => $obj]]);
};
$cola = function (): array {
    $o = [];
    foreach (file(contrata_file_cola(), FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $l) $o[] = json_decode($l, true);
    return $o;
};
$ultima = function () use ($cola): array { $c = $cola(); return $c ? $c[count($c) - 1] : []; };
$pago = ['id' => $sid, 'object' => 'checkout.session', 'payment_status' => 'paid', 'mode' => 'payment', 'currency' => 'eur', 'amount_total' => 59290,
    'payment_intent' => 'pi_x_1', 'invoice' => 'in_x_1', 'metadata' => $meta, 'consent' => ['terms_of_service' => 'accepted'],
    'customer_details' => ['email' => 'facturas@example.com', 'address' => ['country' => 'ES', 'postal_code' => '28001'], 'tax_ids' => [['type' => 'es_cif', 'value' => 'B12345674']]]];
[$p, $h] = $evento('checkout.session.completed', $pago);
$w = contrata_recibir_webhook($p, $h);
$t('webhook aceptado', $w['http'] === 200 && !isset($w['body']['ignorado']));
$fila = $cola()[0] ?? [];
$c = $fila['cuerpo'] ?? [];
$t('el aviso lleva la sesión, el importe y el NIF del modo correcto', ($c['sesion'] ?? '') === $sid && ($c['importe_total_centimos'] ?? 0) === 59290 && ($c['livemode'] ?? null) === $live);
$t('NIF coincide con el tax_id de Stripe y no hay alerta', ($c['nif_coincide'] ?? null) === true && ($c['alerta_facturacion'] ?? 'x') === '' && ($c['factura'] ?? '') === 'in_x_1');
// Evento del otro modo: se acusa y no se procesa.
$n = count($cola());
[$p, $h] = $evento('checkout.session.completed', $pago, !$live);
$w = contrata_recibir_webhook($p, $h);
$t('evento del otro modo (test/live) ignorado', $w['http'] === 200 && ($w['body']['ignorado'] ?? '') === 'livemode' && count($cola()) === $n);
// Importe distinto: alerta.
$r2 = $abrir($entrada('2026-11-09'));
$sid2 = (string)($r2['body']['sesion'] ?? '');
$ult = array_values(array_filter($leerPeticiones(), fn($q) => $q['ruta'] === '/v1/checkout/sessions'));
$pago2 = $pago; $pago2['metadata'] = $ult[count($ult) - 1]['form']['metadata'] ?? []; $pago2['id'] = $sid2; $pago2['payment_intent'] = 'pi_x_2'; $pago2['amount_total'] = 49000;
[$p, $h] = $evento('checkout.session.completed', $pago2);
contrata_recibir_webhook($p, $h);
$c2 = ($ultima())['cuerpo'] ?? [];
$t('importe distinto → alerta importe_inesperado', ($c2['alerta_facturacion'] ?? '') === 'importe_inesperado');
// Reembolsos por payment_intent.
$parcial = ['id' => 'ch_x_1', 'object' => 'charge', 'payment_intent' => 'pi_x_1', 'amount' => 59290, 'amount_refunded' => 10000, 'refunded' => false, 'metadata' => []];
[$p, $h] = $evento('charge.refunded', $parcial);
contrata_recibir_webhook($p, $h);
$c3 = ($ultima())['cuerpo'] ?? [];
$t('reembolso parcial: sesión localizada por payment_intent y estado reembolso_parcial', ($c3['sesion'] ?? '') === $sid && ($c3['estado'] ?? '') === 'reembolso_parcial');
$est = fn(string $s) => array_values(array_filter(contrata_leer_retenciones()['retenciones'], fn($x) => ($x['sesion'] ?? '') === $s))[0]['estado'] ?? '';
$t('el parcial no libera la plaza', $est($sid) === 'pagada');
$total = $parcial; $total['refunded'] = true; $total['amount_refunded'] = 59290;
[$p, $h] = $evento('charge.refunded', $total);
contrata_recibir_webhook($p, $h);
$c4 = ($ultima())['cuerpo'] ?? [];
$t('reembolso total: estado reembolsada y plaza liberada', ($c4['estado'] ?? '') === 'reembolsada' && $est($sid) === 'reembolsada');

if ($caso === 'normal' && !$live) {
    // Stripe rechaza el NIF como tax_id: el cliente se crea sin él y el NIF viaja como campo de la factura.
    @touch($mdir . '/rechaza-tax-id');
    $r3 = $abrir($entrada('2026-11-16', 'ESB12345674'));
    $t('con tax_id rechazado la compra sigue abierta', ($r3['http'] ?? 0) === 200);
    $reqs = $leerPeticiones();
    $ses3 = array_values(array_filter($reqs, fn($q) => $q['metodo'] === 'POST' && $q['ruta'] === '/v1/checkout/sessions'));
    $f3 = ($ses3 ? $ses3[count($ses3) - 1] : [])['form'] ?? [];
    $t('el NIF va como campo personalizado de la factura (sin prefijo ES)', ($f3['invoice_creation']['invoice_data']['custom_fields'][0]['name'] ?? '') === 'NIF/CIF' && ($f3['invoice_creation']['invoice_data']['custom_fields'][0]['value'] ?? '') === 'B12345674');
}
if ($fail > 0) exit(1);
echo "ok\n";

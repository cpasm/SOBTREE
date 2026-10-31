<?php
// Stripe SIMULADO para las pruebas (API mínima). No es Stripe: solo valida la forma de las peticiones.
// php -S 127.0.0.1:PUERTO tests/contrata/mock-stripe.php
// MOCK_STRIPE_DIR guarda el estado y las peticiones (requests.jsonl). El modo (test/live) sale del prefijo de la clave.
declare(strict_types=1);
$dir = getenv('MOCK_STRIPE_DIR') ?: sys_get_temp_dir() . '/mock-stripe';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$estadoF = $dir . '/estado.json';
$st = is_file($estadoF) ? (json_decode((string)file_get_contents($estadoF), true) ?: []) : [];
foreach (['products', 'prices', 'tax_rates', 'webhook_endpoints', 'customers', 'sessions'] as $k) $st[$k] = $st[$k] ?? [];
$guardar = function () use (&$st, $estadoF) { file_put_contents($estadoF, json_encode($st)); };
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$ruta = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$auth = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
$clave = str_starts_with($auth, 'Bearer ') ? substr($auth, 7) : '';
$live = (bool)preg_match('/^(rk|sk)_live_/', $clave);
header('Content-Type: application/json');
$err = function (int $code, string $msg) { http_response_code($code); echo json_encode(['error' => ['message' => $msg]]); exit; };
if (!preg_match('/^(rk|sk)_(test|live)_/', $clave)) $err(401, 'clave no válida');
parse_str((string)($_SERVER['QUERY_STRING'] ?? ''), $query);
$raw = file_get_contents('php://input') ?: '';
parse_str($raw, $form);
file_put_contents($dir . '/requests.jsonl', json_encode([
    'metodo' => $metodo, 'ruta' => $ruta, 'live' => $live, 'form' => $form,
    'idem' => $_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? null,
]) . "\n", FILE_APPEND);
$sal = function (array $o) { echo json_encode($o); exit; };
$id = fn(string $p) => $p . '_' . ($GLOBALS['live'] ? 'live' : 'test') . '_' . bin2hex(random_bytes(6));

if (preg_match('#^/v1/(products|prices|tax_rates|webhook_endpoints|customers)(?:/([^/]+))?$#', $ruta, $m)) {
    $col = $m[1];
    $uno = $m[2] ?? null;
    if ($metodo === 'GET' && $uno === null) {
        $items = array_values(array_filter($st[$col], fn($o) => ($o['livemode'] ?? false) === $live));
        if ($col === 'prices' && isset($query['lookup_keys'][0])) {
            $items = array_values(array_filter($items, fn($o) => ($o['lookup_key'] ?? '') === $query['lookup_keys'][0]));
        }
        $sal(['object' => 'list', 'data' => $items, 'has_more' => false]);
    }
    if ($metodo === 'GET') {
        $o = $st[$col][$uno] ?? null;
        if (!$o || ($o['livemode'] ?? false) !== $live) $err(404, 'No such ' . $col);
        $sal($o);
    }
    if ($metodo === 'POST' && $uno === null) {
        if ($col === 'products') {
            $nid = (string)($form['id'] ?? $id('prod'));
            $o = ['id' => $nid, 'object' => 'product', 'name' => $form['name'] ?? '', 'livemode' => $live, 'active' => true];
        } elseif ($col === 'prices') {
            if (($form['currency'] ?? '') !== 'eur' || !isset($form['unit_amount'], $form['product'])) $err(400, 'price inválido');
            $o = ['id' => $id('price'), 'object' => 'price', 'unit_amount' => (int)$form['unit_amount'], 'currency' => 'eur',
                'product' => $form['product'], 'lookup_key' => $form['lookup_key'] ?? null, 'livemode' => $live, 'active' => true];
        } elseif ($col === 'tax_rates') {
            $o = ['id' => $id('txr'), 'object' => 'tax_rate', 'percentage' => (float)($form['percentage'] ?? 0),
                'inclusive' => ($form['inclusive'] ?? '') === 'true', 'active' => true, 'country' => $form['country'] ?? null,
                'display_name' => $form['display_name'] ?? '', 'metadata' => $form['metadata'] ?? [], 'livemode' => $live];
        } elseif ($col === 'webhook_endpoints') {
            if (!str_starts_with((string)($form['url'] ?? ''), 'https://')) $err(400, 'url');
            $o = ['id' => $id('we'), 'object' => 'webhook_endpoint', 'url' => $form['url'], 'enabled_events' => $form['enabled_events'] ?? [],
                'status' => 'enabled', 'livemode' => $live];
            $st[$col][$o['id']] = $o;
            $guardar();
            $sal($o + ['secret' => 'whsec' . '_' . bin2hex(random_bytes(12))]);
        } else { // customers
            $tid = $form['tax_id_data'][0] ?? null;
            if ($tid !== null && (($tid['type'] ?? '') !== 'es_cif' || !preg_match('/^[A-Z0-9]{9}$/', (string)($tid['value'] ?? '')))) $err(400, 'tax id no válido');
            if (is_file($dir . '/rechaza-tax-id') && $tid !== null) $err(400, 'tax id rechazado');
            $o = ['id' => $id('cus'), 'object' => 'customer', 'name' => $form['name'] ?? '', 'email' => $form['email'] ?? '',
                'tax_id' => $tid['value'] ?? null, 'livemode' => $live];
        }
        $st[$col][$o['id']] = $o;
        $guardar();
        $sal($o);
    }
    $err(405, 'no soportado');
}
if ($ruta === '/v1/checkout/sessions' && $metodo === 'POST') {
    $cus = (string)($form['customer'] ?? '');
    $c = $st['customers'][$cus] ?? null;
    if (!$c) $err(400, 'customer');
    foreach (['invoice_creation', 'billing_address_collection', 'success_url', 'line_items'] as $k) if (!isset($form[$k])) $err(400, "falta $k");
    // Importe de la sesión: price_data (precio inline) o el Price guardado, por la cantidad.
    $li = $form['line_items'][0] ?? [];
    if (isset($li['price_data'])) {
        if (($li['price_data']['currency'] ?? '') !== 'eur' || !isset($li['price_data']['unit_amount'], $li['price_data']['product_data']['name'])) $err(400, 'price_data inválido');
        if (isset($li['price'])) $err(400, 'price y price_data a la vez');
        $unit = (int)$li['price_data']['unit_amount'];
        $cur = 'eur';
    } else {
        $pr = $st['prices'][(string)($li['price'] ?? '')] ?? null;
        if (!$pr || ($pr['livemode'] ?? false) !== $live) $err(400, 'price');
        $unit = (int)$pr['unit_amount'];
        $cur = (string)$pr['currency'];
    }
    $total = $unit * (int)($li['quantity'] ?? 1);
    if (is_file($dir . '/importe-sesion-distinto')) $total += 100;
    $o = ['id' => $id('cs'), 'object' => 'checkout.session', 'livemode' => $live, 'customer' => $cus, 'status' => 'open',
        'amount_total' => $total, 'currency' => $cur];
    $o['url'] = 'https://checkout.stripe.com/c/pay/' . $o['id'];
    $st['sessions'][$o['id']] = $o;
    $guardar();
    $sal($o);
}
if (preg_match('#^/v1/checkout/sessions/([^/]+)/expire$#', $ruta, $m) && $metodo === 'POST') {
    $o = $st['sessions'][$m[1]] ?? null;
    if (!$o || ($o['livemode'] ?? false) !== $live) $err(404, 'No such checkout.session');
    $o['status'] = 'expired';
    $st['sessions'][$m[1]] = $o;
    $guardar();
    $sal($o);
}
$err(404, 'ruta no soportada: ' . $ruta);

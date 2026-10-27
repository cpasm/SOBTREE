<?php
// Prepara Stripe para Contrata de forma idempotente: Product, Price, tax rate de IVA 21 % incluido y endpoint del webhook.
// Sirve igual con una clave de test que con una live. Nunca imprime ni guarda claves.
//
//   STRIPE_PREP_KEY=<clave> STRIPE_WEBHOOK_URL=https://sobtree.com/api/contrata/stripe-webhook.php \
//     php scripts/stripe-preparar.php [--dry-run] [--live] [--secret-file=RUTA]
//
// - La clave sale del entorno (STRIPE_PREP_KEY). Para esto basta una clave restringida temporal con permisos de
//   escritura en Products, Prices, Tax rates y Webhook endpoints (bórrala al terminar).
// - Con una clave live hay que pasar --live (y con una de test no se admite --live): no se mezclan por descuido.
// - Si ya existe todo, no crea nada. Si el endpoint del webhook hay que crearlo, Stripe devuelve su secreto de firma
//   una sola vez: se escribe en --secret-file (permisos 0600, no se sobrescribe) y no se muestra por pantalla.
// - --dry-run solo lee: dice qué crearía.
// Sale con 0 si todo está listo, 1 si algo falla y 2 si los argumentos no son seguros.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/public/lib/contrata.php';

const PREP_PRODUCT_ID = 'prod_sobtree_diagnostico';
const PREP_LOOKUP_KEY = 'sobtree_diagnostico_ia_v1';
const PREP_EVENTOS = ['checkout.session.completed', 'checkout.session.expired', 'charge.refunded'];

$dry = in_array('--dry-run', $argv, true);
$liveArg = in_array('--live', $argv, true);
$secretFile = '';
foreach ($argv as $a) if (str_starts_with($a, '--secret-file=')) $secretFile = substr($a, strlen('--secret-file='));
$priceIdArg = '';
foreach ($argv as $a) if (str_starts_with($a, '--price-id=')) $priceIdArg = substr($a, strlen('--price-id='));
if ($priceIdArg !== '' && !preg_match('/^price_[A-Za-z0-9_]+$/', $priceIdArg)) { fwrite(STDERR, "--price-id no tiene un formato válido.\n"); exit(2); }
$key = trim((string)getenv('STRIPE_PREP_KEY'));
$url = trim((string)getenv('STRIPE_WEBHOOK_URL'));

function prep_salir(string $msg, int $code): never { fwrite(STDERR, $msg . "\n"); exit($code); }

if (!preg_match('/^(rk|sk)_(test|live)_[A-Za-z0-9]+$/', $key)) prep_salir('Falta STRIPE_PREP_KEY (una clave de Stripe) o no tiene un formato válido. No se muestra.', 2);
$esLive = (bool)preg_match('/^(rk|sk)_live_/', $key);
if ($esLive && !$liveArg) prep_salir('La clave es live: añade --live para confirmar que quieres preparar la cuenta real.', 2);
if (!$esLive && $liveArg) prep_salir('Has pasado --live con una clave de test. Usa la clave live o quita --live.', 2);
if (!preg_match('#^https://[a-z0-9.-]+/[A-Za-z0-9._/-]+$#i', $url)) prep_salir('STRIPE_WEBHOOK_URL tiene que ser una URL https completa del webhook.', 2);

$base = 'https://api.stripe.com';
$local = (string)getenv('STRIPE_PREP_BASE');
if ($local !== '' && getenv('STRIPE_PREP_ALLOW_LOCAL') === '1' && preg_match('#^http://127\.0\.0\.1:\d+$#', $local)) $base = $local;

function prep_api(string $metodo, string $ruta, array $form = []): array {
    global $key, $base;
    $ch = curl_init($base . $ruta);
    $o = [CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Content-Type: application/x-www-form-urlencoded']];
    if ($metodo !== 'GET') $o[CURLOPT_POSTFIELDS] = http_build_query($form);
    curl_setopt_array($ch, $o);
    $r = curl_exec($ch);
    $st = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $j = is_string($r) ? json_decode($r, true) : null;
    if ($st < 200 || $st >= 300 || !is_array($j)) {
        $msg = is_array($j) ? (string)($j['error']['message'] ?? '') : '';
        throw new RuntimeException("Stripe respondió $st en $metodo $ruta" . ($msg !== '' ? ': ' . $msg : ''));
    }
    return $j;
}

$imp = contrata_importes();
$hecho = [];
$prefijo = $dry ? '[dry-run] ' : '';
try {
    echo "Modo de la cuenta: " . ($esLive ? 'LIVE (real)' : 'test') . ($dry ? ' · solo lectura' : '') . "\n";

    // 0) Comprobación previa: si hay que crear el webhook hace falta dónde guardar su secreto, antes de crear nada.
    $we = null;
    foreach (prep_api('GET', '/v1/webhook_endpoints?limit=100')['data'] as $w) if (($w['url'] ?? '') === $url) { $we = $w; break; }
    if (!$we && !$dry) {
        if ($secretFile === '') throw new RuntimeException('Hay que crear el webhook y Stripe da su secreto una sola vez: pasa --secret-file=RUTA para guardarlo (0600). No se ha creado nada.');
        if (file_exists($secretFile)) throw new RuntimeException('--secret-file ya existe; no se sobrescribe. No se ha creado nada.');
    }

    // 1) Product (id fijo, así que repetir no duplica)
    try {
        $prod = prep_api('GET', '/v1/products/' . PREP_PRODUCT_ID);
        $hecho[] = 'Product ya existe: ' . $prod['id'];
    } catch (RuntimeException $e) {
        if (!str_contains($e->getMessage(), ' 404 ')) throw $e;
        if ($dry) { $prod = ['id' => PREP_PRODUCT_ID]; $hecho[] = $prefijo . 'crearía el Product ' . PREP_PRODUCT_ID; }
        else {
            $prod = prep_api('POST', '/v1/products', ['id' => PREP_PRODUCT_ID, 'name' => 'Diagnóstico de implantación de IA', 'description' => 'Diagnóstico IA exprés de Sobtree', 'metadata[sku]' => 'diagnostico']);
            $hecho[] = 'Product creado: ' . $prod['id'];
        }
    }

    // 2) Price (lookup_key fija; el importe tiene que ser base + IVA, y un Price no se edita)
    $lista = prep_api('GET', '/v1/prices?' . http_build_query(['lookup_keys' => [PREP_LOOKUP_KEY], 'active' => 'true', 'limit' => 5]));
    $price = $lista['data'][0] ?? null;
    // Un Price que ya existe sin esa lookup_key se reconoce por su ID (--price-id=price_...).
    if (!$price && $priceIdArg !== '') {
        try { $price = prep_api('GET', '/v1/prices/' . rawurlencode($priceIdArg)); }
        catch (RuntimeException $e) { if (!str_contains($e->getMessage(), ' 404 ')) throw $e; }
    }
    if ($price) {
        if (($price['product'] ?? PREP_PRODUCT_ID) !== PREP_PRODUCT_ID) {
            throw new RuntimeException('El Price ' . $price['id'] . ' no es del Product ' . PREP_PRODUCT_ID . '. No se toca nada más.');
        }
        if ((int)$price['unit_amount'] !== $imp['total_centimos'] || strtolower((string)$price['currency']) !== 'eur') {
            throw new RuntimeException('El Price ' . $price['id'] . ' existe con otro importe. Los Price no se editan: crea uno nuevo con otra lookup_key y archiva este.');
        }
        $hecho[] = 'Price ya existe: ' . $price['id'] . ' (' . contrata_euros((int)$price['unit_amount']) . ')';
    } elseif ($dry) {
        $price = ['id' => '(se crearía)'];
        $hecho[] = $prefijo . 'crearía un Price de ' . $imp['total_texto'] . ' en EUR';
    } else {
        $price = prep_api('POST', '/v1/prices', ['product' => $prod['id'], 'unit_amount' => (string)$imp['total_centimos'], 'currency' => 'eur', 'lookup_key' => PREP_LOOKUP_KEY, 'nickname' => 'Diagnóstico (490 € + IVA 21 %)']);
        $hecho[] = 'Price creado: ' . $price['id'] . ' (' . $imp['total_texto'] . ')';
    }

    // 3) Tax rate de IVA 21 % incluido en el precio (España)
    $tr = null;
    foreach (prep_api('GET', '/v1/tax_rates?active=true&limit=100')['data'] as $t) {
        if (abs((float)$t['percentage'] - CONTRATA_IVA_PORCIENTO) < 0.0001 && ($t['inclusive'] ?? null) === true && ($t['country'] ?? '') === 'ES') { $tr = $t; break; }
    }
    if ($tr) $hecho[] = 'Tax rate ya existe: ' . $tr['id'];
    elseif ($dry) { $tr = ['id' => '(se crearía)']; $hecho[] = $prefijo . 'crearía el tax rate IVA 21 % incluido (ES)'; }
    else {
        $tr = prep_api('POST', '/v1/tax_rates', ['display_name' => 'IVA', 'percentage' => '21', 'inclusive' => 'true', 'country' => 'ES', 'jurisdiction' => 'ES', 'tax_type' => 'vat', 'description' => 'IVA 21 % (España), incluido en el precio', 'metadata[sobtree]' => 'iva21_incluido']);
        $hecho[] = 'Tax rate creado: ' . $tr['id'];
    }

    // 4) Webhook
    if ($we) {
        $faltan = array_diff(PREP_EVENTOS, (array)($we['enabled_events'] ?? []));
        $todos = in_array('*', (array)($we['enabled_events'] ?? []), true);
        if ($faltan && !$todos) {
            if ($dry) $hecho[] = $prefijo . 'añadiría eventos al webhook ' . $we['id'] . ': ' . implode(', ', $faltan);
            else {
                $form = [];
                foreach (array_values(array_unique(array_merge((array)$we['enabled_events'], PREP_EVENTOS))) as $i => $e) $form["enabled_events[$i]"] = $e;
                prep_api('POST', '/v1/webhook_endpoints/' . $we['id'], $form);
                $hecho[] = 'Webhook actualizado con los eventos que faltaban: ' . $we['id'];
            }
        } else {
            $hecho[] = 'Webhook ya existe: ' . $we['id'] . ' (el secreto de firma se ve en el Dashboard, no por API)';
        }
    } elseif ($dry) {
        $hecho[] = $prefijo . 'crearía el webhook hacia ' . $url . ' con ' . implode(', ', PREP_EVENTOS);
    } else {
        $form = ['url' => $url, 'description' => 'Sobtree · Contrata'];
        foreach (PREP_EVENTOS as $i => $e) $form["enabled_events[$i]"] = $e;
        $we = prep_api('POST', '/v1/webhook_endpoints', $form);
        $old = umask(0177);
        $ok = @file_put_contents($secretFile, (string)($we['secret'] ?? '') . "\n", LOCK_EX);
        umask($old);
        if ($ok === false) throw new RuntimeException('Webhook creado (' . $we['id'] . ') pero no se pudo escribir el secreto: cópialo del Dashboard.');
        @chmod($secretFile, 0600);
        $hecho[] = 'Webhook creado: ' . $we['id'] . '. Su secreto de firma está en ' . $secretFile . ' (no se muestra).';
    }
} catch (Throwable $e) {
    foreach ($hecho as $l) echo "  · $l\n";
    prep_salir('ERROR: ' . $e->getMessage(), 1);
}
foreach ($hecho as $l) echo "  · $l\n";
echo "\nValores para sobtree-secrets.php (identificadores, no son secretos):\n";
echo "  'STRIPE_PRICE_DIAGNOSTICO' => '" . ($price['id'] ?? '') . "',\n";
echo "  'STRIPE_TAX_RATE_IVA21'    => '" . ($tr['id'] ?? '') . "',\n";
echo "Falta pegar a mano (el fundador): STRIPE_RESTRICTED_KEY y STRIPE_WEBHOOK_SECRET.\n";
exit(0);

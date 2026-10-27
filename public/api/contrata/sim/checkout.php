<?php
// Checkout SIMULADO. No es Stripe. No cobra, no guarda el número de tarjeta y
// no existe fuera de CONTRATA_MODO=simulacion. En Apache este directorio está denegado.
declare(strict_types=1);
ini_set('display_errors', '0');
require dirname(__DIR__, 3) . '/lib/contrata.php';

if (contrata_modo() !== 'simulacion') {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "No encontrado\n";
    exit;
}

$id = (string)($_GET['sesion'] ?? $_POST['sesion'] ?? '');
$ses = contrata_leer_sesion_sim($id);
if (!$ses) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "No encontrado\n";
    exit;
}

$accion = (string)($_POST['accion'] ?? '');
$aviso = '';
$error = '';

$guardar = function (array $cambios) use ($id): void {
    contrata_con_bloqueo(function () use ($id, $cambios) {
        $all = contrata_leer_json(contrata_file_ses(), ['sesiones' => []]);
        if (!isset($all['sesiones'][$id])) return;
        foreach ($cambios as $k => $v) $all['sesiones'][$id][$k] = $v;
        contrata_guardar_json(contrata_file_ses(), $all);
    });
};

if ($accion !== '' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $ses = contrata_leer_sesion_sim($id) ?: $ses;
    if (($ses['status'] ?? '') === 'paid') {
        $aviso = 'Este pago simulado ya consta como hecho.';
    } elseif ($accion === 'abandonar') {
        contrata_sim_evento($id, 'checkout.session.expired');
        $destino = (string)($ses['params']['cancel_url'] ?? contrata_ruta());
        header('Location: ' . $destino, true, 303);
        exit;
    } elseif ($accion === 'rechazar' || $accion === 'pagar') {
        $pan = preg_replace('/\s+/', '', (string)($_POST['numero'] ?? '')) ?? '';
        if ($accion === 'rechazar' || $pan === '4000000000000002' || $pan === '4000000000009995') {
            $error = 'Tarjeta rechazada en la simulación. No se ha cobrado nada. La reserva de la plaza caduca a los 30 minutos.';
        } elseif ($pan === '4000000000003220') {
            $guardar(['esperando_3ds' => true]);
            $ses['esperando_3ds'] = true;
        } elseif ($pan === '4242424242424242') {
            contrata_sim_evento($id, 'checkout.session.completed');
            $destino = str_replace('{CHECKOUT_SESSION_ID}', rawurlencode($id), (string)$ses['params']['success_url']);
            header('Location: ' . $destino, true, 303);
            exit;
        } else {
            $error = 'En la simulación usa 4242 4242 4242 4242, una tarjeta de rechazo o la de 3D Secure de prueba. No escribas una tarjeta real.';
        }
    } elseif ($accion === '3ds_ok' && !empty($ses['esperando_3ds'])) {
        contrata_sim_evento($id, 'checkout.session.completed', ['autenticacion_3ds' => 'simulada_ok']);
        $destino = str_replace('{CHECKOUT_SESSION_ID}', rawurlencode($id), (string)$ses['params']['success_url']);
        header('Location: ' . $destino, true, 303);
        exit;
    } elseif ($accion === '3ds_fail' && !empty($ses['esperando_3ds'])) {
        $guardar(['esperando_3ds' => false, 'autenticacion_3ds' => 'simulada_fallo']);
        $error = 'La autenticación simulada ha fallado. No se ha cobrado nada. La reserva sigue hasta que caduque.';
        $ses['esperando_3ds'] = false;
    }
    $ses = contrata_leer_sesion_sim($id) ?: $ses;
}

$imp = contrata_importes();
$meta = $ses['params']['metadata'] ?? [];
$total = contrata_euros((int)($ses['amount_total'] ?? 0));
$semana = (string)($meta['semana_lunes'] ?? '');
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');
header('Cache-Control: no-store');
?>
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Pago simulado · Sobtree</title>
<style>
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; background: #050F2C; color: #fff; }
  main { max-width: 32rem; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 1.6rem; line-height: 1.2; }
  .aviso { background: #1A3F8C; border-radius: 16px; padding: 12px 14px; }
  label { display: grid; gap: 6px; font-weight: 700; margin-top: 16px; }
  input { font: inherit; padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.3); background: #0C1F4F; color: #fff; width: 100%; }
  button, .btn { display: inline-flex; margin-top: 12px; margin-right: 8px; padding: 14px 18px; border-radius: 999px; border: 0; font: inherit; font-weight: 700; cursor: pointer; background: #fff; color: #050F2C; }
  button.sec { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.4); }
  .err { color: #ffb4ab; }
  dl { display: grid; grid-template-columns: 8rem 1fr; gap: 6px 12px; }
  dt { color: #8FA2CC; }
</style>
</head>
<body>
<main>
  <p class="aviso">Pago simulado de Sobtree. No se cobra nada y no se guarda el número. No escribas una tarjeta real.</p>
  <h1>Diagnóstico IA exprés</h1>
  <dl>
    <dt>Base</dt><dd><?= htmlspecialchars($imp['base_texto'], ENT_QUOTES, 'UTF-8') ?></dd>
    <dt>IVA <?= (int)CONTRATA_IVA_PORCIENTO ?> %</dt><dd><?= htmlspecialchars($imp['iva_texto'], ENT_QUOTES, 'UTF-8') ?></dd>
    <dt>Total</dt><dd><strong><?= htmlspecialchars($total, ENT_QUOTES, 'UTF-8') ?></strong></dd>
    <?php if ($semana !== ''): ?>
    <dt>Semana</dt><dd>Lunes <?= htmlspecialchars(contrata_fecha_larga($semana, contrata_hoy()), ENT_QUOTES, 'UTF-8') ?></dd>
    <?php endif; ?>
  </dl>
  <?php if ($error !== ''): ?><p class="err" role="alert"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?>
  <?php if ($aviso !== ''): ?><p role="status"><?= htmlspecialchars($aviso, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?>
  <?php if (!empty($ses['esperando_3ds'])): ?>
  <h2>Autenticación simulada</h2>
  <p>Esto imita un reto 3D Secure. No es el reto real de un banco.</p>
  <form method="post">
    <input type="hidden" name="sesion" value="<?= htmlspecialchars($id, ENT_QUOTES, 'UTF-8') ?>">
    <button type="submit" name="accion" value="3ds_ok">Autenticación correcta</button>
    <button type="submit" class="sec" name="accion" value="3ds_fail">Autenticación fallida</button>
  </form>
  <?php elseif (($ses['status'] ?? '') !== 'paid'): ?>
  <form method="post" id="sim-pago">
    <input type="hidden" name="sesion" value="<?= htmlspecialchars($id, ENT_QUOTES, 'UTF-8') ?>">
    <label>Número de tarjeta de prueba
      <input name="numero" inputmode="numeric" autocomplete="off" spellcheck="false" required aria-describedby="ayuda-tarjeta">
    </label>
    <p id="ayuda-tarjeta">4242 4242 4242 4242 paga. 4000 0000 0000 0002 rechaza. 4000 0000 0000 3220 pide autenticación simulada.</p>
    <button type="submit" name="accion" value="pagar">Pagar <?= htmlspecialchars($total, ENT_QUOTES, 'UTF-8') ?></button>
    <button type="submit" class="sec" name="accion" value="rechazar">Simular rechazo</button>
    <button type="submit" class="sec" name="accion" value="abandonar">Abandonar</button>
  </form>
  <?php else: ?>
  <p role="status">El pago simulado ya está registrado.</p>
  <?php endif; ?>
</main>
</body>
</html>

<?php
// Pruebas puras de Contrata (sin red). Salida: una línea por fallo, o «ok».
declare(strict_types=1);
require dirname(__DIR__, 2) . '/public/lib/contrata.php';
$fail = 0;
$t = function (string $nombre, bool $ok) use (&$fail) {
    if ($ok) return;
    $fail++;
    fwrite(STDERR, "✘ $nombre\n");
};
$site = file_get_contents(dirname(__DIR__, 2) . '/src/data/site.ts');
preg_match('/precio:\s*(\d+)/', $site, $precio);
preg_match('/dias:\s*(\d+)/', $site, $dias);
preg_match('/POLITICA_VERSION = "([^"]+)"/', $site, $pol);
$t('precio = DIAGNOSTICO', ($precio[1] ?? '') === (string)CONTRATA_PRECIO_BASE_EUR);
$t('días de descuento', ($dias[1] ?? '') === (string)CONTRATA_DIAS_DESCUENTO);
preg_match('/CONDICIONES_VERSION = "([^"]+)"/', $site, $cv);
$t('versión de las condiciones', ($cv[1] ?? '') === CONTRATA_CONDICIONES_VERSION);
$t('versión de la política', ($pol[1] ?? '') === CONTRATA_POLITICA_VERSION);
$imp = contrata_importes();
$t('total con IVA', $imp['total_centimos'] === 59290 && $imp['iva_centimos'] === 10290 && $imp['base_centimos'] === 49000);
$t('price coincide con el total', contrata_price_coincide(59290, 'eur', false));
$t('price de 490 € no basta', !contrata_price_coincide(49000, 'eur', false));
$t('price live no vale', !contrata_price_coincide(59290, 'eur', true));
$t('clave live', contrata_clave_prohibida(contrata_marca_live('sk') . 'abc') && contrata_clave_prohibida(contrata_marca_live('rk') . 'abc'));
$t('clave test no es live', !contrata_clave_prohibida('rk_test_abc') && !contrata_clave_prohibida('sk_test_abc'));
$t('primer lunes', contrata_primer_lunes('2026-10-27') === '2026-11-02');
$t('viernes más un laborable', contrata_sumar_laborables('2026-10-30', 1) === '2026-11-02');
$sem = contrata_calcular_semanas('2026-10-27', [
    ['inicio' => '2026-11-02', 'fin' => '2026-11-07', 'sesion' => 'cs_test_abc'],
], [
    ['inicio' => '2026-11-16', 'fin' => '2026-11-21'],
]);
$t('semana con proyecto', $sem[0]['plazas'] === 0 && $sem[0]['proyectos'] === 1 && $sem[0]['bloqueada'] === false);
$t('semana libre', $sem[1]['lunes'] === '2026-11-09' && $sem[1]['plazas'] === 1);
$t('semana bloqueada', $sem[2]['lunes'] === '2026-11-16' && $sem[2]['plazas'] === 0 && $sem[2]['bloqueada'] === true);
$t('texto de una plaza', contrata_texto_plazas(1, '2026-11-09', 1, '2026-10-27') === 'Queda 1 plaza para la semana del 9 de noviembre');
$t('cero plazas no es escasez', contrata_texto_plazas(0, '2026-11-09', 1, '2026-10-27') === null);
$t('NIF', contrata_validar_nif('12345678Z') && !contrata_validar_nif('12345678A'));
$t('NIE', contrata_validar_nie('X1234567L'));
$t('CIF', contrata_validar_cif('B12345674') && !contrata_validar_cif('B12345675'));
$de = contrata_validar_identificacion('DE123456789');
$es = contrata_validar_identificacion('ESB12345674');
$t('IVA UE formato sin VIES', is_array($de) && $de['pais'] === 'DE' && $de['verificado'] === false);
$t('CIF con prefijo ES', is_array($es) && $es['tipo'] === 'cif' && $es['verificado'] === false);
$t('identificación vacía', contrata_validar_identificacion('') === null);
preg_match('/PLAZO_DIAGNOSTICO = "([^"]+)"/', $site, $plazo);
$t('plazo de entrega = PLAZO_DIAGNOSTICO', ($plazo[1] ?? '') === CONTRATA_PLAZO_TEXTO && CONTRATA_PLAZO_TEXTO === 'máximo 10 días laborables');
$t('el texto de fecha dice el plazo y no una semana de entrega', str_contains(CONTRATA_MSG_FECHA, 'máximo 10 días laborables') && !preg_match('/1 semana|una semana|7 días/i', CONTRATA_MSG_FECHA));
$t('NIF sin prefijo ES para el tax_id', contrata_nif_normal('ES B-1234567-4') === 'B12345674' && contrata_nif_normal('b12345674') === 'B12345674');
$t('territorio con otro IVA', contrata_alerta_territorio(['address' => ['country' => 'ES', 'postal_code' => '38001']]) === 'territorio_sin_iva'
    && contrata_alerta_territorio(['address' => ['country' => 'ES', 'postal_code' => '28001']]) === ''
    && contrata_alerta_territorio(['address' => ['country' => 'DE', 'postal_code' => '10115']]) === 'direccion_fuera_de_espana');
// ---- Servicios: la lista del PHP y la del front (src/data/contrata.ts) coinciden, y solo valen los ids de la lista
$ts = file_get_contents(dirname(__DIR__, 2) . '/src/data/contrata.ts');
preg_match_all('/id:\s*"([a-z0-9_]+)",\s*nombre:\s*"([^"]+)",\s*baseEur:\s*([A-Za-z_.0-9]+),\s*diasBloqueo:\s*(\d+)/', $ts, $m, PREG_SET_ORDER);
$t('hay un servicio en el front y uno en el PHP', count($m) === 1 && count(contrata_servicios()) === 1);
$ids_ts = array_map(fn($x) => $x[1], $m);
$t('mismos ids en PHP y front', $ids_ts === array_keys(contrata_servicios()));
foreach ($m as $x) {
    $sv = contrata_servicio($x[1]);
    $t('servicio ' . $x[1] . ': nombre y días de bloqueo iguales', $sv !== null && $sv['nombre'] === $x[2] && (int)$sv['dias_bloqueo'] === (int)$x[4]);
    $t('servicio ' . $x[1] . ': la base sale de DIAGNOSTICO.precio', $x[3] === 'DIAGNOSTICO.precio' && $sv !== null && $sv['base_eur'] === CONTRATA_PRECIO_BASE_EUR);
}
$t('solo diagnóstico', array_keys(contrata_servicios()) === ['diagnostico']);
$t('un id fuera de la lista no existe', contrata_servicio('Diagnostico') === null && contrata_servicio('diagnostico ') === null && contrata_servicio('proyecto') === null && contrata_servicio('') === null);
$lanzo = false;
try { contrata_importes('proyecto'); } catch (InvalidArgumentException $e) { $lanzo = true; }
$t('importes de un servicio desconocido falla', $lanzo);
$t('el Price se valida contra el importe de ese servicio', contrata_price_coincide(59290, 'eur', false, 'diagnostico'));
$lanzo = false;
try { contrata_price_coincide(59290, 'eur', false, 'otro'); } catch (InvalidArgumentException $e) { $lanzo = true; }
$t('un Price para un servicio que no existe no se compara', $lanzo);
$t('días de bloqueo entre 1 y 5', array_reduce(contrata_servicios(), fn($ok, $s) => $ok && $s['dias_bloqueo'] >= 1 && $s['dias_bloqueo'] <= CONTRATA_DIAS_BLOQUEO_MAX, true));
$t('el Price del diagnóstico sale de STRIPE_PRICE_DIAGNOSTICO', CONTRATA_SERVICIOS['diagnostico']['env_price'] === 'STRIPE_PRICE_DIAGNOSTICO');
// ---- Sesiones de Stripe en lo publicado por «Disponibilidad»: test y live (un pago real deja un cs_live_ en el calendario)
$hoyU = contrata_hoy();
$lunesU = contrata_primer_lunes($hoyU);
$pubU = function (string $sesion) use ($hoyU, $lunesU): array {
    $sem = contrata_calcular_semanas($hoyU, [['inicio' => $lunesU, 'fin' => contrata_sumar_dias($lunesU, 5), 'sesion' => $sesion]], []);
    return ['generado' => gmdate('c'), 'max_proyectos_simultaneos' => CONTRATA_MAX_PROYECTOS, 'semanas' => $sem];
};
$t('publicación con proyecto cs_live_ se acepta', contrata_validar_cuerpo_publicado($pubU('cs_live_a1ZInu98Ig9Z7B0e3BHeKGoNtbujwbdX6g0IPv2ImKB2KRYiK3IEeQtnAN')) === null);
$t('publicación con proyecto cs_test_ se sigue aceptando', contrata_validar_cuerpo_publicado($pubU('cs_test_abc123')) === null);
foreach (['cs_prod_abc', 'cs_live_', 'cs_live_a b', 'cs_live_<x>', 'xcs_live_abc', 'CS_LIVE_abc', 'cs_live_abc@x'] as $malo) {
    $t("sesión no permitida: $malo", contrata_validar_cuerpo_publicado($pubU($malo)) !== null);
}
$ahoraU = 1800000000;
$retLive = ['semana' => $lunesU, 'estado' => 'retenida', 'expira' => $ahoraU + 600, 'sesion' => 'cs_live_abc123'];
$t('retención cs_live_: sin evento en el calendario cuenta', contrata_retencion_cuenta($retLive, $lunesU, [], $ahoraU) === true);
$t('retención cs_live_ ya en el calendario no cuenta doble', contrata_retencion_cuenta($retLive, $lunesU, ['cs_live_abc123'], $ahoraU) === false);
$t('retención cs_live_ pagada ya en el calendario no cuenta doble', contrata_retencion_cuenta(['estado' => 'pagada'] + $retLive, $lunesU, ['cs_live_abc123'], $ahoraU) === false);
$t('retención cs_live_ de otra sesión sí cuenta', contrata_retencion_cuenta($retLive, $lunesU, ['cs_live_otra'], $ahoraU) === true);
if ($fail > 0) exit(1);
echo "ok\n";

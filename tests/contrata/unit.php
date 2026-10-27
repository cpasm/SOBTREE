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
if ($fail > 0) exit(1);
echo "ok\n";

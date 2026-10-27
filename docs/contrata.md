# Contrata · diagnóstico (Stripe, hoja y calendario)

El botón «Contrata» vende el diagnóstico: 490 € + IVA 21 % = 592,90 €. Solo a empresas y autónomos con NIF o CIF español. El pago lo hace Stripe Checkout; la factura la emite Stripe; la venta se anota en la pestaña «Ventas» de la hoja «Sobtree · Contactos» y la semana se bloquea en el calendario de info@sobtree.com, todo desde n8n.

El equipo de Sobtree

## Modos y flag

| Modo (`CONTRATA_MODO`) | Qué hace |
|---|---|
| vacío / `apagado` | No abre pagos. |
| `simulacion` | Checkout falso local (`public/api/contrata/sim/`), sin Stripe ni Google. Solo para pruebas y demo. |
| `stripe_test` | Stripe con clave `rk_test_`/`sk_test_`. |
| `stripe_live` | Stripe real con clave `rk_live_`/`sk_live_`. Exige además: `STRIPE_WEBHOOK_SECRET` (`whsec_`), `STRIPE_PRICE_DIAGNOSTICO`, `STRIPE_TAX_RATE_IVA21`, `CONTRATA_HMAC_SECRET` y `CONTRATA_N8N_WEBHOOK_URL` en https, y `CONTRATA_PUBLIC_URL` en https. Si falta algo, el pago no se abre (503): no se cobra una venta que no se pueda anotar. |

Una clave que no corresponde al modo (live en test o test en live) se descarta. Cada evento, sesión y Price de Stripe se comprueba contra `livemode`.

La web solo muestra el botón, `/contratar/` y `/condiciones/` si el build se hace con `PUBLIC_CONTRATA_ACTIVO=1`. `.github/workflows/deploy.yml` lo pone a `1` salvo que la variable del repo `PUBLIC_CONTRATA_ACTIVO` valga otra cosa (`0` apaga Contrata en el siguiente build sin tocar código). Con el flag apagado el build borra `contratar/` y `condiciones/`, no las pone en el sitemap y no pinta el botón. El simulador `api/contrata/sim/` nunca entra en `dist/` (y `api/.htaccess` lo deniega de todos modos).

## Servicios (selector)

`CONTRATA_SERVICIOS` en `public/lib/contrata.php` es la lista cerrada que acepta el servidor. Cada servicio tiene `id`, `nombre`, `base_eur` (sin IVA), `dias_bloqueo` (1 a 5 días de calendario desde el lunes de inicio) y la clave de secretos de su Price (`env_price`, p. ej. `STRIPE_PRICE_DIAGNOSTICO`). `SERVICIOS` en `src/data/contrata.ts` repite los textos para el front; una prueba comprueba que coinciden. Hoy solo hay `diagnostico`.

- El PHP rechaza (422) cualquier `producto` que no sea exactamente un id de la lista.
- El Price de Stripe se valida contra el importe de ese servicio (base + 21 %), EUR y el modo.
- El id viaja en la retención, en los metadatos de Stripe, en el aviso a n8n y en la columna `producto` de «Ventas». Si Stripe devolviera un pago con un servicio desconocido, el aviso lleva `alerta_facturacion = servicio_desconocido` y la fila queda en «revisar».
- Con un solo servicio la página lo muestra como texto fijo (preseleccionado). Con más, aparece un selector y el desglose y el botón siguen al servicio elegido.
- Un servicio nuevo: añadir su entrada en los dos sitios, crear su Price y poner `STRIPE_PRICE_<ID>`. Hoy el script de preparación de Stripe solo prepara el diagnóstico.

## Precio, IVA y factura

- El Price de Stripe vale el total con IVA (59.290 céntimos). Va con un tax rate manual **inclusivo** del 21 % (ES): Stripe separa 490,00 + 102,90 en la factura. El código lee el Price y el tax rate antes de abrir cada sesión y no continúa si no coinciden.
- La sesión usa un Customer creado por la API con el NIF como `tax_id` (`es_cif`); si Stripe no lo acepta, el cliente se crea sin él y el NIF va como campo personalizado de la factura. Dirección de facturación obligatoria, `invoice_creation` activo (factura automática, descripción y semana de inicio) e `Idempotency-Key` en cada POST.
- Solo vendemos online a NIF/CIF españoles. Un NIF-IVA de otro país se rechaza con un mensaje que remite a info@sobtree.com (422 `fuera_de_espana`). Es una **decisión que el fundador debe confirmar**: evita facturar IVA español a quien tendría inversión del sujeto pasivo (B2B intracomunitario) sin validar el NIF-IVA en VIES; esos clientes se facturan a mano.
- Alertas que dejan la venta en «revisar» (no bloquean el cobro): `importe_inesperado`, `nif_distinto` (el NIF de la web y el `tax_id` de Stripe no coinciden), `condiciones_sin_aceptar`, `nif_ausente`, `servicio_desconocido`, `territorio_sin_iva` (CP de Canarias, Ceuta o Melilla) y `direccion_fuera_de_espana`.
- Coste de las facturas de Stripe: el cargo por factura es el 0,4 % del total, con tope de 2 USD por factura; en un diagnóstico de 592,90 € el 0,4 % serían 2,37 €, así que se aplica el tope de 2 USD (unos 1,7 €) por factura. Más la comisión normal del cobro con tarjeta. Revisa las tarifas vigentes en stripe.com (Invoicing, Precios).
- **VERI*FACTU**: el Invoicing de Stripe por sí solo **no** cumple el sistema de facturación verificable. El Real Decreto 254/2025 (BOE-A-2025-24446, https://www.boe.es/buscar/act.php?id=BOE-A-2025-24446) fija la obligatoriedad desde el 1 de enero de 2027 para sociedades y el 1 de julio de 2027 para el resto; el 5 de octubre de 2026 se anunció un aplazamiento a octubre de 2028 que, a fecha de esta rama, no está en el BOE. Antes de esas fechas hace falta un programa de facturación compatible o consultar con el gestor. Hasta entonces las facturas de Stripe sirven de documento de cobro y el gestor decide cómo registrarlas.

## Condiciones y aceptación

`/condiciones/` (texto de Sobtree Holding, S.L.) es pública e indexable con el flag encendido y está en el sitemap. `CONDICIONES_VERSION` en `src/data/site.ts` (y `CONTRATA_CONDICIONES_VERSION` en el PHP; una prueba las iguala) se guarda en los metadatos de Stripe. Aceptación: casilla obligatoria en `/contratar/` (el servidor rechaza si no llega `condiciones = si`) y casilla de Stripe (`consent_collection.terms_of_service = required`, con `custom_text` que enlaza las condiciones y la privacidad). Si el pago llega sin `consent.terms_of_service = accepted`, la alerta es `condiciones_sin_aceptar`. **Hay que poner la URL de las condiciones en el Dashboard de Stripe** (Ajustes → Datos públicos → Términos de servicio): `https://sobtree.com/condiciones/`; Stripe exige esa URL para mostrar la casilla.

El plazo del informe es «máximo 10 días laborables» (`PLAZO_DIAGNOSTICO`); el calendario bloquea de lunes a viernes (5 días) porque es el trabajo previsto, y los 10 días son el colchón contractual.

## Calendario: un solo calendario (info@sobtree.com)

No hay calendarios secundarios: n8n lee y escribe en el calendario de info@sobtree.com y solo cuentan dos tipos de evento. El resto de eventos (reuniones, citas, recordatorios) se ignora.

- **Proyecto**: lo crea Contrata. Título que empieza por `CONTRATA ·` (o propiedad extendida privada `sobtree_contrata = 1`). Dura los `dias_bloqueo` del servicio y lleva la sesión de Stripe en la descripción, así la web no cuenta dos veces la plaza (la retención y su evento se casan por esa sesión).
- **Bloqueo a mano**: cualquier evento cuyo título empiece por `BLOQUEO` (por ejemplo `BLOQUEO · vacaciones`). Un evento `CONTRATA ·` nunca cuenta como bloqueo aunque lleve la palabra BLOQUEO.
- Lo publicado a la web solo lleva fechas; ningún título ni descripción sale del calendario.

### Cómo bloquear una semana a mano

1. En Google Calendar (cuenta info@sobtree.com), crea un evento **de día completo** que cubra la semana: empieza el lunes y termina el viernes (en Google, el día de fin de un evento de día completo es el último día incluido; basta con marcar de lunes a viernes).
2. Ponle un título que **empiece por `BLOQUEO`**: `BLOQUEO · vacaciones`, `BLOQUEO · festivo`.
3. En menos de una hora (el flujo «Sobtree · Disponibilidad» corre cada hora) esa semana deja de ofrecerse. Para quitarla, borra el evento.
4. Un evento con otro título (aunque sea «Vacaciones») **no** bloquea nada.

## Secretos y configuración

Ver `config/sobtree-secrets.example.php` (solo los nombres). Secretos reales en `domains/sobtree.com/sobtree-secrets.php`, fuera de `public_html`:

- Secretos: `STRIPE_RESTRICTED_KEY`, `STRIPE_WEBHOOK_SECRET`, `CONTRATA_HMAC_SECRET`.
- IDs y URLs (no secretos): `STRIPE_PRICE_DIAGNOSTICO`, `STRIPE_TAX_RATE_IVA21`, `CONTRATA_N8N_WEBHOOK_URL`, `CONTRATA_MODO`, `CONTRATA_PUBLIC_URL` (opcional).

Preparar Stripe (idempotente, no imprime claves):

```bash
STRIPE_PREP_KEY="$(cat ruta/a/la/clave)" STRIPE_WEBHOOK_URL=https://sobtree.com/api/contrata/stripe-webhook.php \
  php scripts/stripe-preparar.php --live --dry-run     # solo lee y dice qué haría
STRIPE_PREP_KEY="$(cat ruta/a/la/clave)" STRIPE_WEBHOOK_URL=https://sobtree.com/api/contrata/stripe-webhook.php \
  php scripts/stripe-preparar.php --live [--price-id=price_…] [--secret-file=RUTA]
```

Reconoce el Product (`prod_sobtree_diagnostico`), el Price (por `lookup_key` `sobtree_diagnostico_ia_v1` o por `--price-id`) y el webhook (por URL) y solo crea lo que falta (el tax rate). Con una clave live exige `--live`. Si hay que crear el webhook, su secreto se escribe en `--secret-file` (0600) y no se muestra.

## n8n

Importar a mano y activar (dos flujos; el secreto `SECRET` se pega en el nodo Code de cada uno, igual que `CONTRATA_HMAC_SECRET`):

1. `integraciones/n8n/sobtree-disponibilidad.json` — lee el calendario y publica las semanas en la web.
2. `integraciones/n8n/sobtree-contrata.json` — recibe el aviso firmado del pago o del reembolso, escribe en «Ventas» (11 columnas, con NIF, sin duplicar por `id_sesion_stripe`) e «Historial», crea el evento `CONTRATA ·` y avisa a info@. El flujo no guarda las ejecuciones correctas (llevarían el NIF).

Regenerar con valores reales (sin secretos): `CONTRATA_N8N_MODO=produccion CONTRATA_N8N_LIVE=1 CONTRATA_CAL_ID=info@sobtree.com CONTRATA_URL_PUBLICACION=https://sobtree.com/api/contrata/disponibilidad.php node integraciones/n8n/build-contrata.mjs`. Credenciales por nombre: «Google Sheets Sobtree (info@)», «Google Calendar Sobtree (info@)», «Gmail Sobtree (info@)».

Si el flujo de Contrata no está importado o `CONTRATA_N8N_WEBHOOK_URL` está vacía, en `stripe_live` el botón no abre pagos. Si el flujo falla después de un pago, el aviso queda en la cola del servidor y `reintentar-contrata.php` (cron) lo reenvía; el pago y la factura de Stripe no se pierden.

## Lista de comprobación para pasar a live

1. Cuenta de Stripe activa. Product, Price (59290 EUR) y webhook (`checkout.session.completed`, `checkout.session.expired`, `charge.refunded`) creados; tax rate con `stripe-preparar.php --live`.
2. URL de condiciones en el Dashboard de Stripe (Datos públicos).
3. `sobtree-secrets.php` con los nombres de arriba y `CONTRATA_MODO=stripe_live`.
4. Flujos de n8n importados, con `SECRET` y credenciales; activados; la URL del webhook de Contrata en `CONTRATA_N8N_WEBHOOK_URL`.
5. Pruebas post-despliegue de solo lectura: `bash scripts/verify-contrata.sh https://sobtree.com`.
6. Un pago real propio, comprobar fila en «Ventas», evento en el calendario, factura recibida, y devolverlo (comprobar que la fila pasa a «reembolsada»).
7. VERI*FACTU y facturación: consulta con el gestor (apartado de arriba).

## Qué hay en el repositorio

| Pieza | Ruta |
|---|---|
| Datos, flag y servicios | `src/data/contrata.ts`, `src/data/contrata-logica.mjs`, `src/data/site.ts` |
| Botón y páginas | `src/components/ContrataBoton.astro`, `src/pages/contratar/`, `src/pages/condiciones/` |
| API | `public/api/contrata/disponibilidad.php`, `crear-sesion.php`, `stripe-webhook.php` (el simulador `sim/` no se publica) |
| Librería y cron | `public/lib/contrata.php`, `public/lib/reintentar-contrata.php` |
| Stripe | `scripts/stripe-preparar.php` |
| Verificación | `scripts/verify-contrata.sh` |
| n8n | `integraciones/n8n/` (`build-contrata.mjs` regenera los JSON) |
| Demo y pruebas | `npm run demo:contrata`, `npm run test:contrata` |

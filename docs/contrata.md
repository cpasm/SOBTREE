# Contrata · diagnóstico (Stripe, registro local, correo y calendario)

El botón «Contrata» vende el diagnóstico: 490 € + IVA 21 % = 592,90 €. Solo a empresas y autónomos con NIF o CIF español. El pago lo hace Stripe Checkout; la factura la emite Stripe. Desde D-116 (2026-10-31) la web no depende de ningún servicio de automatización externo: cuando Stripe confirma una venta o un reembolso, el PHP lo guarda en el **registro local** del servidor (`sobtree-contrata/cola.jsonl`, fuera de `public_html`) y manda un **correo a info@sobtree.com** («[Sobtree] Venta <sesión>» / «[Sobtree] Reembolso <sesión>»). El evento del calendario de info@ lo crea la rutina de NEXUS al leer ese correo. La pestaña «Ventas» de la hoja «Sobtree · Contactos» ya no se escribe sola (queda como histórico).

El equipo de Sobtree

## Modos y flag

| Modo (`CONTRATA_MODO`) | Qué hace |
|---|---|
| vacío / `apagado` | No abre pagos. |
| `simulacion` | Checkout falso local (`public/api/contrata/sim/`), sin Stripe ni Google. Solo para pruebas y demo. |
| `stripe_test` | Stripe con clave `rk_test_`/`sk_test_`. |
| `stripe_live` | Stripe real con clave `rk_live_`/`sk_live_`. Exige además: `STRIPE_WEBHOOK_SECRET` (`whsec_`), `STRIPE_PRICE_DIAGNOSTICO`, `STRIPE_TAX_RATE_IVA21`, `CONTRATA_HMAC_SECRET` (firma el token CSRF del formulario) y `CONTRATA_PUBLIC_URL` en https. Si falta algo, el pago no se abre (503). |

Una clave que no corresponde al modo (live en test o test en live) se descarta. Cada evento, sesión y Price de Stripe se comprueba contra `livemode`.

La web solo muestra el botón, `/contratar/` y `/condiciones/` si el build se hace con `PUBLIC_CONTRATA_ACTIVO=1`. `.github/workflows/deploy.yml` lo pone a `1` salvo que la variable del repo `PUBLIC_CONTRATA_ACTIVO` valga otra cosa (`0` apaga Contrata en el siguiente build sin tocar código). Con el flag apagado el build borra `contratar/` y `condiciones/`, no las pone en el sitemap y no pinta el botón. El simulador `api/contrata/sim/` nunca entra en `dist/` (y `api/.htaccess` lo deniega de todos modos).

## Servicios (selector)

`CONTRATA_SERVICIOS` en `public/lib/contrata.php` es la lista cerrada que acepta el servidor. Cada servicio tiene `id`, `nombre`, `base_eur` (sin IVA), `dias_bloqueo` (1 a 5 días de calendario desde el lunes de inicio) y la clave de secretos de su Price (`env_price`, p. ej. `STRIPE_PRICE_DIAGNOSTICO`). `SERVICIOS` en `src/data/contrata.ts` repite los textos para el front; una prueba comprueba que coinciden. Hay `diagnostico` (con semana y Price) y `kit_asesorias` (precio inline, ver abajo).

- El PHP rechaza (422) cualquier `producto` que no sea exactamente un id de la lista.
- El Price de Stripe se valida contra el importe de ese servicio (base + 21 %), EUR y el modo.
- El id viaja en la retención, en los metadatos de Stripe, en el registro local y en el correo de la venta. Si Stripe devolviera un pago con un servicio desconocido, el registro lleva `alerta_facturacion = servicio_desconocido` y el correo lo marca en «ALERTAS».
- Con un solo servicio la página lo muestra como texto fijo (preseleccionado). Con más, aparece un selector y el desglose y el botón siguen al servicio elegido.
- Un servicio nuevo: añadir su entrada en los dos sitios, crear su Price y poner `STRIPE_PRICE_<ID>`. Hoy el script de preparación de Stripe solo prepara el diagnóstico.

## Kit IA para asesorías y gestorías (producto digital, D-119)

`kit_asesorias`: 39 € + IVA 21 % = 47,19 € (4.719 céntimos). Mismo flujo de cobro que el diagnóstico (NIF español, Customer con `es_cif`, dirección obligatoria, factura automática, tax rate inclusivo `STRIPE_TAX_RATE_IVA21`, webhook, registro local y correo a info@), con estas diferencias:

- **Precio inline** (`tipo => precio_inline` en `CONTRATA_SERVICIOS`): no hay Price en Stripe ni `STRIPE_PRICE_*`; la sesión lleva `line_items[0][price_data]` con el total con IVA. Como no hay Price que leer antes, el PHP comprueba `amount_total` y `currency` de la sesión creada; si no son 4719 EUR, la expira y no devuelve la URL de pago (502). Los servicios inline no se exigen en `contrata_stripe_utilizable()`: el diagnóstico sigue igual.
- **Sin semana ni disponibilidad**: la retención se guarda con `semana = ''` (no ocupa plaza; solo guarda el NIF hasta el pago y el token de descarga). `GET disponibilidad.php?producto=kit_asesorias` da importes y token CSRF sin semanas; la disponibilidad normal solo publica el diagnóstico.
- **Páginas**: `/kit-asesorias/` (venta), `/kit-asesorias/condiciones/` (condiciones propias, versión `2026-10-31`, que viaja en `metadata.condiciones_version`) y `/kit-asesorias/gracias/` (noindex). Solo existen con `PUBLIC_CONTRATA_ACTIVO=1`. La casilla de Stripe de la sesión del kit enlaza las condiciones del kit.
- **Correo a info@**: «[Sobtree] Venta kit_asesorias <sesión>», sin semana y con «Para la rutina: … NO crear evento en el calendario». Lleva el enlace de descarga con token para reenviarlo si el cliente lo pide.
- **Entrega**: `api/contrata/descargar.php?sesion=cs_…` (vuelta de Stripe) o `?k=<token>` (pie de la factura de Stripe). Solo entrega el ZIP si `cola.jsonl` tiene la venta pagada del kit (no consulta Stripe). Sin venta pero con retención viva: 403 `pendiente` con `reintentar` (la página de gracias reintenta 10 veces cada 3 s). Sesión inventada: 404. Otro producto: 403. Reembolso total: 403. Importe inesperado: 403 `revisar`. Máximo 10 descargas por compra (`descargas.json`, con bloqueo): la 11.ª es 403 `limite`.
- **Archivo**: `public/lib/kits/kit-asesorias.zip` (en la web, `lib/` y `lib/kits/` con `Require all denied`). Opcional: `CONTRATA_KITS_DIR` o `<base>/sobtree-kits/` fuera de `public_html`, que tienen prioridad.
- **Contenido**: textos en `kits/kit-asesorias/fuente/` (PULSE). `python3 scripts/generar-kit.py` rehace el ZIP (solo biblioteca estándar: Léeme y guía en PDF, prompts y plantillas en DOCX, hoja en XLSX con fórmulas; reproducible). `--comprobar` verifica que el ZIP guardado corresponde a la fuente (lo ejecuta `npm run test:contrata`). Cambiar el contenido no exige tocar código.
- **Antes de vender en live**: la URL global de términos del Dashboard de Stripe sigue siendo `/condiciones/` (la sesión del kit enlaza las del kit en su texto); revisar que el email de factura/recibo de Stripe está activado para que el cliente reciba el enlace; la política de privacidad no menciona aún el kit (NEXUS).

## Precio, IVA y factura

- El Price de Stripe vale el total con IVA (59.290 céntimos). Va con un tax rate manual **inclusivo** del 21 % (ES): Stripe separa 490,00 + 102,90 en la factura. El código lee el Price y el tax rate antes de abrir cada sesión y no continúa si no coinciden.
- La sesión usa un Customer creado por la API con el NIF como `tax_id` (`es_cif`); si Stripe no lo acepta, el cliente se crea sin él y el NIF va como campo personalizado de la factura. Dirección de facturación obligatoria, `invoice_creation` activo (factura automática, descripción y semana de inicio) e `Idempotency-Key` en cada POST.
- Solo vendemos online a NIF/CIF españoles. Un NIF-IVA de otro país se rechaza con un mensaje que remite a info@sobtree.com (422 `fuera_de_espana`). Es una **decisión que el fundador debe confirmar**: evita facturar IVA español a quien tendría inversión del sujeto pasivo (B2B intracomunitario) sin validar el NIF-IVA en VIES; esos clientes se facturan a mano.
- Alertas que salen en el bloque «ALERTAS» del correo de la venta (no bloquean el cobro): `importe_inesperado`, `nif_distinto` (el NIF de la web y el `tax_id` de Stripe no coinciden), `condiciones_sin_aceptar`, `nif_ausente`, `servicio_desconocido`, `territorio_sin_iva` (CP de Canarias, Ceuta o Melilla) y `direccion_fuera_de_espana`.
- Coste de las facturas de Stripe: el cargo por factura es el 0,4 % del total, con tope de 2 USD por factura; en un diagnóstico de 592,90 € el 0,4 % serían 2,37 €, así que se aplica el tope de 2 USD (unos 1,7 €) por factura. Más la comisión normal del cobro con tarjeta. Revisa las tarifas vigentes en stripe.com (Invoicing, Precios).
- **VERI*FACTU**: el Invoicing de Stripe por sí solo **no** cumple el sistema de facturación verificable. El Real Decreto 254/2025 (BOE-A-2025-24446, https://www.boe.es/buscar/act.php?id=BOE-A-2025-24446) fija la obligatoriedad desde el 1 de enero de 2027 para sociedades y el 1 de julio de 2027 para el resto; el 5 de octubre de 2026 se anunció un aplazamiento a octubre de 2028 que, a fecha de esta rama, no está en el BOE. Antes de esas fechas hace falta un programa de facturación compatible o consultar con el gestor. Hasta entonces las facturas de Stripe sirven de documento de cobro y el gestor decide cómo registrarlas.

## Condiciones y aceptación

`/condiciones/` (texto de Sobtree Holding, S.L.) es pública e indexable con el flag encendido y está en el sitemap. `CONDICIONES_VERSION` en `src/data/site.ts` (y `CONTRATA_CONDICIONES_VERSION` en el PHP; una prueba las iguala) se guarda en los metadatos de Stripe. Aceptación: casilla obligatoria en `/contratar/` (el servidor rechaza si no llega `condiciones = si`) y casilla de Stripe (`consent_collection.terms_of_service = required`, con `custom_text` que enlaza las condiciones y la privacidad). Si el pago llega sin `consent.terms_of_service = accepted`, la alerta es `condiciones_sin_aceptar`. **Hay que poner la URL de las condiciones en el Dashboard de Stripe** (Ajustes → Datos públicos → Términos de servicio): `https://sobtree.com/condiciones/`; Stripe exige esa URL para mostrar la casilla.

El plazo del informe es «máximo 10 días laborables» (`PLAZO_DIAGNOSTICO`); una venta ocupa la semana de lunes a viernes (5 días) porque es el trabajo previsto, y los 10 días son el colchón contractual.

## Disponibilidad (la calcula el PHP)

`GET /api/contrata/disponibilidad.php` calcula las 4 semanas visibles en cada petición (mismo formato JSON que consume el front): capacidad 1 por semana, 0 si un bloqueo toca algún día de lunes a viernes, menos las ventas **pagadas** y las retenciones vivas (30 min) del registro local. Una venta pagada ocupa su semana hasta que llega su reembolso total. Ningún dato personal sale en la respuesta.

**Semanas bloqueadas:** `public/datos/bloqueos.json` (en la web: `public_html/datos/bloqueos.json`, denegado por `.htaccess`; solo lo lee el PHP):

```json
{"actualizado": "2026-10-31", "bloqueos": [{"desde": "2026-12-21", "hasta": "2027-01-01", "nota": "vacaciones"}]}
```

- `desde` y `hasta` son fechas `AAAA-MM-DD` y `hasta` es **inclusive**. Basta con que el bloqueo toque un día de lunes a viernes para cerrar la semana entera; un bloqueo solo de sábado/domingo no cierra nada.
- `nota` es opcional (máx. 80 caracteres, sin datos personales; no admite `@`).
- Si el archivo falta o no es válido (JSON roto, clave desconocida, fecha imposible, `hasta` < `desde`), la web **falla en cerrado**: no muestra fechas ni abre pagos (el botón lleva al formulario de contacto) y el cron avisa a info@ una vez al día («[Sobtree] Contrata: archivo de bloqueos no válido»). Un despliegue con el archivo roto lo detecta además la comprobación de `auto-claude.yml` (`disponibilidad sin ok:true`) y revierte.
- `public/datos/` no está en la lista de archivos protegidos de `auto-claude.yml`: una rama `claude/auto-*` que solo toque este archivo se publica sola.

### Lo que hace la rutina de NEXUS (calendario de info@)

- **Venta** (correo «[Sobtree] Venta <sesión>»): crear en el calendario de info@ el evento de día completo `CONTRATA · <empresa> · <sesión>` del lunes indicado al último día de bloqueo (el correo lo dice: «Para la rutina: …»). Revisar el bloque «ALERTAS».
- **Reembolso total** («[Sobtree] Reembolso <sesión>», «Reembolso TOTAL»): cancelar ese evento. La web ya ha liberado la plaza. Un reembolso parcial no cambia nada.
- **Bloqueos**: cuando aparezca, cambie o se borre un evento cuyo título empiece por `BLOQUEO` (p. ej. `BLOQUEO · vacaciones`), actualizar `public/datos/bloqueos.json` (un bloqueo por evento, con sus fechas) en una rama `claude/auto-*` y comprobar después que `disponibilidad.php` sigue con `"ok":true`. Los eventos `CONTRATA ·` **no** se copian a bloqueos (la web ya cuenta sus ventas). Un proyecto vendido fuera de la web, o una venta que el fundador mueva de semana, sí se bloquea con un `BLOQUEO` en la semana nueva.
- **Limitación conocida**: si una venta web se cambia de semana en el calendario, la web sigue contando la semana original hasta que haya un reembolso; la semana nueva necesita su `BLOQUEO`.

## Secretos y configuración

Ver `config/sobtree-secrets.example.php` (solo los nombres). Secretos reales en `domains/sobtree.com/sobtree-secrets.php`, fuera de `public_html`:

- Secretos: `STRIPE_RESTRICTED_KEY`, `STRIPE_WEBHOOK_SECRET`, `CONTRATA_HMAC_SECRET`.
- IDs y URLs (no secretos): `STRIPE_PRICE_DIAGNOSTICO`, `STRIPE_TAX_RATE_IVA21`, `CONTRATA_MODO`, `CONTRATA_PUBLIC_URL` (opcional), `CONTRATA_NOTIFY_TO` (opcional, por defecto info@sobtree.com).
- `CONTRATA_N8N_WEBHOOK_URL` ya no se usa: si sigue en `sobtree-secrets.php` se ignora y se puede borrar.

Preparar Stripe (idempotente, no imprime claves):

```bash
STRIPE_PREP_KEY="$(cat ruta/a/la/clave)" STRIPE_WEBHOOK_URL=https://sobtree.com/api/contrata/stripe-webhook.php \
  php scripts/stripe-preparar.php --live --dry-run     # solo lee y dice qué haría
STRIPE_PREP_KEY="$(cat ruta/a/la/clave)" STRIPE_WEBHOOK_URL=https://sobtree.com/api/contrata/stripe-webhook.php \
  php scripts/stripe-preparar.php --live [--price-id=price_…] [--secret-file=RUTA]
```

Reconoce el Product (`prod_sobtree_diagnostico`), el Price (por `lookup_key` `sobtree_diagnostico_ia_v1` o por `--price-id`) y el webhook (por URL) y solo crea lo que falta (el tax rate). Con una clave live exige `--live`. Si hay que crear el webhook, su secreto se escribe en `--secret-file` (0600) y no se muestra.

## Registro, avisos y reintentos

1. Stripe llama a `stripe-webhook.php`. El PHP verifica la firma, descarta eventos del otro modo (test/live) y los duplicados (`eventos.jsonl`).
2. **Registro primero**: la venta o el reembolso se escribe en `cola.jsonl` (una fila por `event_id`; un reintento de Stripe no duplica). Después la retención pasa a `pagada` (o `reembolsada`). Solo entonces se marca el evento como procesado.
3. **Ningún cobro sin registro**: si no se puede escribir el registro, la retención o la marca del evento, el webhook responde **500** y Stripe reintenta el mismo evento (durante días). El evento no se marca como procesado hasta que todo queda guardado.
4. Correo a info@ con los datos de la venta (sesión, servicio, semana, importe, empresa, email, NIF, factura, lead, modo) y sus alertas. Si el correo falla, el pago sigue guardado (200 a Stripe) y `cola-estado.jsonl` queda en `correo_error`; el cron lo reenvía. Al salir el correo, el NIF se borra del registro local (queda en el correo y en Stripe).

El cron de leads (`reintentar-leads.php`, cada 15 min) llama también a `contrata_mantenimiento()`: suelta retenciones caducadas, reenvía los avisos pendientes de los últimos 30 días y avisa si el archivo de bloqueos no vale. `reintentar-contrata.php` hace lo mismo por separado.

## Lista de comprobación para pasar a live

1. Cuenta de Stripe activa. Product, Price (59290 EUR) y webhook (`checkout.session.completed`, `checkout.session.expired`, `charge.refunded`) creados; tax rate con `stripe-preparar.php --live`.
2. URL de condiciones en el Dashboard de Stripe (Datos públicos).
3. `sobtree-secrets.php` con los nombres de arriba y `CONTRATA_MODO=stripe_live`.
4. Cron de `reintentar-leads.php` cada 15 min y `public/datos/bloqueos.json` al día (la rutina de NEXUS).
5. Pruebas post-despliegue de solo lectura: `bash scripts/verify-contrata.sh https://sobtree.com`.
6. Un pago real propio: comprobar el correo «[Sobtree] Venta …», la fila en `cola.jsonl`, que la semana pasa a 0 plazas, el evento que crea la rutina y la factura; devolverlo y comprobar el correo «[Sobtree] Reembolso …» y que la plaza vuelve.
7. VERI*FACTU y facturación: consulta con el gestor (apartado de arriba).

## Qué hay en el repositorio

| Pieza | Ruta |
|---|---|
| Datos, flag y servicios | `src/data/contrata.ts`, `src/data/contrata-logica.mjs`, `src/data/site.ts` |
| Botón y páginas | `src/components/ContrataBoton.astro`, `src/pages/contratar/`, `src/pages/condiciones/` |
| API | `public/api/contrata/disponibilidad.php`, `crear-sesion.php`, `stripe-webhook.php` (el simulador `sim/` no se publica) |
| Librería y cron | `public/lib/contrata.php`, `public/lib/reintentar-contrata.php` |
| Semanas bloqueadas | `public/datos/bloqueos.json` (lo actualiza la rutina de NEXUS) |
| Stripe | `scripts/stripe-preparar.php` |
| Verificación | `scripts/verify-contrata.sh` |
| Demo y pruebas | `npm run demo:contrata`, `npm run test:contrata` |

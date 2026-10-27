# Contrata · diagnóstico (v1, modo test)

El botón «Contrata» vende solo el diagnóstico: 490 € + IVA 21 % (592,90 €). La venta es a empresas y autónomos, con NIF o CIF. En producción el botón está apagado: el build no publica la página ni el enlace. Esta versión no cobra, no llama a Stripe live, no llama a Google y no escribe en la hoja de Ventas.

El equipo de Sobtree

## Precio y flag

El precio base sale de `DIAGNOSTICO.precio` en `src/data/site.ts`. PHP repite la misma cifra en `CONTRATA_PRECIO_BASE_EUR`. El total con IVA es el importe del Price de Stripe (59.290 céntimos, EUR, `livemode` false). Un Price de 490 € no basta.

`CONTRATA.activo` solo es true si la variable `PUBLIC_CONTRATA_ACTIVO` vale `1` en el momento de construir o de servir en local. Sin esa variable:

- el componente no pinta el botón;
- el build borra `dist/contratar/`;
- `/contratar/` no entra en el sitemap.

## Qué hay en el repositorio

| Pieza | Ruta |
|---|---|
| Datos y flag | `src/data/contrata.ts`, `src/data/contrata-logica.mjs` |
| Botón | `src/components/ContrataBoton.astro` |
| Páginas (solo si el flag está encendido) | `src/pages/contratar/` |
| API | `public/api/contrata/disponibilidad.php`, `crear-sesion.php`, `stripe-webhook.php` |
| Pago simulado | `public/api/contrata/sim/checkout.php` (Apache lo deniega; `php -S` solo responde en simulación) |
| Librería y cron | `public/lib/contrata.php`, `public/lib/reintentar-contrata.php` |
| Nombres de secretos | `config/sobtree-secrets.example.php` |
| n8n | `integraciones/n8n/sobtree-disponibilidad.json`, `sobtree-contrata.json` |
| Demo | `npm run demo:contrata` |
| Pruebas | `npm run test:contrata` |

Los secretos reales viven en `sobtree-secrets.php`, fuera de `public_html`. Ese fichero no se sube. El ejemplo solo trae los nombres, vacíos:

`STRIPE_RESTRICTED_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_DIAGNOSTICO`, `CONTRATA_HMAC_SECRET`, `CONTRATA_N8N_WEBHOOK_URL`, `CONTRATA_CALENDAR_PROYECTOS_ID`, `CONTRATA_CALENDAR_BLOQUEOS_ID`, `CONTRATA_CALENDAR_CUENTA`.

Cualquier clave que empiece por el prefijo live de Stripe se descarta y no se abre el pago. El modo por defecto, si `CONTRATA_MODO` no es `simulacion` ni `stripe_test`, es apagado.

## Capacidad y textos

Un diagnóstico a la vez. El primer lunes es hoy más 3 días laborables, y el siguiente lunes. Se ven 4 semanas. Los festivos no están en el código: entran como eventos del calendario «Sobtree · Bloqueos».

La escasez solo se muestra si el cálculo la produce, por ejemplo «Queda 1 plaza para la semana del 9 de noviembre». Si los datos faltan, tienen más de 3 horas o la firma no vale, no hay fechas ni cifra, y el botón pasa al formulario con el texto «Reserva tu diagnóstico; te confirmamos la fecha en 1 día laborable».

## Retención y pago

`crear-sesion.php` valida empresa, email y el formato del NIF, CIF, NIE o NIF-IVA de la UE. No consulta VIES: siempre se cobra el 21 % y el aviso a n8n lleva `alerta_facturacion = revisar_antes_de_facturar` y `nif_verificado = false`.

La plaza se retiene 30 minutos con `flock`. Si Stripe (o el simulador) no abre la sesión, la retención se suelta. `checkout.session.completed` la marca pagada. `checkout.session.expired` o el cron la liberan. `charge.refunded` la marca reembolsada y deja de contar. Un `completed` que llega después de liberar igual se marca pagada y `fuera_de_orden`. El mismo `event.id` no se reenvía dos veces.

La sesión de Checkout lleva `tax_id_collection` requerido, consentimiento de condiciones, el campo empresa y el total con IVA en el texto del botón de pago. No se pide `invoice_creation`.

## Demo local

No hace falta cuenta de Stripe. El script crea secretos temporales, no los imprime y los borra al salir.

```bash
npm ci
npm run demo:contrata
```

Queda así:

- Astro en http://127.0.0.1:4321/ con el flag encendido. En dev, `/api/` y `/contact.php` se reenvían al PHP (Vite, si no, entregaría el fuente porque vive en `public/`).
- PHP en 127.0.0.1:8787 (simulación)
- un n8n falso en 127.0.0.1:8788 que solo comprueba la firma

En la portada, «Contrata» abre `/contratar/`. El total visible es 592,90 €. Tarjetas de la simulación (no son de un banco y no se guardan):

| Número | Efecto |
|---|---|
| 4242 4242 4242 4242 | pago simulado y página de gracias |
| 4000 0000 0000 0002 | rechazo; la plaza sigue retenida 30 minutos |
| 4000 0000 0000 9995 | rechazo |
| 4000 0000 0000 3220 | autenticación simulada (no es 3D Secure real) |

Ctrl+C para el script. No despliega y no escribe en la web pública.

## Pruebas

```bash
npm run test:contrata
```

Levanta PHP y un n8n falso, siembra cuatro semanas firmadas con la fecha fija 2026-10-27 y recorre las 15 pruebas del diseño. Las que en la vida real necesitan Dashboard, 3D Secure de un banco o una ejecución de n8n quedan marcadas como simuladas: el PHP se comprueba con eventos firmados, y el informe no las da por hechas de verdad.

Al final construye la web con el flag apagado y comprueba que `dist/` no contiene `/contratar/` ni cadenas `sk_`, `rk_` o `whsec_`.

## Workflows de n8n

Importar a mano, sin activar:

1. `integraciones/n8n/sobtree-disponibilidad.json` — «Sobtree · Disponibilidad»
2. `integraciones/n8n/sobtree-contrata.json` — «Sobtree · Contrata»

Los dos llegan con `active: false`. El secreto del nodo es `REEMPLAZAR_EN_N8N`. La URL de publicación es `https://ejemplo.invalid/...`. Las credenciales se eligen por nombre (`REEMPLAZAR_ID_CREDENCIAL`): «Google Calendar Sobtree (info@)», «Gmail Sobtree (info@)» y «Google Sheets Sobtree (info@)».

Los nodos de Google están deshabilitados. Solo contemplan dos calendarios de la cuenta info@sobtree.com: «Sobtree · Proyectos» y «Sobtree · Bloqueos», con IDs `CONFIGURAR_ID_CALENDARIO_PROYECTOS` y `CONFIGURAR_ID_CALENDARIO_BLOQUEOS`. No listan calendarios.

El nodo «Añadir fila en Ventas» está deshabilitado. Es un nodo de Google Sheets (`appendOrUpdate`, sin duplicar por `id_sesion_stripe`) sobre la pestaña `Ventas` de la hoja «Sobtree · Contactos» (ID `1EWlyQCodNmxIwOvljQuyM1ZOq1s7QlNZVkPEydyNizQ`, privada, solo info@sobtree.com). Su credencial es un marcador de posición: se elige en n8n al activarlo. La rama que sí se ejecuta responde un acuse simulado.

Columnas de `Ventas` (en este orden): `fecha`, `id_sesion_stripe`, `empresa`, `nif`, `email`, `producto`, `importe_sin_iva`, `iva`, `total`, `semana_reservada`, `estado`. Los importes salen en euros del aviso de la web (490 + 102,90 = 592,90) y `estado` es `pagada`. **La columna `nif` no se escribe**: el aviso solo lleva país y tipo de NIF, no el número, y el número no sale de la web hacia n8n. Se copia a mano al facturar (un reintento del webhook no la borra), o se decide con el fundador si el aviso debe llevarlo (cambio en el PHP). Un reintento sí vuelve a poner `estado` = `pagada` en esa fila; solo ocurre mientras el cron reintenta (minutos).

Para regenerar los JSON: `node integraciones/n8n/build-contrata.mjs`.

## Pendiente para pasar a live

Nada de esto se hace en esta rama. El flag sigue apagado hasta un OK explícito.

1. Alta de la cuenta de Stripe (KYC, IBAN, CIF) y la URL de condiciones en el Dashboard. Hoy la sesión ya pide el consentimiento, pero la URL de las condiciones la configura Stripe en su cuenta.
2. Producto y Price de test por el total con IVA (592,90 €, EUR). Pegar `price_...` en `STRIPE_PRICE_DIAGNOSTICO`. El código rechaza otro importe, otra moneda o `livemode`.
3. Clave restringida de test (`rk_test_…`) y endpoint de webhook de test para `checkout.session.completed`, `checkout.session.expired` y `charge.refunded`. Pegar los secretos solo en `sobtree-secrets.php`.
4. Crear en Google, con info@sobtree.com, los dos calendarios secundarios y pegar sus IDs. No compartir calendarios personales. No llamar a `calendarList` sobre la cuenta.
5. Importar los dos workflows, pegar el mismo HMAC que `CONTRATA_HMAC_SECRET`, sustituir `ejemplo.invalid` por la URL pública y activarlos a mano. OAuth de Calendar y Gmail solo de la cuenta de Sobtree.
6. Hoja de Ventas: crear (o reutilizar) en n8n la credencial «Google Sheets Sobtree (info@)» (OAuth de info@sobtree.com, la misma del flujo de leads), elegirla en «Añadir fila en Ventas», habilitar el nodo y comprobar con un pago de test que aparece **una** fila en `Ventas` y que un webhook repetido no la duplica. No queda ningún permiso de CRM pendiente (ya no se piden permisos de deals). Decidir qué hacer con el NIF (ver arriba).
7. Revisión legal de condiciones, desistimiento y cancelación, y revisión fiscal de la factura (VERI*FACTU). Mientras no haya VIES, el 21 % y la alerta se mantienen.
8. Un pago real de prueba, devuelto después, con el flag ya encendido y el OK de despliegue. Hasta entonces no se despliega esta rama.

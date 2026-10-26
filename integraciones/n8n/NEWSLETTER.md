# n8n · Newsletter → HubSpot

Instancia: `https://sobtree.app.n8n.cloud`

- Alta: `POST https://sobtree.app.n8n.cloud/webhook/sobtree-newsletter`
- Confirmación: `GET https://sobtree.app.n8n.cloud/webhook/sobtree-newsletter-confirmar`

Ficheros (sin credenciales ni secretos):

- `sobtree-newsletter.json`: workflow. Se importa **desactivado** (`active: false`).
- `verificar-newsletter.js`: firma HMAC del alta y mapeo a HubSpot.
- `validar-confirmacion.js`: firma y caducidad del enlace de doble confirmación.
- `build-newsletter.py`: regenera el JSON. Prueba local: `node tests/newsletter/test-n8n-code.mjs`.

El alta la registra n8n y el envío lo hace HubSpot. El plan gratuito (portal EU `149616589`) no deja crear tipos de suscripción propios ni más de 10 propiedades personalizadas.

## Qué hace el flujo

1. **Webhook alta** (POST, *Raw Body*, responde desde un nodo).
2. **Verificar firma newsletter**: mismo HMAC que los leads, `sha256` de `"<X-Sobtree-Timestamp>.<cuerpo crudo>"`, comparación en tiempo constante, desfase máximo de 5 minutos. El secreto está en `const SECRET = 'REEMPLAZAR_EN_N8N'` (hay que pegarlo dentro de n8n).
3. Firma no válida → **401**. La web lo deja en la cola y el cron lo reintenta.
4. **Upsert** del contacto por email (`POST /crm/v3/objects/contacts/batch/upsert`) con la credencial **HubSpot Service Key account** (`predefinedCredentialType` / `hubspotAppToken`).
5. **Nota** asociada al contacto con el texto exacto de la casilla (igual que la nota de los leads, asociación `202`).
6. **Doble confirmación propia, activa por defecto** (`const DOBLE_CONFIRMACION = true` en el nodo de la firma). La doble confirmación nativa de HubSpot no se dispara con contactos creados por API. Con el flag activo:
   - no se suscribe a nadie en este paso;
   - **Email de confirmación** con la credencial Gmail **Gmail account**, que tiene que ser el OAuth de `info@sobtree.com`;
   - el enlace va firmado con el mismo secreto, caduca a las 48 horas y apunta al segundo webhook;
   - responde `200` con `{ "ok": true, "confirmar": true }`.
7. Si se pone el flag a `false`, suscribe en el mismo alta y responde `confirmar: false`.
8. **Webhook confirmar** (GET). Valida email, caducidad y HMAC. Solo entonces guarda `sobtree_newsletter_confirmado` y llama a `POST /communication-preferences/v3/subscribe` con `legalBasis: CONSENT_WITH_NOTICE` y `legalBasisExplanation` (incluye el texto aceptado). Hasta ese momento el contacto no está suscrito.
9. El tipo de suscripción es el que ya existe, **Marketing Information**, id `3927875333`. Está escrito en los dos nodos Code (`const SUBSCRIPTION_ID`). No hay marcador `REEMPLAZAR_SUBSCRIPTION_ID`: para cambiarlo se edita esa constante en los dos ficheros `.js` y se regenera el JSON, o se edita dentro de n8n.
10. Si la suscripción falla (por ejemplo, falta el scope), el upsert y la nota **no se deshacen**. El flujo responde al visitante y después lanza un error a propósito para que salte el workflow **Errores de workflows** (`alJvCL7d1kwPIipg`), ya puesto en `settings.errorWorkflow`.
11. Cualquier otro fallo de HubSpot o del correo de confirmación → **502**. La web lo reintenta con el cron, hasta 8 veces.

## Importar

1. En n8n: Workflows → Import from File → `sobtree-newsletter.json`. Debe quedar **inactivo**.
2. En **los dos** nodos Code («Verificar firma newsletter» y «Validar enlace»), sustituye `REEMPLAZAR_EN_N8N` por el mismo valor que `N8N_LEADS_WEBHOOK_SECRET`. No lo copies al repositorio ni al chat.
3. En cada nodo con credencial, el id es `REEMPLAZAR_ID_CREDENCIAL`. Elige en el desplegable:
   - HubSpot: **HubSpot Service Key account** (tipo nativo «HubSpot Service Key», nombre interno `hubspotAppToken`).
   - Gmail: **Gmail account**. Tiene que ser la sesión OAuth de `info@sobtree.com`. Si en n8n esa credencial se llama de otra forma (en el flujo de leads figura «Gmail Sobtree (info@)»), elígela igualmente: el nombre del JSON es solo una pista.
4. Settings → Error workflow = «Sobtree · Errores de workflows». El JSON ya trae el id `alJvCL7d1kwPIipg`. Si al importar n8n lo vacía, vuelve a elegirlo.
5. No actives el workflow hasta crear las dos propiedades y, cuando el fundador lo apruebe, ampliar el scope.

## Variables (solo nombres)

En `domains/sobtree.com/sobtree-secrets.php`, fuera de `public_html`. El ejemplo está en `config/sobtree-secrets.example.php`.

| Nombre | Para qué |
|---|---|
| `N8N_NEWSLETTER_WEBHOOK_URL` | URL de producción del webhook `sobtree-newsletter`. Opcional. |
| `N8N_LEADS_WEBHOOK_URL` | Si la anterior está vacía, de aquí se deduce la ruta (`…/sobtree-lead` → `…/sobtree-newsletter`). |
| `N8N_LEADS_WEBHOOK_SECRET` | Firma HMAC. Es el mismo secreto que los leads. No hay otro. |

En n8n, dentro de los nodos, no en el repo: `SECRET`, `DOBLE_CONFIRMACION`, `SUBSCRIPTION_ID`.

## Requisito previo: scope de la Service Key

La Service Key actual **no** tiene `communication_preferences.write`. Sin ese scope el upsert y la nota funcionan, y la suscripción falla. El fallo no borra el contacto: avisa por «Errores de workflows».

Ampliar la key es un cambio de permisos. **Lo aprueba el fundador** antes de pegar el valor nuevo en la credencial de n8n (Development → Keys → Service keys). Hace falta, como mínimo:

- `communication_preferences.write` (o `communication_preferences.read_write`)
- los que ya usa el flujo de leads: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.schemas.contacts.read`

Cuando el permiso esté, reejecuta en n8n la ejecución que falló en «Suscribir en HubSpot». La web no vuelve a lanzar esa suscripción sola: el alta ya se dio por entregada al mandar el correo de confirmación.

## Propiedades de HubSpot

Máximo 10 personalizadas en la cuenta. Ya hay 7 `sobtree_*` de los leads. Esta newsletter usa **2**, no 4. Créalas a mano, en el mismo grupo que las otras (en la cuenta, «Custom information» / `custom_information`), antes de activar el workflow.

| Nombre interno | Etiqueta | Tipo | Qué guarda |
|---|---|---|---|
| `sobtree_newsletter_consentimiento` | Consentimiento newsletter (web) | Texto de una línea (`string` / single-line text) | `fecha ISO 8601 UTC \| origen \| versión de la política`. Ejemplo: `2026-10-26T07:00:00+00:00 \| portada \| 2026-10-26` |
| `sobtree_newsletter_confirmado` | Newsletter confirmada el | Fecha y hora (`datetime`) | Milisegundos UTC del momento en que el enlace es válido. Vacía hasta entonces. |

El texto completo de la casilla no cabe en otra propiedad: va en la **nota** del contacto y en `legalBasisExplanation` de la suscripción.

No crees un tipo de suscripción «Newsletter». En el plan gratuito no se puede. Se usa **Marketing Information** (`3927875333`).

## Cola en el servidor

`public/lib/newsletter.php` guarda cada alta en `domains/sobtree.com/sobtree-newsletter/` (hermana de `sobtree-leads`, fuera de `public_html`):

- `altas.jsonl`: el alta, con bloqueo y permisos 600.
- `estado.jsonl`: `enviado`, `error` u `omitido`.

Al visitante se le responde éxito aunque n8n no conteste (la prueba de n8n acaba hacia el 8 de noviembre de 2026). `public/lib/reintentar-leads.php` reintenta esta cola en la misma ejecución que los leads. **No hace falta un cron nuevo.** El que ya existe vale:

`/usr/bin/php /home/<usuario>/domains/sobtree.com/public_html/lib/reintentar-leads.php`

Hasta 8 intentos por alta. HubSpot hace upsert por email, así que un reintento no duplica el contacto (sí puede añadir otra nota).

## Probar después del despliegue

1. `GET https://sobtree.com/api/newsletter.php?estado` → `{"ok":true}`. Si falta configuración: `{"ok":false,"falta":"webhook"}`, `"webhook_no_valido"` o `"secreto"`. La respuesta no incluye la URL ni el secreto.
2. Con el workflow activo, envía el formulario en la portada (`origen` `portada`), en `/radar/` (`radar`) y al final de un artículo (`articulo:<slug>`). La casilla no viene marcada y es obligatoria.
3. El mensaje de éxito, con la doble confirmación activa, es «Revisa tu correo para confirmar».
4. Llega un correo de `info@sobtree.com` con el enlace. En HubSpot el contacto existe, `sobtree_newsletter_consentimiento` está relleno, `sobtree_newsletter_confirmado` sigue vacío y **no** está suscrito a Marketing Information. La nota tiene el texto de la casilla.
5. Abre el enlace (48 h). La página dice que la suscripción está confirmada. Entonces `sobtree_newsletter_confirmado` tiene valor y la suscripción pasa a subscribed, con base legal `CONSENT_WITH_NOTICE`.
6. Para probar la cola sin tumbar producción: para el workflow un momento, envía un alta y comprueba que la web responde éxito y que `altas.jsonl` tiene la línea con estado `error`. Reactiva y lanza el cron a mano. Tiene que pasar a `enviado`.
7. Pruebas locales, sin red externa: `bash tests/newsletter/run-tests.sh` y `node tests/newsletter/test-n8n-code.mjs`.

## REVISAR FUNDADOR

- **Scope** `communication_preferences.write` de la Service Key. Sin tu OK no se cambia.
- **Plazo de conservación** en `/privacidad/`: después de la baja se guarda la prueba del consentimiento y de la baja «durante el plazo de prescripción de las posibles responsabilidades». La frase no fija un número de años. Hay un comentario `REVISAR FUNDADOR` junto a ese párrafo en `src/pages/privacidad.astro`.
- El correo de la newsletter lo envía HubSpot con su marca (plan gratuito) y con enlace de baja. El correo de *confirmación* del alta lo envía `info@sobtree.com` desde n8n, no HubSpot.

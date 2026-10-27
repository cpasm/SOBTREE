# n8n · Lead web → HubSpot

La URL de producción del webhook no está en este repositorio. Vive solo en `sobtree-secrets.php` (fuera de `public_html`, en Hostinger), en la clave `N8N_LEADS_WEBHOOK_URL`. Hay que tenerla puesta antes de desplegar. Si falta, está vacía o sigue siendo el marcador de la plantilla, la web guarda el lead, responde al visitante y lo deja encolado (estado `omitido`, igual que si n8n estuviera caído) para que el cron lo reenvíe al configurarla. No hay error 500.

El path del nodo Webhook es `sobtree-lead` (no es un secreto). La forma de la URL es `https://<TU-INSTANCIA>.app.n8n.cloud/webhook/sobtree-lead`. En el JSON, `meta.instancia` usa ese marcador y `meta.webhook_produccion` vale `${N8N_LEADS_WEBHOOK_URL}`.

Antes de desplegar, añade también `IP_HASH_SECRET` al mismo fichero (ver el README del repo, sección «Captura de leads»). Sin esa clave el formulario sigue funcionando y no se guarda ningún resumen de la IP.

Ficheros (sin credenciales ni secretos):

- `sobtree-lead-a-hubspot.json`: workflow principal (importar en n8n).
- `sobtree-errores.json`: workflow de errores (Error Trigger → correo a info@sobtree.com).
- `verificar-y-mapear.js`: código del nodo Code (fuente única; `build-workflow.py` lo incrusta en el JSON).
- `build-workflow.py`: regenera los JSON. Prueba local del código: `node tests/leads/test-n8n-code.mjs`.

## Flujo

La web solo envía su propio correo (de respaldo) si este workflow responde 401/502, no responde a tiempo o devuelve `aviso: false`.

1. **Webhook** (POST, *Raw Body* activado, responde desde nodo).
2. **Verificar firma y mapear**: HMAC-SHA256 de `"<X-Sobtree-Timestamp>.<cuerpo crudo>"` con el secreto compartido, comparación en tiempo constante, desfase máximo de 5 min (anti-replay). Mapea el lead a propiedades de HubSpot.
3. Firma no válida → **401**. La web lo marca como error y lo reintenta, con registro.
4. **Buscar contacto por email** (deduplicación): `POST /crm/v3/objects/contacts/search`.
5. Si existe → **PATCH** (no pisa `lifecyclestage`, `hs_lead_status` ni la fuente, y no envía campos vacíos). Si no → **crear** con `lifecyclestage=lead`, `hs_lead_status=NEW`.
6. **Nota** asociada al contacto con el mensaje completo, el origen, la calculadora o el asistente, el consentimiento de privacidad, el de comunicaciones comerciales (si el lead lo trae) y el id del lead. No se llama a la API de suscripciones.
7. **Aviso PRINCIPAL a info@sobtree.com** (Gmail) con enlace a la ficha, salvo que la web indique que ya envió su correo de respaldo (`envio.respaldo_enviado`). Después **200** con `aviso: true`; si el aviso falla, **200** con `aviso: false` y la web envía su correo de respaldo.
8. Cualquier fallo de HubSpot (tras 3 intentos con 1 s de espera) → **502**. La web lo reintenta por cron, hasta 8 veces.

## Reimportar a mano

Si cambia `verificar-y-mapear.js`, hay que regenerar el JSON (`python3 integraciones/n8n/build-workflow.py`) y **reimportar** `sobtree-lead-a-hubspot.json` en n8n. El despliegue de la web no actualiza el flujo. El JSON sigue con `"active": false`: importarlo no activa el workflow; hay que activarlo a mano en n8n cuando el fundador lo diga.

La firma HMAC y la cola de reintentos de la web no cambian. La nota añade el consentimiento de comunicaciones comerciales (sí, con fecha ISO, texto aceptado y versión de la política; no, si la casilla iba sin marcar; «no consta» si el lead en cola es anterior y no trae el campo). El contexto de la calculadora sigue desglosando diagnóstico, descuento, puesta en marcha y total neto.

No se crea ninguna propiedad nueva. No se reutiliza `sobtree_newsletter_consentimiento`: esa propiedad la define la rama `feat/newsletter-hubspot` para el alta de la newsletter (`fecha | origen | versión`) y pisarla desde un lead mezclaría dos consentimientos distintos. No se llama a `POST /communication-preferences/v3/subscribe` ni a ningún otro endpoint de suscripción: el scope `communication_preferences.write` no está concedido. Marcar la casilla solo deja constancia en la nota y en el aviso a info@. No suscribe al contacto.

## Pasos manuales en n8n (los hace el fundador o FORGE con su OK)

1. Credencial **HubSpot Service Key account**: tipo nativo de n8n **«HubSpot Service Key»** (nombre interno `hubspotAppToken`, el mismo que antes se llamaba «HubSpot App Token»; envía `Authorization: Bearer <key>`). Valor: la *service key* creada en HubSpot (Development → Keys → Service keys) con permisos `crm.objects.contacts.read`, `crm.objects.contacts.write` y `crm.schemas.contacts.read`. La key solo se pega en n8n, nunca en el repo ni en el chat. La usan los 4 nodos HTTP Request: «Buscar contacto por email», «Actualizar contacto», «Crear contacto» y «Crear nota en el contacto» (`authentication: predefinedCredentialType`, `nodeCredentialType: hubspotAppToken`).
2. Credencial **Gmail Sobtree (info@)**: tipo *Gmail OAuth2 API* (`gmailOAuth2`), iniciando sesión con info@sobtree.com (OAuth del fundador). La usan el nodo «Aviso a info@» (workflow principal) y «Aviso de error a info@» (workflow de errores).
3. Importar primero `sobtree-errores.json` y después `sobtree-lead-a-hubspot.json`. Los JSON llevan `REEMPLAZAR_ID_CREDENCIAL`: en cada nodo con credencial, elegir la credencial real en el desplegable.
4. Pegar el secreto (`openssl rand -hex 32`) en `SECRET` del nodo Code. Debe ser el mismo valor que `N8N_LEADS_WEBHOOK_SECRET` en `sobtree-secrets.php`.
5. El enlace del aviso ya apunta a la cuenta de HubSpot 149616589 (región EU1, `app-eu1.hubspot.com`).
6. Settings del workflow principal → *Error workflow* = «Sobtree · Errores de workflows».
7. Probar con *Test URL* y el script local. Después, activar el workflow.

## Propiedades de HubSpot

**Estado (25/10/2026):** las 7 propiedades personalizadas están **creadas** en la cuenta 149616589 (grupo «Custom information», `custom_information`; el conector no permite crear grupos).

Plan gratuito: hasta **10 propiedades personalizadas en toda la cuenta** (según la comunidad de HubSpot; hay que confirmarlo en la cuenta). Este diseño usa **7** y deja 3 libres. La rama `feat/newsletter-hubspot` añadirá 2 (`sobtree_newsletter_consentimiento` y `sobtree_newsletter_confirmado`) y dejaría 1 libre. El consentimiento comercial de este formulario no consume ninguna: vive en la nota del lead.

Nativas que se reutilizan: `email`, `firstname`, `lastname`, `phone`, `jobtitle`, `company`, `company_size`, `message`, `industry`, `lifecyclestage`, `hs_lead_status`, `hs_legal_basis` y `hs_analytics_source` (solo en el alta; HubSpot indica que se puede editar manualmente).

| Nombre interno | Etiqueta | Tipo | Valores |
|---|---|---|---|
| `sobtree_tipo_formulario` | Formulario de origen (web) | Desplegable | contacto, calculadora, asistente |
| `sobtree_interes` | Interés declarado (web) | Texto de una línea | Diagnóstico IA exprés, Primer caso de uso, … |
| `sobtree_utm_source` | UTM source | Texto de una línea | |
| `sobtree_utm_medium` | UTM medium | Texto de una línea | |
| `sobtree_utm_campaign` | UTM campaign | Texto de una línea | |
| `sobtree_origen_detalle` | Origen detallado (web) | Texto de varias líneas | entrada, referrer, página, utm_term, utm_content |
| `sobtree_contexto_lead` | Contexto del lead (calculadora/asistente) | Texto de varias líneas | resumen de la calculadora y motivo del asistente |

Grupo: «Sobtree» (ver la ficha en Drive para el estado de creación).

# n8n · Lead web → HubSpot

Instancia: `https://sobtree.app.n8n.cloud` · Webhook de producción: `https://sobtree.app.n8n.cloud/webhook/sobtree-lead`

Ficheros (sin credenciales ni secretos):

- `sobtree-lead-a-hubspot.json`: workflow principal (importar en n8n).
- `sobtree-errores.json`: workflow de errores (Error Trigger → correo a info@sobtree.com).
- `verificar-y-mapear.js`: código del nodo Code (fuente única; `build-workflow.py` lo incrusta en el JSON).
- `build-workflow.py`: regenera los JSON. Prueba local del código: `node tests/leads/test-n8n-code.mjs`.

## Flujo

1. **Webhook** (POST, *Raw Body* activado, responde desde nodo).
2. **Verificar firma y mapear**: HMAC-SHA256 de `"<X-Sobtree-Timestamp>.<cuerpo crudo>"` con el secreto compartido, comparación en tiempo constante, desfase máximo de 5 min (anti-replay). Mapea el lead a propiedades de HubSpot.
3. Firma no válida → **401**. La web lo marca como error y lo reintenta, con registro.
4. **Buscar contacto por email** (deduplicación): `POST /crm/v3/objects/contacts/search`.
5. Si existe → **PATCH** (no pisa `lifecyclestage`, `hs_lead_status` ni la fuente, y no envía campos vacíos). Si no → **crear** con `lifecyclestage=lead`, `hs_lead_status=NEW`.
6. **Nota** asociada al contacto con el mensaje completo, el origen, la calculadora o el asistente, el consentimiento y el id del lead.
7. **200** a la web. Después, **aviso a info@sobtree.com** con enlace a la ficha. Si el aviso falla, no se reintenta el lead.
8. Cualquier fallo de HubSpot (tras 3 intentos con 1 s de espera) → **502**. La web lo reintenta por cron, hasta 8 veces.

## Pasos manuales en n8n (los hace el fundador o FORGE con su OK)

1. Credencial **HubSpot Sobtree**: tipo *HubSpot App Token* con el token de la app privada. Permisos: `crm.objects.contacts.read`, `crm.objects.contacts.write`. Para las notas, comprobar al crear la app qué permiso exige la API de notas (está **[NV]**).
2. Credencial **Gmail Sobtree (info@)**: OAuth2 con info@sobtree.com.
3. Importar los dos JSON y elegir las credenciales en cada nodo.
4. Pegar el secreto (`openssl rand -hex 32`) en `SECRET` del nodo Code. Debe ser el mismo valor que `N8N_LEADS_WEBHOOK_SECRET` en `sobtree-secrets.php`.
5. Sustituir `REEMPLAZAR_PORTAL_ID` (id de la cuenta de HubSpot) en «Aviso a info@».
6. Settings del workflow principal → *Error workflow* = «Sobtree · Errores de workflows».
7. Probar con *Test URL* y el script local. Después, activar el workflow.

## Propiedades de HubSpot

Plan gratuito: hasta **10 propiedades personalizadas en toda la cuenta** (según la comunidad de HubSpot; hay que confirmarlo en la cuenta). Este diseño usa **7** y deja 3 libres.

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

Grupo sugerido: «Sobtree · Web». **No se ha creado nada en HubSpot**: hace falta el OK del fundador.

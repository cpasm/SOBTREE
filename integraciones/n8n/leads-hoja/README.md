# Lead web → Hoja de contactos (sin HubSpot)

Sustituye los pasos de HubSpot del workflow de leads por Google Sheets. La web, la firma HMAC, el aviso por Gmail y las respuestas 401/200/502 no cambian.

- Hoja: «Sobtree · Contactos» (privada, solo info@sobtree.com).
  ID `1EWlyQCodNmxIwOvljQuyM1ZOq1s7QlNZVkPEydyNizQ`. No es un secreto.
- Pestañas: `Contactos` (una fila por correo en minúsculas), `Historial` (fecha, email, tipo, campania, detalle), `Ventas` (la usará Contrata).
- Workflow: `integraciones/n8n/sobtree-lead-a-hoja.json` (`active:false`). Generado por `leads-hoja/build-lead-a-hoja.py` desde `sobtree-lead-a-hubspot.json`.

## Qué cambia respecto al workflow de HubSpot

| Antes | Ahora |
|---|---|
| Buscar contacto por email (HubSpot) | **Buscar fila por email** (Google Sheets, leer, filtro `email`) |
| ¿Ya existe? / Actualizar / Crear (HubSpot) | **Fusionar con la fila existente** (Code) + **Añadir o actualizar contacto** (Sheets `appendOrUpdate`, columna de coincidencia `email`) |
| Crear nota en el contacto (HubSpot) | **Añadir a Historial** (Sheets, append) |
| Responder 502 (HubSpot falló) | Responder 502 (hoja falló) |
| Verificar firma y mapear | Igual (misma verificación HMAC), mapea a las columnas de la hoja |
| Aviso a info@ | Igual (mismo destinatario, asunto y credencial); el texto enlaza a la hoja |

No cambian: webhook (ruta `sobtree-lead`, mismo id de nodo y `webhookId`), Raw Body, ¿Firma válida?, Responder 401, ¿Enviar aviso?, las dos respuestas 200 y la nota.

## Reglas de datos (nodo «Fusionar con la fila existente»)

- Un correo = una fila. Un lead repetido actualiza la fila; los vacíos del lead nuevo no borran datos buenos.
- Lead nuevo con «no» → `consentimiento_comercial = no`, sin fecha ni texto.
- Un «sí» existente nunca se rebaja a «no». Un «no» pasa a «sí» si llega un lead con la casilla marcada.
- Una baja no se reactiva: `estado`, `fecha_baja` y `ultimo_envio` los conserva siempre el flujo; el Historial anota «sigue de baja».
- `estado` vacío en una fila existente cuenta como `activo`.
- `cellFormat: RAW`: los teléfonos tipo `+34 600…` se guardan como texto, sin interpretarse como fórmula.
- Límite conocido: si fallase solo «Añadir a Historial» después de guardar el contacto, la web reintenta el lead y el Historial puede quedar con una fila repetida. El contacto no se duplica.

## Pruebas locales (sin red)

```
node tests/leads-hoja/test-lead-hoja.mjs
node tests/leads/test-n8n-code.mjs        # el mapeo original de HubSpot sigue intacto
```

Ejecutan el JSON importable con un mini-ejecutor de nodos: webhook firmado, Code, IF, respuestas, Gmail simulado y Google Sheets simulado en memoria (lectura, appendOrUpdate por email, append). Cubren: lead nuevo, lead repetido sin duplicar, sin consentimiento, «sí» que no se rebaja, baja que no se reactiva, firma mala/ausente/caducada → 401 sin tocar la hoja, correo inválido, hoja caída → 502, Gmail caído → 200 con `aviso:false`, aviso ya enviado por la web, estructura del JSON (sin HubSpot, sin secretos, columnas = cabecera de la hoja).
No se probó contra n8n ni contra Google real: eso se comprueba con el lead de prueba firmado del paso 8.

## Pasos EXACTOS para importar en n8n (para Nexus)

No se importa ni se activa nada hasta que el fundador lo confirme. Se actualiza el workflow que ya existe (id `gGCk3789LjvHhhcm`), sin crear otro, para no duplicar el webhook.

1. En n8n abre el workflow `gGCk3789LjvHhhcm`. Si está activo, no lo desactives todavía.
2. Copia de seguridad: ⋯ → *Download* y guarda el JSON actual (para volver atrás). No lo subas al repo: puede incluir ids de credenciales.
3. Credencial de Google Sheets: *Credentials → Create → Google Sheets OAuth2 API*. Inicia sesión con **info@sobtree.com** y autoriza. Nómbrala «Google Sheets Sobtree (info@)». La hoja es privada y esa cuenta es su propietaria.
4. En el workflow: ⋯ → *Import from File* → `sobtree-lead-a-hoja.json`. Confirma que sustituye al contenido actual.
5. En los 3 nodos de Google Sheets («Buscar fila por email», «Añadir o actualizar contacto», «Añadir a Historial») elige la credencial del paso 3. En «Aviso a info@» comprueba que sigue la credencial de Gmail.
6. En «Verificar firma y mapear» comprueba que `SECRET` tiene el mismo valor que `N8N_WEBHOOK_SECRET` de la web (pégalo solo dentro de n8n). Si el workflow anterior ya lo tenía y la importación lo sobrescribe con `REEMPLAZAR_EN_N8N`, vuelve a pegarlo. Mantén el *Error workflow* de «Settings».
7. Comprueba que en el nodo Webhook siguen la ruta `sobtree-lead`, *Respond: Using Respond to Webhook Node* y *Raw Body* activado. Guarda.
8. Prueba con un lead de prueba firmado (desde la web o con el script de firma), correo `info+prueba@sobtree.com`: debe aparecer UNA fila en «Contactos» y una en «Historial», y llegar el aviso a info@. Repite con el mismo correo: la fila se actualiza y no se duplica. Una petición con firma mala debe dar 401 y no escribir.
9. Con el fundador: activa el workflow. Borra las filas de prueba solo si el fundador lo pide.
10. Marcha atrás: reimporta el JSON del paso 2.

Credencial en el JSON: `googleSheetsOAuth2Api` con `id: "REEMPLAZAR_EN_N8N"`. Al importar, n8n no la reconoce y hay que elegirla a mano (paso 5).

#!/usr/bin/env python3
"""Genera el JSON del workflow de la newsletter (sin credenciales ni secretos).

Uso: python3 integraciones/n8n/build-newsletter.py
Importar en n8n con el workflow desactivado. Después, dentro de n8n:
  1) pegar el secreto en los dos nodos Code (SECRET), el mismo que N8N_LEADS_WEBHOOK_SECRET;
  2) elegir «HubSpot Service Key account» y «Gmail account» (OAuth de info@sobtree.com);
  3) el error workflow ya apunta a «Errores de workflows» (alJvCL7d1kwPIipg).
"""
import json, pathlib, uuid

HERE = pathlib.Path(__file__).parent
VERIFICAR = (HERE / "verificar-newsletter.js").read_text(encoding="utf-8")
VALIDAR = (HERE / "validar-confirmacion.js").read_text(encoding="utf-8")
HUBSPOT = {"hubspotAppToken": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "HubSpot Service Key account"}}
GMAIL = {"gmailOAuth2": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "Gmail account"}}
FIRMA = "$('Verificar firma newsletter').first().json"
ENLACE = "$('Validar enlace').first().json"


def nid(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "sobtree-n8n-newsletter/" + name))


def node(name, type_, version, pos, params, **extra):
    n = {"id": nid(name), "name": name, "type": type_, "typeVersion": version, "position": pos, "parameters": params}
    n.update(extra)
    return n


def hubspot(name, pos, method, url, body, tries=3):
    return node(name, "n8n-nodes-base.httpRequest", 4.2, pos, {
        "method": method, "url": url,
        "authentication": "predefinedCredentialType", "nodeCredentialType": "hubspotAppToken",
        "sendBody": True, "specifyBody": "json", "jsonBody": body,
        "options": {"timeout": 10000},
    }, credentials=HUBSPOT, retryOnFail=True, maxTries=tries, waitBetweenTries=1000, onError="continueErrorOutput")


def respond(name, pos, code, body):
    return node(name, "n8n-nodes-base.respondToWebhook", 1.1, pos, {
        "respondWith": "json", "responseBody": body, "options": {"responseCode": code},
    })


def pagina(titulo, cuerpo):
    return (
        "<!doctype html><html lang=\"es\"><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        f"<title>{titulo}</title>"
        "<body style=\"font-family:sans-serif;background:#050F2C;color:#fff;max-width:36em;margin:0 auto;padding:4rem 1.2rem\">"
        f"<h1 style=\"font-size:1.7rem\">{titulo}</h1>"
        f"<p style=\"color:#D4DEF4;line-height:1.5\">{cuerpo}</p>"
        "<p><a style=\"color:#9CC2FF\" href=\"https://sobtree.com/\">Volver a sobtree.com</a></p>"
        "</body></html>"
    )


def respond_html(name, pos, code, html):
    return node(name, "n8n-nodes-base.respondToWebhook", 1.1, pos, {
        "respondWith": "text",
        "responseBody": html,
        "options": {
            "responseCode": code,
            "responseHeaders": {"entries": [{"name": "Content-Type", "value": "text/html; charset=utf-8"}]},
        },
    })


def si(name, pos, expresion, cond_id):
    return node(name, "n8n-nodes-base.if", 2, pos, {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": [{"id": nid(cond_id), "leftValue": expresion, "rightValue": True,
                            "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
            "combinator": "and",
        }, "options": {},
    })


UPSERT = "={{ JSON.stringify({ inputs: [{ idProperty: 'email', id: " + FIRMA + ".email, properties: " + FIRMA + ".props }] }) }}"
NOTA_ALTA = (
    "={{ JSON.stringify({ properties: { hs_timestamp: $now.toISO(), hs_note_body: " + FIRMA + ".nota_html }, "
    "associations: [{ to: { id: $('Upsert contacto').first().json.results[0].id }, "
    "types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }] }) }}"
)
SUSCRIBIR_YA = (
    "={{ JSON.stringify({ emailAddress: " + FIRMA + ".email, subscriptionId: " + FIRMA + ".subscription_id, "
    "legalBasis: 'CONSENT_WITH_NOTICE', legalBasisExplanation: " + FIRMA + ".legal_basis }) }}"
)
UPSERT_OK = "={{ JSON.stringify({ inputs: [{ idProperty: 'email', id: " + ENLACE + ".email, properties: " + ENLACE + ".props }] }) }}"
NOTA_OK = (
    "={{ JSON.stringify({ properties: { hs_timestamp: $now.toISO(), hs_note_body: " + ENLACE + ".nota_html }, "
    "associations: [{ to: { id: $('Guardar confirmación').first().json.results[0].id }, "
    "types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }] }) }}"
)
SUSCRIBIR_OK = (
    "={{ JSON.stringify({ emailAddress: " + ENLACE + ".email, subscriptionId: " + ENLACE + ".subscription_id, "
    "legalBasis: 'CONSENT_WITH_NOTICE', legalBasisExplanation: " + ENLACE + ".legal_basis }) }}"
)

nodes = [
    node("Webhook alta newsletter", "n8n-nodes-base.webhook", 2, [0, 280], {
        "httpMethod": "POST", "path": "sobtree-newsletter", "responseMode": "responseNode",
        "options": {"rawBody": True},
    }, webhookId=nid("webhook-alta")),
    node("Verificar firma newsletter", "n8n-nodes-base.code", 2, [240, 280], {"jsCode": VERIFICAR}),
    si("¿Firma válida?", [480, 280], "={{ $json.valido }}", "cond-firma"),
    respond("Responder 401", [720, 460], 401, '={{ JSON.stringify({ ok: false, motivo: $json.motivo }) }}'),
    hubspot("Upsert contacto", [720, 160], "POST", "https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert", UPSERT),
    hubspot("Crear nota del consentimiento", [980, 160], "POST", "https://api.hubapi.com/crm/v3/objects/notes", NOTA_ALTA),
    si("¿Doble confirmación?", [1220, 160], "={{ " + FIRMA + ".doble_confirmacion }}", "cond-doble"),
    node("Email de confirmación", "n8n-nodes-base.gmail", 2.1, [1460, 60], {
        "sendTo": "={{ " + FIRMA + ".email }}",
        "subject": "={{ " + FIRMA + ".email_asunto }}",
        "emailType": "text",
        "message": "={{ " + FIRMA + ".email_texto }}",
        "options": {"appendAttribution": False},
    }, credentials=GMAIL, retryOnFail=True, maxTries=2, waitBetweenTries=1000, onError="continueErrorOutput"),
    respond("Responder 200 confirmar", [1700, 0], 200,
            "={{ JSON.stringify({ ok: true, confirmar: true, id: " + FIRMA + ".alta_id }) }}"),
    hubspot("Suscribir ya", [1460, 280], "POST", "https://api.hubapi.com/communication-preferences/v3/subscribe", SUSCRIBIR_YA, tries=2),
    respond("Responder 200 suscrito", [1700, 220], 200,
            "={{ JSON.stringify({ ok: true, confirmar: false, id: " + FIRMA + ".alta_id }) }}"),
    respond("Responder 200 suscripción pendiente", [1700, 380], 200,
            "={{ JSON.stringify({ ok: true, confirmar: false, suscripcion: false, id: " + FIRMA + ".alta_id }) }}"),
    respond("Responder 502 alta", [1220, 460], 502,
            '={{ JSON.stringify({ ok: false, motivo: "newsletter", detalle: String($json.error?.message || "").slice(0, 200) }) }}'),
    node("Webhook confirmar", "n8n-nodes-base.webhook", 2, [0, 760], {
        "httpMethod": "GET", "path": "sobtree-newsletter-confirmar", "responseMode": "responseNode",
        "options": {},
    }, webhookId=nid("webhook-confirmar")),
    node("Validar enlace", "n8n-nodes-base.code", 2, [240, 760], {"jsCode": VALIDAR}),
    si("¿Enlace válido?", [480, 760], "={{ $json.valido }}", "cond-enlace"),
    respond_html("Responder enlace inválido", [720, 940], 400, pagina(
        "Este enlace no vale",
        "Ha caducado o no es válido. El enlace dura 48 horas. Vuelve a apuntarte en sobtree.com o escribe a info@sobtree.com.",
    )),
    hubspot("Guardar confirmación", [720, 680], "POST", "https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert", UPSERT_OK),
    hubspot("Crear nota de confirmación", [980, 680], "POST", "https://api.hubapi.com/crm/v3/objects/notes", NOTA_OK),
    hubspot("Suscribir en HubSpot", [1220, 680], "POST", "https://api.hubapi.com/communication-preferences/v3/subscribe", SUSCRIBIR_OK, tries=2),
    respond_html("Responder confirmado", [1460, 600], 200, pagina(
        "Suscripción confirmada",
        "Ya puedes recibir la newsletter de Sobtree. Los correos los envía HubSpot e incluyen un enlace para darte de baja.",
    )),
    respond_html("Responder confirmación pendiente", [1460, 800], 200, pagina(
        "Confirmación registrada",
        "Hemos anotado tu confirmación. Si no recibes la newsletter, escribe a info@sobtree.com.",
    )),
    respond_html("Responder 502 confirmación", [980, 900], 502, pagina(
        "No hemos podido confirmar",
        "Prueba el enlace otra vez en unos minutos o escribe a info@sobtree.com.",
    )),
    node("Avisar fallo de suscripción", "n8n-nodes-base.code", 2, [1700, 800], {
        "jsCode": "// Se ejecuta DESPUÉS de haber respondido. El contacto y la nota ya están guardados.\n"
                  "// Lanzar el error hace saltar el workflow «Errores de workflows» sin deshacer el upsert.\n"
                  "throw new Error('Suscripción HubSpot no aplicada. El contacto y la nota sí se guardaron. Revisa el scope communication_preferences.write de la Service Key y reejecuta esta ejecución.');\n",
    }),
    node("Nota", "n8n-nodes-base.stickyNote", 1, [0, -20], {
        "content": "## Sobtree · Newsletter → HubSpot\n"
                   "La web ya guardó el alta. Este workflow hace el upsert y, con el flag activo, el correo de confirmación.\n"
                   "- Hasta que la persona abre el enlace, el contacto NO se suscribe.\n"
                   "- Tipo de suscripción: Marketing Information (3927875333), constante en los dos nodos Code.\n"
                   "- Si falla la suscripción por permisos, el upsert y la nota no se deshacen y salta el workflow de errores.\n"
                   "- SECRET = el mismo que N8N_LEADS_WEBHOOK_SECRET, en los DOS nodos Code.\n"
                   "Secretos y credenciales solo dentro de n8n, nunca en el repo.",
        "height": 260, "width": 460,
    }),
]

conn = lambda *targets: [[{"node": t, "type": "main", "index": 0} for t in group] for group in targets]
connections = {
    "Webhook alta newsletter": {"main": conn(["Verificar firma newsletter"])},
    "Verificar firma newsletter": {"main": conn(["¿Firma válida?"])},
    "¿Firma válida?": {"main": conn(["Upsert contacto"], ["Responder 401"])},
    "Upsert contacto": {"main": conn(["Crear nota del consentimiento"], ["Responder 502 alta"])},
    "Crear nota del consentimiento": {"main": conn(["¿Doble confirmación?"], ["Responder 502 alta"])},
    "¿Doble confirmación?": {"main": conn(["Email de confirmación"], ["Suscribir ya"])},
    "Email de confirmación": {"main": conn(["Responder 200 confirmar"], ["Responder 502 alta"])},
    "Suscribir ya": {"main": conn(["Responder 200 suscrito"], ["Responder 200 suscripción pendiente"])},
    "Responder 200 suscripción pendiente": {"main": conn(["Avisar fallo de suscripción"])},
    "Webhook confirmar": {"main": conn(["Validar enlace"])},
    "Validar enlace": {"main": conn(["¿Enlace válido?"])},
    "¿Enlace válido?": {"main": conn(["Guardar confirmación"], ["Responder enlace inválido"])},
    "Guardar confirmación": {"main": conn(["Crear nota de confirmación"], ["Responder 502 confirmación"])},
    "Crear nota de confirmación": {"main": conn(["Suscribir en HubSpot"], ["Responder 502 confirmación"])},
    "Suscribir en HubSpot": {"main": conn(["Responder confirmado"], ["Responder confirmación pendiente"])},
    "Responder confirmación pendiente": {"main": conn(["Avisar fallo de suscripción"])},
}

workflow = {
    "name": "Sobtree · Newsletter → HubSpot",
    "nodes": nodes,
    "connections": connections,
    "active": False,
    "settings": {
        "executionOrder": "v1",
        "saveDataErrorExecution": "all",
        "saveDataSuccessExecution": "all",
        "errorWorkflow": "alJvCL7d1kwPIipg",
        "timezone": "Europe/Madrid",
    },
    "meta": {
        "instancia": "https://sobtree.app.n8n.cloud",
        "webhook_produccion": "https://sobtree.app.n8n.cloud/webhook/sobtree-newsletter",
        "webhook_confirmacion": "https://sobtree.app.n8n.cloud/webhook/sobtree-newsletter-confirmar",
        "suscripcion": "Marketing Information",
        "subscription_id": "3927875333",
    },
    "tags": [],
}

(HERE / "sobtree-newsletter.json").write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("escrito sobtree-newsletter.json")

#!/usr/bin/env python3
"""Genera los JSON de los workflows de n8n (sin credenciales ni secretos).

Uso: python3 integraciones/n8n/build-workflow.py
Importar en n8n: Workflows → Import from File. Después, dentro de n8n:
  1) pegar el secreto en el nodo «Verificar firma y mapear» (SECRET);
  2) elegir las credenciales «HubSpot Sobtree» (app privada) y «Gmail Sobtree (info@)»;
  3) (el enlace a la ficha ya apunta al portal 149616589, región EU1);
  4) en Settings del workflow, Error workflow = «Sobtree · Errores de workflows».
"""
import json, pathlib, uuid

HERE = pathlib.Path(__file__).parent
CODE = (HERE / "verificar-y-mapear.js").read_text(encoding="utf-8")
HUBSPOT = {"hubspotAppToken": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "HubSpot Sobtree"}}
GMAIL = {"gmailOAuth2": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "Gmail Sobtree (info@)"}}
MAP = "$('Verificar firma y mapear').first().json"


def nid(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "sobtree-n8n/" + name))


def node(name, type_, version, pos, params, **extra):
    n = {"id": nid(name), "name": name, "type": type_, "typeVersion": version, "position": pos, "parameters": params}
    n.update(extra)
    return n


def hubspot(name, pos, method, url, body):
    return node(name, "n8n-nodes-base.httpRequest", 4.2, pos, {
        "method": method, "url": url,
        "authentication": "predefinedCredentialType", "nodeCredentialType": "hubspotAppToken",
        "sendBody": True, "specifyBody": "json", "jsonBody": body,
        "options": {"timeout": 10000},
    }, credentials=HUBSPOT, retryOnFail=True, maxTries=3, waitBetweenTries=1000, onError="continueErrorOutput")


def respond(name, pos, code, body):
    return node(name, "n8n-nodes-base.respondToWebhook", 1.1, pos, {
        "respondWith": "json", "responseBody": body, "options": {"responseCode": code},
    })


nodes = [
    node("Webhook lead web", "n8n-nodes-base.webhook", 2, [0, 300], {
        "httpMethod": "POST", "path": "sobtree-lead", "responseMode": "responseNode",
        "options": {"rawBody": True},
    }, webhookId=nid("webhook")),
    node("Verificar firma y mapear", "n8n-nodes-base.code", 2, [220, 300], {"jsCode": CODE}),
    node("¿Firma válida?", "n8n-nodes-base.if", 2, [440, 300], {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": [{"id": nid("cond-valido"), "leftValue": "={{ $json.valido }}", "rightValue": True,
                            "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
            "combinator": "and",
        }, "options": {},
    }),
    respond("Responder 401", [660, 520], 401, '={{ JSON.stringify({ ok: false, motivo: $json.motivo }) }}'),
    hubspot("Buscar contacto por email", [660, 200], "POST", "https://api.hubapi.com/crm/v3/objects/contacts/search",
            "={{ JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: $json.email }] }], properties: ['email', 'lifecyclestage'], limit: 1 }) }}"),
    node("¿Ya existe?", "n8n-nodes-base.if", 2, [880, 200], {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
            "conditions": [{"id": nid("cond-existe"), "leftValue": "={{ $json.total }}", "rightValue": 0,
                            "operator": {"type": "number", "operation": "gt"}}],
            "combinator": "and",
        }, "options": {},
    }),
    hubspot("Actualizar contacto", [1100, 100], "PATCH",
            "=https://api.hubapi.com/crm/v3/objects/contacts/{{ $json.results[0].id }}",
            "={{ JSON.stringify({ properties: " + MAP + ".props_actualizacion }) }}"),
    hubspot("Crear contacto", [1100, 300], "POST", "https://api.hubapi.com/crm/v3/objects/contacts",
            "={{ JSON.stringify({ properties: " + MAP + ".props_alta }) }}"),
    hubspot("Crear nota en el contacto", [1320, 200], "POST", "https://api.hubapi.com/crm/v3/objects/notes",
            "={{ JSON.stringify({ properties: { hs_timestamp: $now.toISO(), hs_note_body: " + MAP + ".nota_html }, "
            "associations: [{ to: { id: $json.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }] }) }}"),
    node("¿Enviar aviso?", "n8n-nodes-base.if", 2, [1540, 200], {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": [{"id": nid("cond-aviso"), "leftValue": "={{ " + MAP + ".aviso_necesario }}", "rightValue": True,
                            "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
            "combinator": "and",
        }, "options": {},
    }),
    # Aviso PRINCIPAL a info@ (antes de responder: la web solo manda su correo de respaldo si aquí falla).
    node("Aviso a info@", "n8n-nodes-base.gmail", 2.1, [1760, 100], {
        "sendTo": "info@sobtree.com",
        "subject": "={{ " + MAP + ".aviso_asunto }}",
        "emailType": "text",
        "message": "={{ " + MAP + ".aviso_texto }}\n\nFicha en HubSpot: https://app-eu1.hubspot.com/contacts/149616589/record/0-1/{{ ($('Actualizar contacto').isExecuted ? $('Actualizar contacto').first().json.id : $('Crear contacto').first().json.id) }}",
        "options": {"appendAttribution": False},
    }, credentials=GMAIL, retryOnFail=True, maxTries=2, waitBetweenTries=1000, onError="continueErrorOutput"),
    respond("Responder 200 (aviso enviado)", [1980, 40], 200,
            "={{ JSON.stringify({ ok: true, aviso: true, lead_id: " + MAP + ".lead_id }) }}"),
    respond("Responder 200 (sin aviso)", [1980, 300], 200,
            "={{ JSON.stringify({ ok: true, aviso: false, motivo: " + MAP + ".aviso_necesario ? 'aviso_fallo' : 'respaldo_ya_enviado', lead_id: " + MAP + ".lead_id }) }}"),
    respond("Responder 502 (HubSpot falló)", [1540, 480], 502,
            '={{ JSON.stringify({ ok: false, motivo: "hubspot", detalle: String($json.error?.message || "").slice(0, 200) }) }}'),
    node("Nota", "n8n-nodes-base.stickyNote", 1, [0, 0], {
        "content": "## Sobtree · Lead web → HubSpot\nLa web (contact.php) ya guardó el lead. ESTE workflow envía el aviso PRINCIPAL a info@.\n"
                   "- La web solo manda correo de respaldo si aquí hay 401/502/timeout o aviso:false.\n"
                   "- 401: firma o timestamp no válidos (la web reintenta y queda registro).\n"
                   "- 502: HubSpot falló → la web lo reintenta por cron (máx. 8 intentos).\n"
                   "- 200: contacto creado/actualizado por email (sin duplicados) + nota.\n"
                   "Secretos y credenciales solo dentro de n8n, nunca en el repo.",
        "height": 220, "width": 420,
    }),
]

conn = lambda *targets: [[{"node": t, "type": "main", "index": 0} for t in group] for group in targets]
connections = {
    "Webhook lead web": {"main": conn(["Verificar firma y mapear"])},
    "Verificar firma y mapear": {"main": conn(["¿Firma válida?"])},
    "¿Firma válida?": {"main": conn(["Buscar contacto por email"], ["Responder 401"])},
    "Buscar contacto por email": {"main": conn(["¿Ya existe?"], ["Responder 502 (HubSpot falló)"])},
    "¿Ya existe?": {"main": conn(["Actualizar contacto"], ["Crear contacto"])},
    "Actualizar contacto": {"main": conn(["Crear nota en el contacto"], ["Responder 502 (HubSpot falló)"])},
    "Crear contacto": {"main": conn(["Crear nota en el contacto"], ["Responder 502 (HubSpot falló)"])},
    "Crear nota en el contacto": {"main": conn(["¿Enviar aviso?"], ["Responder 502 (HubSpot falló)"])},
    "¿Enviar aviso?": {"main": conn(["Aviso a info@"], ["Responder 200 (sin aviso)"])},
    "Aviso a info@": {"main": conn(["Responder 200 (aviso enviado)"], ["Responder 200 (sin aviso)"])},
}

workflow = {
    "name": "Sobtree · Lead web → HubSpot",
    "nodes": nodes, "connections": connections, "active": False,
    "settings": {"executionOrder": "v1", "saveDataErrorExecution": "all", "saveDataSuccessExecution": "all",
                 "errorWorkflow": "REEMPLAZAR_ID_WORKFLOW_ERRORES", "timezone": "Europe/Madrid"},
    "meta": {"instancia": "https://sobtree.app.n8n.cloud",
             "webhook_produccion": "https://sobtree.app.n8n.cloud/webhook/sobtree-lead"},
    "tags": [],
}

errores = {
    "name": "Sobtree · Errores de workflows",
    "nodes": [
        node("Error Trigger", "n8n-nodes-base.errorTrigger", 1, [0, 0], {}),
        node("Aviso de error a info@", "n8n-nodes-base.gmail", 2.1, [240, 0], {
            "sendTo": "info@sobtree.com",
            "subject": "=⚠️ n8n: falló «{{ $json.workflow.name }}»",
            "emailType": "text",
            "message": "=Workflow: {{ $json.workflow.name }}\nNodo: {{ $json.execution.lastNodeExecuted }}\n"
                       "Error: {{ $json.execution.error.message }}\nEjecución: {{ $json.execution.url }}\n\n"
                       "El lead sigue guardado en el registro local de la web y se reintentará por cron.",
            "options": {"appendAttribution": False},
        }, credentials=GMAIL),
    ],
    "connections": {"Error Trigger": {"main": conn(["Aviso de error a info@"])}},
    "active": False, "settings": {"executionOrder": "v1", "timezone": "Europe/Madrid"}, "tags": [],
}

for fname, wf in (("sobtree-lead-a-hubspot.json", workflow), ("sobtree-errores.json", errores)):
    (HERE / fname).write_text(json.dumps(wf, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("escrito", fname)

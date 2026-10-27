#!/usr/bin/env python3
"""Genera «Sobtree · Lead web → Hoja de contactos» (sin HubSpot) a partir del workflow de leads de main.

Parte de integraciones/n8n/sobtree-lead-a-hubspot.json y cambia SOLO lo necesario:
  - se quitan los 5 nodos de HubSpot (buscar, ¿ya existe?, actualizar, crear, nota);
  - entran 4 nodos: Buscar fila por email (Google Sheets), Fusionar con la fila existente (Code),
    Añadir o actualizar contacto (Google Sheets, appendOrUpdate con email como columna de coincidencia)
    y Añadir a Historial (Google Sheets, append);
  - «Verificar firma y mapear» conserva la verificación HMAC y mapea a las columnas de la hoja;
  - «Aviso a info@» enlaza a la hoja en lugar de a la ficha de HubSpot;
  - el webhook (ruta sobtree-lead, webhookId), los IDs de los nodos que se mantienen, las respuestas 401/200/502 y el aviso por Gmail no cambian.
Salida: integraciones/n8n/sobtree-lead-a-hoja.json (active=false, sin secretos).
Uso: python3 integraciones/n8n/leads-hoja/build-lead-a-hoja.py
"""
import json, pathlib, uuid

HERE = pathlib.Path(__file__).parent
BASE = HERE.parent
HOJA_ID = "1EWlyQCodNmxIwOvljQuyM1ZOq1s7QlNZVkPEydyNizQ"  # «Sobtree · Contactos». No es un secreto.
SHEETS = {"googleSheetsOAuth2Api": {"id": "REEMPLAZAR_EN_N8N", "name": "Google Sheets Sobtree (info@)"}}
COLUMNAS = ['email', 'nombre', 'empresa', 'cargo', 'telefono', 'interes', 'tamano', 'mensaje', 'tipo_formulario', 'origen', 'referrer', 'pagina',
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'contexto', 'consentimiento_privacidad_fecha', 'consentimiento_comercial',
            'fecha_consentimiento', 'texto_consentimiento_comercial', 'version_politica', 'id_lead', 'estado', 'fecha_baja', 'ultimo_envio', 'fecha_alta', 'fecha_actualizacion']
HISTORIAL = ['fecha', 'email', 'tipo', 'campania', 'detalle']
QUITAR = {"Buscar contacto por email", "¿Ya existe?", "Actualizar contacto", "Crear contacto", "Crear nota en el contacto"}
MAP = "$('Verificar firma y mapear').first().json"
FUS = "$('Fusionar con la fila existente').first().json"


def nid(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "sobtree-n8n/" + name))  # mismo esquema que build-workflow.py


def hoja(name, pos, op, tab, columnas=None, fuente=None, match=None, **extra):
    p = {"authentication": "oAuth2", "resource": "sheet", "operation": op,
         "documentId": {"__rl": True, "value": HOJA_ID, "mode": "id"},
         "sheetName": {"__rl": True, "value": tab, "mode": "name"}}
    if op == "read":
        p["filtersUI"] = {"values": [{"lookupColumn": "email", "lookupValue": "={{ " + MAP + ".email }}"}]}
        p["options"] = {}
    else:
        p["columns"] = {"mappingMode": "defineBelow",
                        "value": {c: "={{ " + fuente + "." + c + " }}" for c in columnas},
                        "matchingColumns": match or [],
                        "schema": [{"id": c, "displayName": c, "required": False, "defaultMatch": c == "email", "display": True,
                                    "type": "string", "canBeUsedToMatch": True, "removed": False} for c in columnas]}
        p["options"] = {"cellFormat": "RAW"}
    return {"id": nid(name), "name": name, "type": "n8n-nodes-base.googleSheets", "typeVersion": 4.7, "position": pos, "parameters": p,
            "credentials": SHEETS, "retryOnFail": True, "maxTries": 3, "waitBetweenTries": 1000, "onError": "continueErrorOutput", **extra}


wf = json.loads((BASE / "sobtree-lead-a-hubspot.json").read_text(encoding="utf-8"))
wf["name"] = "Sobtree · Lead web → Hoja de contactos"
wf["nodes"] = [n for n in wf["nodes"] if n["name"] not in QUITAR]
for n in wf["nodes"]:
    if n["name"] == "Verificar firma y mapear":
        n["parameters"]["jsCode"] = (HERE / "verificar-y-mapear-hoja.js").read_text(encoding="utf-8")
    elif n["name"] == "Responder 502 (HubSpot falló)":
        n["name"] = "Responder 502 (hoja falló)"
        n["parameters"]["responseBody"] = '={{ JSON.stringify({ ok: false, motivo: "hoja", detalle: String($json.error?.message || "").slice(0, 200) }) }}'
    elif n["name"] == "Aviso a info@":
        n["parameters"]["message"] = ("={{ " + MAP + ".aviso_texto }}\n\n{{ " + FUS + ".resumen }}\nHoja de contactos: https://docs.google.com/spreadsheets/d/" + HOJA_ID + "/edit")
    elif n["name"] == "Nota":
        n["parameters"]["content"] = ("## Sobtree · Lead web → Hoja de contactos\nLa web (contact.php) ya guardó el lead. ESTE workflow guarda el contacto en la hoja y envía el aviso PRINCIPAL a info@.\n"
                                      "- La web solo manda correo de respaldo si aquí hay 401/502/timeout o aviso:false.\n"
                                      "- 401: firma o timestamp no válidos.\n- 502: la hoja falló → la web lo reintenta por cron (máx. 8 intentos).\n"
                                      "- 200: una fila por correo (sin duplicados) en «Contactos» + una fila en «Historial».\n"
                                      "- Un «sí» a comunicaciones comerciales no se rebaja a «no»; una baja no se reactiva.\n"
                                      "Secretos y credenciales solo dentro de n8n, nunca en el repo.")
        n["position"] = [0, 0]
nuevos = [
    hoja("Buscar fila por email", [660, 200], "read", "Contactos", alwaysOutputData=True),
    {"id": nid("Fusionar con la fila existente"), "name": "Fusionar con la fila existente", "type": "n8n-nodes-base.code", "typeVersion": 2,
     "position": [880, 200], "parameters": {"jsCode": (HERE / "fusionar-fila.js").read_text(encoding="utf-8")}},
    hoja("Añadir o actualizar contacto", [1100, 200], "appendOrUpdate", "Contactos", COLUMNAS, FUS + ".fila", ["email"]),
    hoja("Añadir a Historial", [1320, 200], "append", "Historial", HISTORIAL, FUS + ".historial"),
]
wf["nodes"][4:4] = nuevos  # tras «Responder 401», antes de «¿Enviar aviso?»
conn = lambda *t: [[{"node": x, "type": "main", "index": 0} for x in g] for g in t]
C = wf["connections"]
for k in list(C):
    if k in QUITAR:
        del C[k]
C["¿Firma válida?"] = {"main": conn(["Buscar fila por email"], ["Responder 401"])}
C["Buscar fila por email"] = {"main": conn(["Fusionar con la fila existente"], ["Responder 502 (hoja falló)"])}
C["Fusionar con la fila existente"] = {"main": conn(["Añadir o actualizar contacto"])}
C["Añadir o actualizar contacto"] = {"main": conn(["Añadir a Historial"], ["Responder 502 (hoja falló)"])}
C["Añadir a Historial"] = {"main": conn(["¿Enviar aviso?"], ["Responder 502 (hoja falló)"])}
wf["meta"] = {**wf.get("meta", {}), "hoja_contactos": "https://docs.google.com/spreadsheets/d/" + HOJA_ID + "/edit"}
wf["active"] = False
(BASE / "sobtree-lead-a-hoja.json").write_text(json.dumps(wf, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("escrito sobtree-lead-a-hoja.json", len(wf["nodes"]), "nodos")

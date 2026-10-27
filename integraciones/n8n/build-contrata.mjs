// Regenera los JSON importables de Contrata. Sin credenciales ni URLs reales.
// Uso: node integraciones/n8n/build-contrata.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../..");
const logica = fs.readFileSync(path.join(root, "src/data/contrata-logica.mjs"), "utf8").replace(/^export /gm, "");
const verificar = fs.readFileSync(path.join(dir, "contrata-verificar.js"), "utf8");

const calcular = `${logica}
const item = $input.first().json;
if (item.modo !== "simulacion") {
  throw new Error("v1 no llama a Google. La rama real sigue deshabilitada.");
}
const ids = [item.calendario_proyectos, item.calendario_bloqueos];
if (ids.length !== 2 || new Set(ids).size !== 2) throw new Error("hacen falta exactamente dos calendarios");
for (const id of ids) {
  if (!id || id === "primary" || /@gmail\\.com$/i.test(id) || String(id).toLowerCase() === "info@sobtree.com") {
    throw new Error("calendario no permitido");
  }
}
const calc = calcularSemanas({
  hoy: item.hoy,
  max: item.max_proyectos_simultaneos,
  plazo: item.plazo_minimo_dias_laborables,
  visibles: item.semanas_visibles,
  proyectos: item.proyectos || [],
  bloqueos: item.bloqueos || []
});
const cuerpo = {
  generado: new Date().toISOString(),
  max_proyectos_simultaneos: item.max_proyectos_simultaneos,
  semanas: calc.semanas
};
const raw = JSON.stringify(cuerpo);
if (raw.includes("@")) throw new Error("la publicación no puede llevar datos personales");
const SECRET = "REEMPLAZAR_EN_N8N";
const ts = String(Math.floor(Date.now() / 1000));
const firma = SECRET === "REEMPLAZAR_EN_N8N" ? "" : ("sha256=" + require("crypto").createHmac("sha256", SECRET).update(ts + "." + raw).digest("hex"));
const enviar = SECRET !== "REEMPLAZAR_EN_N8N" && item.url_publicacion && !String(item.url_publicacion).includes("ejemplo.invalid");
return [{ json: { ...item, cuerpo, raw, enviar, firma, ts } }];
`;

const configJs = `const MODO = "simulacion";
const CALENDARIO_PROYECTOS = "CONFIGURAR_ID_CALENDARIO_PROYECTOS";
const CALENDARIO_BLOQUEOS = "CONFIGURAR_ID_CALENDARIO_BLOQUEOS";
const SECRET = "REEMPLAZAR_EN_N8N";
const URL_PUBLICACION = "https://ejemplo.invalid/api/contrata/disponibilidad.php";
const CUENTA = "info@sobtree.com";
function idOk(id) {
  if (!id || id === "primary") return false;
  if (/@gmail\\.com$/i.test(id)) return false;
  if (String(id).toLowerCase() === CUENTA) return false;
  return true;
}
if (MODO !== "simulacion") throw new Error("v1 permanece en simulación");
if (!idOk(CALENDARIO_PROYECTOS) || !idOk(CALENDARIO_BLOQUEOS) || CALENDARIO_PROYECTOS === CALENDARIO_BLOQUEOS) {
  throw new Error("IDs de calendario no permitidos");
}
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
return [{ json: {
  modo: MODO,
  cuenta: CUENTA,
  calendario_proyectos: CALENDARIO_PROYECTOS,
  calendario_bloqueos: CALENDARIO_BLOQUEOS,
  max_proyectos_simultaneos: 1,
  plazo_minimo_dias_laborables: 3,
  semanas_visibles: 4,
  hoy,
  proyectos: [],
  bloqueos: [],
  secreto_configurado: SECRET !== "REEMPLAZAR_EN_N8N",
  url_publicacion: URL_PUBLICACION
} }];
`;

const code = (id, name, js, x, y) => ({
  id, name, type: "n8n-nodes-base.code", typeVersion: 2, position: [x, y],
  parameters: { jsCode: js }
});

const HOJA_ID = "1EWlyQCodNmxIwOvljQuyM1ZOq1s7QlNZVkPEydyNizQ"; // «Sobtree · Contactos». No es un secreto.
const COLUMNAS_VENTAS = ["fecha", "id_sesion_stripe", "empresa", "nif", "email", "producto", "importe_sin_iva", "iva", "total", "semana_reservada", "estado"];
const cred = (tipo, nombre) => ({ [tipo]: { id: "REEMPLAZAR_ID_CREDENCIAL", name: nombre } });

const disponibilidad = {
  name: "Sobtree · Disponibilidad",
  active: false,
  settings: { executionOrder: "v1", timezone: "Europe/Madrid" },
  tags: [],
  nodes: [
    {
      id: "c0a1b001-0000-4000-8000-000000000001",
      name: "Nota",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [-40, -220],
      parameters: {
        content: "## Simulación\n\nPor defecto no llama a Google ni publica en sobtree.com.\nSolo dos calendarios de info@sobtree.com: «Sobtree · Proyectos» y «Sobtree · Bloqueos».\nIDs placeholder. La rama de Google está deshabilitada.\nSustituir la URL ejemplo.invalid y el secreto solo con OK del fundador.",
        width: 520,
        height: 180,
        color: 4
      }
    },
    {
      id: "c0a1b001-0000-4000-8000-000000000002",
      name: "Cada hora",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 40],
      parameters: { rule: { interval: [{ field: "hours", hoursInterval: 1 }] } }
    },
    {
      id: "c0a1b001-0000-4000-8000-000000000003",
      name: "Webhook reactivo",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 220],
      parameters: { httpMethod: "POST", path: "sobtree-disponibilidad", responseMode: "onReceived", options: {} },
      webhookId: "c0a1b001-0000-4000-8000-000000000013"
    },
    code("c0a1b001-0000-4000-8000-000000000004", "Configuración", configJs, 260, 120),
    {
      id: "c0a1b001-0000-4000-8000-000000000005",
      name: "¿Simulación?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [520, 120],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [{
            id: "c0a1b001-0000-4000-8000-000000000015",
            leftValue: "={{ $json.modo }}",
            rightValue: "simulacion",
            operator: { type: "string", operation: "equals" }
          }],
          combinator: "and"
        },
        options: {}
      }
    },
    code("c0a1b001-0000-4000-8000-000000000006", "Calendario simulado (sin Google)", `const item = $input.first().json;
item.proyectos = [];
item.bloqueos = [];
return [{ json: item }];
`, 780, 40),
    {
      id: "c0a1b001-0000-4000-8000-000000000007",
      name: "Google · Proyectos (DESHABILITADO)",
      type: "n8n-nodes-base.googleCalendar",
      typeVersion: 1.3,
      disabled: true,
      position: [780, 280],
      parameters: {
        operation: "getAll",
        calendar: { __rl: true, mode: "id", value: "={{ $json.calendario_proyectos }}" },
        options: {}
      },
      credentials: cred("googleCalendarOAuth2Api", "Google Calendar Sobtree (info@)"),
      notes: "DESHABILITADO. events.list solo del ID «Sobtree · Proyectos». No listar calendarios. No usar una cuenta personal."
    },
    {
      id: "c0a1b001-0000-4000-8000-000000000008",
      name: "Google · Bloqueos freeBusy (DESHABILITADO)",
      type: "n8n-nodes-base.googleCalendar",
      typeVersion: 1.3,
      disabled: true,
      position: [1020, 280],
      parameters: {
        operation: "availability",
        calendar: { __rl: true, mode: "id", value: "={{ $json.calendario_bloqueos }}" },
        options: {}
      },
      credentials: cred("googleCalendarOAuth2Api", "Google Calendar Sobtree (info@)"),
      notes: "DESHABILITADO. freeBusy solo del ID «Sobtree · Bloqueos», sin títulos."
    },
    code("c0a1b001-0000-4000-8000-000000000009", "Calcular plazas", calcular, 1040, 40),
    {
      id: "c0a1b001-0000-4000-8000-000000000010",
      name: "¿Publicar de verdad?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [1300, 40],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [{
            id: "c0a1b001-0000-4000-8000-000000000016",
            leftValue: "={{ $json.enviar }}",
            rightValue: true,
            operator: { type: "boolean", operation: "true", singleValue: true }
          }],
          combinator: "and"
        },
        options: {}
      }
    },
    {
      id: "c0a1b001-0000-4000-8000-000000000011",
      name: "Publicar en la web",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1560, 0],
      parameters: {
        method: "POST",
        url: "={{ $json.url_publicacion }}",
        sendBody: true,
        contentType: "raw",
        rawContentType: "application/json",
        body: "={{ $json.raw }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "X-Sobtree-Timestamp", value: "={{ $json.ts }}" },
            { name: "X-Sobtree-Signature", value: "={{ $json.firma }}" }
          ]
        },
        options: { timeout: 10000 }
      },
      notes: "No se alcanza mientras la URL sea ejemplo.invalid o el secreto siga sin pegar."
    },
    {
      id: "c0a1b001-0000-4000-8000-000000000012",
      name: "No publicar (simulación)",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [1560, 180],
      parameters: {}
    }
  ],
  connections: {
    "Cada hora": { main: [[{ node: "Configuración", type: "main", index: 0 }]] },
    "Webhook reactivo": { main: [[{ node: "Configuración", type: "main", index: 0 }]] },
    "Configuración": { main: [[{ node: "¿Simulación?", type: "main", index: 0 }]] },
    "¿Simulación?": { main: [
      [{ node: "Calendario simulado (sin Google)", type: "main", index: 0 }],
      [{ node: "Google · Proyectos (DESHABILITADO)", type: "main", index: 0 }]
    ] },
    "Calendario simulado (sin Google)": { main: [[{ node: "Calcular plazas", type: "main", index: 0 }]] },
    "Google · Proyectos (DESHABILITADO)": { main: [[{ node: "Google · Bloqueos freeBusy (DESHABILITADO)", type: "main", index: 0 }]] },
    "Calcular plazas": { main: [[{ node: "¿Publicar de verdad?", type: "main", index: 0 }]] },
    "¿Publicar de verdad?": { main: [
      [{ node: "Publicar en la web", type: "main", index: 0 }],
      [{ node: "No publicar (simulación)", type: "main", index: 0 }]
    ] }
  }
};

const contrata = {
  name: "Sobtree · Contrata",
  active: false,
  settings: {
    executionOrder: "v1",
    timezone: "Europe/Madrid",
    errorWorkflow: "REEMPLAZAR_ID_WORKFLOW_ERRORES"
  },
  tags: [],
  nodes: [
    {
      id: "c0a1b002-0000-4000-8000-000000000001",
      name: "Nota",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [-40, -240],
      parameters: {
        content: "## Simulación\n\nEl nodo «Añadir fila en Ventas» (hoja «Sobtree · Contactos») está DESHABILITADO.\nCalendario, Gmail y la hoja no se ejecutan. La respuesta es un acuse simulado.\nCredenciales por nombre. Secreto: REEMPLAZAR_EN_N8N, el mismo que CONTRATA_HMAC_SECRET.",
        width: 540,
        height: 200,
        color: 5
      }
    },
    {
      id: "c0a1b002-0000-4000-8000-000000000002",
      name: "Webhook contrata",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 80],
      parameters: {
        httpMethod: "POST",
        path: "sobtree-contrata",
        responseMode: "responseNode",
        options: { rawBody: true }
      },
      webhookId: "c0a1b002-0000-4000-8000-000000000012"
    },
    code("c0a1b002-0000-4000-8000-000000000003", "Verificar firma y simular", verificar, 280, 80),
    {
      id: "c0a1b002-0000-4000-8000-000000000004",
      name: "¿Firma válida?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [560, 80],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [{
            id: "c0a1b002-0000-4000-8000-000000000014",
            leftValue: "={{ $json.valido }}",
            rightValue: true,
            operator: { type: "boolean", operation: "true", singleValue: true }
          }],
          combinator: "and"
        },
        options: {}
      }
    },
    {
      id: "c0a1b002-0000-4000-8000-000000000005",
      name: "Responder 401",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [840, 260],
      parameters: {
        respondWith: "json",
        responseBody: "={{ JSON.stringify({ ok: false, motivo: $json.motivo }) }}",
        options: { responseCode: 401 }
      }
    },
    {
      id: "c0a1b002-0000-4000-8000-000000000006",
      name: "¿Rama real?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [840, 40],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [{
            id: "c0a1b002-0000-4000-8000-000000000016",
            leftValue: "={{ $json.modo }}",
            rightValue: "produccion",
            operator: { type: "string", operation: "equals" }
          }],
          combinator: "and"
        },
        options: {}
      }
    },
    {
      id: "c0a1b002-0000-4000-8000-000000000007",
      name: "Responder 200 simulado",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [1120, 120],
      parameters: {
        respondWith: "json",
        responseBody: "={{ JSON.stringify({ ok: true, simulado: true, aviso: true, venta: $json.venta_hoja, evento_calendario: $json.evento_calendario, email: $json.email }) }}",
        options: { responseCode: 200 }
      }
    },
    {
      id: "c0a1b002-0000-4000-8000-000000000008",
      name: "Añadir fila en Ventas",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.7,
      disabled: true,
      position: [1120, -120],
      parameters: {
        authentication: "oAuth2",
        resource: "sheet",
        operation: "appendOrUpdate",
        documentId: { __rl: true, mode: "id", value: HOJA_ID },
        sheetName: { __rl: true, mode: "name", value: "Ventas" },
        columns: {
          mappingMode: "defineBelow",
          value: Object.fromEntries(COLUMNAS_VENTAS.filter((c) => c !== "nif").map((c) => [c, `={{ $json.venta.${c} }}`])),
          matchingColumns: ["id_sesion_stripe"],
          schema: COLUMNAS_VENTAS.filter((c) => c !== "nif").map((c) => ({ id: c, displayName: c, required: false, defaultMatch: c === "id_sesion_stripe", display: true, type: "string", canBeUsedToMatch: true, removed: false }))
        },
        options: { cellFormat: "RAW" }
      },
      credentials: cred("googleSheetsOAuth2Api", "Google Sheets Sobtree (info@)"),
      notes: "DESHABILITADO en v1. Añade o actualiza (por id_sesion_stripe, sin duplicar) una fila en la pestaña «Ventas» de «Sobtree · Contactos». Credencial: marcador de posición, se elige en n8n. La columna nif no se escribe (el aviso no lo lleva): se rellena a mano y un reintento no la borra."
    },
    {
      id: "c0a1b002-0000-4000-8000-000000000009",
      name: "Evento en Proyectos (DESHABILITADO)",
      type: "n8n-nodes-base.googleCalendar",
      typeVersion: 1.3,
      disabled: true,
      position: [1380, -120],
      parameters: {
        operation: "create",
        calendar: { __rl: true, mode: "id", value: "CONFIGURAR_ID_CALENDARIO_PROYECTOS" },
        start: "={{ $json.semana_lunes }}",
        end: "={{ $json.semana_lunes }}",
        additionalFields: { summary: "Diagnóstico" }
      },
      credentials: cred("googleCalendarOAuth2Api", "Google Calendar Sobtree (info@)"),
      notes: "DESHABILITADO. Solo el calendario «Sobtree · Proyectos»."
    },
    {
      id: "c0a1b002-0000-4000-8000-000000000010",
      name: "Correo al cliente (DESHABILITADO)",
      type: "n8n-nodes-base.gmail",
      typeVersion: 2.1,
      disabled: true,
      position: [1640, -120],
      parameters: {
        sendTo: "={{ $json.email_cliente }}",
        subject: "Tu diagnóstico en Sobtree",
        emailType: "text",
        message: "La fecha se confirma por email en 1 día laborable.",
        options: { appendAttribution: false }
      },
      credentials: cred("gmailOAuth2", "Gmail Sobtree (info@)"),
      notes: "DESHABILITADO. No se envía correo en v1."
    }
  ],
  connections: {
    "Webhook contrata": { main: [[{ node: "Verificar firma y simular", type: "main", index: 0 }]] },
    "Verificar firma y simular": { main: [[{ node: "¿Firma válida?", type: "main", index: 0 }]] },
    "¿Firma válida?": { main: [
      [{ node: "¿Rama real?", type: "main", index: 0 }],
      [{ node: "Responder 401", type: "main", index: 0 }]
    ] },
    "¿Rama real?": { main: [
      [{ node: "Añadir fila en Ventas", type: "main", index: 0 }],
      [{ node: "Responder 200 simulado", type: "main", index: 0 }]
    ] },
    "Añadir fila en Ventas": { main: [[{ node: "Evento en Proyectos (DESHABILITADO)", type: "main", index: 0 }]] },
    "Evento en Proyectos (DESHABILITADO)": { main: [[{ node: "Correo al cliente (DESHABILITADO)", type: "main", index: 0 }]] }
  }
};

fs.writeFileSync(path.join(dir, "sobtree-disponibilidad.json"), JSON.stringify(disponibilidad, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "sobtree-contrata.json"), JSON.stringify(contrata, null, 2) + "\n");
console.log("escritos sobtree-disponibilidad.json y sobtree-contrata.json");

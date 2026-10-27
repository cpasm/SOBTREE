// Regenera los JSON importables de Contrata. Sin credenciales ni URLs reales.
// Uso: node integraciones/n8n/build-contrata.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../..");
// Opciones (todas opcionales; sin ellas sale el JSON seguro: simulación, IDs y URL de ejemplo, sin secretos).
//   CONTRATA_N8N_MODO=produccion      rama real (Google Sheets, Calendar, Gmail)
//   CONTRATA_N8N_LIVE=1               los avisos tienen que ser de Stripe live (sin esto, solo de test)
//   CONTRATA_CAL_PROYECTOS_ID / CONTRATA_CAL_BLOQUEOS_ID   IDs de los dos calendarios de info@
//   CONTRATA_URL_PUBLICACION          https://sobtree.com/api/contrata/disponibilidad.php
// El secreto HMAC no se pone aquí: se pega en n8n (nodos Code, constante SECRET).
const MODO_N8N = process.env.CONTRATA_N8N_MODO === "produccion" ? "produccion" : "simulacion";
const LIVE_N8N = process.env.CONTRATA_N8N_LIVE === "1";
const CAL_PROYECTOS = process.env.CONTRATA_CAL_PROYECTOS_ID || "CONFIGURAR_ID_CALENDARIO_PROYECTOS";
const CAL_BLOQUEOS = process.env.CONTRATA_CAL_BLOQUEOS_ID || "CONFIGURAR_ID_CALENDARIO_BLOQUEOS";
const URL_PUB = process.env.CONTRATA_URL_PUBLICACION || "https://ejemplo.invalid/api/contrata/disponibilidad.php";
if (!/^[A-Za-z0-9_.@-]+$/.test(CAL_PROYECTOS) || !/^[A-Za-z0-9_.@-]+$/.test(CAL_BLOQUEOS)) throw new Error("ID de calendario con caracteres no permitidos");
if (!/^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9._\/-]*$/i.test(URL_PUB)) throw new Error("URL de publicación no válida");
if (MODO_N8N === "produccion" && (CAL_PROYECTOS.startsWith("CONFIGURAR_") || CAL_BLOQUEOS.startsWith("CONFIGURAR_") || URL_PUB.includes("ejemplo.invalid"))) {
  throw new Error("En producción hacen falta los dos IDs de calendario y la URL de publicación (CONTRATA_CAL_*, CONTRATA_URL_PUBLICACION).");
}
const logica = fs.readFileSync(path.join(root, "src/data/contrata-logica.mjs"), "utf8").replace(/^export /gm, "");
const verificar = fs.readFileSync(path.join(dir, "contrata-verificar.js"), "utf8")
  .replace("const MODO = 'simulacion';", `const MODO = '${MODO_N8N}';`)
  .replace("const LIVE = false;", `const LIVE = ${LIVE_N8N};`);

const calcular = `${logica}
const item = $input.first().json;
if (item.modo !== "simulacion" && item.modo !== "produccion") throw new Error("modo desconocido");
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
if (item.modo === "produccion" && !enviar) throw new Error("En producción hay que pegar el secreto (SECRET) y poner la URL real de publicación.");
return [{ json: { ...item, cuerpo, raw, enviar, firma, ts } }];
`;

const configJs = `const MODO = "${MODO_N8N}";
const CALENDARIO_PROYECTOS = "${CAL_PROYECTOS}";
const CALENDARIO_BLOQUEOS = "${CAL_BLOQUEOS}";
const SECRET = "REEMPLAZAR_EN_N8N";
const URL_PUBLICACION = "${URL_PUB}";
const CUENTA = "info@sobtree.com";
function idOk(id) {
  if (!id || id === "primary") return false;
  if (/@gmail\\.com$/i.test(id)) return false;
  if (String(id).toLowerCase() === CUENTA) return false;
  return true;
}
if (MODO !== "simulacion" && MODO !== "produccion") throw new Error("modo desconocido");
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

const mapearJs = `// Convierte los eventos de los dos calendarios en rangos de fechas [inicio, fin).
// Los bloqueos solo aportan fechas (nunca títulos ni descripciones). Los proyectos aportan además el id de sesión de Stripe
// (de la descripción del evento) para no contar dos veces una plaza ya reservada en el calendario.
const cfg = $("Configuración").first().json;
const sumar = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const eventos = (nombre) => $(nombre).all().map((i) => i.json).filter((e) => e && e.start && e.end && e.status !== "cancelled");
const rango = (e) => {
  const ini = e.start.date || String(e.start.dateTime).slice(0, 10);
  let fin;
  if (e.end.date) fin = e.end.date;
  else {
    const f = String(e.end.dateTime);
    fin = f.slice(0, 10);
    if (!/T00:00:00/.test(f.slice(10, 19))) fin = sumar(fin, 1);
  }
  if (fin <= ini) fin = sumar(ini, 1);
  return { inicio: ini, fin };
};
const proyectos = eventos("Google · Proyectos").map((e) => {
  const m = String(e.description || "").match(/cs_(?:test|live)_[A-Za-z0-9]+/);
  return { ...rango(e), ...(m ? { sesion: m[0] } : {}) };
});
const bloqueos = eventos("Google · Bloqueos").map((e) => rango(e));
return [{ json: { ...cfg, proyectos, bloqueos } }];
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
        content: "## Modo\n\nLa constante MODO del nodo «Configuración» manda: «simulacion» (por defecto) no llama a Google ni publica; «produccion» lee los dos calendarios de info@sobtree.com («Sobtree · Proyectos» y «Sobtree · Bloqueos») y publica en la web.\nIDs, URL y SECRET: se ponen al pasar a producción (el secreto se pega en n8n, no en el repositorio).",
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
      name: "Google · Proyectos",
      type: "n8n-nodes-base.googleCalendar",
      typeVersion: 1.3,
      position: [780, 280],
      alwaysOutputData: true,
      parameters: {
        operation: "getAll",
        calendar: { __rl: true, mode: "id", value: "={{ $json.calendario_proyectos }}" },
        returnAll: true,
        options: {
          timeMin: "={{ $now.minus({ days: 1 }).toISO() }}",
          timeMax: "={{ $now.plus({ weeks: 9 }).toISO() }}",
          singleEvents: true
        }
      },
      credentials: cred("googleCalendarOAuth2Api", "Google Calendar Sobtree (info@)"),
      notes: "Solo se alcanza con MODO = produccion. events.list solo del ID «Sobtree · Proyectos». No lista calendarios. No usar una cuenta personal."
    },
    {
      id: "c0a1b001-0000-4000-8000-000000000008",
      name: "Google · Bloqueos",
      type: "n8n-nodes-base.googleCalendar",
      typeVersion: 1.3,
      position: [1020, 280],
      alwaysOutputData: true,
      executeOnce: true,
      parameters: {
        operation: "getAll",
        calendar: { __rl: true, mode: "id", value: "={{ $('Configuración').first().json.calendario_bloqueos }}" },
        returnAll: true,
        options: {
          timeMin: "={{ $now.minus({ days: 1 }).toISO() }}",
          timeMax: "={{ $now.plus({ weeks: 9 }).toISO() }}",
          singleEvents: true
        }
      },
      credentials: cred("googleCalendarOAuth2Api", "Google Calendar Sobtree (info@)"),
      notes: "Solo se alcanza con MODO = produccion. events.list solo del ID «Sobtree · Bloqueos»; de aquí solo se usan las fechas. Se ejecuta una vez aunque el calendario de proyectos devuelva varios eventos."
    },
    code("c0a1b001-0000-4000-8000-000000000017", "Mapear calendarios", mapearJs, 1020, 460),
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
      [{ node: "Google · Proyectos", type: "main", index: 0 }]
    ] },
    "Calendario simulado (sin Google)": { main: [[{ node: "Calcular plazas", type: "main", index: 0 }]] },
    "Google · Proyectos": { main: [[{ node: "Google · Bloqueos", type: "main", index: 0 }]] },
    "Google · Bloqueos": { main: [[{ node: "Mapear calendarios", type: "main", index: 0 }]] },
    "Mapear calendarios": { main: [[{ node: "Calcular plazas", type: "main", index: 0 }]] },
    "Calcular plazas": { main: [[{ node: "¿Publicar de verdad?", type: "main", index: 0 }]] },
    "¿Publicar de verdad?": { main: [
      [{ node: "Publicar en la web", type: "main", index: 0 }],
      [{ node: "No publicar (simulación)", type: "main", index: 0 }]
    ] }
  }
};

const V = "Verificar firma y preparar";
const ref = (campo) => `={{ $('${V}').first().json.${campo} }}`;
const cond = (id, izq, der, tipo = "string", op = "equals") => ({
  conditions: {
    options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
    conditions: [{ id, leftValue: izq, rightValue: der, operator: tipo === "boolean" ? { type: "boolean", operation: "true", singleValue: true } : { type: tipo, operation: op } }],
    combinator: "and"
  },
  options: {}
});
const hojaNodo = (id, name, operation, hoja, columnas, coincide, x, y, notes, extra = {}) => ({
  id, name, type: "n8n-nodes-base.googleSheets", typeVersion: 4.7, position: [x, y],
  parameters: {
    authentication: "oAuth2",
    resource: "sheet",
    operation,
    documentId: { __rl: true, mode: "id", value: HOJA_ID },
    sheetName: { __rl: true, mode: "name", value: hoja },
    columns: {
      mappingMode: "defineBelow",
      value: Object.fromEntries(columnas.map(([c, e]) => [c, e])),
      matchingColumns: [coincide],
      schema: columnas.map(([c]) => ({ id: c, displayName: c, required: false, defaultMatch: c === coincide, display: true, type: "string", canBeUsedToMatch: true, removed: false }))
    },
    options: { cellFormat: "RAW" }
  },
  credentials: cred("googleSheetsOAuth2Api", "Google Sheets Sobtree (info@)"),
  notes,
  ...extra
});
const respuesta = (id, name, cuerpo, x, y) => ({
  id, name, type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [x, y],
  parameters: { respondWith: "json", responseBody: cuerpo, options: { responseCode: 200 } }
});
const HIST = [
  ["fecha", ref("historial.fecha")], ["email", ref("historial.email")], ["tipo", ref("historial.tipo")],
  ["campania", ref("historial.campania")], ["detalle", ref("historial.detalle")]
];

const contrata = {
  name: "Sobtree · Contrata",
  active: false,
  settings: {
    executionOrder: "v1",
    timezone: "Europe/Madrid",
    errorWorkflow: "REEMPLAZAR_ID_WORKFLOW_ERRORES",
    saveDataSuccessExecution: "none",
    saveManualExecutions: false
  },
  tags: [],
  nodes: [
    {
      id: "c0a1b002-0000-4000-8000-000000000001",
      name: "Nota",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [-40, -300],
      parameters: {
        content: "## Modo\n\nLa constante MODO del nodo «Verificar firma y preparar» manda. «simulacion» (por defecto): responde un acuse simulado y no escribe en la hoja, el calendario ni el correo. «produccion»: pago confirmado → fila en «Ventas» + línea en «Historial» + evento en «Sobtree · Proyectos» + aviso a info@; reembolso → «Ventas» y «Historial».\nLIVE = true solo cuando se cobre de verdad con Stripe live.\nSecreto: REEMPLAZAR_EN_N8N, el mismo que CONTRATA_HMAC_SECRET. Credenciales por nombre. No se guardan los datos de las ejecuciones correctas (llevan el NIF).",
        width: 620,
        height: 240,
        color: 5
      }
    },
    {
      id: "c0a1b002-0000-4000-8000-000000000002",
      name: "Webhook contrata",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 80],
      parameters: { httpMethod: "POST", path: "sobtree-contrata", responseMode: "responseNode", options: { rawBody: true } },
      webhookId: "c0a1b002-0000-4000-8000-000000000012"
    },
    code("c0a1b002-0000-4000-8000-000000000003", V, verificar, 280, 80),
    {
      id: "c0a1b002-0000-4000-8000-000000000004",
      name: "¿Firma válida?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [560, 80],
      parameters: cond("c0a1b002-0000-4000-8000-000000000014", "={{ $json.valido }}", true, "boolean")
    },
    {
      id: "c0a1b002-0000-4000-8000-000000000005",
      name: "Responder 401",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [840, 360],
      parameters: { respondWith: "json", responseBody: "={{ JSON.stringify({ ok: false, motivo: $json.motivo }) }}", options: { responseCode: 401 } }
    },
    {
      id: "c0a1b002-0000-4000-8000-000000000006",
      name: "¿Rama real?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [840, 40],
      parameters: cond("c0a1b002-0000-4000-8000-000000000016", "={{ $json.modo }}", "produccion")
    },
    respuesta("c0a1b002-0000-4000-8000-000000000007", "Responder 200 simulado",
      "={{ JSON.stringify({ ok: true, simulado: true, aviso: true, accion: $json.accion, venta: $json.venta_hoja, evento_calendario: $json.evento_calendario, email: $json.email }) }}", 1120, 360),
    {
      id: "c0a1b002-0000-4000-8000-000000000020",
      name: "¿Es una venta?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [1120, 40],
      parameters: cond("c0a1b002-0000-4000-8000-000000000021", "={{ $json.accion }}", "venta")
    },
    hojaNodo("c0a1b002-0000-4000-8000-000000000008", "Añadir fila en Ventas", "appendOrUpdate", "Ventas",
      COLUMNAS_VENTAS.map((c) => [c, `={{ $json.venta.${c} }}`]), "id_sesion_stripe", 1400, -200,
      "Añade o actualiza (por id_sesion_stripe, sin duplicar) la fila de la venta en la pestaña «Ventas» de «Sobtree · Contactos», con el NIF que llega en el aviso firmado. Si falla, el flujo termina en error y la web reintenta."),
    hojaNodo("c0a1b002-0000-4000-8000-000000000022", "Historial: venta", "appendOrUpdate", "Historial", HIST, "detalle", 1660, -200,
      "Una línea por venta en «Historial». Coincide por detalle (lleva la sesión), así un reintento no la duplica."),
    {
      id: "c0a1b002-0000-4000-8000-000000000009",
      name: "Evento en Proyectos",
      type: "n8n-nodes-base.googleCalendar",
      typeVersion: 1.3,
      position: [1920, -200],
      onError: "continueRegularOutput",
      parameters: {
        operation: "create",
        calendar: { __rl: true, mode: "id", value: CAL_PROYECTOS },
        start: ref("evento.inicio"),
        end: ref("evento.fin"),
        additionalFields: { summary: ref("evento.resumen"), description: ref("evento.descripcion"), allday: "yes" }
      },
      credentials: cred("googleCalendarOAuth2Api", "Google Calendar Sobtree (info@)"),
      notes: "Evento de día completo, de lunes a viernes (el día de fin es exclusivo), solo en «Sobtree · Proyectos». La descripción lleva la sesión de Stripe: así la web no cuenta dos veces la plaza. Si falla, el flujo sigue y el aviso a info@ lo cubre. Comprobar en la primera venta de prueba que el evento ocupa lunes–viernes."
    },
    {
      id: "c0a1b002-0000-4000-8000-000000000010",
      name: "Aviso a info@ (venta)",
      type: "n8n-nodes-base.gmail",
      typeVersion: 2.1,
      position: [2180, -200],
      onError: "continueRegularOutput",
      parameters: { sendTo: ref("aviso_a"), subject: ref("aviso_email.asunto"), emailType: "text", message: ref("aviso_email.texto"), options: { appendAttribution: false } },
      credentials: cred("gmailOAuth2", "Gmail Sobtree (info@)"),
      notes: "Aviso interno a info@sobtree.com. No va al cliente: la factura y el recibo los envía Stripe."
    },
    respuesta("c0a1b002-0000-4000-8000-000000000023", "Responder 200 venta",
      "={{ JSON.stringify({ ok: true, accion: 'venta', sesion: $('" + V + "').first().json.dedupe_clave }) }}", 2440, -200),
    {
      id: "c0a1b002-0000-4000-8000-000000000024",
      name: "¿Es un reembolso?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [1400, 220],
      parameters: cond("c0a1b002-0000-4000-8000-000000000025", "={{ $json.accion }}", "reembolso")
    },
    hojaNodo("c0a1b002-0000-4000-8000-000000000026", "Marcar reembolso en Ventas", "update", "Ventas",
      [["id_sesion_stripe", ref("estado_venta.id_sesion_stripe")], ["estado", ref("estado_venta.estado")]], "id_sesion_stripe", 1660, 120,
      "Cambia solo la columna estado de la fila de esa sesión. Si no existe la fila no pasa nada y el aviso a info@ lo cuenta.",
      { onError: "continueRegularOutput" }),
    hojaNodo("c0a1b002-0000-4000-8000-000000000027", "Historial: reembolso", "appendOrUpdate", "Historial", HIST, "detalle", 1920, 120,
      "Una línea por reembolso en «Historial»."),
    {
      id: "c0a1b002-0000-4000-8000-000000000028",
      name: "Aviso a info@ (reembolso)",
      type: "n8n-nodes-base.gmail",
      typeVersion: 2.1,
      position: [2180, 120],
      onError: "continueRegularOutput",
      parameters: { sendTo: ref("aviso_a"), subject: ref("aviso_email.asunto"), emailType: "text", message: ref("aviso_email.texto"), options: { appendAttribution: false } },
      credentials: cred("gmailOAuth2", "Gmail Sobtree (info@)"),
      notes: "Aviso interno: hay que valorar la factura rectificativa en Stripe."
    },
    respuesta("c0a1b002-0000-4000-8000-000000000029", "Responder 200 reembolso",
      "={{ JSON.stringify({ ok: true, accion: 'reembolso' }) }}", 2440, 120),
    respuesta("c0a1b002-0000-4000-8000-000000000030", "Responder 200 ignorado",
      "={{ JSON.stringify({ ok: true, ignorado: true }) }}", 1660, 380)
  ],
  connections: {
    "Webhook contrata": { main: [[{ node: V, type: "main", index: 0 }]] },
    [V]: { main: [[{ node: "¿Firma válida?", type: "main", index: 0 }]] },
    "¿Firma válida?": { main: [
      [{ node: "¿Rama real?", type: "main", index: 0 }],
      [{ node: "Responder 401", type: "main", index: 0 }]
    ] },
    "¿Rama real?": { main: [
      [{ node: "¿Es una venta?", type: "main", index: 0 }],
      [{ node: "Responder 200 simulado", type: "main", index: 0 }]
    ] },
    "¿Es una venta?": { main: [
      [{ node: "Añadir fila en Ventas", type: "main", index: 0 }],
      [{ node: "¿Es un reembolso?", type: "main", index: 0 }]
    ] },
    "Añadir fila en Ventas": { main: [[{ node: "Historial: venta", type: "main", index: 0 }]] },
    "Historial: venta": { main: [[{ node: "Evento en Proyectos", type: "main", index: 0 }]] },
    "Evento en Proyectos": { main: [[{ node: "Aviso a info@ (venta)", type: "main", index: 0 }]] },
    "Aviso a info@ (venta)": { main: [[{ node: "Responder 200 venta", type: "main", index: 0 }]] },
    "¿Es un reembolso?": { main: [
      [{ node: "Marcar reembolso en Ventas", type: "main", index: 0 }],
      [{ node: "Responder 200 ignorado", type: "main", index: 0 }]
    ] },
    "Marcar reembolso en Ventas": { main: [[{ node: "Historial: reembolso", type: "main", index: 0 }]] },
    "Historial: reembolso": { main: [[{ node: "Aviso a info@ (reembolso)", type: "main", index: 0 }]] },
    "Aviso a info@ (reembolso)": { main: [[{ node: "Responder 200 reembolso", type: "main", index: 0 }]] }
  }
};

fs.writeFileSync(path.join(dir, "sobtree-disponibilidad.json"), JSON.stringify(disponibilidad, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "sobtree-contrata.json"), JSON.stringify(contrata, null, 2) + "\n");
console.log("escritos sobtree-disponibilidad.json y sobtree-contrata.json");

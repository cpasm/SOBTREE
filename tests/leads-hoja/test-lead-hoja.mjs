// Prueba local del workflow «Lead web → Hoja de contactos». Sin red: ejecuta el JSON importable con un
// mini-ejecutor de nodos (webhook firmado, Code, IF, respuestas, Gmail simulado y Google Sheets simulado en memoria).
// Uso: node tests/leads-hoja/test-lead-hoja.mjs
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = new URL("../../integraciones/n8n/", import.meta.url);
const wf = JSON.parse(fs.readFileSync(new URL("sobtree-lead-a-hoja.json", root), "utf8"));
const main = JSON.parse(fs.readFileSync(new URL("sobtree-lead-a-hubspot.json", root), "utf8"));
const rawText = fs.readFileSync(new URL("sobtree-lead-a-hoja.json", root), "utf8");
const SECRET = "secreto-de-prueba-no-real";
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
let ok = 0, ko = 0;
const t = (n, c) => { c ? ok++ : ko++; console.log(`  ${c ? "✔" : "✘"} ${n}`); };

const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
const ahora = () => new Date().toISOString();

// ---- expresiones de n8n: «=texto {{ expr }} texto» ----
function evalExpr(valor, ctx) {
  if (typeof valor !== "string" || !valor.startsWith("=")) return valor;
  const cuerpo = valor.slice(1);
  const m = cuerpo.match(/^\{\{([\s\S]*)\}\}$/);
  const f = (e) => new Function("$json", "$", "$now", "return (" + e + ")")(ctx.$json, ctx.$, { toISO: ahora });
  if (m && !/\}\}[\s\S]*\{\{/.test(cuerpo)) return f(m[1]);
  return cuerpo.replace(/\{\{([\s\S]*?)\}\}/g, (_, e) => String(f(e)));
}

// ---- mini-ejecutor ----
async function ejecutar(lead, { firma = "ok", hoja, sheetsFalla = false, gmailFalla = false, ts, cuerpoRaw } = {}) {
  const cuerpo = cuerpoRaw ?? JSON.stringify(lead);
  const tsH = ts ?? String(Math.floor(Date.now() / 1000));
  const sig = firma === "ok" ? "sha256=" + crypto.createHmac("sha256", SECRET).update(tsH + "." + cuerpo).digest("hex")
    : firma === "mala" ? "sha256=" + "0".repeat(64) : "";
  const salidas = {}, respuestas = [], correos = [], tablas = hoja;
  const $ = (n) => ({ first: () => (salidas[n] || [])[0], all: () => salidas[n] || [], isExecuted: !!salidas[n] });
  const pasos = [];
  let cola = [["Webhook lead web", [{ json: { headers: { "x-sobtree-timestamp": tsH, "x-sobtree-signature": sig }, body: lead } }], 0]];
  while (cola.length) {
    const [nombre, items, _] = cola.shift();
    const n = byName[nombre]; pasos.push(nombre);
    let out = null, puerto = 0;
    const ctx = { $json: (items[0] || {}).json || {}, $ };
    switch (n.type) {
      case "n8n-nodes-base.webhook": out = items; break;
      case "n8n-nodes-base.code": {
        const src = n.parameters.jsCode.replace("const SECRET = 'REEMPLAZAR_EN_N8N';", `const SECRET = '${SECRET}';`);
        const input = { first: () => items[0], all: () => items };
        const thisCtx = { helpers: { getBinaryDataBuffer: async () => Buffer.from(cuerpo, "utf8") } };
        out = await new AsyncFn("$input", "$", "require", src).call(thisCtx, input, $, require); break; }
      case "n8n-nodes-base.if": {
        const c = n.parameters.conditions.conditions[0];
        const v = evalExpr(c.leftValue, ctx);
        const res = c.operator.operation === "true" ? v === true : false;
        puerto = res ? 0 : 1; out = items; break; }
      case "n8n-nodes-base.googleSheets": {
        if (sheetsFalla) { puerto = 1; out = [{ json: { error: { message: "Google Sheets no responde" } } }]; break; }
        const tab = n.parameters.sheetName.value, op = n.parameters.operation, T = tablas[tab];
        if (op === "read") {
          const f = n.parameters.filtersUI.values[0];
          const v = evalExpr(f.lookupValue, ctx);
          const r = T.filter((x) => x[f.lookupColumn] === v);
          out = r.length ? r.map((x) => ({ json: { ...x } })) : [{ json: {} }];
        } else {
          const fila = {};
          for (const [k, e] of Object.entries(n.parameters.columns.value)) fila[k] = evalExpr(e, ctx);
          if (op === "appendOrUpdate") {
            const mc = n.parameters.columns.matchingColumns;
            const i = T.findIndex((x) => mc.every((c) => x[c] === fila[c]));
            if (i >= 0) T[i] = { ...T[i], ...fila }; else T.push(fila);
          } else T.push(fila);
          out = [{ json: fila }];
        }
        break; }
      case "n8n-nodes-base.gmail": {
        if (gmailFalla) { puerto = 1; out = [{ json: { error: { message: "gmail" } } }]; break; }
        correos.push({ para: n.parameters.sendTo, asunto: evalExpr(n.parameters.subject, ctx), texto: evalExpr(n.parameters.message, ctx) });
        out = [{ json: { id: "msg1" } }]; break; }
      case "n8n-nodes-base.respondToWebhook":
        respuestas.push({ codigo: n.parameters.options.responseCode, cuerpo: JSON.parse(evalExpr(n.parameters.responseBody, ctx)) }); out = items; break;
      default: continue;
    }
    salidas[nombre] = out;
    const sig = (wf.connections[nombre] || { main: [] }).main[puerto] || [];
    for (const d of sig) cola.push([d.node, out, 0]);
  }
  return { respuestas, correos, tablas, pasos };
}

const lead = (o = {}) => ({
  id: "587e4cf7-d926-4eeb-a128-32e140172b5b", fecha: "2026-10-27T09:03:28+00:00", tipo_formulario: "contacto", nombre: "Josema Puerta",
  email: "Crls.Pasku@Gmail.com", empresa: "Microsoft", cargo: "CTO", telefono: "666323123", tamano: "1 a 9 personas", interes: "Diagnóstico IA exprés",
  mensaje: "IA Expres",
  consentimiento: { texto: "Acepto la política de privacidad y que Sobtree use estos datos para responder a mi solicitud.", fecha: "2026-10-27T09:03:28+00:00" },
  consentimiento_comercial: { acepta: true, fecha: "2026-10-27T09:03:28+00:00", texto: "Quiero recibir comunicaciones comerciales de Sobtree (novedades, análisis y ofertas) por email. Puedes darte de baja cuando quieras.", version_politica: "2026-10-26" },
  origen: { landing: "https://sobtree.com/", referrer: "https://www.google.com/", pagina: "https://sobtree.com/", utm: {} },
  calculadora: {}, asistente: { motivo: "" }, ...o,
});
const hojaVacia = () => ({ Contactos: [], Historial: [] });

console.log("\n1. Estructura del JSON");
t("active=false", wf.active === false);
t("el webhook no cambia respecto a main (ruta, id del nodo, webhookId, raw body, respuesta por nodo)", JSON.stringify(wf.nodes[0]) === JSON.stringify(main.nodes[0]));
t("solo hay un webhook y nadie más usa la ruta sobtree-lead", wf.nodes.filter((n) => n.type === "n8n-nodes-base.webhook").length === 1);
t("no queda ningún nodo ni URL de HubSpot (api.hubapi.com, hubspotAppToken, app-eu1.hubspot.com)", !/hubapi|hubspotAppToken|hubspot\.com|crm\/v3/.test(rawText));
const mainGmail = main.nodes.find((n) => n.name === "Aviso a info@");
t("el nodo de aviso por Gmail mantiene destinatario, asunto, tipo, reintentos y credencial", ["sendTo", "subject", "emailType"].every((k) => byName["Aviso a info@"].parameters[k] === mainGmail.parameters[k]) && JSON.stringify(byName["Aviso a info@"].credentials) === JSON.stringify(mainGmail.credentials) && byName["Aviso a info@"].maxTries === mainGmail.maxTries);
t("las respuestas 401, 200 con aviso y 200 sin aviso no cambian", ["Responder 401", "Responder 200 (aviso enviado)", "Responder 200 (sin aviso)"].every((n) => JSON.stringify(byName[n]) === JSON.stringify(main.nodes.find((x) => x.name === n))));
t("Sheets: appendOrUpdate en «Contactos» con email como columna de coincidencia",
  byName["Añadir o actualizar contacto"].parameters.operation === "appendOrUpdate" && byName["Añadir o actualizar contacto"].parameters.sheetName.value === "Contactos" && JSON.stringify(byName["Añadir o actualizar contacto"].parameters.columns.matchingColumns) === '["email"]');
t("Historial: append en la pestaña «Historial»", byName["Añadir a Historial"].parameters.operation === "append" && byName["Añadir a Historial"].parameters.sheetName.value === "Historial");
t("ID real de la hoja en los 3 nodos de Sheets", ["Buscar fila por email", "Añadir o actualizar contacto", "Añadir a Historial"].every((n) => byName[n].parameters.documentId.value === "1EWlyQCodNmxIwOvljQuyM1ZOq1s7QlNZVkPEydyNizQ"));
t("credencial de Sheets = referencia con REEMPLAZAR_EN_N8N (sin valores)", ["Buscar fila por email", "Añadir o actualizar contacto", "Añadir a Historial"].every((n) => byName[n].credentials.googleSheetsOAuth2Api.id === "REEMPLAZAR_EN_N8N" && Object.keys(byName[n].credentials.googleSheetsOAuth2Api).length === 2));
t("el secreto HMAC sigue como REEMPLAZAR_EN_N8N", byName["Verificar firma y mapear"].parameters.jsCode.includes("const SECRET = 'REEMPLAZAR_EN_N8N';"));
t("sin patrones de secretos", !/Bearer\s+[A-Za-z0-9]|pat-(eu1|na1)-|\b[0-9a-f]{32,}\b|ya29\.|GOCSPX|eyJ[A-Za-z0-9_-]{20,}/.test(rawText));
const cols = Object.keys(byName["Añadir o actualizar contacto"].parameters.columns.value);
const pedidas = "email,nombre,empresa,cargo,telefono,interes,tamano,origen,utm_source,utm_medium,utm_campaign,consentimiento_comercial,fecha_consentimiento,version_politica,id_lead,estado,fecha_baja,ultimo_envio,fecha_alta,fecha_actualizacion".split(",");
t("la hoja recibe todas las columnas pedidas (20) más las que llegan del formulario", pedidas.every((c) => cols.includes(c)) && ["mensaje", "tipo_formulario", "referrer", "pagina", "utm_term", "utm_content", "contexto", "consentimiento_privacidad_fecha", "texto_consentimiento_comercial"].every((c) => cols.includes(c)));
const hojaReal = JSON.parse(fs.readFileSync(new URL("cabeceras-hoja.json", import.meta.url), "utf8"));
t("las columnas del flujo coinciden una a una con la cabecera de la hoja creada en Drive", JSON.stringify(cols) === JSON.stringify(hojaReal.Contactos) && JSON.stringify(Object.keys(byName["Añadir a Historial"].parameters.columns.value)) === JSON.stringify(hojaReal.Historial));

console.log("\n2. Lead nuevo con consentimiento comercial");
let h = hojaVacia();
let r = await ejecutar(lead(), { hoja: h });
t("responde 200 con aviso:true", r.respuestas.length === 1 && r.respuestas[0].codigo === 200 && r.respuestas[0].cuerpo.aviso === true);
t("una fila en Contactos, con el correo en minúsculas y estado activo", h.Contactos.length === 1 && h.Contactos[0].email === "crls.pasku@gmail.com" && h.Contactos[0].estado === "activo");
const f1 = h.Contactos[0];
t("guarda consentimiento comercial «sí» con fecha, texto y versión de la política", f1.consentimiento_comercial === "sí" && f1.fecha_consentimiento === "2026-10-27T09:03:28+00:00" && f1.version_politica === "2026-10-26" && f1.texto_consentimiento_comercial.startsWith("Quiero recibir"));
t("guarda nombre, empresa, cargo, teléfono (como texto), interés, tamaño, origen e id del lead", f1.nombre === "Josema Puerta" && f1.empresa === "Microsoft" && f1.cargo === "CTO" && f1.telefono === "666323123" && f1.interes === "Diagnóstico IA exprés" && f1.tamano === "1 a 9 personas" && f1.origen === "https://sobtree.com/" && f1.id_lead === lead().id);
t("fecha_alta y fecha_actualizacion = fecha del lead; sin baja ni envíos", f1.fecha_alta === "2026-10-27T09:03:28+00:00" && f1.fecha_actualizacion === f1.fecha_alta && f1.fecha_baja === "" && f1.ultimo_envio === "");
t("una fila «alta» en Historial", h.Historial.length === 1 && h.Historial[0].tipo === "alta" && h.Historial[0].email === "crls.pasku@gmail.com" && h.Historial[0].detalle.includes(lead().id));
t("el aviso por Gmail sale a info@sobtree.com con enlace a la hoja", r.correos.length === 1 && r.correos[0].para === "info@sobtree.com" && r.correos[0].texto.includes("docs.google.com/spreadsheets/d/1EWlyQCodNmxIwOvljQuyM1ZOq1s7QlNZVkPEydyNizQ") && /Lead web \(contacto\)/.test(r.correos[0].asunto));

console.log("\n3. Lead repetido (se actualiza sin duplicar)");
h.Contactos[0].ultimo_envio = "2026-10-28T10:00:00+00:00";
r = await ejecutar(lead({ id: "id-segundo-lead", fecha: "2026-10-29T08:00:00+00:00", email: "CRLS.PASKU@gmail.com", empresa: "Microsoft Ibérica", cargo: "", telefono: "", mensaje: "Otra consulta" }), { hoja: h });
t("sigue habiendo UNA fila para ese correo", h.Contactos.length === 1);
t("actualiza lo que cambia (empresa, mensaje, id_lead, fecha_actualizacion)", h.Contactos[0].empresa === "Microsoft Ibérica" && h.Contactos[0].mensaje === "Otra consulta" && h.Contactos[0].id_lead === "id-segundo-lead" && h.Contactos[0].fecha_actualizacion === "2026-10-29T08:00:00+00:00");
t("no borra datos buenos con vacíos (cargo y teléfono se conservan)", h.Contactos[0].cargo === "CTO" && h.Contactos[0].telefono === "666323123");
t("conserva fecha_alta y ultimo_envio", h.Contactos[0].fecha_alta === "2026-10-27T09:03:28+00:00" && h.Contactos[0].ultimo_envio === "2026-10-28T10:00:00+00:00");
t("Historial: alta + actualización", h.Historial.map((x) => x.tipo).join() === "alta,actualización");
t("el mismo lead reenviado por la cola de reintentos no duplica el contacto", (await ejecutar(lead({ id: "id-segundo-lead", fecha: "2026-10-29T08:00:00+00:00", email: "crls.pasku@gmail.com" }), { hoja: h }), h.Contactos.length === 1));

console.log("\n4. Consentimiento comercial");
h = hojaVacia();
await ejecutar(lead({ email: "no@example.com", consentimiento_comercial: { acepta: false, fecha: "2026-10-27T09:00:00+00:00", texto: "", version_politica: "2026-10-26" } }), { hoja: h });
t("lead nuevo con «no» se queda en «no» (sin fecha ni texto de consentimiento)", h.Contactos[0].consentimiento_comercial === "no" && h.Contactos[0].fecha_consentimiento === "" && h.Contactos[0].texto_consentimiento_comercial === "");
const antiguo = lead({ email: "antiguo@example.com" }); delete antiguo.consentimiento_comercial;
await ejecutar(antiguo, { hoja: h });
t("lead antiguo sin el campo (anterior a la casilla) cuenta como «no»", h.Contactos[1].consentimiento_comercial === "no");
h = hojaVacia();
await ejecutar(lead(), { hoja: h });
await ejecutar(lead({ id: "otro", fecha: "2026-10-30T08:00:00+00:00", consentimiento_comercial: { acepta: false, fecha: "2026-10-30T08:00:00+00:00", texto: "", version_politica: "2026-10-26" } }), { hoja: h });
t("un «sí» existente NO se rebaja a «no» por un lead posterior (se conserva la fecha original)", h.Contactos[0].consentimiento_comercial === "sí" && h.Contactos[0].fecha_consentimiento === "2026-10-27T09:03:28+00:00" && h.Contactos[0].texto_consentimiento_comercial.startsWith("Quiero"));
t("el Historial lo deja anotado", /se conserva el «sí» anterior/.test(h.Historial[1].detalle));
h = hojaVacia();
await ejecutar(lead({ consentimiento_comercial: { acepta: false, fecha: "2026-10-26T06:30:25+00:00", texto: "", version_politica: "2026-10-26" } }), { hoja: h });
await ejecutar(lead({ id: "con-sí", fecha: "2026-10-27T09:03:28+00:00" }), { hoja: h });
t("un «no» existente pasa a «sí» cuando llega un lead con la casilla marcada", h.Contactos[0].consentimiento_comercial === "sí" && h.Contactos[0].fecha_consentimiento === "2026-10-27T09:03:28+00:00" && h.Contactos.length === 1);

console.log("\n5. Una baja no se reactiva");
h = hojaVacia();
h.Contactos.push({ ...f1, email: "baja@example.com", estado: "baja", fecha_baja: "2026-10-28T09:00:00+00:00", consentimiento_comercial: "sí", ultimo_envio: "2026-10-27T12:00:00+00:00" });
await ejecutar(lead({ email: "baja@example.com", id: "tras-baja", fecha: "2026-10-30T09:00:00+00:00" }), { hoja: h });
t("el contacto sigue en «baja», con su fecha_baja y ultimo_envio", h.Contactos.length === 1 && h.Contactos[0].estado === "baja" && h.Contactos[0].fecha_baja === "2026-10-28T09:00:00+00:00" && h.Contactos[0].ultimo_envio === "2026-10-27T12:00:00+00:00");
t("los datos de contacto sí se actualizan y el Historial lo anota", h.Contactos[0].id_lead === "tras-baja" && /sigue de baja/.test(h.Historial[0].detalle));

console.log("\n6. Firma mala, aviso y fallos");
h = hojaVacia(); r = await ejecutar(lead(), { hoja: h, firma: "mala" });
t("firma mala → 401, no se escribe nada en la hoja y no hay aviso", r.respuestas[0].codigo === 401 && h.Contactos.length === 0 && h.Historial.length === 0 && r.correos.length === 0);
r = await ejecutar(lead(), { hoja: h, firma: "ninguna" });
t("sin firma → 401 y no se toca la hoja", r.respuestas[0].codigo === 401 && h.Contactos.length === 0);
r = await ejecutar(lead(), { hoja: h, ts: String(Math.floor(Date.now() / 1000) - 3600) });
t("firma válida pero con 1 h de retraso (anti-replay) → 401", r.respuestas[0].codigo === 401 && r.respuestas[0].cuerpo.motivo === "timestamp" && h.Contactos.length === 0);
r = await ejecutar(lead({ email: "no-es-email" }), { hoja: h });
t("correo no válido → 401 y no se escribe nada", r.respuestas[0].codigo === 401 && h.Contactos.length === 0);
r = await ejecutar(lead(), { hoja: h, sheetsFalla: true });
t("si la hoja falla → 502 (la web reintenta por cron) y no se manda el aviso", r.respuestas[0].codigo === 502 && r.respuestas[0].cuerpo.motivo === "hoja" && r.correos.length === 0);
r = await ejecutar(lead(), { hoja: hojaVacia(), gmailFalla: true });
t("si falla el aviso por Gmail → 200 con aviso:false (la web manda su respaldo)", r.respuestas[0].codigo === 200 && r.respuestas[0].cuerpo.aviso === false);
r = await ejecutar(lead({ envio: { respaldo_enviado: true } }), { hoja: hojaVacia() });
t("si la web ya mandó el correo de respaldo no se repite el aviso (200, aviso:false)", r.respuestas[0].codigo === 200 && r.respuestas[0].cuerpo.aviso === false && r.correos.length === 0);
r = await ejecutar(lead(), { hoja: hojaVacia() });
t("camino normal: Gmail se ejecuta después de guardar en la hoja y antes de responder", r.pasos.indexOf("Añadir a Historial") < r.pasos.indexOf("Aviso a info@") && r.pasos.indexOf("Aviso a info@") < r.pasos.indexOf("Responder 200 (aviso enviado)"));

console.log(`\nResultado: ${ok} correctas, ${ko} fallidas (${ok + ko} comprobaciones)`);
process.exit(ko ? 1 : 0);

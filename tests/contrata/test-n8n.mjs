// Revisa los JSON de n8n y ejecuta los nodos Code en local. No llama a n8n ni a Google.
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const dir = new URL("../../integraciones/n8n/", import.meta.url);
const disp = JSON.parse(fs.readFileSync(new URL("sobtree-disponibilidad.json", dir), "utf8"));
const cont = JSON.parse(fs.readFileSync(new URL("sobtree-contrata.json", dir), "utf8"));
const texto = fs.readFileSync(new URL("sobtree-disponibilidad.json", dir), "utf8")
  + fs.readFileSync(new URL("sobtree-contrata.json", dir), "utf8");

let ko = 0;
const t = (nombre, ok) => {
  if (!ok) ko += 1;
  console.log(`  ${ok ? "✔" : "✘"} ${nombre}`);
};
const V = "Verificar firma y preparar";

t("disponibilidad inactiva", disp.active === false && disp.name === "Sobtree · Disponibilidad");
t("contrata inactiva", cont.active === false && cont.name === "Sobtree · Contrata");
t("sin claves ni instancia real", !/sk_|rk_|whsec_|@gmail\.com|sobtree\.app\.n8n\.cloud/.test(texto));
t("URL de ejemplo por defecto", texto.includes("https://ejemplo.invalid/api/contrata/disponibilidad.php"));
t("secreto placeholder", texto.includes("REEMPLAZAR_EN_N8N"));
t("sin calendarList", !/calendarList/.test(texto));
t("no queda rastro de HubSpot ni de deals", !/hubspot|hubapi|crm\.objects|deal/i.test(texto));
t("la configuración sale en modo simulación y el flujo de contrata no guarda las ejecuciones correctas (llevan el NIF)",
  disp.nodes.find((n) => n.name === "Configuración").parameters.jsCode.includes('const MODO = "simulacion"') && cont.nodes.find((n) => n.name === "Verificar firma y preparar").parameters.jsCode.includes("const MODO = 'simulacion'") && cont.settings.saveDataSuccessExecution === "none");

// ---- Calendarios: reales pero solo tras la rama de producción
const google = [...disp.nodes, ...cont.nodes].filter((n) => n.type === "n8n-nodes-base.googleCalendar");
t("nodos de Google Calendar habilitados pero solo en la rama de producción", google.length === 3 && google.every((n) => !n.disabled)
  && disp.connections["¿Simulación?"].main[1][0].node === "Google · Proyectos"
  && cont.connections["¿Rama real?"].main[0][0].node === "¿Es una venta?");
const ids = [...texto.matchAll(/CONFIGURAR_ID_CALENDARIO_[A-Z]+/g)].map((m) => m[0]);
t("solo los dos IDs placeholder", ids.includes("CONFIGURAR_ID_CALENDARIO_PROYECTOS") && ids.includes("CONFIGURAR_ID_CALENDARIO_BLOQUEOS"));
t("Contrata solo escribe en el calendario de Proyectos",
  cont.nodes.find((n) => n.name === "Evento en Proyectos").parameters.calendar.value === "CONFIGURAR_ID_CALENDARIO_PROYECTOS"
  && !JSON.stringify(cont).includes("CONFIGURAR_ID_CALENDARIO_BLOQUEOS"));
t("Bloqueos se lee una vez (executeOnce) y solo para fechas", disp.nodes.find((n) => n.name === "Google · Bloqueos").executeOnce === true);

// ---- Hoja
const COLS_VENTAS = ["fecha", "id_sesion_stripe", "empresa", "nif", "email", "producto", "importe_sin_iva", "iva", "total", "semana_reservada", "estado"];
const COLS_HIST = ["fecha", "email", "tipo", "campania", "detalle"];
const HOJA = "1EWlyQCodNmxIwOvljQuyM1ZOq1s7QlNZVkPEydyNizQ";
const cred = JSON.stringify({ googleSheetsOAuth2Api: { id: "REEMPLAZAR_ID_CREDENCIAL", name: "Google Sheets Sobtree (info@)" } });
const nodo = (n) => cont.nodes.find((x) => x.name === n);
const ventas = nodo("Añadir fila en Ventas");
t("«Añadir fila en Ventas»: Google Sheets sobre «Ventas» de «Sobtree · Contactos», habilitado, credencial de marcador de posición",
  ventas?.type === "n8n-nodes-base.googleSheets" && !ventas.disabled && ventas.parameters.sheetName.value === "Ventas" && ventas.parameters.documentId.value === HOJA && JSON.stringify(ventas.credentials) === cred);
t("escribe las 11 columnas de Ventas, NIF incluido, sin duplicar por id_sesion_stripe, en RAW",
  ventas.parameters.operation === "appendOrUpdate" && JSON.stringify(Object.keys(ventas.parameters.columns.value)) === JSON.stringify(COLS_VENTAS)
  && JSON.stringify(ventas.parameters.columns.matchingColumns) === '["id_sesion_stripe"]' && ventas.parameters.options.cellFormat === "RAW");
for (const n of ["Historial: venta", "Historial: reembolso"]) {
  const h = nodo(n);
  t(`«${n}» escribe las columnas de Historial y coincide por detalle`, JSON.stringify(Object.keys(h.parameters.columns.value)) === JSON.stringify(COLS_HIST) && JSON.stringify(h.parameters.columns.matchingColumns) === '["detalle"]' && h.parameters.sheetName.value === "Historial" && JSON.stringify(h.credentials) === cred);
}
const reemb = nodo("Marcar reembolso en Ventas");
t("el reembolso solo cambia la columna estado de la fila de esa sesión", reemb.parameters.operation === "update" && JSON.stringify(Object.keys(reemb.parameters.columns.value)) === '["id_sesion_stripe","estado"]' && reemb.parameters.columns.matchingColumns[0] === "id_sesion_stripe");
const c = cont.connections;
t("orden de la venta: Ventas → Historial → Evento → Aviso → Respuesta",
  c["Añadir fila en Ventas"].main[0][0].node === "Historial: venta" && c["Historial: venta"].main[0][0].node === "Evento en Proyectos"
  && c["Evento en Proyectos"].main[0][0].node === "Aviso a info@ (venta)" && c["Aviso a info@ (venta)"].main[0][0].node === "Responder 200 venta");
t("si falla Calendario o Gmail el flujo sigue; si falla Ventas o Historial termina en error y la web reintenta",
  nodo("Evento en Proyectos").onError === "continueRegularOutput" && nodo("Aviso a info@ (venta)").onError === "continueRegularOutput" && !ventas.onError && !nodo("Historial: venta").onError);
t("el evento es de día completo y su descripción lleva la sesión de Stripe", nodo("Evento en Proyectos").parameters.additionalFields.allday === "yes" && /evento\.descripcion/.test(nodo("Evento en Proyectos").parameters.additionalFields.description));

const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const codigo = (wf, n) => wf.nodes.find((x) => x.name === n).parameters.jsCode;
const run = async (js, item, ctx = {}) => new AsyncFn("$input", "$", "require", js).call(
  { helpers: { getBinaryDataBuffer: async () => Buffer.from(item?.raw || "", "utf8") } },
  { first: () => ({ json: item || { headers: {} } }) },
  (nombre) => ctx[nombre],
  require
);

// ---- Disponibilidad
const [calc] = await run(codigo(disp, "Calcular plazas"), {
  modo: "simulacion", calendario_proyectos: "CONFIGURAR_ID_CALENDARIO_PROYECTOS", calendario_bloqueos: "CONFIGURAR_ID_CALENDARIO_BLOQUEOS",
  max_proyectos_simultaneos: 1, plazo_minimo_dias_laborables: 3, semanas_visibles: 4, hoy: "2026-10-27",
  proyectos: [{ inicio: "2026-11-02", fin: "2026-11-07", sesion: "cs_test_abc" }], bloqueos: [{ inicio: "2026-11-16", fin: "2026-11-21" }],
  url_publicacion: "https://ejemplo.invalid/api/contrata/disponibilidad.php"
});
t("calcular devuelve 4 semanas, aplica proyecto y bloqueo", calc.json.cuerpo.semanas.length === 4 && calc.json.cuerpo.semanas[0].plazas === 0 && calc.json.cuerpo.semanas[2].bloqueada === true && calc.json.cuerpo.semanas[1].plazas === 1);
t("no publica con el placeholder", calc.json.enviar === false && calc.json.firma === "");
let lanzo = false;
try { await run(codigo(disp, "Calcular plazas"), { modo: "produccion", calendario_proyectos: "x", calendario_bloqueos: "y", max_proyectos_simultaneos: 1, plazo_minimo_dias_laborables: 3, semanas_visibles: 4, hoy: "2026-10-27", url_publicacion: "https://ejemplo.invalid/x" }); } catch (e) { lanzo = true; }
t("en producción sin secreto ni URL real, calcular falla en vez de no publicar en silencio", lanzo);

const cfg = { modo: "produccion", calendario_proyectos: "p", calendario_bloqueos: "b", hoy: "2026-10-27" };
const evs = (arr) => ({ all: () => arr.map((json) => ({ json })) });
const [mapa] = await run(codigo(disp, "Mapear calendarios"), {}, {
  "Configuración": { first: () => ({ json: cfg }) },
  "Google · Proyectos": evs([
    { status: "confirmed", start: { date: "2026-11-02" }, end: { date: "2026-11-07" }, description: "Sesión Stripe: cs_test_abc123\nSemana de inicio", summary: "Diagnóstico · Acme" },
    { status: "confirmed", start: { dateTime: "2026-11-09T10:00:00+01:00" }, end: { dateTime: "2026-11-09T11:00:00+01:00" } },
    { status: "cancelled", start: { date: "2026-11-23" }, end: { date: "2026-11-28" } },
    {}
  ]),
  "Google · Bloqueos": evs([{ status: "confirmed", start: { date: "2026-11-16" }, end: { date: "2026-11-21" }, summary: "Vacaciones privadas" }, {}])
});
t("mapear: evento de día completo con sesión, evento con hora (+1 día de fin), cancelado y vacío ignorados",
  JSON.stringify(mapa.json.proyectos) === JSON.stringify([{ inicio: "2026-11-02", fin: "2026-11-07", sesion: "cs_test_abc123" }, { inicio: "2026-11-09", fin: "2026-11-10" }]));
t("mapear: los bloqueos solo llevan fechas (nada de títulos)", JSON.stringify(mapa.json.bloqueos) === JSON.stringify([{ inicio: "2026-11-16", fin: "2026-11-21" }]) && !JSON.stringify(mapa.json).includes("Vacaciones"));

// ---- Contrata
const src = fs.readFileSync(new URL("contrata-verificar.js", dir), "utf8");
const SECRET = "secreto-de-prueba-contrata";
const preparar = (extra = {}) => src.replace("const SECRET = 'REEMPLAZAR_EN_N8N';", `const SECRET = '${SECRET}';`)
  .replace("const MODO = 'simulacion';", `const MODO = '${extra.modo || "simulacion"}';`).replace("const LIVE = false;", `const LIVE = ${extra.live ? "true" : "false"};`);
const firmar = (aviso) => {
  const raw = execFileSync("php", ["-r", "echo json_encode(json_decode(stream_get_contents(STDIN), true), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);"], { input: JSON.stringify(aviso) }).toString();
  const ts = String(Math.floor(Date.now() / 1000));
  return { headers: { "x-sobtree-timestamp": ts, "x-sobtree-signature": "sha256=" + crypto.createHmac("sha256", SECRET).update(`${ts}.${raw}`).digest("hex") }, raw };
};
const venta = (cuerpo = {}) => ({
  id: "11111111-2222-4333-8444-555555555555", tipo: "checkout.session.completed", event_id: "evt_test_n8n",
  cuerpo: { sesion: "cs_test_abc", empresa: "Acme SL", semana_lunes: "2026-11-09", producto: "diagnostico", email: "Cliente@Acme.es",
    importe_base_centimos: 49000, iva_porcentaje: 21, importe_total_centimos: 59290, nif: "B12345674", nif_coincide: true, nif_verificado: false,
    alerta_facturacion: "", factura: "in_test_1", livemode: false, ...cuerpo }
});
const [sim] = await run(preparar(), firmar(venta()));
t("simulación: firma válida y nada se escribe", sim.json.valido === true && sim.json.venta_hoja === "simulada" && sim.json.evento_calendario === "simulado" && sim.json.simulado === true && sim.json.calendarios_consultados.length === 0);
const [prod] = await run(preparar({ modo: "produccion" }), firmar(venta()));
const v = prod.json.venta;
t("producción: fila de Ventas con sesión, empresa, correo en minúsculas, producto y semana", prod.json.accion === "venta" && v.id_sesion_stripe === "cs_test_abc" && v.empresa === "Acme SL" && v.email === "cliente@acme.es" && v.producto === "diagnostico" && v.semana_reservada === "2026-11-09");
t("el NIF del aviso llega a la fila", v.nif === "B12345674");
t("importes en euros: 490 sin IVA + 102,90 de IVA = 592,90", v.importe_sin_iva === 490 && v.iva === 102.9 && v.total === 592.9);
t("estado «pagada» sin alerta, fecha ISO, y las 11 columnas exactas", v.estado === "pagada" && !isNaN(Date.parse(v.fecha)) && JSON.stringify(Object.keys(v)) === JSON.stringify(COLS_VENTAS));
t("Historial con las 5 columnas y sin NIF", JSON.stringify(Object.keys(prod.json.historial)) === JSON.stringify(COLS_HIST) && prod.json.historial.tipo === "venta" && !JSON.stringify(prod.json.historial).includes("B12345674") && !prod.json.aviso_email.texto.includes("B12345674"));
t("evento: lunes a viernes (fin exclusivo el sábado), descripción con la sesión", prod.json.evento.inicio === "2026-11-09" && prod.json.evento.fin === "2026-11-14" && prod.json.evento.descripcion.includes("cs_test_abc"));
const [rev] = await run(preparar({ modo: "produccion" }), firmar(venta({ alerta_facturacion: "nif_distinto", nif_coincide: false })));
t("con alerta de facturación la fila queda «revisar» y el aviso lo dice", rev.json.venta.estado === "revisar" && /REVISAR/.test(rev.json.aviso_email.asunto));
const [live] = await run(preparar({ modo: "produccion" }), firmar(venta({ livemode: true })));
t("un aviso live no escribe en un flujo de test (ni al revés)", live.json.valido === false && live.json.motivo === "modo");
const [liveOk] = await run(preparar({ modo: "produccion", live: true }), firmar(venta({ livemode: true, sesion: "cs_live_abc" })));
t("con LIVE = true acepta el aviso live", liveOk.json.valido === true && liveOk.json.venta.id_sesion_stripe === "cs_live_abc");
const [sinSes] = await run(preparar({ modo: "produccion" }), firmar(venta({ sesion: "no-es-una-sesion" })));
t("una sesión con formato raro se rechaza", sinSes.json.valido === false);
const [ref] = await run(preparar({ modo: "produccion" }), firmar({ id: "x", tipo: "charge.refunded", event_id: "evt_test_ref", cuerpo: { sesion: "cs_test_abc", estado: "reembolsada", importe_reembolsado_centimos: 59290, livemode: false } }));
t("reembolso total: estado «reembolsada» en la sesión y línea de Historial", ref.json.accion === "reembolso" && ref.json.estado_venta.estado === "reembolsada" && ref.json.estado_venta.id_sesion_stripe === "cs_test_abc" && ref.json.historial.tipo === "reembolso" && /592/.test(ref.json.historial.detalle));
const [par] = await run(preparar({ modo: "produccion" }), firmar({ id: "x", tipo: "charge.refunded", event_id: "evt_test_ref2", cuerpo: { sesion: "cs_test_abc", estado: "reembolso_parcial", importe_reembolsado_centimos: 10000, livemode: false } }));
t("reembolso parcial: estado «reembolso_parcial»", par.json.estado_venta.estado === "reembolso_parcial");
const [otro] = await run(preparar({ modo: "produccion" }), firmar({ id: "x", tipo: "checkout.session.expired", event_id: "evt_test_exp", cuerpo: {} }));
t("un tipo que n8n no gestiona se acusa sin escribir", otro.json.valido === true && otro.json.accion === "ignorar");
const buena = firmar(venta());
const [malo] = await run(preparar(), { headers: { ...buena.headers, "x-sobtree-signature": "sha256=" + "0".repeat(64) }, raw: buena.raw });
t("firma falsa rechazada", malo.json.valido === false);
const [placeholder] = await run(src, buena);
t("sin secreto pegado rechaza", placeholder.json.valido === false);

if (ko > 0) process.exit(1);
console.log("ok");

// Revisa los JSON de n8n y ejecuta los nodos Code en local. No llama a n8n.
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

t("disponibilidad inactiva", disp.active === false && disp.name === "Sobtree · Disponibilidad");
t("contrata inactiva", cont.active === false && cont.name === "Sobtree · Contrata");
t("sin claves ni instancia real", !/sk_|rk_|whsec_|@gmail\.com|sobtree\.app\.n8n\.cloud/.test(texto));
t("URL de ejemplo", texto.includes("https://ejemplo.invalid/api/contrata/disponibilidad.php"));
t("secreto placeholder", texto.includes("REEMPLAZAR_EN_N8N"));

const google = [...disp.nodes, ...cont.nodes].filter((n) => n.type === "n8n-nodes-base.googleCalendar");
t("nodos de Google deshabilitados", google.length >= 2 && google.every((n) => n.disabled === true));
t("sin calendarList", !/calendarList/.test(texto));
const ids = [...texto.matchAll(/CONFIGURAR_ID_CALENDARIO_[A-Z]+/g)].map((m) => m[0]);
t("solo los dos IDs placeholder", ids.includes("CONFIGURAR_ID_CALENDARIO_PROYECTOS") && ids.includes("CONFIGURAR_ID_CALENDARIO_BLOQUEOS"));

const ventas = cont.nodes.find((n) => n.name === "Añadir fila en Ventas");
const COLS_VENTAS = ["fecha", "id_sesion_stripe", "empresa", "nif", "email", "producto", "importe_sin_iva", "iva", "total", "semana_reservada", "estado"];
t("«Añadir fila en Ventas» existe y está deshabilitado", !!ventas && ventas.disabled === true);
t("es un nodo de Google Sheets sobre la pestaña «Ventas» de la hoja «Sobtree · Contactos»",
  ventas?.type === "n8n-nodes-base.googleSheets" && ventas.parameters.sheetName.value === "Ventas" && ventas.parameters.documentId.value === "1EWlyQCodNmxIwOvljQuyM1ZOq1s7QlNZVkPEydyNizQ");
t("la credencial es un marcador de posición (REEMPLAZAR_ID_CREDENCIAL), sin valores",
  JSON.stringify(ventas?.credentials) === JSON.stringify({ googleSheetsOAuth2Api: { id: "REEMPLAZAR_ID_CREDENCIAL", name: "Google Sheets Sobtree (info@)" } }));
t("escribe las columnas de Ventas (todas menos nif, que se rellena a mano y no se borra en un reintento) y no duplica por id_sesion_stripe (appendOrUpdate)",
  ventas?.parameters.operation === "appendOrUpdate" && JSON.stringify(Object.keys(ventas.parameters.columns.value)) === JSON.stringify(COLS_VENTAS.filter((c) => c !== "nif")) && JSON.stringify(ventas.parameters.columns.matchingColumns) === '["id_sesion_stripe"]');
t("cellFormat RAW (un nombre de empresa que empiece por «=» no se interpreta como fórmula)", ventas?.parameters.options.cellFormat === "RAW");
t("el flujo mantiene el orden: ¿Rama real? → Añadir fila en Ventas → Evento → Correo",
  cont.connections["¿Rama real?"].main[0][0].node === "Añadir fila en Ventas" && cont.connections["Añadir fila en Ventas"].main[0][0].node === "Evento en Proyectos (DESHABILITADO)");
t("no queda rastro de HubSpot ni de deals en los JSON", !/hubspot|hubapi|crm\.objects|deal/i.test(texto));

const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const nodo = (wf, nombre) => wf.nodes.find((n) => n.name === nombre).parameters.jsCode;
const run = async (js, item) => new AsyncFn("$input", "require", js).call(
  { helpers: { getBinaryDataBuffer: async () => Buffer.from(item?.raw || "", "utf8") } },
  { first: () => ({ json: item || { headers: {} } }) },
  require
);

const [calc] = await run(nodo(disp, "Calcular plazas"), {
  modo: "simulacion",
  calendario_proyectos: "CONFIGURAR_ID_CALENDARIO_PROYECTOS",
  calendario_bloqueos: "CONFIGURAR_ID_CALENDARIO_BLOQUEOS",
  max_proyectos_simultaneos: 1,
  plazo_minimo_dias_laborables: 3,
  semanas_visibles: 4,
  hoy: "2026-10-27",
  proyectos: [{ inicio: "2026-11-02", fin: "2026-11-07", sesion: "cs_test_abc" }],
  bloqueos: [{ inicio: "2026-11-16", fin: "2026-11-21" }],
  url_publicacion: "https://ejemplo.invalid/api/contrata/disponibilidad.php"
});
t("calcular devuelve 4 semanas", calc.json.cuerpo.semanas.length === 4);
t("calcular aplica proyecto y bloqueo", calc.json.cuerpo.semanas[0].plazas === 0 && calc.json.cuerpo.semanas[2].bloqueada === true && calc.json.cuerpo.semanas[1].plazas === 1);
t("no publica con el placeholder", calc.json.enviar === false && calc.json.firma === "");

const src = fs.readFileSync(new URL("contrata-verificar.js", dir), "utf8");
const SECRET = "secreto-de-prueba-contrata";
const conSecreto = src.replace("const SECRET = 'REEMPLAZAR_EN_N8N';", `const SECRET = '${SECRET}';`);
const aviso = {
  id: "11111111-2222-4333-8444-555555555555",
  tipo: "checkout.session.completed",
  event_id: "evt_test_n8n",
  cuerpo: {
    sesion: "cs_test_abc",
    empresa: "Acme SL",
    semana_lunes: "2026-11-09",
    producto: "diagnostico",
    email: "Cliente@Acme.es",
    importe_base_centimos: 49000,
    iva_porcentaje: 21,
    importe_total_centimos: 59290,
    nif_verificado: false,
    alerta_facturacion: "revisar_antes_de_facturar"
  }
};
const raw = execFileSync("php", ["-r", "echo json_encode(json_decode(stream_get_contents(STDIN), true), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);"], { input: JSON.stringify(aviso) }).toString();
const ts = String(Math.floor(Date.now() / 1000));
const firma = "sha256=" + crypto.createHmac("sha256", SECRET).update(`${ts}.${raw}`).digest("hex");
const headers = { "x-sobtree-timestamp": ts, "x-sobtree-signature": firma };
const [bueno] = await run(conSecreto, { headers, raw });
t("firma válida simulada", bueno.json.valido === true && bueno.json.venta_hoja === "simulada" && bueno.json.email === "no_enviado" && bueno.json.calendarios_consultados.length === 0);
const v = bueno.json.venta;
t("la fila de Ventas lleva sesión, empresa, correo en minúsculas, producto y semana", v.id_sesion_stripe === "cs_test_abc" && v.empresa === "Acme SL" && v.email === "cliente@acme.es" && v.producto === "diagnostico" && v.semana_reservada === "2026-11-09");
t("importes en euros: 490 sin IVA + 102,90 de IVA = 592,90", v.importe_sin_iva === 490 && v.iva === 102.9 && v.total === 592.9);
t("estado «pagada», fecha ISO y NIF vacío (el aviso no lo lleva)", v.estado === "pagada" && !isNaN(Date.parse(v.fecha)) && v.nif === "");
t("la fila tiene exactamente las 11 columnas de la hoja", JSON.stringify(Object.keys(v)) === JSON.stringify(COLS_VENTAS));
t("alerta de facturación", bueno.json.nif_verificado === false && bueno.json.alerta_facturacion === "revisar_antes_de_facturar");
const [malo] = await run(conSecreto, { headers: { ...headers, "x-sobtree-signature": "sha256=" + "0".repeat(64) }, raw });
t("firma falsa rechazada", malo.json.valido === false);
const [placeholder] = await run(src, { headers, raw });
t("sin secreto pegado rechaza", placeholder.json.valido === false);

if (ko > 0) process.exit(1);
console.log("ok");

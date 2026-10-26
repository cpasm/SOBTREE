// Prueba local de los nodos Code de la newsletter. Sin red.
// Uso: node tests/newsletter/test-n8n-code.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const SECRET = "secreto-de-prueba";
const TEXTO = "Acepto recibir la newsletter de Sobtree por email y he leído la política de privacidad.";
const root = new URL("../../", import.meta.url);
const leer = (rel) => fs.readFileSync(new URL(rel, root), "utf8");
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const cargar = (rel) => leer(rel).replace("const SECRET = 'REEMPLAZAR_EN_N8N';", `const SECRET = '${SECRET}';`);

const alta = {
  v: 1, id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", fecha: "2026-10-26T07:00:00+00:00",
  email: "Ana@Example.com", consentimiento: true, consent_timestamp: "2026-10-26T07:00:00+00:00",
  origen: "articulo:como-empezar-con-ia-en-tu-pyme", consent_text: TEXTO + " <b>",
  version_politica: "2026-10-26",
};
const raw = execFileSync("php", ["-r", "echo json_encode(json_decode(stream_get_contents(STDIN), true), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);"], { input: JSON.stringify(alta) }).toString();
const ts = String(Math.floor(Date.now() / 1000));
const sig = "sha256=" + execFileSync("php", ["-r", `require "public/lib/leads.php"; echo leads_sign($argv[1], $argv[2], stream_get_contents(STDIN));`, SECRET, ts], { input: raw }).toString();

const runFirma = (cuerpo, headers) => new AsyncFn("$input", "require", cargar("integraciones/n8n/verificar-newsletter.js")).call(
  { helpers: { getBinaryDataBuffer: async () => Buffer.from(cuerpo, "utf8") } },
  { first: () => ({ json: { headers } }) },
  require);
const runEnlace = (query) => new AsyncFn("$input", "require", cargar("integraciones/n8n/validar-confirmacion.js")).call(
  {}, { first: () => ({ json: { query } }) }, require);

let ok = 0, ko = 0;
const t = (name, cond) => { cond ? ok++ : ko++; console.log(`  ${cond ? "✔" : "✘"} ${name}`); };

const [good] = await runFirma(raw, { "x-sobtree-timestamp": ts, "x-sobtree-signature": sig });
t("firma PHP verificada", good.json.valido === true);
t("email normalizado y doble confirmación activa", good.json.email === "ana@example.com" && good.json.doble_confirmacion === true);
t("suscripción Marketing Information, sin marcador", good.json.subscription_id === "3927875333" && good.json.nombre_suscripcion === "Marketing Information");
t("como mucho la propiedad de consentimiento, con fecha, origen y versión", good.json.props.sobtree_newsletter_consentimiento === "2026-10-26T07:00:00+00:00 | articulo:como-empezar-con-ia-en-tu-pyme | 2026-10-26" && !("sobtree_newsletter_confirmado" in good.json.props) && Object.keys(good.json.props).length === 2);
t("la nota guarda el texto y lo escapa", good.json.nota_html.includes("política de privacidad") && good.json.nota_html.includes("&lt;b&gt;"));
t("explicación legal con CONSENT_WITH_NOTICE y el texto", good.json.legal_basis.includes("CONSENT_WITH_NOTICE") && good.json.legal_basis.includes("política de privacidad"));
t("hay enlace de confirmación y todavía no se da por suscrito", good.json.enlace.includes("/webhook/sobtree-newsletter-confirmar?") && good.json.nota_html.includes("todavía no está suscrito"));

const q = Object.fromEntries(new URL(good.json.enlace).searchParams.entries());
const [conf] = await runEnlace(q);
t("el enlace firmado valida", conf.json.valido === true && conf.json.email === "ana@example.com");
t("al confirmar se guarda la fecha y no se inventan más propiedades", /^\d+$/.test(conf.json.props.sobtree_newsletter_confirmado) && Object.keys(conf.json.props).length === 2);
t("la nota de confirmación repite el texto aceptado", conf.json.nota_html.includes("&lt;b&gt;") && conf.json.legal_basis.includes("CONSENT_WITH_NOTICE"));

q.sig = "0".repeat(64);
const [mala] = await runEnlace(q);
t("firma del enlace alterada → no válido", mala.json.valido === false && mala.json.motivo === "firma");
q.sig = Object.fromEntries(new URL(good.json.enlace).searchParams.entries()).sig;
q.exp = String(Math.floor(Date.now() / 1000) - 3600);
const [viejo] = await runEnlace(q);
t("enlace caducado → no válido", viejo.json.valido === false && viejo.json.motivo === "caducado");

const [bad] = await runFirma(raw, { "x-sobtree-timestamp": ts, "x-sobtree-signature": "sha256=" + "0".repeat(64) });
t("firma del alta falsa → no válido", bad.json.valido === false);
const old = String(Number(ts) - 3600);
const sigOld = "sha256=" + execFileSync("php", ["-r", `require "public/lib/leads.php"; echo leads_sign($argv[1], $argv[2], stream_get_contents(STDIN));`, SECRET, old], { input: raw }).toString();
const [stale] = await runFirma(raw, { "x-sobtree-timestamp": old, "x-sobtree-signature": "sha256=" + sigOld });
t("timestamp de hace 1 h → no válido", stale.json.valido === false && stale.json.motivo === "timestamp");

const sinSecreto = new AsyncFn("$input", "require", leer("integraciones/n8n/verificar-newsletter.js"));
const [unset] = await sinSecreto.call(
  { helpers: { getBinaryDataBuffer: async () => Buffer.from(raw) } },
  { first: () => ({ json: { headers: { "x-sobtree-timestamp": ts, "x-sobtree-signature": sig } } }) },
  require);
t("sin secreto configurado → rechaza", unset.json.valido === false);

const json = leer("integraciones/n8n/sobtree-newsletter.json");
const wf = JSON.parse(json);
t("workflow inactivo", wf.active === false);
t("workflow de errores asignado", wf.settings.errorWorkflow === "alJvCL7d1kwPIipg");
t("webhooks de alta y de confirmación", json.includes('"path": "sobtree-newsletter"') && json.includes('"path": "sobtree-newsletter-confirmar"'));
t("credencial HubSpot Service Key y Gmail account", json.includes("HubSpot Service Key account") && json.includes("hubspotAppToken") && json.includes("Gmail account"));
t("API de suscripción v3 y base legal", json.includes("/communication-preferences/v3/subscribe") && json.includes("CONSENT_WITH_NOTICE"));
t("el id de suscripción va en claro y no hay marcador", json.includes("3927875333") && !json.includes("REEMPLAZAR_SUBSCRIPTION_ID"));
t("el marcador del secreto sigue en los dos nodos", json.split("REEMPLAZAR_EN_N8N").length >= 3);
t("flag de doble confirmación activo en el JSON", json.includes("const DOBLE_CONFIRMACION = true;"));

console.log(`\nResultado: ${ok} correctas, ${ko} fallidas`);
process.exit(ko ? 1 : 0);

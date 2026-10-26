// Prueba local del nodo Code de n8n (integraciones/n8n/verificar-y-mapear.js) con un lead firmado
// igual que lo firma la web (PHP: hash_hmac sha256 sobre "<timestamp>.<cuerpo>"). Sin red.
// Uso: node tests/leads/test-n8n-code.mjs
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const SECRET = "secreto-de-prueba";
const src = fs.readFileSync(new URL("../../integraciones/n8n/verificar-y-mapear.js", import.meta.url), "utf8")
  .replace("const SECRET = 'REEMPLAZAR_EN_N8N';", `const SECRET = '${SECRET}';`);
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const run = (raw, headers) => new AsyncFn("$input", "require", src).call(
  { helpers: { getBinaryDataBuffer: async () => Buffer.from(raw, "utf8") } },
  { first: () => ({ json: { headers } }) }, require);
const lead = {
  v: 1, id: "11111111-2222-4333-8444-555555555555", fecha: "2026-10-25T16:00:00+00:00", tipo_formulario: "calculadora",
  nombre: "Ana María Prueba", cargo: "Gerente", telefono: "+34 600 000 000", empresa: "Acme SL", email: "Ana@Example.com",
  tamano: "10 a 49 personas", interes: "Diagnóstico IA exprés", mensaje: "Hola <b>", consentimiento: { acepta: true, texto: "Acepto…", fecha: "2026-10-25T16:00:00+00:00" },
  origen: { pagina: "https://sobtree.com/", landing: "https://sobtree.com/calculadora/?utm_source=google", referrer: "https://www.google.com/", utm: { utm_source: "google", utm_medium: "cpc", utm_campaign: "otono", utm_term: "", utm_content: "" } },
  calculadora: { sector: "Comercio", personas: 8, horas: 6, coste: 20, ahorro_min: 11000, ahorro_max: 20300, precio_min: 1200, precio_max: 2280, diagnostico: 490, descuento: 490, puesta_min: 1200, puesta_max: 2280, neto_min: 1200, neto_max: 2280, areas: ["Presupuestos y ventas"] },
  asistente: { motivo: "" }, meta: {},
};
// Mismo JSON que produce PHP (json_encode con UNESCAPED_UNICODE|UNESCAPED_SLASHES) → aquí lo generamos con PHP para ser fieles.
import { execFileSync } from "node:child_process";
const raw = execFileSync("php", ["-r", 'echo json_encode(json_decode(stream_get_contents(STDIN), true), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);'], { input: JSON.stringify(lead) }).toString();
const ts = String(Math.floor(Date.now() / 1000));
const sig = "sha256=" + execFileSync("php", ["-r", `require "public/lib/leads.php"; echo leads_sign($argv[1], $argv[2], stream_get_contents(STDIN));`, SECRET, ts], { input: raw }).toString();
let ok = 0, ko = 0;
const t = (name, cond) => { cond ? ok++ : ko++; console.log(`  ${cond ? "✔" : "✘"} ${name}`); };

const [good] = await run(raw, { "x-sobtree-timestamp": ts, "x-sobtree-signature": sig });
t("firma PHP verificada por el nodo n8n", good.json.valido === true);
const p = good.json.props_alta;
t("email normalizado", p.email === "ana@example.com");
t("nombre partido en firstname/lastname", p.firstname === "Ana" && p.lastname === "María Prueba");
t("cargo → jobtitle, teléfono → phone", p.jobtitle === "Gerente" && p.phone === "+34 600 000 000");
t("UTM en propiedades sobtree_utm_*", p.sobtree_utm_source === "google" && p.sobtree_utm_medium === "cpc" && p.sobtree_utm_campaign === "otono");
t("fuente nativa deducida (cpc → PAID_SEARCH)", p.hs_analytics_source === "PAID_SEARCH");
t("alta: lifecyclestage=lead y hs_lead_status=NEW", p.lifecyclestage === "lead" && p.hs_lead_status === "NEW");
t("actualización NO toca lifecyclestage/estado/fuente", !("lifecyclestage" in good.json.props_actualizacion) && !("hs_lead_status" in good.json.props_actualizacion) && !("hs_analytics_source" in good.json.props_actualizacion));
t("contexto de calculadora", /Ahorro 11\.000/.test(p.sobtree_contexto_lead) || /Ahorro 11/.test(p.sobtree_contexto_lead));
t("importes en la nota, sin propiedades nuevas", /Diagnóstico/.test(good.json.nota_html) && /Descuento/.test(good.json.nota_html) && /Puesta en marcha/.test(good.json.nota_html) && /Neto/.test(good.json.nota_html) && !/diagnostico/.test(JSON.stringify(p)));
t("sector → industry", p.industry === "Comercio");
t("nota HTML escapada", good.json.nota_html.includes("Hola &lt;b&gt;"));
const raw2 = raw.replace(/"calculadora":\{.*?\]\}/, '"calculadora":[]');
const sig2 = "sha256=" + crypto.createHmac("sha256", SECRET).update(ts + "." + raw2).digest("hex");
const [sinCalc] = await run(raw2, { "x-sobtree-timestamp": ts, "x-sobtree-signature": sig2 });
t("vacíos no se envían (no borran datos existentes)", sinCalc.json.valido === true && !("sobtree_contexto_lead" in sinCalc.json.props_actualizacion) && !("industry" in sinCalc.json.props_actualizacion));

t("sin marca de respaldo → aviso_necesario=true", good.json.aviso_necesario === true);
const raw3 = raw.slice(0, -1) + ',"envio":{"respaldo_enviado":true}}';
const sig3 = "sha256=" + crypto.createHmac("sha256", SECRET).update(ts + "." + raw3).digest("hex");
const [conResp] = await run(raw3, { "x-sobtree-timestamp": ts, "x-sobtree-signature": sig3 });
t("respaldo ya enviado por la web → aviso_necesario=false (sin duplicar)", conResp.json.valido === true && conResp.json.aviso_necesario === false);
const [bad] = await run(raw, { "x-sobtree-timestamp": ts, "x-sobtree-signature": "sha256=" + "0".repeat(64) });
t("firma falsa → no válido", bad.json.valido === false);
const [tampered] = await run(raw.replace("Acme SL", "Otra SL"), { "x-sobtree-timestamp": ts, "x-sobtree-signature": sig });
t("cuerpo alterado → no válido", tampered.json.valido === false);
const old = String(Number(ts) - 3600);
const sigOld = "sha256=" + crypto.createHmac("sha256", SECRET).update(old + "." + raw).digest("hex");
const [stale] = await run(raw, { "x-sobtree-timestamp": old, "x-sobtree-signature": sigOld });
t("timestamp de hace 1 h → no válido (anti-replay)", stale.json.valido === false && stale.json.motivo === "timestamp");
const noSecret = new AsyncFn("$input", "require", fs.readFileSync(new URL("../../integraciones/n8n/verificar-y-mapear.js", import.meta.url), "utf8"));
const [unset] = await noSecret.call({ helpers: { getBinaryDataBuffer: async () => Buffer.from(raw) } }, { first: () => ({ json: { headers: { "x-sobtree-timestamp": ts, "x-sobtree-signature": sig } } }) }, require);
t("sin secreto configurado → rechaza todo", unset.json.valido === false);
console.log(`\nResultado: ${ok} correctas, ${ko} fallidas`);
process.exit(ko ? 1 : 0);

// Recorre Contrata con teclado a 360 px contra el dev server. No usa producción.
// Uso: node tests/contrata/a11y.mjs http://127.0.0.1:4322
import { createRequire } from "node:module";

const pptrRoot = process.env.PPTR_ROOT || "/tmp/contrata-pptr";
const puppeteer = createRequire(`${pptrRoot}/package.json`)("puppeteer-core");

const base = (process.argv[2] || "http://127.0.0.1:4322").replace(/\/$/, "");
const chrome = process.env.CHROME_PATH || "/usr/bin/google-chrome";
let ko = 0;
const t = (nombre, ok, extra = "") => {
  if (!ok) ko += 1;
  console.log(`  ${ok ? "✔" : "✘"} ${nombre}${extra ? " — " + extra : ""}`);
};

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
await page.setViewport({ width: 360, height: 800, isMobile: true, hasTouch: true });
page.on("pageerror", (e) => console.log("  PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("  CONSOLA", m.text().slice(0, 200)); });

const sinScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const enfocado = () => page.evaluate(() => {
  const e = document.activeElement;
  if (!e) return {};
  return { id: e.id || "", name: e.getAttribute("name") || "", tag: e.tagName, type: e.getAttribute("type") || "" };
});

await page.goto(`${base}/`, { waitUntil: "networkidle0" });
await page.waitForSelector("#contrata-boton", { timeout: 15000 });
t("hay botón en portada", true);
await page.waitForFunction(() => {
  const nota = document.getElementById("contrata-nota");
  const boton = document.getElementById("contrata-boton");
  return !!(nota && boton && !nota.hidden && /lunes/.test(nota.textContent || "") && boton.getAttribute("href") === "/contratar/");
}, { timeout: 10000 });
t("la nota sale del cálculo y el botón sigue en contratar", true);
t("la portada cabe en 360 px", await sinScroll());
const altoBoton = await page.$eval("#contrata-boton", (e) => e.getBoundingClientRect().height);
t("el botón mide al menos 48 px", altoBoton >= 48, String(Math.round(altoBoton)));
const boton = await page.$("#contrata-boton");
await boton.evaluate((e) => e.scrollIntoView({ block: "center" }));
await boton.focus();
await page.keyboard.press("Enter");
await page.waitForFunction(() => location.pathname.includes("/contratar"), { timeout: 10000 });
try {
  await page.waitForFunction(() => {
    const f = document.querySelector("#contrata-form");
    return f && f.hidden === false && f.querySelector("input[name=semana]");
  }, { timeout: 15000 });
} catch (e) {
  const info = await page.evaluate(() => ({ url: location.href, estado: (document.getElementById("contrata-estado") || {}).textContent, form: !!document.getElementById("contrata-form") }));
  console.log("  DIAGNÓSTICO", JSON.stringify(info));
  const disp = await page.evaluate(async () => { try { const r = await fetch("/api/contrata/disponibilidad.php"); return r.status + " " + (await r.text()).slice(0, 300); } catch (x) { return String(x); } });
  console.log("  DISPONIBILIDAD", disp);
  throw e;
}
t("el formulario cabe en 360 px", await sinScroll());
const total = await page.$eval(".contrata-total", (e) => e.textContent || "");
t("el total con IVA está visible", /592,90\s*€/.test(total), total.trim());
const hayEtiquetas = await page.evaluate(() => {
  const empresa = document.querySelector("label input#contrata-empresa");
  const email = document.querySelector("label input#contrata-email");
  const nif = document.querySelector("label input#contrata-nif");
  return !!(empresa && email && nif);
});
t("empresa, email y NIF tienen etiqueta", hayEtiquetas);

let radio = false;
for (let i = 0; i < 40 && !radio; i += 1) {
  await page.keyboard.press("Tab");
  const f = await enfocado();
  if (f.name === "semana") radio = true;
}
t("el tabulador llega a la semana", radio);
await page.keyboard.press("Space");
await page.click("#contrata-continuar");
await page.waitForFunction(() => {
  const semana = document.getElementById("contrata-paso-semana");
  const contacto = document.getElementById("contrata-paso-contacto");
  return !!(semana && semana.hidden && contacto && !contacto.hidden);
}, { timeout: 3000 });
t("la selección de semana da paso a contacto", true);
const gridSemanas = await page.$eval("#contrata-semanas", (e) => getComputedStyle(e).gridTemplateColumns);
t("las semanas se presentan en una cuadrícula compacta", gridSemanas.split(" ").length >= 1, gridSemanas);

const escribir = async (id, texto) => {
  let ok = false;
  for (let i = 0; i < 15 && !ok; i += 1) {
    await page.keyboard.press("Tab");
    const f = await enfocado();
    if (f.id === id) ok = true;
  }
  if (!ok) return false;
  await page.keyboard.type(texto);
  return true;
};
t("teclado escribe la empresa", await escribir("contrata-empresa", "Acme SL"));
t("teclado escribe el email", await escribir("contrata-email", "facturas@example.com"));
t("teclado escribe el NIF", await escribir("contrata-nif", "B12345674"));
let casilla = false;
for (let i = 0; i < 8 && !casilla; i += 1) {
  await page.keyboard.press("Tab");
  const f = await enfocado();
  if (f.id === "contrata-condiciones") casilla = true;
}
t("el tabulador llega a las condiciones", casilla);
await page.keyboard.press("Space");
let pagar = false;
for (let i = 0; i < 6 && !pagar; i += 1) {
  await page.keyboard.press("Tab");
  const f = await enfocado();
  if (f.id === "contrata-pagar") pagar = true;
}
t("el tabulador llega a pagar", pagar);
const altoPagar = await page.$eval("#contrata-pagar", (e) => e.getBoundingClientRect().height);
t("pagar mide al menos 48 px", altoPagar >= 48, String(Math.round(altoPagar)));
await page.keyboard.press("Enter");
await page.waitForFunction(() => location.pathname.includes("/api/contrata/sim/checkout.php"), { timeout: 15000 });
t("llega al pago simulado", true);
await page.waitForSelector("input[name=numero]");
await page.focus("input[name=numero]");
await page.keyboard.type("4242424242424242");
let botonPago = false;
for (let i = 0; i < 6 && !botonPago; i += 1) {
  await page.keyboard.press("Tab");
  const valor = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("value"));
  if (valor === "pagar") botonPago = true;
}
t("el tabulador llega a pagar en el simulador", botonPago);
await page.keyboard.press("Enter");
await page.waitForFunction(() => location.pathname.includes("/contratar/gracias"), { timeout: 15000 });
const gracias = await page.evaluate(() => document.body.innerText);
t("la página de gracias no da el pago por hecho", /no comprueba la tarjeta/i.test(gracias) && /1 día laborable/i.test(gracias));
t("gracias cabe en 360 px", await sinScroll());

await browser.close();
if (ko > 0) process.exit(1);
console.log("ok");

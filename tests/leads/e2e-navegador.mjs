// Prueba opcional en navegador (local): requiere puppeteer-core y Chrome. Ver README de tests/leads.
import puppeteer from "puppeteer-core";
const B = "http://127.0.0.1:18090";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"], headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
// 1) Llega desde una campaña a la calculadora, con referrer externo simulado
await page.goto(`${B}/calculadora/?utm_source=google&utm_medium=cpc&utm_campaign=prueba-e2e`, { referer: "https://www.google.com/" });
await page.click("#calc-cta");
await page.waitForSelector("#contact");
await new Promise((r) => setTimeout(r, 3500)); // antispam t0
const pre = await page.evaluate(() => ({ tipo: contact.elements.tipo_formulario.value, calc: contact.elements.datos_calculadora.value, msg: contact.elements.mensaje.value.slice(0, 40) }));
console.log("prefill", JSON.stringify(pre));
await page.type('input[name="nombre"]', "Prueba E2E");
await page.type('input[name="cargo"]', "CEO");
await page.type('input[name="empresa"]', "Test SL");
await page.type('input[name="email"]', "e2e@example.com");
await page.type('input[name="telefono"]', "600 111 222");
await page.select('select[name="tamano"]', "1 a 9 personas");
await page.click('input[name="consentimiento"]');
await page.click('#contact button[type=submit]');
await page.waitForFunction(() => document.querySelector("#contact-status").textContent.length > 0, { timeout: 15000 });
console.log("status", await page.$eval("#contact-status", (e) => e.textContent));
console.log("tipo tras reset", await page.evaluate(() => contact.elements.tipo_formulario.value));
await browser.close();

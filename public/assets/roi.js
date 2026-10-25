// Calculadora para pymes (/calculadora/): horquilla de ahorro anual con IA y precio cerrado orientativo.
// Mismas tarifas que los servicios publicados (src/data/site.ts). Todos los supuestos se muestran en la página.
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const form = $("#calc");
  if (!form) return;

  // Precio cerrado por pieza, en euros [bajo, alto], sin IVA
  const PRICE = { diag: [360, 360], first: [600, 1200], extra: [480, 840], train: [[120, 240], [240, 360]] };
  const WEEKS = 46;         // semanas efectivas al año
  const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });
  const nf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
  const round = (v, step) => Math.round(v / step) * step;
  let last = null;

  function calc() {
    const personas = +$("#c-personas").value, horas = +$("#c-horas").value, coste = +$("#c-coste").value;
    const areas = [...form.querySelectorAll('input[name="area"]:checked')];
    const n = Math.max(1, areas.length);
    const sector = form.querySelector('input[name="sector"]:checked')?.value || "";

    // Pinta los controles deslizantes
    [["#c-personas", "#o-personas", (v) => (v >= 100 ? "100 o más" : nf.format(v))], ["#c-horas", "#o-horas", (v) => `${v} h`], ["#c-coste", "#o-coste", (v) => `${v} €/h`]].forEach(([i, o, f]) => {
      const inp = $(i);
      $(o).textContent = f(+inp.value);
      inp.style.setProperty("--p", `${((inp.value - inp.min) / (inp.max - inp.min)) * 100}%`);
    });

    // Ahorro: parte del tiempo repetitivo que la IA puede quitar, según cuántas áreas se automatizan
    const shareLo = Math.min(0.40, 0.15 + 0.05 * n), shareHi = Math.min(0.65, 0.30 + 0.08 * n);
    const horasAno = personas * horas * WEEKS;
    const saveLo = horasAno * shareLo * coste, saveHi = horasAno * shareHi * coste;

    // Precio cerrado: diagnóstico + primera área + áreas adicionales + formación (más si la plantilla crece)
    const big = personas > 50 ? 1.25 : 1;
    const train = PRICE.train[personas > 25 ? 1 : 0];
    const fee = (i) => round((PRICE.diag[i] + PRICE.first[i] + PRICE.extra[i] * (n - 1) + train[i]) * big, 10);
    const feeLo = fee(0), feeHi = fee(1);

    // Licencias de IA: ~20–30 €/usuario/mes para la mitad de la plantilla
    const users = Math.max(1, Math.ceil(personas * 0.5));
    const licLo = users * 20, licHi = users * 30;

    // Recuperación de la inversión, con escenario prudente (ahorro bajo, coste alto)
    const netMonth = saveLo / 12 - licHi;
    const payback = netMonth > 0 ? feeHi / netMonth : Infinity;

    $("#r-save-lo").textContent = eur.format(round(saveLo, 100));
    $("#r-save-hi").textContent = eur.format(round(saveHi, 100));
    $("#r-hours").textContent = `${nf.format(horasAno * shareLo / 12)}–${nf.format(horasAno * shareHi / 12)}`;
    $("#r-fee-lo").textContent = eur.format(feeLo);
    $("#r-fee-hi").textContent = eur.format(feeHi);
    $("#r-lic").textContent = `${eur.format(licLo)}–${eur.format(licHi)}`;
    $("#a-share").textContent = `entre un ${Math.round(shareLo * 100)} % y un ${Math.round(shareHi * 100)} %`;
    $("#r-payback").textContent = !isFinite(payback) ? "más de un año" : payback < 1 ? "menos de 1 mes" : payback > 12 ? "más de un año" : `unos ${Math.ceil(payback)} ${Math.ceil(payback) === 1 ? "mes" : "meses"}`;

    // Barras: ahorro del primer año (medio) frente a inversión del primer año (trabajo + licencias, medio)
    const save1 = (saveLo + saveHi) / 2, cost1 = (feeLo + feeHi) / 2 + ((licLo + licHi) / 2) * 12;
    const max = Math.max(save1, cost1, 1);
    $("#b-save").style.width = `${(save1 / max) * 100}%`;
    $("#b-cost").style.width = `${(cost1 / max) * 100}%`;

    last = { sector, personas, horas, coste, areas: areas.map((a) => a.dataset.name), saveLo, saveHi, feeLo, feeHi };
  }

  form.addEventListener("input", calc);
  form.addEventListener("change", calc);
  calc();

  // El formulario de contacto está en la portada: dejamos el cálculo escrito para que llegue con el lead.
  // (Cuando haya CRM/n8n, este es el punto para enviar también el lead al webhook.)
  $("#calc-cta").addEventListener("click", () => {
    if (!last) return;
    try {
      sessionStorage.setItem("sobtree_prefill", JSON.stringify({
        interes: "Diagnóstico IA exprés",
        mensaje: `He usado la calculadora. Sector: ${last.sector}. ${last.personas} personas, ${last.horas} h/semana en tareas repetitivas, ${last.coste} €/h. Quiero automatizar: ${last.areas.join(", ") || "por decidir"}. Ahorro estimado: ${eur.format(round(last.saveLo, 100))}–${eur.format(round(last.saveHi, 100))} al año. Precio cerrado orientativo: ${eur.format(last.feeLo)}–${eur.format(last.feeHi)}.`
      }));
    } catch (e) {}
  });
})();

// Calculadora de ahorro (/calculadora/): estimación del ahorro operativo de un agente de IA en atención al cliente.
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  if (!$("#roi-form")) return;
  const nf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
  const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const R = {
    cases: [$("#r-cases"), $("#o-cases"), (v) => nf.format(v)],
    min: [$("#r-min"), $("#o-min"), (v) => `${v} min`],
    cost: [$("#r-cost"), $("#o-cost"), (v) => `${v} €`],
    auto: [$("#r-auto"), $("#o-auto"), (v) => `${v} %`]
  };
  const HOURS_PER_FTE = 1720; // horas efectivas por jornada completa al año
  let last = null;
  function calc() {
    Object.values(R).forEach(([inp, out, fmt]) => {
      out.textContent = fmt(Number(inp.value));
      inp.style.setProperty("--p", `${((inp.value - inp.min) / (inp.max - inp.min)) * 100}%`);
    });
    const cases = +R.cases[0].value, min = +R.min[0].value, cost = +R.cost[0].value, auto = +R.auto[0].value / 100;
    const hours = cases * 12 * (min / 60) * auto;
    const savings = hours * cost;
    $("#roi-eur").textContent = eur.format(savings);
    $("#roi-hours").textContent = nf.format(hours);
    $("#roi-fte").textContent = nf.format(hours / HOURS_PER_FTE);
    last = { cases, min, cost, auto: auto * 100, savings };
  }
  Object.values(R).forEach(([inp]) => inp.addEventListener("input", calc));
  calc();
  // El formulario está en la portada: dejamos el cálculo preparado para rellenarlo allí.
  $("#roi-cta").addEventListener("click", () => {
    try {
      sessionStorage.setItem("sobtree_prefill", JSON.stringify({
        interes: "Agentforce a producción",
        mensaje: `He usado la calculadora: ${nf.format(last.cases)} casos al mes, ${last.min} min por caso, ${last.cost} €/h y un ${last.auto} % automatizable. Ahorro estimado: ${eur.format(last.savings)} al año. Me gustaría validarlo con nuestros datos.`
      }));
    } catch (e) {}
  });
})();

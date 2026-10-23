(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scrollOpts = (block = "start") => ({ behavior: reduce ? "auto" : "smooth", block });

  /* ---------- Preselección del formulario desde los CTA ---------- */
  const interest = $("#f-interes");
  const message = $('#contact textarea[name="mensaje"]');
  function prefill(opt, text) {
    if (opt && interest) interest.value = opt;
    if (text && message && !message.value.trim()) message.value = text;
  }
  $$("[data-interest]").forEach((a) => a.addEventListener("click", () => prefill(a.dataset.interest)));

  /* ---------- Casos de uso por sector ---------- */
  const CASES = JSON.parse($("#casos-data").textContent);
  const ucPanel = $("#uc-panel");
  const tabs = $$(".tabs button");
  function renderCases(sector) {
    ucPanel.innerHTML = CASES[sector].casos.map((c) => `
      <article class="uc">
        <span class="uc-area">${c.area}</span>
        <h3>${c.titulo}</h3>
        <p>${c.descripcion}</p>
        <ul class="uc-kpis" aria-label="KPIs de impacto">${c.kpis.map((k) => `<li>${k}</li>`).join("")}</ul>
      </article>`).join("");
    tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.sector === sector)));
  }
  tabs.forEach((b, i) => {
    b.addEventListener("click", () => renderCases(b.dataset.sector));
    b.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      next.focus(); next.click();
    });
  });
  renderCases("seguros");
  $$("[data-goto-sector]").forEach((a) => a.addEventListener("click", () => renderCases(a.dataset.gotoSector)));

  /* ---------- Calculadora ROI ---------- */
  const nf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
  const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const R = {
    cases: [$("#r-cases"), $("#o-cases"), (v) => nf.format(v)],
    min: [$("#r-min"), $("#o-min"), (v) => `${v} min`],
    cost: [$("#r-cost"), $("#o-cost"), (v) => `${v} €`],
    auto: [$("#r-auto"), $("#o-auto"), (v) => `${v} %`]
  };
  const HOURS_PER_FTE = 1720; // horas efectivas por jornada completa al año
  let lastRoi = null;
  function calcRoi() {
    Object.values(R).forEach(([inp, out, fmt]) => {
      out.textContent = fmt(Number(inp.value));
      const p = ((inp.value - inp.min) / (inp.max - inp.min)) * 100;
      inp.style.setProperty("--p", `${p}%`);
    });
    const cases = +R.cases[0].value, min = +R.min[0].value, cost = +R.cost[0].value, auto = +R.auto[0].value / 100;
    const hours = cases * 12 * (min / 60) * auto;
    const savings = hours * cost;
    $("#roi-eur").textContent = eur.format(savings);
    $("#roi-hours").textContent = nf.format(hours);
    $("#roi-fte").textContent = nf.format(hours / HOURS_PER_FTE);
    lastRoi = { cases, min, cost, auto: auto * 100, savings };
    syncMini();
  }

  /* Calculadora mini del bento: controla los mismos valores que la completa. */
  const M = { cases: [$("#m-cases"), $("#mo-cases"), "cases"], auto: [$("#m-auto"), $("#mo-auto"), "auto"] };
  function syncMini() {
    if (!M.cases[0]) return;
    Object.values(M).forEach(([inp, out, key]) => {
      const [full, , fmt] = R[key];
      inp.value = full.value;
      out.textContent = fmt(Number(full.value));
      inp.style.setProperty("--p", `${((inp.value - inp.min) / (inp.max - inp.min)) * 100}%`);
    });
    $("#m-eur").textContent = $("#roi-eur").textContent;
    $("#m-assume").textContent = `Con ${R.min[0].value} min por caso y ${R.cost[0].value} €/h.`;
  }
  Object.values(M).forEach(([inp, , key]) => inp && inp.addEventListener("input", () => { R[key][0].value = inp.value; calcRoi(); }));
  Object.values(R).forEach(([inp]) => inp.addEventListener("input", calcRoi));
  calcRoi();
  $("#roi-cta").addEventListener("click", () => {
    if (!lastRoi) return;
    prefill("Agentforce a producción",
      `He usado la calculadora: ${nf.format(lastRoi.cases)} casos al mes, ${lastRoi.min} min por caso, ${lastRoi.cost} €/h y un ${lastRoi.auto} % automatizable. Ahorro estimado: ${eur.format(lastRoi.savings)} al año. Me gustaría validarlo con nuestros datos.`);
  });

  /* ---------- Autodiagnóstico (una pregunta cada vez) ---------- */
  const QUESTIONS = [
    { q: "¿Dónde vive hoy el dato de tus clientes?", o: ["Repartido en sistemas que no se hablan", "En el CRM, pero incompleto", "Unificado en parte, con esfuerzo manual", "Un perfil único actualizado en tiempo real"] },
    { q: "¿Qué uso hacéis de la IA dentro de Salesforce?", o: ["Ninguno todavía", "Pruebas y demos aisladas", "Un caso en producción", "Varios agentes en producción"] },
    { q: "¿Cómo medís el valor de Salesforce?", o: ["No lo medimos", "Por adopción y licencias", "Por KPIs de proceso", "Por impacto en ingresos y coste"] },
    { q: "¿Quién decide las prioridades de la plataforma?", o: ["Tecnología, en solitario", "Negocio pide y tecnología ejecuta", "Un comité conjunto", "Un dueño de producto con roadmap propio"] },
    { q: "¿Cómo gobernáis el uso de la IA?", o: ["No está definido", "Se está discutiendo", "Hay políticas básicas", "Límites, auditoría y supervisión operativos"] },
    { q: "¿Cada cuánto llega una mejora a los usuarios?", o: ["Una vez al año o menos", "Cada trimestre", "Cada mes", "De forma continua"] }
  ];
  const LEVELS = [
    { max: 5, title: "Nivel 1 · Cimientos", text: "La IA todavía tendría poco con lo que trabajar. La buena noticia: puedes construir bien desde el principio, sin rehacer nada.", rec: "un diagnóstico de valor y un primer bloque de datos unificados, con un caso de uso acotado que demuestre retorno en semanas." },
    { max: 11, title: "Nivel 2 · Experimentación", text: "Hay interés y alguna prueba, pero la IA aún no mueve indicadores de negocio. El riesgo es acumular pilotos que nunca llegan a producción.", rec: "elegir un caso con retorno claro y llevarlo a producción con Agentforce, con métricas y supervisión desde el primer día." },
    { max: 15, title: "Nivel 3 · Escalado", text: "Ya tienes casos que funcionan. El reto es repetir el éxito sin multiplicar el coste ni el riesgo.", rec: "un modelo operativo para agentes: gobierno, catálogo de casos priorizado y un dato unificado que sirva a todos." },
    { max: 18, title: "Nivel 4 · Liderazgo", text: "Estás por delante de la mayoría del mercado. El valor está ahora en mantener el criterio cuando todos te ofrecen más.", rec: "asesoría a dirección para revisar la hoja de ruta, las renovaciones y las propuestas de terceros con una mirada independiente." }
  ];
  const answers = new Array(QUESTIONS.length).fill(null);
  let idx = 0;
  const qBox = $("#diag-q"), bar = $("#diag-bar"), count = $("#diag-count"), prev = $("#diag-prev");
  const form = $("#diag"), result = $("#diag-result");

  function renderQ() {
    const item = QUESTIONS[idx];
    count.textContent = `Pregunta ${idx + 1} de ${QUESTIONS.length}`;
    bar.style.width = `${(idx / QUESTIONS.length) * 100}%`;
    qBox.innerHTML = `<p class="diag-question" id="dq">${item.q}</p>
      <div class="diag-opts" role="group" aria-labelledby="dq">
        ${item.o.map((t, i) => `<button type="button" class="diag-opt" data-v="${i}" aria-pressed="${answers[idx] === i}"><span class="k">${"ABCD"[i]}</span>${t}</button>`).join("")}
      </div>`;
    prev.style.visibility = idx === 0 ? "hidden" : "visible";
  }
  qBox.addEventListener("click", (e) => {
    const b = e.target.closest(".diag-opt");
    if (!b) return;
    answers[idx] = Number(b.dataset.v);
    $$(".diag-opt", qBox).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    setTimeout(() => {
      if (idx < QUESTIONS.length - 1) { idx++; renderQ(); $(".diag-opt", qBox).focus({ preventScroll: true }); }
      else showResult();
    }, reduce ? 0 : 220);
  });
  prev.addEventListener("click", () => { if (idx > 0) { idx--; renderQ(); } });

  function showResult() {
    const score = answers.reduce((a, b) => a + b, 0);
    const level = LEVELS.find((l) => score <= l.max);
    $("#r-score").textContent = score;
    $("#r-title").textContent = level.title;
    $("#r-text").textContent = level.text;
    $("#r-rec").textContent = level.rec;
    $("#r-cta").dataset.level = `${level.title} (${score}/18)`;
    form.hidden = true; result.hidden = false;
    requestAnimationFrame(() => { $("#gauge-fill").style.width = `${(score / 18) * 100}%`; });
    result.focus({ preventScroll: true });
  }
  $("#diag-reset").addEventListener("click", () => {
    answers.fill(null); idx = 0;
    $("#gauge-fill").style.width = "0";
    result.hidden = true; form.hidden = false; renderQ();
  });
  $("#r-cta").addEventListener("click", (e) => {
    prefill("Diagnóstico de valor", `He hecho el autodiagnóstico y estamos en «${e.currentTarget.dataset.level}». Me gustaría comentarlo.`);
  });
  renderQ();

  /* ---------- Formulario de contacto ---------- */
  // En Hostinger se envía a contact.php (llega a info@sobtree.com).
  // Si el PHP no está disponible (p. ej. abriendo el fichero en local), abre el correo del visitante.
  const contact = $("#contact");
  const status = $("#contact-status");
  const setStatus = (msg, cls = "") => { status.textContent = msg; status.className = `form-status ${cls}`; };

  function mailtoFallback(d) {
    const subject = `Solicitud de conversación — ${d.get("empresa")}`;
    const body = ["nombre", "cargo", "empresa", "email", "tamano", "interes"].map((k) => `${k}: ${d.get(k)}`).join("\n") + `\n\n${d.get("mensaje")}`;
    window.location.href = `mailto:info@sobtree.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setStatus("Se ha abierto tu correo con la solicitud preparada. Envíala desde allí.", "ok");
  }

  contact.addEventListener("submit", async (e) => {
    e.preventDefault();
    let firstInvalid = null;
    $$("input:not([type=checkbox]):not([name=web]), select, textarea", contact).forEach((el) => {
      const ok = el.checkValidity() && el.value.trim() !== "";
      el.setAttribute("aria-invalid", String(!ok));
      if (!ok && !firstInvalid) firstInvalid = el;
    });
    const consent = $('input[name="consentimiento"]', contact);
    consent.closest("label").classList.toggle("invalid", !consent.checked);
    if (!consent.checked && !firstInvalid) firstInvalid = consent;
    if (firstInvalid) {
      setStatus("Revisa los campos marcados: todos son obligatorios y el email debe ser válido.", "err");
      firstInvalid.focus();
      return;
    }
    const data = new FormData(contact);
    const btn = $("button[type=submit]", contact);
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      if (location.protocol === "file:") throw new Error("local");
      const res = await fetch(contact.action, { method: "POST", body: data, headers: { Accept: "application/json" } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "server");
      contact.reset();
      setStatus("Solicitud enviada. Te responderemos en menos de 24 horas laborables.", "ok");
    } catch (err) {
      if (err.message === "local" || err.message === "server" || err instanceof TypeError) mailtoFallback(data);
      else setStatus(err.message, "err");
    } finally {
      btn.disabled = false; btn.textContent = "Solicitar conversación";
    }
  });
})();

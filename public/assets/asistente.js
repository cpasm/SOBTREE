// Asistente de la home: pregunta → /api/asistente.php → respuesta con citas y, si procede, oferta de reunión.
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const API = "/api/asistente.php";

  const ask = $("#ask"), chat = $("#chat"), log = $("#chat-log");
  if (!ask || !chat || typeof chat.showModal !== "function") return;

  // Solo se muestra si el servidor está configurado; si no, la home se queda con sus botones.
  fetch(`${API}?estado`, { headers: { Accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : { ok: false }))
    .then((d) => { if (d.ok) { ask.hidden = false; $("#hero-actions").hidden = true; } })
    .catch(() => {});

  const history = []; // [{ role: "user" | "assistant", content: string }]
  let busy = false;

  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // Markdown mínimo y seguro: negritas, listas con guion y párrafos.
  function md(text) {
    return esc(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").split(/\n{2,}/).map((block) => {
      const items = block.split("\n");
      if (items.every((l) => /^\s*[-•]\s+/.test(l))) return `<ul>${items.map((l) => `<li>${l.replace(/^\s*[-•]\s+/, "")}</li>`).join("")}</ul>`;
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    }).join("");
  }

  function bubble(cls, html) {
    const el = document.createElement("div");
    el.className = `msg ${cls}`;
    el.innerHTML = html;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function render(data) {
    const byN = Object.fromEntries((data.sources || []).map((s) => [s.n, s]));
    const text = data.segments.map((s) => s.t).join("");
    const cites = (c) => c.map((n) => byN[n] ? `<sup><a href="${esc(byN[n].url)}" title="${esc(byN[n].title)}">${n}</a></sup>` : "").join("");
    // Las citas van pegadas al trozo de texto que respaldan.
    let html = md(data.segments.map((s, i) => s.t + (s.c.length ? `\u0000${i}\u0000` : "")).join(""));
    html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => cites(data.segments[+i].c));
    if (data.sources?.length) {
      html += `<ol class="msg-sources">${data.sources.map((s) => `<li value="${s.n}"><a href="${esc(s.url)}">${esc(s.title)}</a></li>`).join("")}</ol>`;
    }
    bubble("bot", html);
    if (data.offer) offer(data.offer);
    return text;
  }

  function offer(motivo) {
    const el = bubble("offer", `<p><strong>¿Lo vemos para tu caso?</strong> 30 minutos con un perfil senior, sin compromiso.</p>
      <button type="button" class="btn btn-primary btn-sm">Reservar conversación</button>`);
    $("button", el).addEventListener("click", () => {
      chat.close();
      const interest = $("#f-interes"), msg = $('#contact textarea[name="mensaje"]');
      if (interest) interest.value = "Aún no lo sé";
      if (msg && !msg.value.trim()) msg.value = `Vengo del asistente de la web. Me gustaría resolver: ${motivo}`;
      $("#contacto").scrollIntoView({ behavior: "smooth" });
      setTimeout(() => $('#contact input[name="nombre"]')?.focus({ preventScroll: true }), 500);
    });
  }

  async function send(question) {
    question = question.trim();
    if (!question || busy) return;
    busy = true;
    if (!chat.open) chat.showModal();
    bubble("user", `<p>${esc(question)}</p>`);
    const typing = bubble("bot typing", "<span></span><span></span><span></span>");
    chat.querySelectorAll("form input, form button").forEach((el) => (el.disabled = true));
    history.push({ role: "user", content: question });
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ messages: history })
      });
      const data = await res.json().catch(() => ({}));
      typing.remove();
      if (!res.ok || !data.segments) throw new Error(data.error || "No he podido responder ahora mismo. Inténtalo de nuevo.");
      history.push({ role: "assistant", content: render(data) });
    } catch (err) {
      typing.remove();
      history.pop(); // la pregunta sin respuesta no se reenvía
      bubble("error", `<p>${esc(err.message || "Error de conexión.")}</p>`);
    } finally {
      busy = false;
      chat.querySelectorAll("form input, form button").forEach((el) => (el.disabled = false));
      $("#chat-q").focus();
    }
  }

  $("#ask-form").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#ask-q"); send(q.value); q.value = ""; });
  $("#chat-form").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#chat-q"); send(q.value); q.value = ""; });
  ask.addEventListener("click", (e) => { const b = e.target.closest("[data-ask]"); if (b) send(b.dataset.ask); });
  $("#chat-close").addEventListener("click", () => chat.close());
  chat.addEventListener("click", (e) => { if (e.target === chat) chat.close(); }); // clic fuera del panel
})();

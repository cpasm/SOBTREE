// Formulario de newsletter: se muestra si /api/newsletter.php está configurado
// y envía email, consentimiento y origen. El servidor firma y reenvía a n8n.
(() => {
  "use strict";
  const box = document.getElementById("newsletter");
  if (!box) return;
  const API = "/api/newsletter.php";
  const form = document.getElementById("nl-form");
  const status = document.getElementById("nl-status");
  const setStatus = (msg, cls) => {
    status.textContent = msg;
    status.className = "nl-status" + (cls ? " " + cls : "");
    status.setAttribute("role", cls === "err" ? "alert" : "status");
  };

  fetch(API + "?estado", { headers: { Accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : { ok: false }))
    .then((d) => { if (d.ok) box.hidden = false; })
    .catch(() => {});

  const stamp = () => { form.elements.t0.value = String(Date.now()); };
  stamp();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email;
    const consent = form.consentimiento;
    const okEmail = email.checkValidity() && email.value.trim() !== "";
    email.setAttribute("aria-invalid", String(!okEmail));
    consent.setAttribute("aria-invalid", String(!consent.checked));
    consent.closest("label").classList.toggle("invalid", !consent.checked);
    if (!okEmail) {
      setStatus("Revisa el email: no parece válido.", "err");
      email.focus();
      return;
    }
    if (!consent.checked) {
      setStatus("Marca la casilla para poder enviarte la newsletter.", "err");
      consent.focus();
      return;
    }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Enviando…";
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          email: email.value.trim(),
          consentimiento: "si",
          consent_text: form.dataset.consentText || "",
          origen: form.dataset.origen || "",
          web: form.web.value,
          t0: Number(form.elements.t0.value) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "No hemos podido apuntarte ahora mismo. Inténtalo de nuevo.");
      form.reset();
      stamp();
      setStatus(data.confirmar === true ? "Revisa tu correo para confirmar" : "Hecho. El próximo Radar te llega al correo.", "ok");
    } catch (err) {
      setStatus(err.message || "Error de conexión. Inténtalo de nuevo.", "err");
    } finally {
      btn.disabled = false;
      btn.textContent = "Suscribirme";
    }
  });
})();

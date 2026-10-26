// Genera llms.txt (índice) y llms-full.txt (contenido completo) a partir de los mismos datos que la web.
// Formato: https://llmstxt.org
import { SITE, SERVICES, TEXTOS } from "./site";
import { FAQ } from "./faq";
import { getAnalisis, getRadar } from "./content";

const STEPS = [
  "Llamada de 25 minutos, gratis: entendemos tu empresa y te decimos si la IA te compensa.",
  TEXTOS.llmsPaso,
  "Puesta en marcha (2–3 semanas): el primer caso de uso funcionando y tu equipo formado.",
  "Cada mes, si quieres: medimos el ahorro y vamos a por la siguiente tarea."
];

export async function buildLlms(full: boolean) {
  const posts = await getAnalisis();
  const radar = await getRadar();
  const out: string[] = [];

  out.push(`# ${SITE.name}`, "", `> ${SITE.description}`, "");
  out.push(
    "Sobtree ayuda a pequeñas y medianas empresas a implantar IA (ChatGPT, Claude, Gemini, Microsoft Copilot y automatizaciones). " +
    "Precio cerrado antes de empezar, sin extras, y sin comisiones de licencias. Trabaja casi todo con IA, por eso cobra menos. " +
    TEXTOS.llmsIntro,
    ""
  );

  out.push("## Servicios", "");
  for (const s of SERVICES) out.push(`- **${s.name}** (${s.duration}): ${s.description}`);
  out.push("");

  out.push("## Páginas", "");
  out.push(`- [Inicio](${SITE.url}/): servicios, casos de uso por sector, método de trabajo, autodiagnóstico, FAQ y contacto.`);
  out.push(`- [Calculadora de ahorro](${SITE.url}/calculadora/): en 5 preguntas, horquilla de ahorro anual con IA y precio cerrado orientativo de la implantación.`);
  if (posts.length) out.push(`- [Análisis](${SITE.url}/analisis/): guías para implantar IA en una pyme: por dónde empezar, costes, ahorro y ley de IA.`);
  if (radar.length) out.push(`- [Radar](${SITE.url}/radar/): entrega semanal con las novedades de IA que importan a una pyme.`);
  out.push("");

  if (posts.length) {
    out.push("## Análisis", "");
    for (const p of posts) out.push(`- [${p.data.title}](${SITE.url}/analisis/${p.id}/): ${p.data.description}`);
    out.push("");
  }

  if (radar.length) {
    out.push("## Radar (últimas entregas)", "");
    for (const r of radar.slice(0, full ? radar.length : 4)) out.push(`- [${r.data.title}](${SITE.url}/radar/${r.id}/): ${r.data.puntos.join(" · ")}`);
    out.push("");
  }

  if (full) {
    out.push("## Cómo trabajamos", "");
    STEPS.forEach((s, i) => out.push(`${i + 1}. ${s}`));
    out.push("");
    out.push("## Preguntas frecuentes", "");
    for (const f of FAQ) out.push(`### ${f.q}`, "", f.a, "");
    for (const r of radar) {
      out.push(`## ${r.data.title}`, "", `URL: ${SITE.url}/radar/${r.id}/`, `Fecha: ${r.data.date.toISOString().slice(0, 10)}`, "", (r.body ?? "").trim(), "");
    }
    for (const p of posts) {
      out.push(`## ${p.data.title}`, "", `URL: ${SITE.url}/analisis/${p.id}/`, `Fecha: ${p.data.date.toISOString().slice(0, 10)}`, "", (p.body ?? "").trim(), "");
    }
  } else {
    out.push("## Optional", "");
    out.push(`- [Contenido completo](${SITE.url}/llms-full.txt): servicios, método, FAQ y texto íntegro del Radar y los análisis.`);
    out.push("");
  }

  out.push("## Contacto", "", `- Email: ${SITE.email}`, `- Reservar diagnóstico: ${SITE.url}/#contacto`, "");
  return out.join("\n");
}

// Genera llms.txt (índice) y llms-full.txt (contenido completo) a partir de los mismos datos que la web.
// Formato: https://llmstxt.org
import { SITE, SERVICES } from "./site";
import { FAQ } from "./faq";
import { getAnalisis, getRadar } from "./content";

const STEPS = [
  "Diagnóstico (semanas 1–3): entrevistas con negocio y auditoría de la org y del dato.",
  "Business case (semana 4): uno o dos casos priorizados con KPI de negocio, coste y plazo aprobados por dirección.",
  "Construcción (semanas 5–12): entregas cada dos semanas en entorno real con métricas visibles.",
  "Escala (mes 4 en adelante): lo que funciona se extiende y el equipo del cliente se queda con el conocimiento."
];

export async function buildLlms(full: boolean) {
  const posts = await getAnalisis();
  const radar = await getRadar();
  const out: string[] = [];

  out.push(`# ${SITE.name}`, "", `> ${SITE.description}`, "");
  out.push(
    "Sobtree es una consultora independiente: no revende licencias ni cobra comisiones de Salesforce ni de otros fabricantes. " +
    "Trabaja en español e inglés para empresas de España, Europa y Latinoamérica. Sede en Madrid. " +
    "El punto de entrada es un diagnóstico de valor de 3 semanas a precio cerrado.",
    ""
  );

  out.push("## Servicios", "");
  for (const s of SERVICES) out.push(`- **${s.name}** (${s.duration}): ${s.description}`);
  out.push("");

  out.push("## Páginas", "");
  out.push(`- [Inicio](${SITE.url}/): servicios, casos de uso por sector, calculadora de ahorro, método de trabajo, autodiagnóstico, FAQ y contacto.`);
  if (posts.length) out.push(`- [Análisis](${SITE.url}/analisis/): artículos sobre IA y Salesforce.`);
  if (radar.length) out.push(`- [Radar](${SITE.url}/radar/): entrega semanal con las noticias de Salesforce e IA que importan y su lectura.`);
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

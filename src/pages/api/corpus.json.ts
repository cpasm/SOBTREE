// Documentos que el asistente puede usar y citar (api/asistente.php los lee en cada pregunta).
// Se generan en cada build desde el mismo contenido que la web: si cambia la web, cambia el asistente.
import type { APIRoute } from "astro";
import { SITE, SERVICES } from "../../data/site";
import { FAQ } from "../../data/faq";
import { getAnalisis, getRadar } from "../../data/content";
import CASOS from "../../data/casos.json";

type Doc = { title: string; url: string; text: string };

const lines = (...l: string[]) => l.join("\n");

export const GET: APIRoute = async () => {
  const docs: Doc[] = [];

  docs.push({
    title: "Sobtree: quiénes somos y qué servicios ofrecemos",
    url: `${SITE.url}/#servicios`,
    text: lines(
      SITE.description,
      "Sobtree es una consultora independiente: no revende licencias ni cobra comisiones de Salesforce ni de otros fabricantes. Trabaja en español e inglés, en remoto y con presencia cuando el proyecto lo requiere, para empresas de España, Europa y Latinoamérica. Sede en Madrid.",
      "Sobtree no está afiliada a Salesforce, Inc.",
      "",
      "Servicios:",
      ...SERVICES.map((s) => `- ${s.name} (${s.duration}): ${s.description}`),
      "",
      "El punto de entrada recomendado es el Diagnóstico de valor IA + Salesforce: 3 semanas, precio cerrado, perfil senior en cada sesión. Incluye auditoría técnica de la org y del modelo de datos, mapa de casos de uso de IA priorizado por impacto y esfuerzo, business case con KPIs de partida y objetivo, hoja de ruta a 90 días y a 12 meses, y revisión de licencias (qué sobra, qué falta y qué negociar).",
      "",
      "Plataformas en las que trabajamos: Agentforce, Data 360, Marketing Cloud Next, Loyalty Management, Sales Cloud, Service Cloud, MuleSoft y Tableau."
    )
  });

  docs.push({
    title: "Cómo trabajamos",
    url: `${SITE.url}/#metodo`,
    text: lines(
      "Riesgo acotado, retorno abierto: cada fase termina con algo útil y se puede parar sin perder la inversión.",
      "1. Diagnóstico (semanas 1–3): entrevistas con negocio, auditoría de la org y del dato.",
      "2. Business case (semana 4): uno o dos casos priorizados, con KPI de negocio, coste y plazo aprobados por dirección.",
      "3. Construcción (semanas 5–12): entregas cada dos semanas en entorno real, con usuarios reales y métricas visibles desde el primer sprint.",
      "4. Escala (mes 4 en adelante): lo que funciona se extiende y el equipo del cliente se queda con el conocimiento y la documentación.",
      "Objetivo habitual: primer agente en producción en 90 días."
    )
  });

  docs.push({
    title: "Preguntas frecuentes",
    url: `${SITE.url}/#faq`,
    text: FAQ.map((f) => `${f.q}\n${f.a}`).join("\n\n")
  });

  docs.push({
    title: "Casos de uso de IA por sector",
    url: `${SITE.url}/#casos`,
    text: Object.values(CASOS).map((s) => lines(
      `${s.nombre}:`,
      ...s.casos.map((c) => `- ${c.titulo} (${c.area}): ${c.descripcion} KPIs: ${c.kpis.join(", ")}.`)
    )).join("\n\n")
  });

  docs.push({
    title: "Calculadora de ahorro de un agente de IA",
    url: `${SITE.url}/#roi`,
    text: lines(
      "La calculadora de la web estima el ahorro operativo anual de un agente de IA en atención al cliente.",
      "Fórmula: horas liberadas al año = casos al mes × 12 × (minutos por caso / 60) × % de casos que resuelve el agente. Ahorro = horas × coste por hora. Jornadas completas equivalentes = horas / 1.720.",
      "Valores por defecto: 10.000 casos al mes, 12 minutos por caso, 28 € por hora y un 35 % resuelto por el agente, que dan unos 235.200 € al año.",
      "Es una estimación orientativa del ahorro operativo, antes de contar el impacto en satisfacción y ventas, y no incluye el coste de la plataforma ni de la implantación."
    )
  });

  for (const r of await getRadar()) {
    docs.push({
      title: r.data.title,
      url: `${SITE.url}/radar/${r.id}/`,
      text: lines(`Publicado el ${r.data.date.toISOString().slice(0, 10)}.`, ...r.data.puntos.map((p) => `- ${p}`), "", (r.body ?? "").trim())
    });
  }

  for (const a of await getAnalisis()) {
    docs.push({
      title: a.data.title,
      url: `${SITE.url}/analisis/${a.id}/`,
      text: lines(`Publicado el ${a.data.date.toISOString().slice(0, 10)}.`, a.data.description, "", (a.body ?? "").trim())
    });
  }

  return new Response(JSON.stringify(docs), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};

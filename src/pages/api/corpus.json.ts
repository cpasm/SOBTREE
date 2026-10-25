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
    title: "Sobtree: quiénes somos, servicios y precios",
    url: `${SITE.url}/#servicios`,
    text: lines(
      SITE.description,
      "Sobtree ayuda a pequeñas y medianas empresas a implantar IA en su día a día: atención al cliente, presupuestos, facturas, marketing e informes. Usa herramientas que ya existen (ChatGPT, Claude, Gemini, Microsoft Copilot y automatizaciones sencillas) y las deja funcionando, con el equipo formado.",
      `Precio cerrado, IVA no incluido: se fija antes de empezar y no hay extras. Sobtree no cobra comisiones por las licencias de IA: las paga el cliente directamente al proveedor.`,
      "Cobra menos porque trabaja casi todo con IA: tarda menos y eso se nota en el precio. Sobtree no publica ni factura por horas.",
      "Sede en Madrid; trabaja en remoto para toda España, en español e inglés. No está afiliada a Anthropic, OpenAI, Google ni Microsoft.",
      "",
      "Servicios:",
      ...SERVICES.map((s) => `- ${s.name} (${s.duration}): ${s.description}`),
      "",
      "El punto de entrada recomendado es el Diagnóstico IA exprés: 1 semana, 360 € precio cerrado. Dice qué tareas automatizar primero, cuánto ahorrarías y cuánto costaría ponerlo en marcha."
    )
  });

  docs.push({
    title: "Cómo trabajamos",
    url: `${SITE.url}/#metodo`,
    text: lines(
      "1. Llamada de 25 minutos, gratis: entendemos tu empresa y te decimos si la IA te compensa.",
      "2. Diagnóstico IA exprés (1 semana): qué tareas automatizar, cuánto ahorras y cuánto cuesta, por escrito.",
      "3. Puesta en marcha (2–3 semanas): el primer caso de uso funcionando y tu equipo formado.",
      "4. Cada mes, si quieres: medimos el ahorro y vamos a por la siguiente tarea.",
      "Se empieza siempre por una sola tarea, la que más horas quita. Si no hay ahorro claro, se dice antes de gastar más."
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
    title: "Calculadora: cuánto ahorras con IA y cuánto te costaría",
    url: `${SITE.url}/calculadora/`,
    text: lines(
      "La calculadora de la web (sobtree.com/calculadora/) hace 5 preguntas: sector, número de personas, horas por persona y semana en tareas repetitivas, coste medio por hora y qué áreas automatizar (atención al cliente, presupuestos y ventas, facturas y administración, marketing y contenidos, informes y documentos).",
      "Horas repetitivas al año = personas × horas por semana × 46 semanas. La IA puede ahorrar de un 20–38 % de ese tiempo (una sola área) a un 40–65 % (las cinco áreas). Ahorro = horas ahorradas × coste por hora.",
      `Precio cerrado orientativo de Sobtree: diagnóstico 360 € + puesta en marcha 600–1.200 € la primera área y 480–840 € cada área adicional + formación 120–360 €, un 25 % más si la empresa tiene más de 50 personas. Por ejemplo, 8 personas y dos áreas: entre 1.560 € y 2.640 € aproximadamente.`,
      "Licencias de IA: unos 20–30 € por usuario y mes, para aproximadamente la mitad de la plantilla; las paga el cliente al proveedor.",
      "También calcula en cuántos meses se recupera la inversión con el escenario prudente. Es una estimación orientativa, sin IVA; el diagnóstico la ajusta a cada caso."
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

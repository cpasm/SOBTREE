// Versión de los assets: cambia en cada build (ver Base.astro).
export const BUILD_VERSION = Date.now().toString(36);

// Datos de la empresa. Se usan en las metaetiquetas, los datos estructurados (JSON-LD) y llms.txt.
export const SITE = {
  name: "Sobtree",
  url: "https://sobtree.com",
  email: "info@sobtree.com",
  legalName: "Sobtree Holding, S.L.",
  city: "Madrid",
  country: "ES",
  title: "Sobtree | IA para pymes: implanta IA en tu empresa y ahorra desde el primer mes",
  description:
    "Ayudamos a pequeñas y medianas empresas a implantar IA en su negocio con casos de uso que se pagan solos. Precio transparente: 60 €/hora. Calcula tu ahorro y lo que te costaría.",
  tagline: "IA para pymes con precio transparente: primer caso de uso en marcha en semanas, no en meses.",
  rate: 60, // €/hora, IVA no incluido
  areaServed: ["ES"],
  languages: ["es", "en"],
  knowsAbout: ["Inteligencia artificial para pymes", "Automatización con IA", "ChatGPT", "Claude", "Gemini", "Microsoft Copilot", "Agentes de IA", "Atención al cliente con IA", "Automatización de procesos administrativos"]
};

// Autor visible en análisis y en el JSON-LD (tipo Person).
// Vacío a propósito: la web no nombra todavía a nadie. Rellénalo cuando quieras firmar con tu nombre.
export const AUTHOR: { name: string; jobTitle: string; url?: string; sameAs: string[] } | null = null;

// Precios a 60 €/h (IVA no incluido). La calculadora usa el mismo modelo de horas.
export const SERVICES = [
  { name: "Diagnóstico IA exprés", duration: "1 semana · 6 h · 360 €", description: "Revisamos cómo trabajáis, detectamos las tareas que más tiempo os comen y salís con 3 casos de uso priorizados, con su ahorro estimado y su coste." },
  { name: "Primer caso de uso en marcha", duration: "2–3 semanas · 10–20 h · 600–1.200 €", description: "Implantamos un caso de uso completo (atención al cliente, presupuestos, facturas, contenidos…) con herramientas que ya existen, sin desarrollos a medida caros." },
  { name: "Formación de tu equipo", duration: "2–4 h · 120–240 €", description: "Tu gente aprende a usar la IA en su día a día con ejemplos de vuestro propio trabajo, no con teoría." },
  { name: "Acompañamiento mensual", duration: "Desde 4 h/mes · 240 €/mes", description: "Un caso de uso nuevo cada mes, ajustes y soporte. Sin permanencia." }
];

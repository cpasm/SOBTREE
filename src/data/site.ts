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
  title: "Sobtree | Consultoría de IA y Salesforce para empresas",
  description:
    "Consultoría independiente de IA y Salesforce para empresas. Llevamos Agentforce y Data 360 a producción con un business case medible: menos coste por caso, más conversión y más retención.",
  tagline: "Agentforce y Data 360 en producción, con retorno medible. Diagnóstico de valor en 3 semanas a precio cerrado.",
  areaServed: ["ES", "EU", "LATAM"],
  languages: ["es", "en"],
  knowsAbout: ["Salesforce", "Agentforce", "Data 360", "Marketing Cloud Next", "Loyalty Management", "Sales Cloud", "Service Cloud", "MuleSoft", "Tableau", "Inteligencia artificial generativa", "Agentes de IA"]
};

// Autor visible en análisis y en el JSON-LD (tipo Person).
// Vacío a propósito: la web no nombra todavía a nadie. Rellénalo cuando quieras firmar con tu nombre.
export const AUTHOR: { name: string; jobTitle: string; url?: string; sameAs: string[] } | null = null;

export const SERVICES = [
  { name: "Diagnóstico de valor IA + Salesforce", duration: "3 semanas", description: "Auditoría de la org y del dato, mapa de casos de uso de IA priorizado, business case con KPIs y hoja de ruta a 90 días y 12 meses. Precio cerrado." },
  { name: "Agentforce a producción", duration: "6–10 semanas", description: "Diseño, construcción y despliegue de agentes que resuelven casos reales en servicio, ventas o marketing, con guardrails y escalado a personas." },
  { name: "Data 360", duration: "8–12 semanas", description: "Perfil único de cliente con identidad, consentimiento y segmentos activables. La base para que la IA acierte." },
  { name: "Marketing y Loyalty", duration: "Por fases", description: "Marketing Cloud Next y Loyalty Management conectados al dato: journeys que reaccionan y programas que premian el valor real." },
  { name: "Asesoría a dirección", duration: "Cuota mensual", description: "Criterio independiente para revisar ofertas de integradores, renovaciones de licencias y decisiones de arquitectura." }
];

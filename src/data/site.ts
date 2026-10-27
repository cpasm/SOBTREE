// Versión de los assets: cambia en cada build (ver Base.astro).
export const BUILD_VERSION = Date.now().toString(36);

// Política de privacidad. Tiene que coincidir con LEADS_POLITICA_VERSION en public/lib/leads.php.
export const POLITICA_VERSION = "2026-10-27";
export const POLITICA_FECHA = "27 de octubre de 2026";
// Texto exacto de la casilla opcional del formulario de contacto. El mismo literal va firmado
// en el lead (LEADS_COMERCIAL_TEXTO). El enlace a /privacidad/ es aparte y no forma parte del texto.
export const COMERCIAL_CONSENT_TEXT =
  "Quiero recibir comunicaciones comerciales de Sobtree (novedades, análisis y ofertas) por email. Puedes darte de baja cuando quieras.";

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
    "Ayudamos a pequeñas y medianas empresas a implantar IA en su negocio con casos de uso que se pagan solos. Precio cerrado antes de empezar, sin sorpresas. Calcula tu ahorro y lo que te costaría.",
  tagline: "IA para pymes con precio transparente: primer caso de uso en marcha en semanas, no en meses.",
  areaServed: ["ES"],
  languages: ["es", "en"],
  knowsAbout: ["Inteligencia artificial para pymes", "Automatización con IA", "ChatGPT", "Claude", "Gemini", "Microsoft Copilot", "Agentes de IA", "Atención al cliente con IA", "Automatización de procesos administrativos"]
};

// Autor visible en análisis y en el JSON-LD (tipo Person).
// Vacío a propósito: la web no nombra todavía a nadie. Rellénalo cuando quieras firmar con tu nombre.
export const AUTHOR: { name: string; jobTitle: string; url?: string; sameAs: string[] } | null = null;

// Una sola fuente del diagnóstico. `descuentoCondicionado: false` pasa toda la web a
// «490 €, descontable del proyecto» (opción B). Con true, el descuento es contratar
// el proyecto en los 30 días siguientes a la entrega del informe, con las condiciones de la FAQ.
export const DIAGNOSTICO = {
  precio: 490,
  descuentoCondicionado: true,
  dias: 30
};

// Resto del precio cerrado (sin IVA). El 25 % de más de 50 personas no se aplica al diagnóstico.
export const TARIFAS = {
  first: [600, 1200],
  extra: [480, 840],
  trainSmall: [120, 240],
  trainBig: [240, 360],
  recargo: 1.25,
  umbralRecargo: 50,
  umbralFormacion: 25
};

export type CfgPrecio = typeof TARIFAS & { precio: number; descuentoCondicionado: boolean; dias: number };

export const cfgPrecio = (d = DIAGNOSTICO): CfgPrecio => ({
  ...TARIFAS,
  precio: d.precio,
  descuentoCondicionado: d.descuentoCondicionado,
  dias: d.dias
});

// La misma cuenta que public/assets/roi.js (función desdeCfg). El diagnóstico no lleva recargo.
export function precioCerrado(personas: number, areas: number, d = DIAGNOSTICO) {
  const cfg = cfgPrecio(d);
  const big = personas > cfg.umbralRecargo ? cfg.recargo : 1;
  const train = personas > cfg.umbralFormacion ? cfg.trainBig : cfg.trainSmall;
  const n = Math.max(1, areas);
  const round = (v: number) => Math.round(v / 10) * 10;
  const puesta = [0, 1].map((i) => round((cfg.first[i] + cfg.extra[i] * (n - 1) + train[i]) * big));
  const descuento = cfg.descuentoCondicionado ? cfg.precio : 0;
  return {
    diagnostico: cfg.precio,
    descuento,
    puestaMin: puesta[0],
    puestaMax: puesta[1],
    netoMin: puesta[0] + cfg.precio - descuento,
    netoMax: puesta[1] + cfg.precio - descuento
  };
}

const euros = (n: number) => `${n.toLocaleString("es-ES")} €`;

function textosDiagnostico(d = DIAGNOSTICO) {
  const precio = euros(d.precio);
  const cond = d.descuentoCondicionado;
  // Redacción aprobada. Con precio 490 y 30 días coincide literalmente con el email.
  const condiciones = cond
    ? "Se aplica solo a proyectos (no a formación, acompañamiento ni licencias), uno por empresa, no es acumulable y no se devuelve en dinero."
    : "";
  const fraseProyecto = `Si contratas el proyecto en los ${d.dias} días siguientes a la entrega del informe, te descontamos los ${d.precio} €`;
  const faqLiteral = `Diagnóstico ${d.precio} € + IVA. ${fraseProyecto}. ${condiciones}`;
  const etiquetaCorta = `−${precio} si contratas el proyecto en ${d.dias} días desde la entrega del informe (condiciones en las FAQ)`;
  const lineaCorta = cond
    ? `${precio} + IVA. ${fraseProyecto}.`
    : `${precio}, descontable del proyecto.`;
  const conCondiciones = cond ? `${lineaCorta} ${condiciones}` : lineaCorta;
  const focoDetalle = cond ? `${precio} + IVA. ${etiquetaCorta}.` : "Descontable del proyecto.";
  const cierreFicha = cond
    ? `El diagnóstico cuesta ${precio} + IVA. ${fraseProyecto}. ${condiciones}`
    : `El diagnóstico cuesta ${precio}, descontable del proyecto.`;
  const faqDescuento = cond
    ? { q: "¿El diagnóstico se descuenta?", a: faqLiteral }
    : {
        q: "¿El diagnóstico se descuenta?",
        a: `Sí. El diagnóstico cuesta ${precio}, descontable del proyecto.`
      };
  const faqPrecio = cond
    ? `${faqLiteral} Siempre a precio cerrado, IVA no incluido: sabes lo que pagas antes de empezar y no hay extras. Poner en marcha un primer caso de uso cuesta entre 600 y 1.200 € según lo que haya que conectar. En la calculadora de la web tienes una horquilla para tu caso.`
    : `Siempre a precio cerrado, IVA no incluido: sabes lo que pagas antes de empezar y no hay extras. El diagnóstico exprés cuesta ${precio}, descontable del proyecto, y poner en marcha un primer caso de uso, entre 600 y 1.200 € según lo que haya que conectar. En la calculadora de la web tienes una horquilla para tu caso.`;
  const articulo = {
    apertura: cond
      ? `${precio} + IVA. ${fraseProyecto}. ${condiciones}`
      : `${precio}, descontable del proyecto`,
    servicios: cond
      ? faqLiteral
      : `${precio}, descontable del proyecto.`,
    faq: cond
      ? faqLiteral
      : `${precio}, sin IVA, descontable del proyecto.`
  };
  const calcDescuento = etiquetaCorta;
  const calcSinContratar = cond ? `sin contratar el proyecto después: ${precio}` : `sin contratar después: ${precio}`;
  const calcSupuesto = cond
    ? `Nuestro precio: diagnóstico (${precio} + IVA, sin el recargo por tamaño) + puesta en marcha de la primera área (600–1.200 €) y de cada área más (480–840 €) + formación del equipo (120–360 €). Más de 50 personas: +25 % solo sobre la puesta en marcha. Si contratas el proyecto en los ${d.dias} días siguientes a la entrega del informe, el total neto resta los ${d.precio} €. ${condiciones} Si no, pagas el diagnóstico. El precio final, cerrado, te lo damos tras el diagnóstico.`
    : `Nuestro precio: diagnóstico (${precio}, descontable del proyecto, sin el recargo por tamaño) + puesta en marcha de la primera área (600–1.200 €) y de cada área más (480–840 €) + formación del equipo (120–360 €). Más de 50 personas: +25 % solo sobre la puesta en marcha. El total suma diagnóstico y puesta en marcha. El precio final, cerrado, te lo damos tras el diagnóstico.`;
  const ej8 = precioCerrado(8, 2, d);
  const ej60 = precioCerrado(60, 2, d);
  const fmt = (n: number) => n.toLocaleString("es-ES");
  const corpus = cond
    ? `Precio cerrado orientativo de Sobtree, sin IVA. El diagnóstico (${d.precio} €) va en una línea aparte y no lleva el recargo del 25 % de más de 50 personas. La puesta en marcha (primera área 600–1.200 €, cada área adicional 480–840 €, formación 120–360 €) sí lleva ese 25 % si la empresa tiene más de 50 personas. Si se contrata el proyecto en los ${d.dias} días siguientes a la entrega del informe, se restan ${d.precio} € y el total neto es la puesta en marcha; si no se contrata el proyecto después, el coste es el diagnóstico. ${condiciones} Por ejemplo, 8 personas y dos áreas: diagnóstico ${fmt(ej8.diagnostico)} €, puesta en marcha ${fmt(ej8.puestaMin)}–${fmt(ej8.puestaMax)} €, descuento −${fmt(ej8.descuento)} €, total neto ${fmt(ej8.netoMin)}–${fmt(ej8.netoMax)} €. Con 60 personas y dos áreas: diagnóstico ${fmt(ej60.diagnostico)} €, puesta en marcha ${fmt(ej60.puestaMin)}–${fmt(ej60.puestaMax)} €, descuento −${fmt(ej60.descuento)} €, total neto ${fmt(ej60.netoMin)}–${fmt(ej60.netoMax)} €.`
    : `Precio cerrado orientativo de Sobtree, sin IVA. El diagnóstico (${precio}, descontable del proyecto) va en una línea aparte y no lleva el recargo del 25 %. La puesta en marcha (primera área 600–1.200 €, cada área adicional 480–840 €, formación 120–360 €) sí lleva ese 25 % si hay más de 50 personas. El total es la suma. Por ejemplo, 8 personas y dos áreas: entre ${fmt(ej8.netoMin)} y ${fmt(ej8.netoMax)} €. Con 60 personas y dos áreas: entre ${fmt(ej60.netoMin)} y ${fmt(ej60.netoMax)} €.`;
  return {
    lineaCorta,
    focoDetalle,
    cierreFicha,
    condiciones,
    faqDescuento,
    faqPrecio,
    articulo,
    calcDescuento,
    calcSinContratar,
    calcSupuesto,
    corpus,
    llmsPaso: `Diagnóstico IA exprés (1 semana, ${conCondiciones}): qué tareas automatizar, cuánto ahorras y cuánto cuesta.`,
    llmsIntro: `El punto de entrada es un diagnóstico IA exprés de 1 semana (${conCondiciones.replace(/\.$/, "")}). Sede en Madrid; trabaja en remoto para toda España.`,
    duracionServicio: `1 semana · ${conCondiciones}`
  };
}

export const TEXTOS = textosDiagnostico();

// Precios cerrados, IVA no incluido. La calculadora lee cfgPrecio() desde esta misma fuente.
export const SERVICES = [
  { name: "Diagnóstico IA exprés", duration: TEXTOS.duracionServicio, description: "Revisamos cómo trabajáis, detectamos las tareas que más tiempo os comen y salís con 3 casos de uso priorizados, con su ahorro estimado y su coste." },
  { name: "Primer caso de uso en marcha", duration: "2–3 semanas · 600–1.200 € según el caso, precio cerrado antes de empezar", description: "Implantamos un caso de uso completo (atención al cliente, presupuestos, facturas, contenidos…) con herramientas que ya existen, sin desarrollos a medida caros." },
  { name: "Formación de tu equipo", duration: "Desde 120 €", description: "Tu gente aprende a usar la IA en su día a día con ejemplos de vuestro propio trabajo, no con teoría." },
  { name: "Acompañamiento mensual", duration: "Desde 240 €/mes, cuota fija", description: "Un caso de uso nuevo cada mes, ajustes y soporte. Sin permanencia." }
];

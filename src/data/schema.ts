// Datos estructurados schema.org (JSON-LD) para buscadores y asistentes de IA.
import { SITE, AUTHOR, SERVICES } from "./site";
import { FAQ } from "./faq";

const ORG_ID = `${SITE.url}/#organization`;
const SITE_ID = `${SITE.url}/#website`;
const PERSON_ID = `${SITE.url}/#author`;

export function organization() {
  return {
    "@type": "ProfessionalService",
    "@id": ORG_ID,
    name: SITE.name,
    legalName: SITE.legalName,
    url: `${SITE.url}/`,
    logo: `${SITE.url}/assets/favicon.svg`,
    email: SITE.email,
    description: SITE.description,
    address: { "@type": "PostalAddress", addressLocality: SITE.city, addressCountry: SITE.country },
    areaServed: SITE.areaServed,
    knowsLanguage: SITE.languages,
    knowsAbout: SITE.knowsAbout,
    ...(AUTHOR && { founder: { "@id": PERSON_ID } }),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Implantación de IA para pymes",
      itemListElement: SERVICES.map((s) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: s.name, description: s.description, provider: { "@id": ORG_ID } }
      }))
    }
  };
}

export function website() {
  return { "@type": "WebSite", "@id": SITE_ID, url: `${SITE.url}/`, name: SITE.name, inLanguage: "es-ES", publisher: { "@id": ORG_ID } };
}

export function person() {
  if (!AUTHOR) return null;
  return { "@type": "Person", "@id": PERSON_ID, name: AUTHOR.name, jobTitle: AUTHOR.jobTitle, url: AUTHOR.url, sameAs: AUTHOR.sameAs, worksFor: { "@id": ORG_ID } };
}

export function faqPage() {
  return {
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } }))
  };
}

export function article(a: { title: string; description: string; url: string; date: Date; updated?: Date; tags: string[]; image?: string; autor?: string }) {
  // Solo la portada del frontmatter. La ilustración de marca no es un archivo: no se inventa una URL.
  const image = a.image ? new URL(a.image, SITE.url).href : undefined;
  // El autor del análisis es la organización Sobtree (no una persona: AUTHOR sigue vacío).
  const author = a.autor
    ? { "@type": "Organization", name: a.autor, url: `${SITE.url}/`, parentOrganization: { "@id": ORG_ID } }
    : AUTHOR ? { "@id": PERSON_ID } : { "@id": ORG_ID };
  return {
    "@type": "Article",
    headline: a.title,
    description: a.description,
    url: a.url,
    mainEntityOfPage: a.url,
    datePublished: a.date.toISOString(),
    dateModified: (a.updated ?? a.date).toISOString(),
    inLanguage: "es-ES",
    keywords: a.tags.join(", "),
    ...(image ? { image } : {}),
    author,
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": SITE_ID }
  };
}

// Agrupa varios nodos en un único bloque @graph.
export function graph(...nodes: (object | null)[]) {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes.filter(Boolean) });
}

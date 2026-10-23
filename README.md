# Sobtree — web de servicios IA × Salesforce

Sitio estático generado con [Astro](https://astro.build). El contenido se escribe en Markdown/MDX y cada push a `main` compila la web y la sube a Hostinger.

## Estructura

```
src/pages/index.astro          Home: bento + secciones (servicios, casos, ROI, método, autodiagnóstico, FAQ, contacto)
src/components/Bento.astro     Bloques de la home: propuesta, calculadora mini, Radar, análisis, método, reservar
src/pages/analisis/            Listado y página de cada análisis
src/pages/radar/               Listado y página de cada entrega del Radar
src/pages/privacidad.astro     Privacidad y aviso legal
src/pages/llms.txt.ts          /llms.txt y /llms-full.txt, generados desde los datos de la web
src/content/analisis/          Análisis en .md/.mdx (ver plantilla.mdx)
src/content/radar/             Radar semanal en .md/.mdx (ver plantilla.mdx)
src/data/site.ts               Datos de la empresa, servicios y autor
src/data/faq.ts                Preguntas frecuentes (alimentan el FAQ visible, el JSON-LD y llms.txt)
src/data/schema.ts             Datos estructurados schema.org
src/layouts/Base.astro         <head>, cabecera y pie comunes
public/                        Se copia tal cual: assets/, contact.php, .htaccess, robots.txt
.github/workflows/deploy.yml   Compila y publica dist/ en la rama hostinger
```

## Trabajar en local

```bash
npm install
npm run dev      # http://localhost:4321 con recarga en vivo
npm run build    # genera dist/
npm run preview  # sirve dist/ para revisarlo
```

## Publicar un análisis

Copia `src/content/analisis/plantilla.mdx` con un nombre en minúsculas y guiones (será la URL), rellena el frontmatter, pon `draft: false` y haz push. Se generan solos la página, el JSON-LD `Article`, el sitemap y las entradas de `llms.txt`.

## Publicar el Radar

Copia `src/content/radar/plantilla.mdx` (por ejemplo `2026-semana-44.mdx`), escribe de 1 a 4 `puntos` (son los que salen en la home), desarrolla cada uno en el cuerpo y pon `draft: false`.

Mientras no haya Radar ni análisis publicados, la home muestra en su lugar el autodiagnóstico y los casos de uso por sector, y los enlaces de Radar y Análisis no salen en el menú ni en el sitemap.

## Para buscadores y asistentes de IA

- `robots.txt` permite explícitamente a GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Google-Extended y Applebot-Extended.
- `/llms.txt` (índice) y `/llms-full.txt` (contenido completo) siguiendo llmstxt.org.
- JSON-LD: `ProfessionalService` con catálogo de servicios, `WebSite`, `FAQPage` y `Article`. `Person` se activa al rellenar `AUTHOR` en `src/data/site.ts`.
- `sitemap-index.xml` automático.

## Publicar en Hostinger

La web necesita compilarse, así que Hostinger no publica `main` sino la rama `hostinger`:

1. Cada push a `main` lanza `.github/workflows/deploy.yml`, que compila con Astro y sube `dist/` a la rama `hostinger`.
2. hPanel → sobtree.com → Conectado con GitHub, con rama `hostinger` y directorio `public_html`, y la implementación automática publica ese contenido.

No edites la rama `hostinger` a mano: se sobrescribe en cada build.

## Antes de publicar

- Formulario: `public/contact.php` envía cada solicitud a `info@sobtree.com` con `mail()` de Hostinger. Crea en hPanel el buzón `web@sobtree.com` (remitente) o cambia `$from` en el PHP.
- `privacidad`: texto base de privacidad y aviso legal. Revísalo con tu asesor antes de publicar.
- Revisa la compatibilidad con tu contrato laboral actual antes de hacer pública la web.

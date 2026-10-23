# Sobtree — web de servicios IA × Salesforce

Sitio estático generado con [Astro](https://astro.build). El contenido se escribe en Markdown/MDX y cada push a `main` compila la web y la sube a Hostinger.

## Estructura

```
src/pages/index.astro          Home (servicios, casos, calculadora ROI, método, autodiagnóstico, FAQ, contacto)
src/pages/analisis/            Listado y página de cada análisis
src/pages/privacidad.astro     Privacidad y aviso legal
src/pages/llms.txt.ts          /llms.txt y /llms-full.txt, generados desde los datos de la web
src/content/analisis/          Análisis en .md/.mdx (ver plantilla.mdx)
src/data/site.ts               Datos de la empresa, servicios y autor
src/data/faq.ts                Preguntas frecuentes (alimentan el FAQ visible, el JSON-LD y llms.txt)
src/data/schema.ts             Datos estructurados schema.org
src/layouts/Base.astro         <head>, cabecera y pie comunes
public/                        Se copia tal cual: assets/, contact.php, .htaccess, robots.txt
.github/workflows/deploy.yml   Compilación y despliegue por FTP
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

## Para buscadores y asistentes de IA

- `robots.txt` permite explícitamente a GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Google-Extended y Applebot-Extended.
- `/llms.txt` (índice) y `/llms-full.txt` (contenido completo) siguiendo llmstxt.org.
- JSON-LD: `ProfessionalService` con catálogo de servicios, `WebSite`, `FAQPage` y `Article`. `Person` se activa al rellenar `AUTHOR` en `src/data/site.ts`.
- `sitemap-index.xml` automático.

## Publicar en Hostinger

La web ya **necesita compilarse**, así que no se puede subir el repositorio tal cual ni usar el Git nativo de Hostinger (subiría el código fuente, no la web).

1. Si tenías conectado hPanel → Avanzado → Git a este repositorio, desconéctalo.
2. En GitHub → Settings → Secrets and variables → Actions crea los secretos `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` y la variable `DEPLOY_ENABLED = true`.
3. Cada push a `main` compila y sube `dist/` a `public_html/`.

Manual: `npm run build` y sube el contenido de `dist/` (incluido `.htaccess`) a `public_html/`.

## Antes de publicar

- Formulario: `public/contact.php` envía cada solicitud a `info@sobtree.com` con `mail()` de Hostinger. Crea en hPanel el buzón `web@sobtree.com` (remitente) o cambia `$from` en el PHP.
- `privacidad`: texto base de privacidad y aviso legal. Revísalo con tu asesor antes de publicar.
- Revisa la compatibilidad con tu contrato laboral actual antes de hacer pública la web.

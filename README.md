# Sobtree — web de servicios IA × Salesforce

Sitio estático generado con [Astro](https://astro.build). **Diseño y maquetación: [DESIGN.md](DESIGN.md)** (colores, tipografía, componentes, movimiento, responsive y línea editorial). El contenido se escribe en Markdown/MDX y cada push a `main` compila la web y la sube a Hostinger.

## Estructura

```
src/pages/index.astro          Portada: Foco + artículos + secciones (servicios, casos, método, autodiagnóstico, FAQ, contacto)
src/components/Foco.astro      Primera pantalla: titular, diagrama interactivo, «cómo lo hacemos» y franja de confianza
src/components/Articulos.astro Artículo destacado con portada y resumen + lista
src/components/Asistente.astro Burbuja «Deja tu nombre y comienza a ahorrar» y diálogo del asistente
src/components/Cover.astro     Portada de artículo (imagen o ilustración generada)
src/pages/calculadora/         Calculadora de ahorro
src/data/confianza.ts          Logos de la franja de confianza (solo con permiso)
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
public/api/asistente.php       Asistente de la home (llama a Claude con el contenido de la web)
src/pages/api/corpus.json.ts   Documentos que el asistente puede citar, generados en cada build
api/composer.json              Dependencias PHP del asistente (el build las instala en dist/api/vendor)
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

## Newsletter

Al final de cada análisis y Radar hay un formulario de suscripción (email + consentimiento). Envía a `/api/newsletter.php`, que reenvía el alta a un webhook de Zapier. Para activarlo, añade esta línea al array de `domains/sobtree.com/sobtree-secrets.php` (el mismo fichero de la clave del asistente):

`'ZAPIER_NEWSLETTER_WEBHOOK' => 'https://hooks.zapier.com/hooks/catch/...',`

Zapier recibe `email`, `consentimiento`, `texto_consentimiento`, `origen` (página) y `fecha`. Mientras no haya webhook, el formulario no aparece. Límite: 5 altas por IP y hora, 300 al día.

## Radar y artículo semanal

Cada lunes a las 8:00 (hora de Madrid) una rutina en la nube prepara el Radar de la semana y un artículo para CIOs, y abre un pull request «¿Publicar? …» con el texto completo. Te llega un email.

- **Publicar:** abre el PR y escribe **OK** en un comentario (vale también «publicar» o «súbelo»). La acción `publicar-con-ok.yml` fusiona el PR y despliega la web en 1–2 minutos. Pulsar «Merge» en GitHub hace lo mismo.
- **Descartar:** cierra el PR.
- Solo cuenta un comentario del dueño del repositorio y solo en ramas `radar/*`.

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

## Asistente de IA

La caja de la home envía la pregunta a `/api/asistente.php`, que llama a Claude (`claude-opus-5-5`, esfuerzo bajo) con el contenido de la web como documentos citables. Responde solo con ese contenido, cita las fuentes y, si detecta intención de contratar, ofrece reservar (rellena el formulario de contacto).

- **Clave de la API:** nunca en el repositorio. Créala en console.anthropic.com y súbela con el gestor de archivos de Hostinger a `domains/sobtree.com/sobtree-secrets.php` (fuera de `public_html`):
  `<?php return ['ANTHROPIC_API_KEY' => 'sk-ant-...'];`
- **Mientras no haya clave**, la caja no aparece y la home muestra sus botones de siempre.
- **Límites:** 20 preguntas por visitante y hora, 500 al día en total (`LIMIT_*` en `asistente.php`). Pon además un límite de gasto mensual en la consola de Anthropic.
- **Contenido:** el asistente sabe lo que sabe la web. Al publicar un Radar o un análisis, el asistente lo incorpora en el siguiente build.

## Antes de publicar

- Formulario: `public/contact.php` envía cada solicitud a `info@sobtree.com` con `mail()` de Hostinger. Crea en hPanel el buzón `web@sobtree.com` (remitente) o cambia `$from` en el PHP.
- `privacidad`: texto base de privacidad y aviso legal. Revísalo con tu asesor antes de publicar.
- Revisa la compatibilidad con tu contrato laboral actual antes de hacer pública la web.

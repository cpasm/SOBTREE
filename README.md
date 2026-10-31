# Sobtree — IA para pymes con precio transparente

Sitio estático generado con [Astro](https://astro.build). **Diseño y maquetación: [DESIGN.md](DESIGN.md)** (colores, tipografía, componentes, movimiento, responsive y línea editorial). El contenido se escribe en Markdown/MDX y cada push a `main` compila la web y la sube a Hostinger.

## Estructura

```
src/pages/index.astro          Portada: Foco + artículos + secciones (servicios, casos, método, autodiagnóstico, FAQ, contacto)
src/components/Foco.astro      Primera pantalla: titular, diagrama interactivo, «cómo lo hacemos» y franja de confianza
src/components/Articulos.astro Artículo destacado con portada y resumen + lista
src/components/Asistente.astro Burbuja «Deja tu nombre y comienza a ahorrar» y diálogo del asistente
src/components/Cover.astro     Portada de artículo (imagen o ilustración generada)
src/pages/calculadora/         Calculadora: ahorro con IA y precio cerrado orientativo (tarifas en public/assets/roi.js)
src/data/confianza.ts          IA de la franja «Trabajamos con» (logos opcionales en public/img/logos/ia/)
src/pages/analisis/            Listado y página de cada análisis
src/pages/radar/               Listado y página de cada entrega del Radar
src/pages/privacidad.astro     Privacidad y aviso legal
src/pages/llms.txt.ts          /llms.txt y /llms-full.txt, generados desde los datos de la web
src/content/analisis/          Análisis en .md/.mdx (ver plantilla.mdx)
src/content/radar/             Radar semanal en .md/.mdx (ver plantilla.mdx)
src/data/site.ts               Datos de la empresa, servicios con precio cerrado y autor
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

Al final de cada análisis y Radar hay un formulario de suscripción (email + consentimiento). Envía las altas a `/api/newsletter.php`, que actualmente depende de un webhook externo configurado en el fichero de secretos de Hostinger. El formulario solo se muestra cuando el endpoint confirma que la integración está configurada. Límites: 5 altas por IP y hora, 300 al día.

La migración de la newsletter fuera de ese webhook está pendiente y debe hacerse con pruebas de consentimiento, bajas, duplicados y envío antes de retirar la integración vigente.

## Radar y artículo semanal

Cada lunes a las 8:00 (hora de Madrid) una rutina en la nube prepara el Radar de la semana y un artículo práctico de IA para pymes, y abre un pull request «¿Publicar? …» con el texto completo. Te llega un email.

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

- Formulario: ver «Captura de leads» más abajo. El aviso a info@ y la respuesta automática E-02 salen con remitente `info@sobtree.com` (buzón real en Google Workspace); se puede cambiar con `LEADS_NOTIFY_FROM` si se crea otro buzón o alias.
- `privacidad`: texto base de privacidad y aviso legal. Revísalo con tu asesor antes de publicar.
- Revisa la compatibilidad con tu contrato laboral actual antes de hacer pública la web.

## Captura de leads (formulario → registro local → correo a info@)

`public/contact.php` recibe el formulario de la portada (también cuando llega desde la calculadora o el asistente) y, en este orden:

1. Valida y filtra spam (honeypot `web`, envíos en menos de 3 s, 1 envío cada 30 s por IP).
2. **Guarda el lead** en `domains/sobtree.com/sobtree-leads/leads.jsonl` (fuera de `public_html`, con bloqueo de escritura y permisos 600) **antes de cualquier envío**.
3. Responde al visitante.
4. **Aviso a `info@sobtree.com`** con todos los campos (contacto, mensaje, consentimientos, página, entrada, referrer y cada `utm_*`) y asunto estable `[Sobtree] Nuevo contacto <id>` (lo busca la rutina de NEXUS en Gmail).
5. **Respuesta automática E-02** (texto aprobado, D-115) al visitante, desde info@, en texto plano y firmada «El equipo de Sobtree». Reglas: solo `tipo_formulario = contacto`; solo de lunes a viernes de 9:00 a 19:00 (Europe/Madrid, sin los festivos de `LEADS_E02_FESTIVOS`: nacionales y de Madrid; los de Madrid están pendientes de verificar en el BOCM); fuera de horario queda en cola y la manda el cron en la siguiente ventana; una sola respuesta por lead y por email en 7 días; sin seguimientos; como mucho 5 por ejecución del cron y 20 por hora en total; no se responde a leads de prueba ni a spam evidente (heurística en `leads_e02_filtro()` de `public/lib/leads.php`: dominios reservados, palabra «prueba»/«test», dominios desechables conocidos, enlaces en nombre/empresa, 2+ enlaces en el mensaje, campos idénticos, nombre sin vocales, alfabeto cirílico/CJK, palabras de 30+ caracteres, letras con 3+ dígitos incrustados como «NAEWTRER276562NERTH», la misma cifra de 3+ dígitos en nombre y mensaje). Se apaga con `LEADS_AUTORESPUESTA = '0'` en `sobtree-secrets.php`.

El registro canónico de contactos es el registro local del servidor + el correo de aviso a info@. La hoja «Sobtree · Contactos» ya no se escribe sola (queda como histórico). Cada envío queda en `estado.jsonl` (canal `correo` para el aviso y `e02` para la respuesta: `pendiente`, `enviando`, `enviado`, `error`, `descartado` con su motivo). Una marca `enviando` sin confirmar cuenta como enviada: ante la duda no se repite.

Lo que falle lo reintenta `public/lib/reintentar-leads.php` (cron cada 15 min en hPanel → Avanzado → Cron Jobs): reenvía solo los avisos que fallaron y manda las E-02 pendientes en horario.
`/usr/bin/php /home/<usuario>/domains/sobtree.com/public_html/lib/reintentar-leads.php`

- **Configuración:** opcional, en `sobtree-secrets.php` (ver `config/sobtree-secrets.example.php`): `LEADS_DIR`, `LEADS_NOTIFY_TO`, `LEADS_NOTIFY_FROM`, `LEADS_AUTORESPUESTA`. La web no llama a ningún servicio externo para los leads; solo guarda en disco y envía correo con `mail()`.
- **Origen:** `assets/origen.js` guarda en `sessionStorage` (sin cookies) la página de entrada, el referrer externo y las UTM; `main.js` las copia en campos ocultos al enviar.
- **Pruebas locales:** `npm run test:leads` (servidor PHP local; ningún correo sale de la máquina) y `npm run test:leads-hoja` (pruebas sin red del aviso y de E-02: horario, cola, idempotencia, frenos y filtros).

## Publicación automática de agentes
Las ramas `claude/auto-*` se compilan, prueban, publican y comprueban solas (`.github/workflows/auto-claude.yml`). Si la web falla tras publicar, se revierte sola. Resultado en la rama `claude/auto-resultados`.
Los cambios en archivos protegidos quedan con estado `pendiente_ok_fundador` y no se publican.

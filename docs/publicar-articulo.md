# Publicar «Cuánto cuesta implantar IA en una pyme»

El artículo ya está escrito en `src/content/analisis/cuanto-cuesta-implantar-ia-en-una-pyme.mdx`, con `draft: false`. No entra en producción hasta que el fundador dé el OK y se fusione a `main`. La URL será:

`https://sobtree.com/analisis/cuanto-cuesta-implantar-ia-en-una-pyme/`

Un push a `main` compila y despliega a producción (`.github/workflows/deploy.yml` → rama `hostinger`). No hagas ese push hasta terminar las comprobaciones de abajo. Esta rama no publica nada.

## Qué quedó relleno

El esquema está en `src/content.config.ts`. `description` admite como máximo 200 caracteres. Las frases del diagnóstico salen de `DIAGNOSTICO` en `src/data/site.ts` (`descuentoCondicionado`).

| Campo | Estado |
|---|---|
| `title` | «Cuánto cuesta implantar IA en una pyme (y de qué depende)» |
| `seoTitle` | «Cuánto cuesta implantar IA en una pyme en 2026 \| Sobtree» |
| `description` | 157 caracteres, la del paquete |
| `date` | 2026-10-27 |
| `autor` | El equipo de Sobtree (valor por defecto del esquema) |
| `tags` | Pymes, Precios, Primeros pasos |
| `linea` | IA. Valores posibles: `IA`, `Normativa`, `Caso de uso`. |
| `imagen` | `/img/cuanto-cuesta-implantar-ia-pyme.png`. Alt: «Cuánto cuesta implantar IA en una pyme, guía de Sobtree». |
| `draft` | `false`. Publicar es fusionar a `main` con el OK del fundador. |

Las frases de precio del cuerpo no están escritas a mano: las pinta `FraseDiagnostico` desde `DIAGNOSTICO`. Con `descuentoCondicionado: true` la FAQ usa la redacción aprobada: «Diagnóstico 490 € + IVA. Si contratas el proyecto en los 30 días siguientes a la entrega del informe, te descontamos los 490 €. Se aplica solo a proyectos (no a formación, acompañamiento ni licencias), uno por empresa, no es acumulable y no se devuelve en dinero.» Con `descuentoCondicionado: false` pasan a «490 €, descontable del proyecto».

No hay autor con nombre de persona (`AUTHOR` en `src/data/site.ts` está vacío). El JSON-LD usa una Organization.

## Antes de fusionar a main

1. Newsletter: el formulario ya está en la plantilla (`#newsletter`). No hace falta otro enlace. Permanece oculto hasta que `ZAPIER_NEWSLETTER_WEBHOOK` está configurado.
2. `npm run build` tiene que pasar.
3. Comprueba sitemap, canónica, JSON-LD y enlaces internos con los comandos de abajo.

## Comprobaciones sobre `dist/`

Sustituye la ruta si el build numera el sitemap de otra forma (`sitemap-0.xml` es el habitual).

```bash
# Con draft: false la URL tiene que salir. /radar/ no, mientras no haya entregas publicadas.
grep -n "cuanto-cuesta-implantar-ia-en-una-pyme" dist/sitemap-0.xml
grep -n "/radar/" dist/sitemap-0.xml && echo "radar en el sitemap" || echo "radar fuera del sitemap"

# Canónica absoluta, con https y barra final.
grep -o 'rel="canonical" href="[^"]*"' dist/analisis/cuanto-cuesta-implantar-ia-en-una-pyme/index.html

# JSON-LD: un solo bloque, parseable, tipo Article.
node --input-type=module -e '
import { readFileSync } from "node:fs";
const html = readFileSync("dist/analisis/cuanto-cuesta-implantar-ia-en-una-pyme/index.html", "utf8");
const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
if (blocks.length !== 1) throw new Error("Se esperaba un único JSON-LD");
const graph = blocks[0]["@graph"];
const article = graph.find((n) => n["@type"] === "Article");
const org = graph.find((n) => n["@id"]?.endsWith("#organization"));
const canonical = html.match(/rel="canonical" href="([^"]+)"/)[1];
const required = ["headline", "description", "datePublished", "dateModified", "author", "publisher", "mainEntityOfPage", "inLanguage"];
for (const key of required) if (article[key] == null || article[key] === "") throw new Error("Falta " + key);
if (article.mainEntityOfPage !== canonical) throw new Error("mainEntityOfPage no es la canónica");
if (article.inLanguage !== "es-ES") throw new Error("inLanguage");
if (article.publisher["@id"] !== org["@id"] || org.name !== "Sobtree") throw new Error("publisher");
if (article.datePublished.slice(0, 10) !== "2026-10-27") throw new Error("datePublished");
console.log("JSON-LD válido", canonical);
'

# Enlaces internos del HTML: cada href del sitio debe existir como página o ancla conocida.
node --input-type=module -e '
import { readFileSync, existsSync } from "node:fs";
const html = readFileSync("dist/analisis/cuanto-cuesta-implantar-ia-en-una-pyme/index.html", "utf8");
const hrefs = [...html.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1]);
const missing = [...new Set(hrefs)].filter((h) => {
  if (h === "/") return false;
  const path = "dist" + (h.endsWith("/") ? h + "index.html" : h);
  return !existsSync(path);
});
if (missing.length) { console.error(missing); process.exit(1); }
console.log("Enlaces internos resueltos:", [...new Set(hrefs)].length);
'
```

Con `draft: false` la URL sale en el sitemap, en `/llms.txt` y en el listado, con `https://sobtree.com` y barra final. `/radar/` no entra mientras la única entrega sea la plantilla en borrador.

El JSON-LD lo escribe la plantilla (`src/data/schema.ts`, tipo `Article` dentro de `@graph`). `publisher` apunta a la organización Sobtree del mismo bloque. `author` es una `Organization` con el `autor` del frontmatter («El equipo de Sobtree») y `parentOrganization` hacia Sobtree. `image` solo se añade si `imagen` tiene valor. Esa misma URL absoluta es `og:image` y `twitter:image` (la tarjeta pasa a `summary_large_image`). Sin `imagen`, la página no lleva imagen social y la tarjeta sigue siendo `summary`.

El flujo de n8n exportado hay que reimportarlo a mano si se quieren los importes desglosados en la nota del lead. La firma HMAC y la cola de reintentos no cambian.

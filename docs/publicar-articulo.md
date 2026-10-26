# Publicar «Cuánto cuesta implantar IA en una pyme»

El borrador está en `src/content/analisis/cuanto-cuesta-implantar-ia-en-una-pyme.mdx`, con `draft: true`. La URL final, cuando se publique, será:

`https://sobtree.com/analisis/cuanto-cuesta-implantar-ia-en-una-pyme/`

Un push a `main` compila y despliega a producción (`.github/workflows/deploy.yml` → rama `hostinger`). No hagas ese push hasta terminar las comprobaciones de abajo. Esta rama no publica nada.

## Qué hay que rellenar

El esquema está en `src/content.config.ts`. `description` admite como máximo 200 caracteres.

| Campo | Estado | Qué poner |
|---|---|---|
| `title` | Relleno | Cámbialo solo si el titular definitivo es otro. |
| `description` | `REEMPLAZAR_DESCRIPCION` | Resumen de 2–3 frases. Es la meta description y el texto de las tarjetas. Máximo 200 caracteres. |
| `date` | `2026-10-27` | Fecha de publicación. No la cambies salvo que se decida otra. |
| `updated` | Comentado | Solo si el texto se revisa después de publicarlo. Si no existe, `dateModified` del JSON-LD usa `date`. |
| `tags` | `REEMPLAZAR_ETIQUETA` | Lista real. El tema de la portada ilustrada sale de aquí (`precio`, `coste` o `ahorro` → tema ahorro). |
| `linea` | `IA` | Déjala en `IA` salvo que la pieza sea de Salesforce. Valores: `Salesforce`, `IA`, `Salesforce + IA`. |
| `imagen` | Comentado | Ruta pública, por ejemplo `/img/coste-ia-pyme.jpg`. Archivo en `public/img/`, con licencia de uso. |
| `imagenAlt` | Comentado | Obligatorio si hay `imagen`. Describe la foto; no repitas el título si no aporta. |
| `draft` | `true` | Pásalo a `false` solo cuando el texto esté pegado y revisado. |
| Cuerpo | `{/* REEMPLAZAR_CUERPO */}` | El artículo. Borra el comentario. |

No hay autor con nombre en la web (`AUTHOR` en `src/data/site.ts` está vacío). El JSON-LD usa la organización Sobtree. No inventes una persona.

## Pasos (menos de 30 minutos)

1. Pega el texto en el cuerpo, en español, y borra `{/* REEMPLAZAR_CUERPO */}`.
2. Sustituye cada `REEMPLAZAR_...` del frontmatter. `description` tiene que seguir cabiendo en 200 caracteres.
3. Imágenes: guárdalas en `public/img/`, descomenta `imagen` y `imagenAlt`, y comprueba que cada `<img>` del cuerpo (si las hay) lleva `alt`. No uses fotos sin licencia.
4. Fuentes: cada cifra o afirmación ajena lleva un enlace, con el nombre de la fuente en el texto del enlace, como en los análisis ya publicados. Enlaces internos con ruta del sitio y barra final: `/calculadora/`, `/analisis/como-empezar-con-ia-en-tu-pyme/`, `/analisis/ley-de-ia-que-exige-a-tu-pyme/`, `/#contacto`.
5. Newsletter: el formulario ya está en la plantilla del artículo (`src/layouts/Post.astro` incluye `Newsletter.astro`, ancla `#newsletter`). No añadas otro. En el cuerpo, si quieres enlazarlo, usa `[la newsletter](#newsletter)`. El formulario permanece oculto hasta que `ZAPIER_NEWSLETTER_WEBHOOK` está configurado en el servidor; no enlaces una URL de newsletter que no existe.
6. Pon `draft: false`.
7. `npm run build`. Tiene que terminar sin errores.

## Comprobaciones sobre `dist/`

Sustituye la ruta si el build numera el sitemap de otra forma (`sitemap-0.xml` es el habitual).

```bash
# El borrador no debe estar. Con draft: false, esta URL sí debe salir.
grep -n "cuanto-cuesta-implantar-ia-en-una-pyme" dist/sitemap-0.xml || echo "NO está en el sitemap"

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

Con `draft: true` la página no se genera y el slug no entra en el sitemap, en `/llms.txt` ni en el listado. Vuelve a mirar el sitemap después de poner `draft: false`: la URL tiene que aparecer una vez, con `https://sobtree.com` y barra final.

El JSON-LD ya lo escribe la plantilla (`src/data/schema.ts`, tipo `Article` dentro de `@graph`). No lo copies a mano. `publisher` apunta a la organización Sobtree del mismo bloque (nombre, razón social, logo y URL que ya usa el sitio). `image` solo se añade si `imagen` tiene valor, como URL absoluta. `author` es esa misma organización mientras `AUTHOR` siga vacío.

Mientras preparas el texto, `npm run build` debe seguir pasando y el slug no debe aparecer en `dist/sitemap-0.xml`.

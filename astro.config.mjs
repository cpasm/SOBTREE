import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// /analisis/ y /radar/ solo entran en el sitemap cuando tienen algo publicado (sin draft: true).
const hasPublished = (name) => {
  const dir = new URL(`./src/content/${name}/`, import.meta.url);
  return readdirSync(dir).some((f) => /\.mdx?$/.test(f) && !/^draft:\s*true/m.test(readFileSync(new URL(f, dir), "utf8")));
};
const empty = ["analisis", "radar"].filter((c) => !hasPublished(c));

// URL de directorio, con barra final y sin index.html: es la que Apache responde 200.
const canonicalPath = (page) => {
  let path = new URL(page).pathname.replace(/index\.html$/, "");
  if (path === "") path = "/";
  if (!path.endsWith("/")) path += "/";
  return path;
};

// Solo páginas públicas que deben indexarse. Nada de 404, gracias, /lib, /api
// ni rutas internas de la calculadora (la portada /calculadora/ sí).
const indexable = (page) => {
  const raw = new URL(page).pathname;
  const path = canonicalPath(page);
  if (/(^|\/)404(\.html)?\/?$/.test(raw)) return false;
  if (empty.some((c) => path.startsWith(`/${c}/`))) return false;
  if (path.startsWith("/calculadora/") && path !== "/calculadora/") return false;
  if (path.startsWith("/lib/") || path.startsWith("/api/")) return false;
  if (path.startsWith("/contratar/")) return false;
  if (/\/(gracias|thanks|thank-you|error)(\/|$)/i.test(path)) return false;
  return true;
};

// Con el flag apagado el build no publica /contratar/. El botón tampoco se pinta.
function quitarContrataSiApagado() {
  return {
    name: "contrata-no-publicar",
    hooks: {
      "astro:build:done": ({ dir }) => {
        if (process.env.PUBLIC_CONTRATA_ACTIVO === "1") return;
        rmSync(path.join(fileURLToPath(dir), "contratar"), { recursive: true, force: true });
      }
    }
  };
}

const phpOrigin = process.env.CONTRATA_PHP_ORIGIN;

export default defineConfig({
  site: "https://sobtree.com",
  // En Hostinger un directorio sin barra responde 301 a la URL con barra. Esa es la canónica.
  trailingSlash: "always",
  ...(phpOrigin
    ? { server: { proxy: { "/api": phpOrigin, "/contact.php": phpOrigin } } }
    : {}),
  integrations: [
    mdx(),
    sitemap({ filter: indexable }),
    quitarContrataSiApagado()
  ]
});

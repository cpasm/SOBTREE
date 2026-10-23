import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { readdirSync, readFileSync } from "node:fs";

// /analisis/ solo entra en el sitemap cuando hay algún análisis publicado (sin draft: true).
const dir = new URL("./src/content/analisis/", import.meta.url);
const hasPosts = readdirSync(dir).some((f) => /\.mdx?$/.test(f) && !/^draft:\s*true/m.test(readFileSync(new URL(f, dir), "utf8")));

export default defineConfig({
  site: "https://sobtree.com",
  trailingSlash: "ignore",
  integrations: [
    mdx(),
    sitemap({ filter: (page) => !page.includes("/privacidad") && (hasPosts || !page.includes("/analisis")) })
  ]
});

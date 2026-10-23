import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { readdirSync, readFileSync } from "node:fs";

// /analisis/ y /radar/ solo entran en el sitemap cuando tienen algo publicado (sin draft: true).
const hasPublished = (name) => {
  const dir = new URL(`./src/content/${name}/`, import.meta.url);
  return readdirSync(dir).some((f) => /\.mdx?$/.test(f) && !/^draft:\s*true/m.test(readFileSync(new URL(f, dir), "utf8")));
};
const empty = ["analisis", "radar"].filter((c) => !hasPublished(c));

export default defineConfig({
  site: "https://sobtree.com",
  trailingSlash: "ignore",
  integrations: [
    mdx(),
    sitemap({ filter: (page) => !page.includes("/privacidad") && !empty.some((c) => page.includes(`/${c}/`)) })
  ]
});

import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Análisis: un fichero .md o .mdx por artículo en src/content/analisis/.
// El nombre del fichero es la URL: agentforce-coste-por-caso.mdx → /analisis/agentforce-coste-por-caso/
const analisis = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/analisis" }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(200),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false)
  })
});

export const collections = { analisis };

import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Análisis: un fichero .md o .mdx por artículo en src/content/analisis/.
// El nombre del fichero es la URL: como-empezar-con-ia-en-tu-pyme.mdx → /analisis/como-empezar-con-ia-en-tu-pyme/
const analisis = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/analisis" }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(200),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    // Título de la pestaña del navegador. Si no está, el layout usa «{title} | Sobtree».
    seoTitle: z.string().optional(),
    // Firma visible. Por defecto la organización, no una persona.
    autor: z.string().default("El equipo de Sobtree"),
    tags: z.array(z.string()).default([]),
    // Línea editorial (DESIGN.md §9) y portada opcional en public/img/.
    linea: z.enum(["IA", "Normativa", "Caso de uso"]).default("IA"),
    imagen: z.string().optional(),
    imagenAlt: z.string().optional(),
    draft: z.boolean().default(false)
  })
});

// Radar: una entrega semanal con lo que importa de la IA para una pyme, en src/content/radar/.
// `puntos` son las 3–4 frases que se ven en la home; el cuerpo desarrolla cada una.
const radar = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/radar" }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(200),
    date: z.coerce.date(),
    puntos: z.array(z.string()).min(1).max(4),
    imagen: z.string().optional(),
    imagenAlt: z.string().optional(),
    draft: z.boolean().default(false)
  })
});

export const collections = { analisis, radar };

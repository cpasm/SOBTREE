import { getCollection } from "astro:content";

// Análisis publicados, del más reciente al más antiguo.
export async function getAnalisis() {
  const all = await getCollection("analisis", ({ data }) => !data.draft);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export const fmtDate = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

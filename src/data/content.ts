import { getCollection } from "astro:content";

// Entradas publicadas (sin draft) de una colección, de la más reciente a la más antigua.
export async function getPublished<C extends "analisis" | "radar">(collection: C) {
  const all = await getCollection(collection, ({ data }) => !data.draft);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export const getAnalisis = () => getPublished("analisis");
export const getRadar = () => getPublished("radar");

export const fmtDate = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
export const fmtShort = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });

// Tema de la portada ilustrada (Cover.astro): el mismo en portada, listados y artículo.
export type Tema = "ahorro" | "radar" | "ia" | "datos";
export const temaDe = (linea: string, tags: string[] = []): Tema => {
  const t = tags.join(" ").toLowerCase();
  if (/precio|coste|ahorro|licenc|business case/.test(t)) return "ahorro";
  if (linea === "IA") return "ia";
  if (linea === "Salesforce") return "ahorro";
  return "datos";
};

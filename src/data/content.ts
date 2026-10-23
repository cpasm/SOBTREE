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

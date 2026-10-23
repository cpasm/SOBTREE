import type { APIRoute } from "astro";
import { buildLlms } from "../data/llms";

export const GET: APIRoute = async () =>
  new Response(await buildLlms(true), { headers: { "Content-Type": "text/plain; charset=utf-8" } });

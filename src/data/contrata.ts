// Botón «Contrata» (diagnóstico → semana de inicio → Stripe Checkout).
// Diseño: docs/contrata.md. En producción `activo` es false: el build no publica
// el botón ni /contratar/. Solo se enciende en local o preview con
// PUBLIC_CONTRATA_ACTIVO=1. Las plazas no se inventan aquí.
import { DIAGNOSTICO } from "./site";
import {
  IVA_PORCIENTO,
  MAX_PROYECTOS_SIMULTANEOS,
  PLAZO_MINIMO_DIAS_LABORABLES,
  RETENCION_MINUTOS,
  SEMANAS_VISIBLES,
  importes
} from "./contrata-logica.mjs";

const activo = import.meta.env.PUBLIC_CONTRATA_ACTIVO === "1";

export const CONTRATA = {
  activo,
  productos: ["diagnostico"] as const,
  maxProyectosSimultaneos: MAX_PROYECTOS_SIMULTANEOS,
  plazoMinimoDiasLaborables: PLAZO_MINIMO_DIAS_LABORABLES,
  semanasVisibles: SEMANAS_VISIBLES,
  diaArranque: "lunes" as const,
  ivaPorciento: IVA_PORCIENTO,
  retencionMinutos: RETENCION_MINUTOS,
  precioSinIva: DIAGNOSTICO.precio,
  importes: importes(DIAGNOSTICO.precio, IVA_PORCIENTO),
  // IDs de ejemplo. Los reales viven solo en sobtree-secrets.php / n8n.
  calendario: {
    cuenta: "info@sobtree.com",
    proyectos: "CONFIGURAR_ID_CALENDARIO_PROYECTOS",
    bloqueos: "CONFIGURAR_ID_CALENDARIO_BLOQUEOS",
    nombres: ["Sobtree · Proyectos", "Sobtree · Bloqueos"] as const
  },
  endpoints: {
    disponibilidad: "/api/contrata/disponibilidad.php",
    crearSesion: "/api/contrata/crear-sesion.php"
  },
  contacto: "/#contacto"
};

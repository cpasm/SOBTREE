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

// Servicios que se pueden pagar online. Textos e importes del front; el PHP (CONTRATA_SERVICIOS en
// public/lib/contrata.php) es quien manda y solo acepta estos ids. El ID de Price de Stripe de cada
// servicio vive en sobtree-secrets.php (STRIPE_PRICE_<ID en mayúsculas>), nunca aquí.
// Una prueba comprueba que id, nombre, base y días de bloqueo coinciden con el PHP.
export type ServicioContrata = {
  id: string;
  nombre: string;
  baseEur: number;
  diasBloqueo: number; // días laborables de calendario que bloquea desde el lunes de inicio (1 a 5)
  resumen: string;
};
export const SERVICIOS: ServicioContrata[] = [
  {
    id: "diagnostico",
    nombre: "Diagnóstico de implantación de IA",
    baseEur: DIAGNOSTICO.precio,
    diasBloqueo: 5,
    resumen: "Informe a precio cerrado con prioridades, plan y ahorro estimado."
  }
];
export const SERVICIO_DEFECTO = SERVICIOS[0];
export const serviciosConImportes = SERVICIOS.map((s) => ({ ...s, importes: importes(s.baseEur, IVA_PORCIENTO) }));

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

// CTA principal de la portada y de la cabecera. Con el flag encendido lleva a /contratar/; apagado, al formulario
// como antes. El botón del hero y el de la oferta vuelven al formulario si la disponibilidad falla (ContrataBoton).
export const CTA_CONTRATA = { texto: "Contrata y empieza a ahorrar", href: "/contratar/" } as const;
export const CTA_RESERVA = { texto: "Reservar 25 min", href: "/#contacto" } as const;
export const CTA_HABLAR = { texto: "Prefiero hablar antes", href: "/#contacto" } as const;
export const CTA_PRINCIPAL = activo ? CTA_CONTRATA : CTA_RESERVA;

// Lógica compartida del botón «Contrata» (importes, textos honestos y estado del botón).
// La usa el front y las pruebas. No inventa plazas: solo acepta textos que ya cuadran
// con la fórmula publicada por el servidor.

export const IVA_PORCIENTO = 21;
export const RETENCION_MINUTOS = 30;
export const SEMANAS_VISIBLES = 4;
export const PLAZO_MINIMO_DIAS_LABORABLES = 3;
export const MAX_PROYECTOS_SIMULTANEOS = 1;

export const TEXTO_RESERVA =
  "Reserva tu diagnóstico; te confirmamos la fecha en 1 día laborable";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

export function importes(precioBaseEur, ivaPorciento = IVA_PORCIENTO) {
  const base = Number(precioBaseEur);
  if (!Number.isInteger(base) || base < 0) throw new Error("precio");
  const baseCentimos = base * 100;
  const ivaCentimos = Math.trunc((baseCentimos * ivaPorciento) / 100);
  const totalCentimos = baseCentimos + ivaCentimos;
  return { baseEur: base, ivaPorciento, baseCentimos, ivaCentimos, totalCentimos };
}

export function euros(centimos) {
  const signo = centimos < 0 ? "-" : "";
  const abs = Math.abs(centimos);
  const entero = Math.trunc(abs / 100);
  const dec = String(abs % 100).padStart(2, "0");
  return `${signo}${entero.toLocaleString("es-ES")},${dec} €`;
}

function diaSemana(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function sumarDias(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function esLaborable(iso) {
  return diaSemana(iso) <= 5;
}

export function sumarLaborables(iso, n) {
  let d = iso;
  let rest = n;
  while (rest > 0) {
    d = sumarDias(d, 1);
    if (esLaborable(d)) rest -= 1;
  }
  return d;
}

export function siguienteLunes(iso) {
  const n = diaSemana(iso);
  if (n === 1) return iso;
  return sumarDias(iso, 8 - n);
}

export function primerLunes(hoy, plazo = PLAZO_MINIMO_DIAS_LABORABLES) {
  return siguienteLunes(sumarLaborables(hoy, plazo));
}

function solapa(aIni, aFin, bIni, bFin) {
  return aIni < bFin && aFin > bIni;
}

export function fechaLarga(iso, anoReferencia) {
  const [y, m, d] = iso.split("-").map(Number);
  let txt = `${d} de ${MESES[m - 1]}`;
  if (anoReferencia && y !== anoReferencia) txt += ` de ${y}`;
  return txt;
}

export function textoPlazas(n, lunes, max, anoReferencia) {
  if (!Number.isInteger(n) || n < 1 || n > max) return null;
  const fecha = fechaLarga(lunes, anoReferencia);
  if (n === 1) return `Queda 1 plaza para la semana del ${fecha}`;
  return `Quedan ${n} plazas para la semana del ${fecha}`;
}

export function textoProxima(lunes, anoReferencia) {
  return `Nuestros agentes pueden empezar a partir del lunes ${fechaLarga(lunes, anoReferencia)}`;
}

export function calcularSemanas({ hoy, max, plazo, visibles, proyectos, bloqueos }) {
  const primero = primerLunes(hoy, plazo);
  const ano = Number(hoy.slice(0, 4));
  const semanas = [];
  for (let i = 0; i < visibles; i += 1) {
    const lunes = sumarDias(primero, i * 7);
    const fin = sumarDias(lunes, 5);
    const eventos = (proyectos || []).filter((p) => solapa(p.inicio, p.fin, lunes, fin));
    const bloqueada = (bloqueos || []).some((b) => solapa(b.inicio, b.fin, lunes, fin));
    const plazas = bloqueada ? 0 : Math.max(0, max - eventos.length);
    semanas.push({
      lunes,
      plazas,
      bloqueada,
      proyectos: eventos.length,
      sesiones: eventos.map((e) => e.sesion).filter(Boolean)
    });
  }
  return { hoy, ano, primero, semanas, max };
}

const RE_PLAZA_1 = /^Queda 1 plaza para la semana del \d{1,2} de [a-záéíóúñ]+( de \d{4})?$/;
const RE_PLAZAS_N = /^Quedan [2-9]\d* plazas para la semana del \d{1,2} de [a-záéíóúñ]+( de \d{4})?$/;
const RE_PROXIMA = /^Nuestros agentes pueden empezar a partir del lunes \d{1,2} de [a-záéíóúñ]+( de \d{4})?$/;
const TEXTO_SIN_PLAZAS = "No hay plazas en las próximas 4 semanas.";

export function notaPermitida(s) {
  if (typeof s !== "string" || s.length > 180 || /[<>]/.test(s)) return null;
  if (s === TEXTO_SIN_PLAZAS) return s;
  if (RE_PLAZA_1.test(s) || RE_PLAZAS_N.test(s) || RE_PROXIMA.test(s)) return s;
  return null;
}

export function estadoBoton(disp) {
  const reserva = { href: "/#contacto", texto: TEXTO_RESERVA, nota: null };
  if (!disp || disp.ok !== true) return reserva;
  const notas = [];
  const proxima = notaPermitida(disp.proxima && disp.proxima.texto);
  if (proxima) notas.push(proxima);
  const semana = Array.isArray(disp.semanas)
    ? disp.semanas.find((s) => s && s.libres >= 1)
    : null;
  const plazas = notaPermitida(semana && semana.texto_plazas);
  if (plazas) notas.push(plazas);
  const sin = notaPermitida(disp.sin_plazas_texto);
  if (!semana && sin) notas.push(sin);
  return { href: "/contratar/", texto: "Contrata", nota: notas.join(" ") || null };
}

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

// ---- Validación de NIF/CIF/NIE y NIF-IVA UE en el navegador ----
// Réplica exacta de contrata_validar_identificacion() de public/lib/contrata.php.
// Si cambia una, cambia la otra: tests/contrata/test-nif.mjs las compara con php.
export const MSG_NIF_INVALIDO =
  "Este NIF o CIF no es válido. Revisa letras y números; solo vendemos a empresas y autónomos con NIF o CIF español.";
export const MSG_NIF_FUERA_DE_ESPANA =
  "Por ahora solo cobramos online a empresas y autónomos con NIF o CIF español. Si tu empresa está en otro país, escríbenos a info@sobtree.com y te preparamos la factura sin IVA español cuando corresponda.";

const LETRAS_NIF = "TRWAGMYFPDXBNJZSQVHLCKE";
const PATRONES_UE = {
  AT: /^U\d{8}$/, BE: /^\d{10}$/, BG: /^\d{9,10}$/, CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/, DE: /^\d{9}$/, DK: /^\d{8}$/, EE: /^\d{9}$/,
  EL: /^\d{9}$/, FI: /^\d{8}$/, FR: /^[A-Z0-9]{2}\d{9}$/, HR: /^\d{11}$/,
  HU: /^\d{8}$/, IE: /^[A-Z0-9]{8,9}$/, IT: /^\d{11}$/, LT: /^\d{9}(\d{3})?$/,
  LU: /^\d{8}$/, LV: /^\d{11}$/, MT: /^\d{8}$/, NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/, PT: /^\d{9}$/, RO: /^\d{2,10}$/, SE: /^\d{12}$/,
  SI: /^\d{8}$/, SK: /^\d{10}$/, XI: /^(\d{9}|\d{12}|(GD|HA)\d{3})$/
};

function nifOk(d) {
  if (!/^\d{8}[A-Z]$/.test(d)) return false;
  return LETRAS_NIF[Number(d.slice(0, 8)) % 23] === d[8];
}

function nieOk(d) {
  if (!/^[XYZ]\d{7}[A-Z]$/.test(d)) return false;
  const num = { X: "0", Y: "1", Z: "2" }[d[0]] + d.slice(1, 8);
  return LETRAS_NIF[Number(num) % 23] === d[8];
}

function cifOk(d) {
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(d)) return false;
  let suma = 0;
  for (let i = 0; i < 7; i++) {
    let n = Number(d[i + 1]);
    if (i % 2 === 0) {
      n *= 2;
      suma += Math.trunc(n / 10) + (n % 10);
    } else {
      suma += n;
    }
  }
  const digito = (10 - (suma % 10)) % 10;
  const letra = "JABCDEFGHI"[digito];
  const control = d[8];
  const tipo = d[0];
  if ("PQRSNW".includes(tipo)) return control === letra;
  if ("ABEH".includes(tipo)) return control === String(digito);
  return control === String(digito) || control === letra;
}

function documentoEs(doc) {
  const d = doc.replace(/[ \t\n\v\f\r.-]/g, "").replace(/[a-z]/g, (c) => c.toUpperCase());
  return nifOk(d) || nieOk(d) || cifOk(d);
}

/** @returns {{ok:boolean, motivo?:"formato"|"fuera_de_espana", mensaje?:string}} */
export function validarIdentificacion(raw) {
  const id = String(raw ?? "").replace(/[ \t\n\v\f\r.-]/g, "").replace(/[a-z]/g, (c) => c.toUpperCase());
  const malo = { ok: false, motivo: "formato", mensaje: MSG_NIF_INVALIDO };
  if (id === "") return malo;
  if (id.startsWith("ES") && id.length > 2) return documentoEs(id.slice(2)) ? { ok: true } : malo;
  if (documentoEs(id)) return { ok: true };
  const m = /^([A-Z]{2})([A-Z0-9]{2,14})$/.exec(id);
  if (!m || !Object.prototype.hasOwnProperty.call(PATRONES_UE, m[1]) || !PATRONES_UE[m[1]].test(m[2])) return malo;
  return { ok: false, motivo: "fuera_de_espana", mensaje: MSG_NIF_FUERA_DE_ESPANA };
}

// Nodo Code del workflow «Sobtree · Contrata».
// Verifica el HMAC del aviso de la web y prepara lo que escriben los nodos siguientes:
// la fila de «Ventas», la línea de «Historial», el evento de «Sobtree · Proyectos» y el aviso interno.
// MODO = 'simulacion' (por defecto): no se escribe nada fuera de n8n. MODO = 'produccion': se ejecuta la rama real.
const crypto = require('crypto');

const SECRET = 'REEMPLAZAR_EN_N8N';
const MODO = 'simulacion';
const LIVE = false; // true solo al cobrar de verdad: un aviso de test no escribe en la hoja real ni uno live en pruebas
const MAX_DESFASE_S = 300;
const AVISO_A = 'info@sobtree.com';

const item = $input.first();
const h = item.json.headers || {};
const ts = String(h['x-sobtree-timestamp'] || '');
const firma = String(h['x-sobtree-signature'] || '');
let raw = '';
try { raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8'); } catch (e) { raw = ''; }

const esperada = 'sha256=' + crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');
const reciente = /^\d+$/.test(ts) && Math.abs(Date.now() / 1000 - Number(ts)) <= MAX_DESFASE_S;
const a = Buffer.from(firma);
const b = Buffer.from(esperada);
const valida = SECRET !== 'REEMPLAZAR_EN_N8N' && reciente && a.length === b.length && crypto.timingSafeEqual(a, b);
if (!valida) return [{ json: { valido: false, motivo: !reciente ? 'timestamp' : 'firma', modo: MODO } }];

let aviso;
try { aviso = JSON.parse(raw); } catch (e) { return [{ json: { valido: false, motivo: 'json', modo: MODO } }]; }
const tipo = String(aviso.tipo || '');
const cuerpo = aviso.cuerpo || {};
const sesion = String(cuerpo.sesion || '');
if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sesion) && tipo === 'checkout.session.completed') {
  return [{ json: { valido: false, motivo: 'sesion', modo: MODO } }];
}
// El modo del aviso tiene que ser el del flujo: un aviso de test no escribe en la hoja real ni al revés.
if (MODO === 'produccion' && (cuerpo.livemode === true) !== LIVE) {
  return [{ json: { valido: false, motivo: 'modo', modo: MODO } }];
}
const empresa = String(cuerpo.empresa || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
const semana = String(cuerpo.semana_lunes || '');
const eur = (centimos) => Math.round(Number(centimos || 0)) / 100;
const baseC = Number(cuerpo.importe_base_centimos || 0);
const totalC = Number(cuerpo.importe_total_centimos || 0);
const email = String(cuerpo.email || '').trim().toLowerCase();
const alerta = String(cuerpo.alerta_facturacion || '');
const ahora = new Date().toISOString();
const sumar = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const base = {
  valido: true,
  modo: MODO,
  tipo,
  event_id: String(aviso.event_id || ''),
  dedupe_clave: sesion,
  email,
  alerta_facturacion: alerta,
  nif_verificado: cuerpo.nif_verificado === true,
  nif_coincide: cuerpo.nif_coincide === undefined ? null : cuerpo.nif_coincide,
  aviso_a: AVISO_A,
  calendarios_consultados: [],
  importe_total_centimos: totalC,
};

if (tipo === 'checkout.session.completed') {
  // Fila de «Ventas». El NIF viaja en el aviso firmado y se escribe aquí; no se registra en ningún otro sitio.
  const venta = {
    fecha: ahora,
    id_sesion_stripe: sesion,
    empresa,
    nif: String(cuerpo.nif || ''),
    email,
    producto: String(cuerpo.producto || 'diagnostico'), // id del servicio (lista de contrata.php)
    importe_sin_iva: eur(baseC),
    iva: eur(totalC - baseC),
    total: eur(totalC),
    semana_reservada: semana,
    estado: alerta ? 'revisar' : 'pagada',
  };
  const factura = String(cuerpo.factura || '');
  const servicioNombre = String(cuerpo.servicio_nombre || '').replace(/[\r\n]+/g, ' ').slice(0, 80);
  const diasBloqueo = Math.min(5, Math.max(1, Math.trunc(Number(cuerpo.dias_bloqueo)) || 5));
  const historial = {
    fecha: ahora,
    email,
    tipo: 'venta',
    campania: 'contrata',
    detalle: `Pago ${sesion}. Semana de inicio: ${semana}. Total ${venta.total} €. Factura de Stripe: ${factura || 'se genera tras el pago'}. Alerta: ${alerta || 'ninguna'}.`,
  };
  return [{ json: { ...base,
    accion: 'venta',
    venta, historial,
    venta_hoja: MODO === 'produccion' ? 'pendiente' : 'simulada',
    venta_nodo: MODO === 'produccion' ? 'habilitado' : 'simulado',
    evento_calendario: MODO === 'produccion' ? 'pendiente' : 'simulado',
    // Se bloquean los días del servicio desde el lunes de inicio (5 = lunes a viernes; el día de fin es exclusivo), aunque la entrega contractual sea de 10 días laborables como máximo.
    // El título empieza por «CONTRATA ·»: la web lo lee como proyecto, nunca como bloqueo manual.
    evento: {
      resumen: 'CONTRATA · ' + (servicioNombre || 'Servicio') + ' · ' + empresa.slice(0, 80),
      descripcion: `Sesión Stripe: ${sesion}\nServicio: ${venta.producto}\nSemana de inicio: lunes ${semana}`,
      inicio: semana,
      fin: semana ? sumar(semana, diasBloqueo) : '',
    },
    aviso_email: {
      asunto: (alerta ? 'Contrata · venta a REVISAR: ' : 'Contrata · nueva venta: ') + empresa.slice(0, 60),
      texto: `Nueva venta (${servicioNombre || venta.producto}).\nEmpresa: ${empresa}\nTotal: ${venta.total} €\nSemana de inicio: lunes ${semana}\nSesión: ${sesion}\n` + (alerta ? `ALERTA de facturación: ${alerta}. Revisa la fila en «Ventas» y la factura en Stripe.\n` : 'La factura la emite Stripe y se envía al cliente.\n') + 'Los datos (incluido el NIF) están en la pestaña «Ventas».',
    },
    simulado: MODO !== 'produccion',
    aviso: true,
  } }];
}

if (tipo === 'charge.refunded') {
  const parcial = String(cuerpo.estado || '') === 'reembolso_parcial';
  const estado = parcial ? 'reembolso_parcial' : 'reembolsada';
  return [{ json: { ...base,
    accion: 'reembolso',
    estado_venta: { id_sesion_stripe: sesion, estado },
    historial: {
      fecha: ahora,
      email,
      tipo: 'reembolso',
      campania: 'contrata',
      detalle: `Reembolso ${parcial ? 'parcial' : 'total'} de ${sesion || '(sesión desconocida)'}: ${eur(cuerpo.importe_reembolsado_centimos)} €. Si procede, emitir la factura rectificativa (abono) en Stripe.`,
    },
    aviso_email: {
      asunto: 'Contrata · reembolso ' + (parcial ? 'parcial' : 'total'),
      texto: `Stripe ha notificado un reembolso ${parcial ? 'parcial' : 'total'} (${eur(cuerpo.importe_reembolsado_centimos)} €) de la sesión ${sesion || '(desconocida)'}.\nLa fila de «Ventas» pasa a «${estado}». Si procede, emite la factura rectificativa.`,
    },
    sin_sesion: sesion === '',
    simulado: MODO !== 'produccion',
    aviso: true,
  } }];
}

return [{ json: { ...base, accion: 'ignorar', simulado: MODO !== 'produccion', aviso: true } }];

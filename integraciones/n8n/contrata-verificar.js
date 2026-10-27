// Nodo Code del workflow «Sobtree · Contrata».
// Verifica el HMAC de la web y deja el alta en la hoja de Ventas, el calendario y el correo SIMULADOS.
// El nodo «Añadir fila en Ventas» está deshabilitado en v1: no escribe en la hoja hasta que se apruebe.
const crypto = require('crypto');

const SECRET = 'REEMPLAZAR_EN_N8N';
const MODO = 'simulacion';
const MAX_DESFASE_S = 300;

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
const cuerpo = aviso.cuerpo || {};
const sesion = String(cuerpo.sesion || '');
const empresa = String(cuerpo.empresa || '').slice(0, 80);
const semana = String(cuerpo.semana_lunes || '');
const eur = (centimos) => Math.round(Number(centimos || 0)) / 100;
const baseC = Number(cuerpo.importe_base_centimos || 0);
const totalC = Number(cuerpo.importe_total_centimos || 0);
// Fila de la pestaña «Ventas» de la hoja «Sobtree · Contactos». El NIF no viaja en el aviso (solo país y tipo): se rellena a mano al facturar.
const venta = {
  fecha: new Date().toISOString(),
  id_sesion_stripe: sesion,
  empresa,
  nif: '',
  email: String(cuerpo.email || '').trim().toLowerCase(),
  producto: String(cuerpo.producto || 'diagnostico'),
  importe_sin_iva: eur(baseC),
  iva: eur(totalC - baseC),
  total: eur(totalC),
  semana_reservada: semana,
  estado: 'pagada',
};

return [{ json: {
  valido: true,
  modo: MODO,
  tipo: String(aviso.tipo || ''),
  event_id: String(aviso.event_id || ''),
  dedupe_clave: sesion,
  venta,
  venta_hoja: 'simulada',
  venta_nodo: 'deshabilitado',
  evento_calendario: 'simulado',
  email: 'no_enviado',
  aviso: true,
  simulado: true,
  nif_verificado: cuerpo.nif_verificado === true,
  alerta_facturacion: cuerpo.alerta_facturacion || 'revisar_antes_de_facturar',
  calendarios_consultados: [],
  importe_total_centimos: Number(cuerpo.importe_total_centimos || 0),
} }];

// Nodo Code «Verificar firma newsletter» del workflow «Sobtree · Newsletter → HubSpot».
// Fuente única: build-newsletter.py lo incrusta en el JSON y tests/ lo prueba en local.
// Modo: Run Once for All Items. Requiere que el nodo Webhook tenga activado «Raw Body».
const crypto = require('crypto');

// Secreto compartido con la web (N8N_LEADS_WEBHOOK_SECRET en sobtree-secrets.php).
// Plan Starter de n8n Cloud: sin Variables, así que se pega aquí DENTRO de n8n, nunca en el repositorio.
const SECRET = 'REEMPLAZAR_EN_N8N';
const MAX_DESFASE_S = 300; // 5 minutos

// Doble confirmación propia. Por defecto activa: la nativa de HubSpot no se dispara
// con contactos creados por API. Ponla a false solo para suscribir en el mismo alta.
const DOBLE_CONFIRMACION = true;
const CADUCIDAD_S = 48 * 3600;
const BASE_CONFIRMAR = 'https://sobtree.app.n8n.cloud/webhook/sobtree-newsletter-confirmar';

// Tipo existente «Marketing Information» del portal gratuito 149616589.
// El plan gratuito no deja crear tipos propios. Para usar otro, cambia solo esta constante.
const SUBSCRIPTION_ID = '3927875333';
const NOMBRE_SUSCRIPCION = 'Marketing Information';

function canonEnlace(email, exp, ts, origen, version, texto) {
  return ['newsletter-confirmar', email, String(exp), String(ts), String(origen), String(version), String(texto)].join('\n');
}
function explicacion(p, via) {
  const frase = via === 'enlace'
    ? 'La persona confirmó el alta con el enlace enviado a su correo tras marcar la casilla en sobtree.com.'
    : 'La persona marcó la casilla no premarcada en sobtree.com para recibir la newsletter por email.';
  return [
    frase,
    'Texto aceptado: «' + p.texto + '».',
    'Fecha del consentimiento (UTC): ' + p.ts + '.',
    'Origen: ' + p.origen + '.',
    'Versión de la política de privacidad: ' + p.version + '.',
    'Base legal: consentimiento, art. 6.1.a RGPD (CONSENT_WITH_NOTICE).',
    'Tipo de suscripción: ' + NOMBRE_SUSCRIPCION + ' (' + SUBSCRIPTION_ID + ').',
  ].join(' ').slice(0, 1000);
}
function fallo(motivo) { return [{ json: { valido: false, motivo } }]; }

const item = $input.first();
const h = item.json.headers || {};
const tsHeader = String(h['x-sobtree-timestamp'] || '');
const firma = String(h['x-sobtree-signature'] || '');
let raw = '';
try { raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8'); } catch (e) { raw = ''; }

const esperada = 'sha256=' + crypto.createHmac('sha256', SECRET).update(tsHeader + '.' + raw).digest('hex');
const reciente = /^\d+$/.test(tsHeader) && Math.abs(Date.now() / 1000 - Number(tsHeader)) <= MAX_DESFASE_S;
const a = Buffer.from(firma), b = Buffer.from(esperada);
const valida = SECRET !== 'REEMPLAZAR_EN_N8N' && reciente && a.length === b.length && crypto.timingSafeEqual(a, b);
if (!valida) return fallo(!reciente ? 'timestamp' : 'firma');

let alta;
try { alta = JSON.parse(raw); } catch (e) { return fallo('json'); }
const email = String(alta.email || '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fallo('email');
if (alta.consentimiento !== true) return fallo('consentimiento');
const texto = String(alta.consent_text || '');
if (!texto || texto.length > 500) return fallo('texto');
const origen = String(alta.origen || '');
if (!/^(portada|radar|articulo:[a-z0-9-]{1,120})$/.test(origen)) return fallo('origen');
const cuando = String(alta.consent_timestamp || '');
if (!/^\d{4}-\d{2}-\d{2}T/.test(cuando)) return fallo('fecha');
const version = String(alta.version_politica || '');
if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) return fallo('version');

const corta = (s, n) => String(s || '').slice(0, n);
const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const resumen = [cuando, origen, version].join(' | ').slice(0, 400);
const nota = [
  `<p><strong>Alta a la newsletter</strong> · ${esc(cuando)} · id ${esc(alta.id)}</p>`,
  `<p><strong>Email:</strong> ${esc(email)}</p>`,
  `<p><strong>Origen:</strong> ${esc(origen)} · <strong>Versión de la política:</strong> ${esc(version)}</p>`,
  `<p><strong>Consentimiento:</strong> sí</p>`,
  `<p><strong>Texto aceptado:</strong> ${esc(texto)}</p>`,
  `<p>Doble confirmación: ${DOBLE_CONFIRMACION ? 'pendiente del enlace; todavía no está suscrito' : 'desactivada; la suscripción se intenta en este paso'}.</p>`,
].join('');

const exp = Math.floor(Date.now() / 1000) + CADUCIDAD_S;
const sigEnlace = crypto.createHmac('sha256', SECRET).update(canonEnlace(email, exp, cuando, origen, version, texto)).digest('hex');
const qs = new URLSearchParams({ email, exp: String(exp), ts: cuando, origen, v: version, txt: texto, sig: sigEnlace });
const enlace = BASE_CONFIRMAR + '?' + qs.toString();
const emailTexto = [
  'Hola,',
  '',
  'Para recibir la newsletter de Sobtree, confirma tu email antes de 48 horas:',
  '',
  enlace,
  '',
  'Si no has pedido esta suscripción, ignora este mensaje: no te apuntaremos.',
  '',
  'Responsable: Sobtree. Finalidad: envío de la newsletter. Base legal: consentimiento. Puedes darte de baja en cada email o escribiendo a info@sobtree.com.',
].join('\n');

return [{ json: {
  valido: true,
  doble_confirmacion: DOBLE_CONFIRMACION,
  alta_id: corta(alta.id, 64),
  email,
  props: { email, sobtree_newsletter_consentimiento: resumen },
  nota_html: nota,
  enlace: DOBLE_CONFIRMACION ? enlace : '',
  email_asunto: 'Confirma tu suscripción a la newsletter de Sobtree',
  email_texto: DOBLE_CONFIRMACION ? emailTexto : '',
  subscription_id: SUBSCRIPTION_ID,
  nombre_suscripcion: NOMBRE_SUSCRIPCION,
  legal_basis: explicacion({ texto, ts: cuando, origen, version }, DOBLE_CONFIRMACION ? 'enlace' : 'formulario'),
} }];

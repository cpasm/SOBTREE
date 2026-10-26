// Nodo Code «Validar enlace» del workflow «Sobtree · Newsletter → HubSpot».
// Comprueba el enlace firmado del correo de doble confirmación (caduca a las 48 h).
// Fuente única: build-newsletter.py lo incrusta en el JSON y tests/ lo prueba en local.
// Modo: Run Once for All Items. El webhook es GET; los datos van en la query.
const crypto = require('crypto');

// El mismo secreto que «Verificar firma newsletter» (N8N_LEADS_WEBHOOK_SECRET).
const SECRET = 'REEMPLAZAR_EN_N8N';
const SUBSCRIPTION_ID = '3927875333'; // «Marketing Information». Mismo valor que en el otro nodo Code.
const NOMBRE_SUSCRIPCION = 'Marketing Information';

function canonEnlace(email, exp, ts, origen, version, texto) {
  return ['newsletter-confirmar', email, String(exp), String(ts), String(origen), String(version), String(texto)].join('\n');
}
function explicacion(p) {
  return [
    'La persona confirmó el alta con el enlace enviado a su correo tras marcar la casilla en sobtree.com.',
    'Texto aceptado: «' + p.texto + '».',
    'Fecha del consentimiento (UTC): ' + p.ts + '.',
    'Origen: ' + p.origen + '.',
    'Versión de la política de privacidad: ' + p.version + '.',
    'Base legal: consentimiento, art. 6.1.a RGPD (CONSENT_WITH_NOTICE).',
    'Tipo de suscripción: ' + NOMBRE_SUSCRIPCION + ' (' + SUBSCRIPTION_ID + ').',
  ].join(' ').slice(0, 1000);
}
function fallo(motivo) { return [{ json: { valido: false, motivo } }]; }

const item = $input.first().json;
const q = item.query && typeof item.query === 'object' ? item.query : {};
const email = String(q.email || '').trim().toLowerCase();
const exp = String(q.exp || '');
const ts = String(q.ts || '');
const origen = String(q.origen || '');
const version = String(q.v || '');
const texto = String(q.txt || '');
const sig = String(q.sig || '');

if (SECRET === 'REEMPLAZAR_EN_N8N') return fallo('secreto');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fallo('email');
if (!/^\d+$/.test(exp) || Number(exp) < Math.floor(Date.now() / 1000) - 30) return fallo('caducado');
if (!/^(portada|radar|articulo:[a-z0-9-]{1,120})$/.test(origen)) return fallo('origen');
if (!texto || texto.length > 500) return fallo('texto');
if (!/^\d{4}-\d{2}-\d{2}T/.test(ts)) return fallo('fecha');
if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) return fallo('version');

const esperada = crypto.createHmac('sha256', SECRET).update(canonEnlace(email, exp, ts, origen, version, texto)).digest('hex');
const a = Buffer.from(sig), b = Buffer.from(esperada);
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fallo('firma');

const ahoraMs = Date.now();
const ahoraIso = new Date(ahoraMs).toISOString();
const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const nota = [
  `<p><strong>Doble confirmación de la newsletter</strong> · ${esc(ahoraIso)}</p>`,
  `<p><strong>Email:</strong> ${esc(email)} · <strong>Origen:</strong> ${esc(origen)} · <strong>Versión de la política:</strong> ${esc(version)}</p>`,
  `<p><strong>Consentimiento (UTC):</strong> ${esc(ts)}</p>`,
  `<p><strong>Texto aceptado:</strong> ${esc(texto)}</p>`,
].join('');

return [{ json: {
  valido: true,
  email,
  subscription_id: SUBSCRIPTION_ID,
  nombre_suscripcion: NOMBRE_SUSCRIPCION,
  legal_basis: explicacion({ texto, ts, origen, version }),
  props: { email, sobtree_newsletter_confirmado: String(ahoraMs) },
  nota_html: nota,
} }];

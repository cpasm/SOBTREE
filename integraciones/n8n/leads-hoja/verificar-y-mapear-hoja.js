// Nodo Code «Verificar firma y mapear» del workflow «Sobtree · Lead web → Hoja de contactos».
// Versión sin HubSpot: la verificación HMAC es idéntica a la de verificar-y-mapear.js; cambia solo el mapeo (de propiedades de HubSpot a las columnas de la hoja).
// Fuente única: build-lead-a-hoja.py lo incrusta en el JSON y tests/leads-hoja/ lo prueba en local.
// Modo: Run Once for All Items. Requiere que el nodo Webhook tenga activado «Raw Body».
const crypto = require('crypto');

// Secreto compartido con la web (N8N_LEADS_WEBHOOK_SECRET en sobtree-secrets.php).
// Plan Starter de n8n Cloud: sin Variables, así que se pega aquí DENTRO de n8n, nunca en el repositorio.
// En planes con Variables, usar: const SECRET = $vars.SOBTREE_LEADS_SECRET;
const SECRET = 'REEMPLAZAR_EN_N8N';
const MAX_DESFASE_S = 300; // 5 minutos

const item = $input.first();
const h = item.json.headers || {};
const ts = String(h['x-sobtree-timestamp'] || '');
const firma = String(h['x-sobtree-signature'] || '');
let raw = '';
try { raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8'); } catch (e) { raw = ''; }

const esperada = 'sha256=' + crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');
const reciente = /^\d+$/.test(ts) && Math.abs(Date.now() / 1000 - Number(ts)) <= MAX_DESFASE_S;
const a = Buffer.from(firma), b = Buffer.from(esperada);
const valida = SECRET !== 'REEMPLAZAR_EN_N8N' && reciente && a.length === b.length && crypto.timingSafeEqual(a, b);
if (!valida) return [{ json: { valido: false, motivo: !reciente ? 'timestamp' : 'firma' } }];

let lead;
try { lead = JSON.parse(raw); } catch (e) { return [{ json: { valido: false, motivo: 'json' } }]; }
const email = String(lead.email || '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return [{ json: { valido: false, motivo: 'email' } }];

const o = lead.origen || {}, utm = o.utm || {}, calc = lead.calculadora || {}, asis = lead.asistente || {};
const partes = String(lead.nombre || '').trim().split(/\s+/);
const corta = (s, n) => String(s || '').slice(0, n);

const eur = (n) => (typeof n === 'number' ? n.toLocaleString('es-ES') + ' €' : '—');
// Importes por separado en el texto (nota y contexto).
const importes = typeof calc.diagnostico === 'number'
  ? `Diagnóstico ${eur(calc.diagnostico)} · Descuento ${eur(calc.descuento)} · Puesta en marcha ${eur(calc.puesta_min)}–${eur(calc.puesta_max)} · Neto ${eur(calc.neto_min)}–${eur(calc.neto_max)}`
  : `Precio ${eur(calc.precio_min)}–${eur(calc.precio_max)}`;
const resumenCalc = Object.keys(calc).length
  ? `Sector: ${calc.sector || '—'} · ${calc.personas ?? '—'} personas · ${calc.horas ?? '—'} h/sem · ${calc.coste ?? '—'} €/h · Áreas: ${(calc.areas || []).join(', ') || '—'} · Ahorro ${eur(calc.ahorro_min)}–${eur(calc.ahorro_max)}/año · ${importes}`
  : '';
const contexto = [resumenCalc && 'Calculadora: ' + resumenCalc, asis.motivo && 'Asistente: ' + asis.motivo].filter(Boolean).join('\n');
const detalleOrigen = [
  o.landing && 'entrada=' + o.landing, o.referrer && 'referrer=' + o.referrer, o.pagina && 'pagina=' + o.pagina,
  utm.utm_term && 'utm_term=' + utm.utm_term, utm.utm_content && 'utm_content=' + utm.utm_content,
].filter(Boolean).join(' | ');

const comercial = lead.consentimiento_comercial;
const tieneCC = !!comercial && typeof comercial === 'object' && Object.prototype.hasOwnProperty.call(comercial, 'acepta');
const aceptaCC = tieneCC && comercial.acepta === true;
const tipo = ['contacto', 'calculadora', 'asistente'].includes(lead.tipo_formulario) ? lead.tipo_formulario : 'contacto';
const tamano = corta(lead.tamano, 60);
const fechaLead = corta(lead.fecha, 40) || new Date().toISOString();
// Fila nueva de la pestaña «Contactos» (sin los campos de estado). Los vacíos no pisan datos buenos al fusionar.
const fila_nueva = {
  email,
  nombre: corta(String(lead.nombre || '').trim(), 200),
  empresa: corta(lead.empresa, 200),
  cargo: corta(lead.cargo, 120),
  telefono: corta(lead.telefono, 40),
  interes: corta(lead.interes, 100),
  tamano,
  mensaje: corta(lead.mensaje, 4000),
  tipo_formulario: tipo,
  origen: corta(o.landing, 300),
  referrer: corta(o.referrer, 300),
  pagina: corta(o.pagina, 300),
  utm_source: corta(utm.utm_source, 150),
  utm_medium: corta(utm.utm_medium, 150),
  utm_campaign: corta(utm.utm_campaign, 150),
  utm_term: corta(utm.utm_term, 150),
  utm_content: corta(utm.utm_content, 150),
  contexto: corta(contexto, 2000),
  consentimiento_privacidad_fecha: corta((lead.consentimiento || {}).fecha, 40),
  id_lead: corta(lead.id, 64),
  fecha_actualizacion: fechaLead,
};
// Comunicaciones comerciales del lead tal como llegan. «no consta» (lead en cola anterior a la casilla) cuenta como «no».
const cc_nuevo = {
  consentimiento_comercial: aceptaCC ? 'sí' : 'no',
  fecha_consentimiento: aceptaCC ? corta(comercial.fecha, 40) : '',
  texto_consentimiento_comercial: aceptaCC ? corta(comercial.texto, 500) : '',
  version_politica: tieneCC ? corta(comercial.version_politica, 40) : '',
};

const comercialTexto = !tieneCC ? 'Comunicaciones comerciales: no consta' : (aceptaCC ? `Comunicaciones comerciales: sí (${comercial.fecha || '—'}, política ${comercial.version_politica || '—'})\n${comercial.texto || ''}` : 'Comunicaciones comerciales: no');

// Si la web ya envió su correo de RESPALDO (n8n falló antes), no se repite el aviso.
const avisoNecesario = !(lead.envio && lead.envio.respaldo_enviado === true);

return [{ json: {
  valido: true,
  aviso_necesario: avisoNecesario,
  lead_id: corta(lead.id, 64),
  email,
  fecha_lead: fechaLead,
  fila_nueva,
  cc_nuevo,
  detalle_historial: `Lead web (${tipo}) id ${corta(lead.id, 64)}. ${comercialTexto.split('\n')[0]}.`,
  aviso_asunto: `Lead web (${tipo}): ${corta(lead.empresa, 80)} · ${corta(lead.interes, 60)}`,
  aviso_texto: `${lead.nombre} (${lead.cargo || 'sin cargo'}) de ${lead.empresa}\n${email} · ${lead.telefono}\nInterés: ${lead.interes} · Tamaño: ${lead.tamano}\n\n${lead.mensaje}\n\n${contexto ? contexto + '\n\n' : ''}Origen: ${detalleOrigen || '—'}\nUTM: ${[utm.utm_source, utm.utm_medium, utm.utm_campaign].filter(Boolean).join(' / ') || '—'}\n${comercialTexto}\nId lead: ${lead.id}`,
} }];

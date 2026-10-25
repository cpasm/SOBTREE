// Nodo Code «Verificar firma y mapear» del workflow «Sobtree · Lead web → HubSpot».
// Fuente única: build-workflow.py lo incrusta en el JSON y tests/ lo prueba en local.
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

// Fuente de tráfico (propiedad nativa hs_analytics_source), deducida de UTM y referrer.
function fuente() {
  const med = String(utm.utm_medium || '').toLowerCase(), src = String(utm.utm_source || '').toLowerCase();
  let ref = ''; try { ref = o.referrer ? new URL(o.referrer).hostname : ''; } catch (e) {}
  if (/^(cpc|ppc|paid|paidsearch|sem)$/.test(med)) return /facebook|instagram|linkedin|twitter|x\.com|tiktok/.test(src) ? 'PAID_SOCIAL' : 'PAID_SEARCH';
  if (/paid_?social/.test(med)) return 'PAID_SOCIAL';
  if (/e-?mail|newsletter/.test(med)) return 'EMAIL_MARKETING';
  if (/social/.test(med)) return 'SOCIAL_MEDIA';
  if (med || src) return 'OTHER_CAMPAIGNS';
  if (/chatgpt|openai|perplexity|claude|gemini|copilot/.test(ref)) return 'AI_REFERRALS';
  if (/google\.|bing\.|duckduckgo|ecosia|yahoo\./.test(ref)) return 'ORGANIC_SEARCH';
  if (/linkedin|facebook|instagram|twitter|x\.com|t\.co|youtube|tiktok/.test(ref)) return 'SOCIAL_MEDIA';
  if (ref) return 'REFERRALS';
  return 'DIRECT_TRAFFIC';
}

const eur = (n) => (typeof n === 'number' ? n.toLocaleString('es-ES') + ' €' : '—');
const resumenCalc = Object.keys(calc).length
  ? `Sector: ${calc.sector || '—'} · ${calc.personas ?? '—'} personas · ${calc.horas ?? '—'} h/sem · ${calc.coste ?? '—'} €/h · Áreas: ${(calc.areas || []).join(', ') || '—'} · Ahorro ${eur(calc.ahorro_min)}–${eur(calc.ahorro_max)}/año · Precio ${eur(calc.precio_min)}–${eur(calc.precio_max)}`
  : '';
const contexto = [resumenCalc && 'Calculadora: ' + resumenCalc, asis.motivo && 'Asistente: ' + asis.motivo].filter(Boolean).join('\n');
const detalleOrigen = [
  o.landing && 'entrada=' + o.landing, o.referrer && 'referrer=' + o.referrer, o.pagina && 'pagina=' + o.pagina,
  utm.utm_term && 'utm_term=' + utm.utm_term, utm.utm_content && 'utm_content=' + utm.utm_content,
].filter(Boolean).join(' | ');

// Propiedades que se escriben siempre (alta y actualización).
const comunes = {
  email,
  firstname: corta(partes[0], 100),
  lastname: corta(partes.slice(1).join(' '), 100),
  phone: corta(lead.telefono, 40),
  company: corta(lead.empresa, 200),
  company_size: corta(lead.tamano, 60),
  message: corta(lead.mensaje, 4000),
  hs_legal_basis: 'Freely given consent from contact',
  sobtree_tipo_formulario: ['contacto', 'calculadora', 'asistente'].includes(lead.tipo_formulario) ? lead.tipo_formulario : 'contacto',
  sobtree_interes: corta(lead.interes, 100),
  sobtree_utm_source: corta(utm.utm_source, 150),
  sobtree_utm_medium: corta(utm.utm_medium, 150),
  sobtree_utm_campaign: corta(utm.utm_campaign, 150),
  sobtree_origen_detalle: corta(detalleOrigen, 1000),
  sobtree_contexto_lead: corta(contexto, 2000),
};
if (lead.cargo) comunes.jobtitle = corta(lead.cargo, 120);
if (calc.sector) comunes.industry = corta(calc.sector, 80);
// No borrar datos buenos con vacíos al actualizar.
for (const k of Object.keys(comunes)) if (comunes[k] === '') delete comunes[k];

// Solo en el alta: etapa, estado y fuente (no se pisan en contactos que ya avanzaron).
const soloAlta = { lifecyclestage: 'lead', hs_lead_status: 'NEW', hs_analytics_source: fuente() };

const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const nota = [
  `<p><strong>Lead web (${esc(comunes.sobtree_tipo_formulario)})</strong> · ${esc(lead.fecha)} · id ${esc(lead.id)}</p>`,
  `<p><strong>Interés:</strong> ${esc(lead.interes)} · <strong>Tamaño:</strong> ${esc(lead.tamano)}</p>`,
  `<p><strong>Mensaje:</strong><br>${esc(lead.mensaje).replace(/\n/g, '<br>')}</p>`,
  contexto && `<p>${esc(contexto).replace(/\n/g, '<br>')}</p>`,
  `<p><strong>Origen:</strong> ${esc(detalleOrigen || '—')} · UTM: ${esc([utm.utm_source, utm.utm_medium, utm.utm_campaign].filter(Boolean).join(' / ') || '—')}</p>`,
  `<p><strong>Consentimiento:</strong> ${esc((lead.consentimiento || {}).texto)} (${esc((lead.consentimiento || {}).fecha)})</p>`,
].filter(Boolean).join('');

// Si la web ya envió su correo de RESPALDO (n8n falló antes), no se repite el aviso.
const avisoNecesario = !(lead.envio && lead.envio.respaldo_enviado === true);

return [{ json: {
  valido: true,
  aviso_necesario: avisoNecesario,
  lead_id: corta(lead.id, 64),
  email,
  props_alta: { ...comunes, ...soloAlta },
  props_actualizacion: comunes,
  nota_html: nota,
  aviso_asunto: `Lead en HubSpot (${comunes.sobtree_tipo_formulario}): ${corta(lead.empresa, 80)} · ${corta(lead.interes, 60)}`,
  aviso_texto: `${lead.nombre} (${lead.cargo || 'sin cargo'}) de ${lead.empresa}\n${email} · ${lead.telefono}\nInterés: ${lead.interes} · Tamaño: ${lead.tamano}\n\n${lead.mensaje}\n\n${contexto ? contexto + '\n\n' : ''}Origen: ${detalleOrigen || '—'}\nUTM: ${[utm.utm_source, utm.utm_medium, utm.utm_campaign].filter(Boolean).join(' / ') || '—'}\nId lead: ${lead.id}`,
} }];

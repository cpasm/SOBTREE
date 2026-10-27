// Nodo Code «Fusionar con la fila existente» del workflow «Sobtree · Lead web → Hoja de contactos».
// Entrada: salida de «Buscar fila por email» (la fila actual de la hoja, o un ítem vacío si el correo es nuevo).
// Reglas: un correo = una fila. Los vacíos del lead nuevo no borran datos buenos.
//   - Un «sí» a comunicaciones comerciales nunca se rebaja a «no» por un lead posterior.
//   - Un lead nuevo con «no» se queda en «no».
//   - Una baja no se reactiva: estado, fecha_baja y ultimo_envio se conservan siempre.
const COLUMNAS = ['email', 'nombre', 'empresa', 'cargo', 'telefono', 'interes', 'tamano', 'mensaje', 'tipo_formulario', 'origen', 'referrer', 'pagina',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'contexto', 'consentimiento_privacidad_fecha', 'consentimiento_comercial',
  'fecha_consentimiento', 'texto_consentimiento_comercial', 'version_politica', 'id_lead', 'estado', 'fecha_baja', 'ultimo_envio', 'fecha_alta', 'fecha_actualizacion'];
const m = $('Verificar firma y mapear').first().json;
const ex = $input.first().json || {};
const s = (v) => (v === undefined || v === null ? '' : String(v).trim());
const existe = s(ex.email).toLowerCase() === m.email;
const prev = existe ? ex : {};
const esSi = (v) => ['sí', 'si', 'yes', 'true'].includes(s(v).toLowerCase());

const fila = {};
for (const c of COLUMNAS) fila[c] = s(prev[c]);
// Campos de contacto: lo nuevo gana si no está vacío.
for (const [k, v] of Object.entries(m.fila_nueva)) if (s(v) !== '') fila[k] = s(v);
fila.email = m.email;

// Consentimiento comercial.
const notas = [];
if (existe && esSi(prev.consentimiento_comercial)) {
  fila.consentimiento_comercial = 'sí';
  fila.fecha_consentimiento = s(prev.fecha_consentimiento);
  fila.texto_consentimiento_comercial = s(prev.texto_consentimiento_comercial);
  fila.version_politica = s(prev.version_politica) || s(m.cc_nuevo.version_politica);
  if (!esSi(m.cc_nuevo.consentimiento_comercial)) notas.push('se conserva el «sí» anterior');
} else if (esSi(m.cc_nuevo.consentimiento_comercial)) {
  Object.assign(fila, m.cc_nuevo);
  if (existe) notas.push('nuevo «sí» a comunicaciones comerciales');
} else {
  fila.consentimiento_comercial = 'no';
  fila.fecha_consentimiento = '';
  fila.texto_consentimiento_comercial = '';
  fila.version_politica = s(m.cc_nuevo.version_politica) || s(prev.version_politica);
}

// Estado y envíos: nunca los toca un lead.
const baja = existe && s(prev.estado).toLowerCase() === 'baja';
fila.estado = baja ? 'baja' : 'activo';
fila.fecha_baja = s(prev.fecha_baja);
fila.ultimo_envio = s(prev.ultimo_envio);
fila.fecha_alta = s(prev.fecha_alta) || m.fecha_lead;
fila.fecha_actualizacion = m.fecha_lead;
if (baja) notas.push('el contacto sigue de baja (no se reactiva)');
// Un lead sin consentimiento a una persona de baja no cambia nada de eso; el consentimiento comercial de una baja no se usa para enviar.

const tipo = existe ? 'actualización' : 'alta';
return [{ json: {
  existe, fila,
  historial: { fecha: m.fecha_lead, email: m.email, tipo, campania: '', detalle: (m.detalle_historial + (notas.length ? ' ' + notas.join('; ') + '.' : '')).slice(0, 500) },
  resumen: (existe ? 'Contacto ya existente: fila actualizada' : 'Contacto nuevo: fila añadida') + (notas.length ? ' (' + notas.join('; ') + ')' : ''),
} }];

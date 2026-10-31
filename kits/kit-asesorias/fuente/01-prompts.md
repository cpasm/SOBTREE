# Prompts del Kit IA para asesorías y gestorías

**Cómo usarlos**
- Copiad el prompt entero en la herramienta.
- Sustituid cada [CORCHETE] por vuestro dato y borrad los corchetes.
- Usad roles («cliente autónomo», «cliente sociedad») en lugar de nombres, NIF, cuentas o importes reales.
- Todos los prompts piden a la IA que no invente fechas, importes ni normativa y que marque con [PENDIENTE] lo que falte.
- Los ejemplos de resultado son orientativos. Cada herramienta redacta a su manera.

### Bloque A. Recogida de documentación de clientes

**A1. Lista de documentación por tipo de cliente**
Para qué sirve: preparar una lista clara de lo que tiene que enviar cada tipo de cliente para un trámite.

> Actúa como asistente administrativo de una asesoría en España. Prepara una lista de documentación para un [TIPO DE CLIENTE: autónomo en estimación directa / sociedad limitada / particular con alquiler…] y este trámite: [TRÁMITE O SERVICIO]. Nuestra lista interna de partida es esta: [PEGA VUESTRA LISTA INTERNA]. Reglas: usa solo los documentos de nuestra lista; si crees que falta alguno, ponlo aparte en «Sugerencias para revisar», sin darlo por obligatorio. No incluyas fechas ni importes. Formato: lista numerada, una línea por documento, con una explicación de 10 palabras como máximo para que el cliente sepa qué es.

Ejemplo de resultado:
- «1. Facturas emitidas del periodo: todas las que has hecho a tus clientes.
- 2. Facturas recibidas: gastos de la actividad con factura a tu nombre…
- Sugerencias para revisar: justificantes de cuotas pagadas.»

**A2. Email de petición de documentación**
Para qué sirve: convertir la lista en un email amable y fácil de seguir.

> Redacta un email de [NOMBRE DE LA ASESORÍA] a un cliente [TIPO DE CLIENTE] para pedirle esta documentación: [PEGA LA LISTA]. Plazo interno que queremos darle: [FECHA LÍMITE QUE PONÉIS VOSOTROS]. Canal por el que debe enviarla: [PORTAL / EMAIL / OTRO]. Tono: cercano y profesional, tuteo [o «de usted»]. Como máximo 150 palabras más la lista. Incluye un asunto claro. No añadas documentos, fechas ni consecuencias legales que no te haya dado. Si falta algún dato, escribe [PENDIENTE].

Ejemplo de resultado: «Asunto: Documentación para [trámite]: te la pedimos antes del [fecha]. Hola [Nombre]: para preparar [trámite] necesitamos lo siguiente…».

**A3. Recordatorios escalonados**
Para qué sirve: tener preparados tres recordatorios con tono creciente cuando la documentación no llega.

> Tengo este email de petición de documentación: [PEGA EL EMAIL]. Escribe tres recordatorios para un cliente que no ha respondido: (1) amable, a los [N] días; (2) más directo, a los [N] días; (3) último aviso, a los [N] días, en el que se explique que sin la documentación no podremos [CONSECUENCIA QUE DEFINÍS VOSOTROS]. Sin amenazas ni importes de sanciones. Cada recordatorio con 80 palabras como máximo y su asunto.

Ejemplo de resultado: «Recordatorio 2. Asunto: Seguimos esperando tu documentación. Hola [Nombre]: aún nos faltan [documentos]. Para llegar a tiempo, necesitamos recibirlos antes del [fecha]…».

**A4. Qué falta: pedido frente a recibido**
Para qué sirve: comparar dos listas y ver de un vistazo qué falta, sin pegar el contenido de los documentos.

> Compara estas dos listas. Lista A, lo que pedimos: [LISTA]. Lista B, los nombres de los archivos recibidos (sin contenido): [LISTA DE NOMBRES DE ARCHIVO, SIN DATOS PERSONALES]. Devuelve una tabla con estas columnas: documento pedido / ¿recibido? (sí, no, dudoso) / comentario. Si un nombre de archivo es ambiguo, márcalo «dudoso» y no supongas. Después, redacta en 3 líneas qué hay que pedir de nuevo al cliente.

Ejemplo de resultado: «Facturas recibidas T[x] | dudoso | el archivo "scan_003.pdf" no permite saberlo.»

**A5. Estado semanal de la documentación para el equipo**
Para qué sirve: un resumen interno de qué clientes están pendientes, a partir de una tabla anonimizada.

> Esta tabla es de seguimiento interno y usa códigos de cliente, no nombres: [PEGA TABLA: código cliente | trámite | documentos pendientes | último contacto]. Prepara un resumen para la reunión del lunes: (1) clientes con más de [N] días sin respuesta; (2) qué documento bloquea más trámites; (3) propuesta de a quién llamar primero y por qué, en una frase cada uno. No inventes datos que no estén en la tabla.

Ejemplo de resultado: «Prioridad 1: C-014 y C-022, 12 días sin respuesta. Les falta el mismo documento: extracto bancario.»

### Bloque B. Avisos de plazos y vencimientos

**B1. Calendario interno de avisos a partir de vuestras fechas**
Para qué sirve: ordenar cuándo avisar a cada grupo de clientes, usando solo las fechas que vosotros copiáis del calendario oficial.

> Te doy las obligaciones y fechas que hemos copiado y comprobado en el calendario oficial de la AEAT: [PEGA OBLIGACIÓN | FECHA LÍMITE | A QUIÉN AFECTA]. Prepara un calendario interno de avisos: para cada obligación, cuándo enviar el primer aviso (con [N] días de antelación) y cuándo el recordatorio (con [N] días). Reglas estrictas: no añadas obligaciones ni fechas que no estén en mi lista y no corrijas fechas; si ves algo raro, márcalo como «REVISAR». Formato: tabla ordenada por fecha de aviso.

Ejemplo de resultado: «[fecha aviso] | Primer aviso | [obligación] | autónomos | REVISAR: la fecha límite coincide con un festivo, confirmar.»

**B2. Aviso según el tipo de cliente**
Para qué sirve: adaptar un mismo aviso a perfiles distintos.

> Redacta un aviso de [NOMBRE DE LA ASESORÍA] sobre [OBLIGACIÓN, CON SUS PALABRAS] con fecha límite interna para el cliente el [FECHA QUE PONÉIS VOSOTROS]. Haz tres versiones: [PERFIL 1, p. ej. autónomo con poca documentación], [PERFIL 2, p. ej. sociedad con contabilidad completa], [PERFIL 3]. En cada una explica qué necesitamos del cliente y antes de cuándo. Como máximo 100 palabras por versión. No expliques la normativa ni cites artículos. Si el cliente quiere más información, remítele a nosotros.

Ejemplo de resultado: «Versión autónomo: Hola [Nombre]: se acerca [obligación]. Para prepararla necesitamos tus facturas del periodo antes del [fecha]…».

**B3. Del email al WhatsApp**
Para qué sirve: convertir un aviso largo en un mensaje corto para móvil.

> Convierte este aviso en un mensaje de WhatsApp de 300 caracteres como máximo: [PEGA EL AVISO]. Mantén la fecha que aparece en el aviso y la petición concreta. Sin emojis [o «con un emoji como máximo»]. Termina con una pregunta que se pueda responder con sí o no.

Ejemplo de resultado: «Hola [Nombre], soy [Persona] de [Asesoría]. Para [obligación] necesitamos tus facturas antes del [fecha]. ¿Nos las puedes subir esta semana?»

**B4. Cliente que va tarde**
Para qué sirve: un mensaje firme y cortés cuando el plazo interno ya ha pasado.

> Un cliente [TIPO] no nos ha enviado [DOCUMENTACIÓN] y el plazo interno que le dimos ([FECHA]) ya ha pasado. La fecha límite oficial, comprobada por nosotros, es [FECHA]. Redacta un mensaje firme y respetuoso que: (1) recuerde lo que falta; (2) dé un último plazo ([FECHA]); (3) explique, sin cifras ni tecnicismos, que fuera de plazo pueden aplicarse recargos o sanciones y que se lo detallaremos si lo pide. No calcules ni menciones importes. Como máximo 120 palabras.

Ejemplo de resultado: «Hola [Nombre]: el [fecha] te pedimos [documentación] y todavía no la tenemos. Para presentarlo a tiempo, la necesitamos como tarde el [fecha]…».

**B5. Prioridades de la semana**
Para qué sirve: ordenar el trabajo del equipo según los vencimientos.

> Esta es nuestra lista de tareas de la semana, con códigos de cliente: [PEGA TABLA: código | tarea | fecha límite comprobada | ¿documentación completa? | responsable (rol)]. Ordénala por urgencia. Separa lo que se puede hacer ya de lo que está bloqueado por falta de documentación y propone a qué cliente avisar hoy. No cambies ninguna fecha.

Ejemplo de resultado: «Hacer ya: C-031, documentación completa, vence [fecha]. Bloqueado: C-008, falta el extracto; avisar hoy.»

### Bloque C. Respuestas a las dudas repetidas

**C1. Encontrar las dudas que más se repiten**
Para qué sirve: agrupar las preguntas de los clientes para saber cuáles merecen una respuesta preparada.

> Estas son preguntas de clientes que hemos copiado sin nombres ni datos personales: [PEGA PREGUNTAS, UNA POR LÍNEA]. Agrúpalas por tema. Para cada grupo, dime cuántas preguntas tiene, escribe la pregunta tipo en una frase y añade un ejemplo literal. Ordénalos de más a menos frecuentes. No respondas a las preguntas todavía.

Ejemplo de resultado: «Grupo 1 (7 preguntas): "¿Qué gastos puedo deducir?". Ejemplo: "¿el móvil cuenta como gasto?"»

**C2. Respuesta base a partir de la explicación del asesor**
Para qué sirve: convertir la explicación técnica de un profesional del equipo en una respuesta clara para clientes. El contenido lo pone el asesor; la IA solo redacta.

> Esta es la explicación de nuestro asesor sobre [TEMA]: [PEGA LA EXPLICACIÓN]. Redáctala como respuesta para clientes: frases cortas, sin jerga, 150 palabras como máximo. Reglas: no añadas información, excepciones ni normativa que no esté en la explicación. Si algo no queda claro, escribe [PREGUNTAR AL ASESOR]. Termina con: «Cada caso puede tener matices; si quieres, lo revisamos con tus datos».

Ejemplo de resultado: «Puedes deducir un gasto si está relacionado con tu actividad y tienes factura a tu nombre… [PREGUNTAR AL ASESOR: ¿incluimos el caso de uso mixto?]».

**C3. Adaptar el tono y el nivel**
Para qué sirve: ajustar una respuesta a cada cliente.

> Reescribe esta respuesta: [PEGA RESPUESTA]. Haz dos versiones: (1) para un cliente sin conocimientos fiscales, en tuteo; (2) para un cliente con experiencia, de usted, más breve. No cambies el contenido ni añadas datos. Señala cualquier frase que pueda entenderse como una promesa o garantía.

Ejemplo de resultado: «Versión 2: Le confirmamos que el gasto puede deducirse si cumple dos condiciones… Frase que puede leerse como garantía: "seguro que te lo aceptan".»

**C4. Documento de preguntas frecuentes para clientes**
Para qué sirve: reunir las respuestas ya revisadas en un documento que podáis enviar o colgar en vuestra web.

> Con estas preguntas y respuestas, ya revisadas por nuestro equipo: [PEGA PARES PREGUNTA–RESPUESTA], prepara un documento de preguntas frecuentes para clientes de [NOMBRE DE LA ASESORÍA]. Ordénalas por tema y añade una introducción de 2 líneas y un cierre que invite a contactar en [CANAL]. No modifiques el contenido de las respuestas; solo puedes corregir erratas y dar formato.

Ejemplo de resultado: «Preguntas frecuentes de [Asesoría]. Documentación: ¿Cómo os envío las facturas?…».

**C5. Revisar un borrador antes de enviarlo**
Para qué sirve: una segunda lectura de tono, claridad y riesgos. No sustituye la revisión profesional.

> Revisa este borrador de respuesta a un cliente: [PEGA BORRADOR]. Dame: (1) frases poco claras y cómo mejorarlas; (2) cualquier fecha, importe, porcentaje o referencia legal que haya que comprobar con la fuente oficial (lístalas; no digas si son correctas); (3) si hay algún dato personal que convenga quitar; (4) una versión corregida. No añadas contenido técnico nuevo.

Ejemplo de resultado: «Comprobar: "plazo hasta el [fecha]" y "recargo del X %". Dato personal: aparece un número de cuenta; quitarlo.»

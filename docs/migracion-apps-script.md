# Migración de n8n a Google Apps Script: doble envío (fase «sombra»)

Estado: **preparado en rama local, sin fusionar ni desplegar** (pendiente del OK del fundador). Sin claves de Apps Script en `sobtree-secrets.php` el código no hace nada nuevo: el comportamiento es el de antes.

## Qué cambia

Cada lead (`contact.php`, `reintentar-leads.php`) y cada aviso de Contrata (webhook de Stripe, `reintentar-contrata.php`) se reenvía, **además de a n8n**, a un web app de Google Apps Script con el mismo evento. El contrato del web app está en `integraciones/apps-script/README.md` del repositorio `cpasm/SOBTREE-AGENTS` («Requisito del parche PHP»).

| Pieza | Fichero |
|---|---|
| Cliente (sobre firmado, 302, interpretación del JSON) | `public/lib/apps-script.php` (nuevo) |
| Leads: configuración, envío, modos, contadores | `public/lib/leads.php`, `public/lib/reintentar-leads.php` |
| Contrata: configuración, entrega diferida, cola por canal, purga de NIF | `public/lib/contrata.php` |
| Nombres de las claves | `config/sobtree-secrets.example.php` (solo nombres, comentados) |
| Pruebas | `tests/apps-script/` (`npm run test:apps-script`) |

### Protocolo
- `POST <APPS_SCRIPT_*_URL>?flujo=lead|contrata` con el sobre `{"ts","flujo","firma","cuerpo"}`. `cuerpo` es el JSON crudo que también recibe n8n (lead: con `envio.respaldo_enviado`; Contrata: la fila de la cola). `firma = "sha256=" . HMAC-SHA256(secreto, ts . "." . flujo . "." . cuerpo)`, con `ts` y firma nuevos en cada intento.
- Apps Script responde 302. El cliente sigue la `Location` **con GET, sin reenviar el POST** (hasta 3 saltos). La `Location` solo se acepta si es `https` y de `*.google.com` o `*.googleusercontent.com` (si no, `redireccion_no_permitida`; protege frente a SSRF).
- Timeout de **30 s** por petición (conexión 5 s). La respuesta es HTTP 200 con el resultado dentro del JSON: **solo `status` 2xx cuenta como entregado**. JSON roto, sin `status`, `status` no numérico, `status` fuera de 2xx o HTTP distinto de 2xx = fallo.
- El `detalle` que se registra sale de un vocabulario cerrado (`status_502 hoja`, `json_invalido`, `sin_status`, `http_500`, `timeout`, `curl_<n>`, `redireccion_no_permitida`…). Nunca se guarda el cuerpo de la respuesta, la URL del despliegue (parte de ella es sensible), el secreto ni datos personales.

### Configuración (en `domains/sobtree.com/sobtree-secrets.php` o en el entorno, como el resto)
| Clave | Uso |
|---|---|
| `APPS_SCRIPT_LEADS_URL`, `APPS_SCRIPT_LEADS_HMAC_SECRET` | web app y secreto del flujo lead (= `LEADS_HMAC_SECRET` de las propiedades del script) |
| `APPS_SCRIPT_CONTRATA_URL`, `APPS_SCRIPT_CONTRATA_HMAC_SECRET` | ídem Contrata (= `CONTRATA_HMAC_SECRET` del script) |
| `APPS_SCRIPT_MODO` | `sombra` (defecto) · `principal` · `apagado` |

Si falta la URL (o no es https) o el secreto de un flujo, ese flujo se omite en silencio.

## Modos

| Modo | n8n | Apps Script | Correo de respaldo / cola de n8n |
|---|---|---|---|
| `sombra` (defecto, también si el valor es vacío o desconocido) | Principal, **sin ningún cambio** | Recibe el mismo evento **después** de n8n y del respaldo. Solo se **registra** (canal `apps_script`) | Los decide solo el resultado de n8n. Apps Script no los dispara ni los evita |
| `principal` | Respaldo: solo se llama si Apps Script no entregó | Decide la entrega | El correo de respaldo sale solo si no entrega ninguno de los dos (o si el que entrega dice `aviso:false`) |
| `apagado` | Principal | No se llama | Como antes |

Sin claves, cualquier modo equivale a `apagado`.

### Estado, contadores y reintentos
- **Leads**: `estado.jsonl` ya tenía un registro por canal; se añade el canal `apps_script`. Su contador de intentos fallidos es propio (máx. 8, `APPS_SCRIPT_MAX_INTENTOS`), independiente del de n8n (`LEADS_MAX_ATTEMPTS`). El cron (`reintentar-leads.php`) reintenta Apps Script solo si ya falló antes, o si el lead tiene menos de 24 h y nunca se intentó (proceso cortado). **No hace recuperación en bloque** de leads antiguos al activar la función.
- **Contrata**: `cola-estado.jsonl` ya existía; las filas nuevas llevan `"canal":"apps_script"` y las antiguas (sin `canal`) son de n8n. Mismo contador propio de 8.
- **Idempotencia**: un canal ya `enviado` no se vuelve a llamar. Apps Script es además idempotente por su lado (una fila por email, venta por `id_sesion_stripe`). Un reintento tras un fallo ambiguo (p. ej. timeout con el doPost ya ejecutado) puede repetir el aviso por correo de Apps Script (documentado en su README).
- **NIF en la cola de Contrata**: antes se purgaba al entregar a n8n. Ahora se purga cuando no queda ningún canal que lo necesite (n8n entregado y Apps Script entregado o agotado, o apagado/no configurado). Con Apps Script caído el NIF se conserva, como máximo, hasta agotar sus 8 intentos (unas 2 h con el cron cada 15 min).
- **No bloquea ni rompe nada**: en leads, Apps Script se llama tras responder al visitante y tras n8n/respaldo; en Contrata, la llamada se difiere a una función de cierre (`register_shutdown_function`) que cierra antes la respuesta HTTP (`fastcgi_finish_request` / `litespeed_finish_request`), de modo que el webhook de Stripe y el checkout no esperan hasta 30 s. Todo está envuelto en `try/catch`; un fallo solo deja una línea de registro.
- Cuando `contact.php` no puede guardar el lead en disco (caso excepcional) solo se usa n8n, como antes.

## Orden recomendado del corte
1. **Antes** (fuera de este parche, requiere OK): desplegar el web app de Apps Script, poner sus propiedades, reconciliar n8n en vivo con los JSON del repositorio. Comprobar que en `sombra` Apps Script **no duplica avisos ni escrituras** con n8n (ver Riesgos): usar un `AVISO_A` de pruebas o la hoja de pruebas mientras dure la sombra.
2. Fusionar y desplegar este parche con las claves **ausentes**: sin efecto. Comprobar que formulario y Contrata siguen igual.
3. Poner las claves de **lead** con `APPS_SCRIPT_MODO` ausente (= sombra). Observar `estado.jsonl` (canal `apps_script`) varios días: tasa de `enviado`, tiempos, errores. Criterio de salida propuesto: ≥ 99 % de leads en `enviado` sin reintentos y 0 incidencias de duplicados.
4. Igual con **Contrata** (primero con `CONTRATA_MODO` en simulación o `stripe_test`; en `live` solo con el OK del fundador, porque afecta a ventas).
5. `APPS_SCRIPT_MODO=principal`. n8n queda como respaldo. Observar al menos una semana.
6. Apagar n8n (tras backup) y, en una fase posterior, retirar el código de n8n y la espera por el canal n8n. No forma parte de este parche.

## Rollback
- **Inmediato y sin desplegar código**: `APPS_SCRIPT_MODO=apagado` (o quitar las claves `APPS_SCRIPT_*`). Efecto en la siguiente petición; n8n vuelve a ser el único canal. Los estados `apps_script` ya escritos quedan inertes.
- Si se estaba en `principal`: volver a `sombra` o `apagado`; los leads/ventas pendientes en Apps Script se entregan por n8n en el siguiente cron porque su estado de n8n no es `enviado`.
- Revertir el commit del parche también es seguro: las filas con `canal` extra en `estado.jsonl`/`cola-estado.jsonl` las ignoraría el código anterior salvo que las trate como estado de n8n (en `cola-estado.jsonl` el código anterior **no** distingue canal: un `enviado` de Apps Script contaría como entrega de n8n). Por eso el rollback preferido es el interruptor, no revertir el código con filas `apps_script` en cola.

## Pruebas
`npm run test:apps-script` (`bash tests/apps-script/run-tests.sh`): levanta, en 127.0.0.1, la web, n8n simulado (los mocks existentes) y `tests/apps-script/mock-apps-script.php` (302 + GET, `status` 502/503/401, JSON roto, sin `status`, HTTP 500 en la redirección, timeout, 302 a dominio no permitido, 200 directo). Datos sintéticos y secretos generados al vuelo. Comprueba, para leads y Contrata: sombra (n8n idéntico y Apps Script solo registrado), un único POST y un GET, cada tipo de fallo, contador propio de 8, idempotencia del cron, `apagado`, sin claves, URL no https, destino caído, `principal` (con respaldo en n8n y recuperación), ausencia de secretos, URL del despliegue y datos personales en estados, cola y logs.

Los tests existentes (`test:leads`, `test:leads-hoja`, `test:contrata`) se ejecutan sin cambios; el resultado antes y después del parche es idéntico (ver el informe del PR).

## Riesgos y límites conocidos
- **Duplicados en sombra**: el web app real también avisa a `AVISO_A` y escribe en la hoja. Con n8n activo habrá avisos dobles o escrituras concurrentes si no se separan (destinatario/hoja de pruebas). Es una decisión de despliegue, no de este código.
- Los timeouts de 30 s dentro de `reintentar-*.php` alargan el cron si Apps Script está caído (hasta 30 s por elemento pendiente; el cron de 15 min tiene un único proceso por bloqueo). Con muchos pendientes habría que limitar el lote.
- El cierre anticipado de la respuesta depende de FPM/LiteSpeed; en el servidor de desarrollo `php -S` la respuesta espera al final del script (solo afecta a las pruebas locales).
- No verificado: comportamiento real del 302 de Apps Script y de Hostinger (LiteSpeed) con `litespeed_finish_request`; cuotas de `UrlFetch`.

# Sobtree · Guía de diseño y maquetación

Dirección elegida: **F · Foco** (octubre de 2026). Azul marino y blanco, tipografía Open Sans, bordes redondeados, movimiento que responde al ratón y un tono directo, agresivo con el precio de las grandes consultoras.

Posicionamiento (octubre de 2026): **IA para pymes con precio transparente**. Siempre **precio cerrado** (nunca se muestran tarifas por hora ni horas de trabajo; la tarifa interna no sale en la web), 0 € en comisiones de licencias. Lectores: dueños y gerentes de pequeñas y medianas empresas, no técnicos. Nada de Salesforce.

Todo lo que se añada a la web sigue esta guía. Los valores viven en `public/assets/styles.css` (`:root`); si cambias uno, cámbialo aquí también.

---

## 1. Marca

### Logotipo
- **Monograma:** «S.»: S blanca en Open Sans 800 y punto en `--accent`, sobre un cuadrado marino con radio 16/64 y borde blanco al 28 %. Se usa **solo como favicon**; en pantalla nunca. Juego de iconos: `favicon.svg`, `/favicon.ico` (16/32/48), `favicon-32.png`, `apple-touch-icon.png` (180, fondo marino) e `icon-192/512.png` en `site.webmanifest`.
- **Wordmark:** `Sobtree.` en Open Sans 800, blanco sobre marino (o marino sobre blanco), con el **punto en el color de acento** (`--accent`).
- **Lockup en cabecera:** `Sobtree.` · barra vertical fina (1 px, 26 px de alto, blanco al 30 %) · `IA` en versalitas, 13 px, 600, tracking 0,06 em. Sin logos de terceros. Se ve igual en móvil, algo más pequeño.
- **Favicon:** monograma «S.» blanco con punto de acento sobre marino (`public/assets/favicon.svg`).
- **El punto de acento** es un recurso de marca: puede cerrar titulares cortos («Gana más con IA.»). Uno por bloque como máximo.

### Tono
- Directo, agresivo con el sobrecoste y nunca con personas o empresas concretas: «¿Cansado de consultoras que cobran pastizales?» sí; nombres de competidores, no.
- Se habla de tú. Frases cortas. Cifras siempre verificables (diagnóstico 490 € + IVA a precio cerrado; si contratas el proyecto en los 30 días siguientes a la entrega del informe, te descontamos los 490 €, solo en proyectos, uno por empresa, no acumulable y no se devuelve en dinero; 2–3 semanas, 0 € en comisiones, ejemplos de los análisis). Transparencia total en coste y ahorro: si damos un ahorro, damos también lo que cuesta. La frase sale de `DIAGNOSTICO` en `src/data/site.ts`.
- Lenguaje de pyme: tareas, horas, euros. Sin jerga técnica; si hace falta un término, se explica.
- Nada de promesas no medibles («resultados garantizados»). Si no hay dato, no hay cifra.
- La expresión destacada del titular (p. ej. «cobran pastizales») va en `--accent` con el subrayado dibujado.

---

## 2. Color

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#050F2C` | Fondo principal (marino profundo) |
| `--bg-alt` | `#0A1A42` | Secciones alternas |
| `--bg-deep` | `#030A1F` | Pie, campos de formulario |
| `--panel` | `#0C1F4F` | Tarjetas sobre marino |
| `--panel-2` | `#1A3F8C` | Tarjeta activa / hover |
| `--line` | `rgba(255,255,255,.12)` | Bordes suaves |
| `--line-strong` | `rgba(255,255,255,.24)` | Bordes de campos y botones fantasma |
| `--white` | `#FFFFFF` | Texto principal sobre marino |
| `--text-2` | `#D4DEF4` | Texto secundario |
| `--text-3` | `#8FA2CC` | Metadatos, notas |
| `--accent` | `#6AA2FF` | Punto del logo, palabra destacada, foco, elementos activos |
| `--accent-2` | `#9CC2FF` | Antetítulos y enlaces sobre marino |
| `--ok` | `#3CCF9A` | Confirmaciones y checks |
| `--paper` | `#FFFFFF` | Secciones claras (artículos) |
| `--ink` | `#050F2C` | Texto sobre blanco |
| `--ink-2` | `#3E5079` | Texto secundario sobre blanco |
| `--paper-2` | `#EEF3FC` | Tarjetas sobre blanco |

Reglas:
- Una sola tinta de acento. Prohibidos los degradados de fondo decorativos; el único degradado permitido es el **foco** que sigue al ratón.
- Contraste mínimo 4,5:1 en texto. `--text-3` solo sobre `--bg`/`--bg-alt`.
- Los botones primarios son **blancos sobre marino** (y marinos sobre blanco), no de color acento.

---

### Menú móvil desplegable
El menú desplegable utiliza una superficie ligeramente más clara que el fondo principal (`--bg-alt`), con borde discreto y sombra suave. Debe diferenciarse del contenido sin competir con la marca ni parecer un bloque azul brillante. El enlace de calculadora se mantiene neutro, con texto secundario y borde fino.

## 3. Tipografía

- **Open Sans** (Google Fonts) 400, 600, 700, 800. Pila de respaldo: `system-ui, -apple-system, "Segoe UI", sans-serif`.
- Titular de portada: 800, `clamp(38px, 5.2vw, 76px)`, interlineado 1,0, tracking −0,045 em.
- Titulares de sección (`h2`): 800, `clamp(30px, 3.6vw, 44px)`, tracking −0,03 em.
- Antetítulos: 700, 13 px, versalitas, tracking 0,12 em, `--accent-2`.
- Cuerpo: 400, 17 px (16 px en móvil), interlineado 1,6.
- Cifras grandes (3 sem., 90 días, 0 €): 800, 36 px, tracking −0,04 em.

---

## 4. Forma y espaciado

| Token | Valor | Uso |
|---|---|---|
| `--r` | `20px` | Tarjetas, campos |
| `--r-lg` | `28px` | Bloques grandes, diálogo del asistente |
| `--r-xl` | `40px` | Esquinas superiores de las secciones blancas |
| Píldora | `999px` | Botones, chips, burbuja del asistente |
| `--wrap` | `1280px` | Ancho máximo del contenido |
| `--gutter` | `clamp(16px, 4vw, 32px)` | Márgenes laterales |

- Separación entre bloques de una misma sección: 14 px (rejilla) o 24–32 px (texto).
- Padding vertical de sección: `clamp(64px, 8vw, 112px)`.

---

## 5. Portada: todo de un vistazo

En escritorio (≥1280×800) la primera pantalla muestra, sin hacer scroll:
1. Cabecera con el lockup, la pestaña destacada **«Calcula tu ahorro»** (píldora, `/calculadora/`) y «Contrata y empieza a ahorrar» (con `PUBLIC_CONTRATA_ACTIVO=1`; si no, «Reservar 25 min»).
2. Antetítulo («IA para pymes · precio cerrado, sin sorpresas»), titular y una frase de apoyo.
3. Dos acciones: **Calcula tu ahorro** (primaria) y **Contrata y empieza a ahorrar** como botón blanco principal a `/contratar/` (con el flag; si no, «Calcula tu ahorro» primario y «Reservar 25 min» secundario a `#contacto`).
4. Diagrama interactivo horizontal (Tus tareas → Caso de uso → IA → Tu equipo).
5. «Cómo lo hacemos»: tres tarjetas (2–3 sem. · 490 € + IVA a precio cerrado, −490 € si contratas el proyecto en 30 días desde la entrega del informe, condiciones en las FAQ · 0 €).
6. Franja «Trabajamos con»: Claude, ChatGPT, Gemini y Copilot.

Los artículos empiezan justo debajo, en una sección blanca con esquinas superiores redondeadas. La calculadora vive en `/calculadora/`, no en la portada.

### Calculadora (`/calculadora/`)
Cinco preguntas visuales (sector en chips, personas, horas repetitivas y coste por hora con deslizadores, áreas a automatizar en tarjetas) y un panel de resultado fijo: ahorro anual (tarjeta oscura), diagnóstico en línea aparte, puesta en marcha, descuento si se contrata el proyecto en los 30 días desde la entrega del informe (cuando `descuentoCondicionado` está activo; condiciones en las FAQ), total neto, licencias al mes, barras ahorro frente a inversión del primer año, meses para recuperarlo (sobre el neto) y «Cómo lo calculamos» desplegable. El modelo está en `public/assets/roi.js` con los números de `src/data/site.ts`. El botón final rellena el formulario de contacto con los importes por separado (diagnóstico, descuento, puesta en marcha y neto); viajan con el lead y salen en el aviso a info@.

---

## 6. Componentes

**Llamadas a reservar:** como máximo **dos** en la primera pantalla: «Contrata y empieza a ahorrar» en cabecera y botón blanco del titular (con el flag); opción secundaria «Prefiero hablar antes» a `#contacto`. El resto de tarjetas enlazan a su explicación con una flecha («Qué incluye →», «Cómo →», «Por qué →»). Más abajo: el formulario de contacto y la oferta del asistente.

- **Botón primario:** píldora, blanco sobre marino, 700, 15–16 px, padding 15×26. Hover: sube 2 px.
- **Botón fantasma:** píldora, borde `--line-strong`, texto blanco.
- **Tarjeta «cómo lo hacemos»:** `--panel`, radio 26 px, cifra + texto + enlace con flecha a su sección. Hover: se vuelve blanca, sube 8 px y gira −0,6°.
- **Diagrama:** cuatro nodos en fila; el activo crece (`flex-grow` 2,2) y muestra su explicación. Se activa con ratón, foco de teclado o toque. Una línea animada recorre la base. En móvil, columna con todas las explicaciones visibles.
- **Artículo destacado:** portada 16:9 con radio 28 px, línea temática, titular 800 y resumen de 2–3 frases (el `description` del artículo).
- **Lista de artículos:** miniatura 88×64, línea temática y titular.
- **Asistente:** burbuja fija abajo a la derecha. A los 3,5 s se abre una tarjeta con «Deja tu nombre y comienza a ahorrar.», un campo, un botón y una **cruz para cerrar** (cerrada, no vuelve a abrirse sola en la visita). Indica siempre que es una IA. El nombre no se envía al modelo: solo saluda y rellena el formulario de contacto.
- **Newsletter:** al final de cada análisis y Radar (`src/components/Newsletter.astro`, en `Post.astro`), a todo el ancho del artículo, en tarjeta `--panel` con radio 28 px. Título «¿Quieres más análisis como este?», email + casilla de consentimiento (obligatoria) + «Suscribirme». Envía a `/api/newsletter.php`, que reenvía a Zapier; la URL del webhook va en `sobtree-secrets.php`, nunca en la página. Sin webhook configurado, no se muestra.
- **Franja «Trabajamos con»:** las IA que usamos (`src/data/confianza.ts`): Claude, ChatGPT, Gemini y Copilot, en píldoras con nombre y fabricante. Si se sube el logo oficial a `public/img/logos/ia/<slug>.svg|png`, se usa el logo. Nunca logos de clientes sin permiso escrito.

---

## 7. Movimiento

- **Foco:** un halo radial de 520 px en `--accent` al 22 % sigue al ratón en la portada. Solo con puntero fino (`pointer: fine`).
- **Paralaje suave:** el titular se desplaza hasta 16 px en sentido contrario al ratón.
- **Hover:** tarjetas suben 6–8 px; imágenes de artículos hacen zoom 1,04–1,06.
- Duraciones: 200–400 ms, `cubic-bezier(.2,.8,.2,1)`.
- `prefers-reduced-motion: reduce` desactiva foco, paralaje, animaciones y transformaciones.

---

## 8. Responsive

| Punto | Cambios |
|---|---|
| ≤1080 px | Menú hamburguesa. Diagrama en dos filas de dos. |
| ≤960 px | Rejillas de dos columnas pasan a una. |
| ≤640 px | Titular 38–44 px. Tarjetas «cómo lo hacemos» en columna, compactas. Diagrama en columna con explicaciones visibles. Asistente: botón redondo, panel a pantalla completa. Botones a todo el ancho. |

Probar siempre a 1440×900, 1280×800, 1024×768, 768×1024 y 375×812, sin scroll horizontal.

---

## 9. Contenido y artículos

- Cada artículo responde a una pregunta real de un **dueño o gerente de pyme** sobre usar IA: cómo ahorra tiempo y dinero, cómo vende más o cómo quita trabajo pesado a su equipo. Título y slug con las palabras que buscaría en Google («IA para pymes», «cuánto cuesta implantar IA»…).
- Línea (`linea` en el frontmatter): **IA**, **Normativa** o **Caso de uso**. El valor por defecto es IA. No hay línea de Salesforce: los borradores antiguos están en `archivo/borradores/`, fuera de `src/content`, y no se publican.
- Portada: `imagen` (con licencia de uso, en `public/img/`) y `imagenAlt`. Sin imagen, se dibuja una **ilustración de marca** según el tema (`src/components/Cover.astro`): **ahorro** (columnas que bajan y flecha), **radar** (barrido con señales), **IA** (burbujas de conversación y agente) y **datos** (fuentes que convergen en un perfil y ventas que suben). Solo azul marino, `--panel-2`, blanco y acento; sin texto dentro.
- La **misma portada** sale en la portada de la web, en los listados de Artículos y Radar (tarjetas con imagen, tema, fecha, título y resumen) y dentro de cada pieza, bajo el título. El tema se calcula en un solo sitio (`temaDe` en `src/data/content.ts`).
- Las páginas de listados y de artículo usan poco espacio superior (`.page-tight`).
- Fotos reales, si se usan: escenas de trabajo reales y sobrias (equipos, pantallas, oficinas), retocadas a tonos fríos para casar con el marino. Nada de robots, cerebros brillantes ni manos humanas tocando circuitos.
- El `description` es el resumen de la portada: 2–3 frases, con una cifra si la hay.
- El Radar es semanal; cada noticia se convierte en una pregunta concreta de una pyme («¿Tengo que cambiar de herramienta de IA este mes?»).
- **Publicación semanal:** cada lunes una rutina en la nube abre un pull request «¿Publicar? Radar semana NN + artículo» con el texto completo en la descripción. Llega un email con el enlace: **comentar «OK» en el PR = publicar** (la acción `publicar-con-ok.yml` fusiona y despliega); **cerrarlo = descartar**. Nada se publica sin esa decisión.

---

## 10. Accesibilidad

- Elementos interactivos reales (`<a>`, `<button>`, `<input>` con `<label>`), objetivos táctiles ≥44 px.
- Foco visible: contorno de 2 px en `--accent-2`.
- El diagrama funciona con teclado (botones con `aria-expanded`).
- El asistente se identifica como IA en el botón, el panel y el pie del panel.

# Sobtree · Guía de diseño y maquetación

Dirección elegida: **F · Foco** (octubre de 2026). Azul marino y blanco, tipografía Open Sans, bordes redondeados, movimiento que responde al ratón y un tono directo, agresivo con el precio de las grandes consultoras.

Todo lo que se añada a la web sigue esta guía. Los valores viven en `public/assets/styles.css` (`:root`); si cambias uno, cámbialo aquí también.

---

## 1. Marca

### Logotipo
- **Monograma:** «S.»: S blanca en Open Sans 800 y punto en `--accent`, sobre un cuadrado marino con radio 16/64 y borde blanco al 28 %. Se usa **solo como favicon**; en pantalla nunca.
- **Wordmark:** `Sobtree.` en Open Sans 800, blanco sobre marino (o marino sobre blanco), con el **punto en el color de acento** (`--accent`).
- **Lockup en cabecera:** `Sobtree.` · barra vertical fina (1 px, 26 px de alto, blanco al 30 %) · logo de Salesforce en PNG (`public/img/logos/salesforce.png`, 46 px de alto; 40 px en móvil) · `× IA` en versalitas, 13 px, 600, tracking 0,06 em. Sin el PNG, el texto es `IA × SALESFORCE`. Se ve igual en móvil, algo más pequeño.
- **Logo de Salesforce:** solo si Sobtree es partner oficial y con el distintivo que Salesforce entregue a partners. Mientras no lo sea, el nombre «Salesforce» va solo en texto (uso nominativo) y el pie mantiene el aviso de no afiliación.
- **Favicon:** monograma «S.» blanco con punto de acento sobre marino (`public/assets/favicon.svg`).
- **El punto de acento** es un recurso de marca: puede cerrar titulares cortos («Gana más con IA.»). Uno por bloque como máximo.

### Tono
- Directo, agresivo con el sobrecoste y nunca con personas o empresas concretas: «¿Cansado de consultoras que cobran pastizales?» sí; nombres de competidores, no.
- Se habla de tú. Frases cortas. Cifras siempre verificables (precio cerrado, 3 semanas, 90 días, 0 € en comisiones, ejemplos de los análisis).
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
1. Cabecera con el lockup y «Reservar 30 min».
2. Antetítulo, titular y una frase de apoyo.
3. Dos acciones: **Reservar diagnóstico** (primaria) y **Calcular mi ahorro**.
4. Diagrama interactivo horizontal (Fuentes → Data 360 → Agentforce → Personas).
5. «Cómo lo hacemos»: tres tarjetas (3 sem. · 90 días · 0 €), cada una con su botón de reservar.
6. Franja de confianza.

Los artículos empiezan justo debajo, en una sección blanca con esquinas superiores redondeadas. La calculadora vive en `/calculadora/`, no en la portada.

---

## 6. Componentes

**Llamadas a reservar:** como máximo **dos** en la primera pantalla: «Reservar 30 min» (cabecera) y «Reservar diagnóstico» (titular). El resto de tarjetas enlazan a su explicación con una flecha («Qué incluye →», «Cómo →», «Por qué →»). Más abajo: el formulario de contacto y la oferta del asistente.

- **Botón primario:** píldora, blanco sobre marino, 700, 15–16 px, padding 15×26. Hover: sube 2 px.
- **Botón fantasma:** píldora, borde `--line-strong`, texto blanco.
- **Tarjeta «cómo lo hacemos»:** `--panel`, radio 26 px, cifra + texto + enlace con flecha a su sección. Hover: se vuelve blanca, sube 8 px y gira −0,6°.
- **Diagrama:** cuatro nodos en fila; el activo crece (`flex-grow` 2,2) y muestra su explicación. Se activa con ratón, foco de teclado o toque. Una línea animada recorre la base. En móvil, columna con todas las explicaciones visibles.
- **Artículo destacado:** portada 16:9 con radio 28 px, línea temática, titular 800 y resumen de 2–3 frases (el `description` del artículo).
- **Lista de artículos:** miniatura 88×64, línea temática y titular.
- **Asistente:** burbuja fija abajo a la derecha. A los 3,5 s se abre una tarjeta con «Deja tu nombre y comienza a ahorrar.», un campo, un botón y una **cruz para cerrar** (cerrada, no vuelve a abrirse sola en la visita). Indica siempre que es una IA. El nombre no se envía al modelo: solo saluda y rellena el formulario de contacto.
- **Franja de confianza:** logos reales (`src/data/confianza.ts`). Sin logos aprobados, muestra las plataformas en texto. Nunca logos de clientes sin permiso escrito ni de proyectos hechos para otra empresa.

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

- Cada artículo responde a una pregunta de un **CIO**: cómo ahorra dinero, cómo gana más o cómo ayuda a su gente.
- Tres líneas (`linea` en el frontmatter): **Salesforce**, **IA**, **Salesforce + IA**.
- Portada: `imagen` (con licencia de uso, en `public/img/`) y `imagenAlt`. Sin imagen, se dibuja una **ilustración de marca** según el tema (`src/components/Cover.astro`): **ahorro** (columnas que bajan y flecha), **radar** (barrido con señales), **IA** (burbujas de conversación y agente) y **datos** (fuentes que convergen en un perfil y ventas que suben). Solo azul marino, `--panel-2`, blanco y acento; sin texto dentro.
- Fotos reales, si se usan: escenas de trabajo reales y sobrias (equipos, pantallas, oficinas), retocadas a tonos fríos para casar con el marino. Nada de robots, cerebros brillantes ni manos humanas tocando circuitos.
- El `description` es el resumen de la portada: 2–3 frases, con una cifra si la hay.
- El Radar es semanal; cada noticia se convierte en una pregunta concreta de empresa («¿Tengo que renegociar Marketing Cloud tras la compra de Braze?»).
- **Publicación semanal:** cada lunes una rutina en la nube abre un pull request «¿Publicar? Radar semana NN + artículo» con el texto completo en la descripción. **Fusionar el PR = publicar; cerrarlo = descartar.** Nada se publica sin esa decisión.

---

## 10. Accesibilidad

- Elementos interactivos reales (`<a>`, `<button>`, `<input>` con `<label>`), objetivos táctiles ≥44 px.
- Foco visible: contorno de 2 px en `--accent-2`.
- El diagrama funciona con teclado (botones con `aria-expanded`).
- El asistente se identifica como IA en el botón, el panel y el pie del panel.

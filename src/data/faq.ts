// Una sola fuente para el FAQ visible, el JSON-LD FAQPage y llms.txt.
import { TEXTOS } from "./site";

export const FAQ: { q: string; a: string; nota?: string }[] = [
  { q: "¿Cuánto cuesta implantar IA en una pyme?", a: TEXTOS.faqPrecio },
  { ...TEXTOS.faqDescuento, ...(TEXTOS.condiciones ? { nota: TEXTOS.condiciones } : {}) },
  { q: "¿Necesito saber de tecnología o tener un departamento de informática?", a: "No. Usamos herramientas que ya existen (ChatGPT, Claude, Gemini, Microsoft Copilot y automatizaciones sencillas) y las dejamos funcionando. Tu equipo solo tiene que aprender a usarlas, y eso también lo hacemos." },
  { q: "¿En cuánto tiempo veo resultados?", a: "El primer caso de uso suele estar en marcha en 2 o 3 semanas. Empezamos siempre por la tarea que más tiempo os quita, para que el ahorro se note pronto." },
  { q: "¿Qué pasa con mis datos y el RGPD?", a: "Elegimos planes de empresa de los proveedores de IA que no usan tus datos para entrenar sus modelos, limitamos qué información se comparte y dejamos por escrito qué hace cada herramienta. Si un caso de uso no es seguro para tus datos, no lo hacemos." },
  { q: "¿Y si la IA no me sirve?", a: "Por eso empezamos con un diagnóstico corto y un solo caso de uso. Si no vemos ahorro claro, te lo decimos antes de que gastes más." },
  { q: "¿Por qué sois tan baratos?", a: "Porque hacemos lo que predicamos: casi todo nuestro trabajo, incluida esta web, lo hacemos con IA. Tardamos menos y eso se nota en el precio." }
];

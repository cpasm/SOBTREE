// Comprueba que la cuenta del diagnóstico (src/data/site.ts) coincide con public/assets/roi.js.
// 8 personas y dos áreas, y 60 personas y dos áreas. Sin red.
import fs from "node:fs";
import vm from "node:vm";
import { precioCerrado, DIAGNOSTICO, cfgPrecio } from "../src/data/site.ts";

const src = fs.readFileSync(new URL("../public/assets/roi.js", import.meta.url), "utf8");
const cuerpo = src.match(/function desdeCfg\(personas, n\) \{([\s\S]*?)\n  \}/);
if (!cuerpo) {
  console.error("No encuentro desdeCfg en roi.js");
  process.exit(1);
}
const desdeCfg = vm.runInNewContext(
  `function desdeCfg(personas, n) {${cuerpo[1]}\n  }\ndesdeCfg`,
  { cfg: cfgPrecio() }
);

let ko = 0;
const t = (name, cond) => {
  console.log(`  ${cond ? "✔" : "✘"} ${name}`);
  if (!cond) ko++;
};

const igual = (a, b) => a.diagnostico === b.diagnostico && a.descuento === b.descuento && a.puestaMin === b.puestaMin && a.puestaMax === b.puestaMax && a.netoMin === b.netoMin && a.netoMax === b.netoMax;

const ocho = precioCerrado(8, 2);
const sesenta = precioCerrado(60, 2);
t("roi.js y site.ts coinciden (8 personas, 2 áreas)", igual(ocho, desdeCfg(8, 2)));
t("roi.js y site.ts coinciden (60 personas, 2 áreas)", igual(sesenta, desdeCfg(60, 2)));
t("8 personas: diagnóstico 490 sin recargo, puesta 1.200–2.280", ocho.diagnostico === 490 && ocho.puestaMin === 1200 && ocho.puestaMax === 2280);
t("8 personas con descuento: neto = puesta en marcha", DIAGNOSTICO.descuentoCondicionado && ocho.descuento === 490 && ocho.netoMin === 1200 && ocho.netoMax === 2280);
t("60 personas: el 25 % no entra en el diagnóstico", sesenta.diagnostico === 490 && sesenta.puestaMin === 1650 && sesenta.puestaMax === 3000 && sesenta.netoMin === 1650 && sesenta.netoMax === 3000);

const sin = precioCerrado(8, 2, { ...DIAGNOSTICO, descuentoCondicionado: false });
t("sin condición: total = diagnóstico + puesta, descuento 0", sin.descuento === 0 && sin.netoMin === 1690 && sin.netoMax === 2770);
const sin60 = precioCerrado(60, 2, { ...DIAGNOSTICO, descuentoCondicionado: false });
t("60 personas sin condición: 490 + puesta con recargo", sin60.netoMin === 2140 && sin60.netoMax === 3490);

console.log(ko ? `\n${ko} fallos` : "\nCalculadora OK");
console.log("8 personas, 2 áreas:", ocho);
console.log("60 personas, 2 áreas:", sesenta);
process.exit(ko ? 1 : 0);

// La validación de NIF/CIF/NIE del navegador debe dar lo mismo que contrata_validar_identificacion() de PHP.
// Compara caso a caso con php. Sin red.
import { execFileSync } from "node:child_process";
import { validarIdentificacion, MSG_NIF_INVALIDO, MSG_NIF_FUERA_DE_ESPANA } from "../../src/data/contrata-logica.mjs";

let ko = 0;
const t = (nombre, ok) => {
  if (!ok) ko += 1;
  console.log(`  ${ok ? "✔" : "✘"} ${nombre}`);
};

// NIF 12345678Z, NIE X1234567L, CIF A58818501 (control numérico), CIF Q2826000H (control letra), CIF B12345674.
const casos = [
  // válidos
  "12345678Z", "12345678z", " 12 345 678-Z ", "00000000T", "X1234567L", "x-1234567-l", "Y1234567X", "Z1234567R",
  "A58818501", "Q2826000H", "P0800000J", "B12345674", "ES12345678Z", "ESA58818501", "es b12345674", "G28000000", "S2800000A",
  // inválidos: letra de control, formato, vacíos
  "12345678A", "12345678", "1234567Z", "123456789Z", "X1234567A", "A58818502", "Q2826000A", "B1234567J", "B12345670",
  "", "   ", "ES", "ES12345678A", "ESES12345678Z", "NIF", "12345678Z ", " 12345678Z", "ñ2345678Z", "12345678Ｚ",
  "I12345678", "T12345678", "ßA58818501",
  // IVA UE de otros países (fuera_de_espana)
  "DE123456789", "FR12345678901", "FRAB123456789", "PT123456789", "IT12345678901", "NL123456789B01", "EL123456789",
  "XI123456789", "XIGD123", "ATU12345678", "IE1234567FA",
  // IVA UE mal formados, países no UE
  "DE12345678", "NL123456789X01", "GB123456789", "US123456789", "XX123456789", "FR1", "DE1234567890"
];

const phpOut = JSON.parse(execFileSync("php", ["-r", `
require "public/lib/contrata.php";
$casos = json_decode(stream_get_contents(STDIN), true);
$out = [];
foreach ($casos as $c) {
  $r = contrata_validar_identificacion($c);
  $out[] = $r === null ? "formato" : (($r['pais'] ?? '') === 'ES' ? "ok" : "fuera_de_espana");
}
echo json_encode($out);
`], { encoding: "utf8", input: JSON.stringify(casos) }));

let difs = 0;
casos.forEach((c, i) => {
  const r = validarIdentificacion(c);
  const js = r.ok ? "ok" : r.motivo;
  if (js !== phpOut[i]) {
    difs += 1;
    console.log(`    DIFERENCIA ${JSON.stringify(c)}: js=${js} php=${phpOut[i]}`);
  }
});
t(`${casos.length} casos: JS = PHP uno a uno`, difs === 0);
t("hay válidos, formato y fuera_de_espana", ["ok", "formato", "fuera_de_espana"].every((k) => phpOut.includes(k)));
t("NIF, NIE y CIF válidos no se bloquean", ["12345678Z", "X1234567L", "A58818501", "Q2826000H", "ES12345678Z"].every((c) => validarIdentificacion(c).ok === true));
t("NIF con letra mala da el aviso", validarIdentificacion("12345678A").mensaje === MSG_NIF_INVALIDO);
t("NIF-IVA de otro país da el aviso del servidor", validarIdentificacion("DE123456789").mensaje === MSG_NIF_FUERA_DE_ESPANA);
t("mensajes iguales a los de PHP", (() => {
  const src = execFileSync("grep", ["-cF", MSG_NIF_FUERA_DE_ESPANA, "public/lib/contrata.php"], { encoding: "utf8" });
  return Number(src) >= 1;
})());
t("valores raros no rompen", [null, undefined, 5, {}].every((v) => validarIdentificacion(v).ok === false));
if (ko > 0) process.exit(1);
console.log("ok");

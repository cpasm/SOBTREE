// Compara el cálculo de semanas de JS con el de PHP. Sin red.
import { execFileSync } from "node:child_process";
import { calcularSemanas, notaPermitida, primerLunes } from "../../src/data/contrata-logica.mjs";

let ko = 0;
const t = (nombre, ok) => {
  if (!ok) ko += 1;
  console.log(`  ${ok ? "✔" : "✘"} ${nombre}`);
};

t("primer lunes", primerLunes("2026-10-27") === "2026-11-02");
const js = calcularSemanas({
  hoy: "2026-10-27",
  max: 1,
  plazo: 3,
  visibles: 4,
  proyectos: [{ inicio: "2026-11-02", fin: "2026-11-07", sesion: "cs_test_abc" }],
  bloqueos: [{ inicio: "2026-11-16", fin: "2026-11-21" }]
});
const php = JSON.parse(execFileSync("php", ["-r", `
require "public/lib/contrata.php";
echo json_encode(contrata_calcular_semanas("2026-10-27", [
  ["inicio" => "2026-11-02", "fin" => "2026-11-07", "sesion" => "cs_test_abc"],
], [
  ["inicio" => "2026-11-16", "fin" => "2026-11-21"],
]), JSON_UNESCAPED_UNICODE);
`], { encoding: "utf8" }));
t("mismas semanas que PHP", JSON.stringify(js.semanas) === JSON.stringify(php));
t("proyecto ocupa la primera", js.semanas[0].plazas === 0 && js.semanas[0].proyectos === 1 && js.semanas[0].sesiones[0] === "cs_test_abc");
t("bloqueo a cero", js.semanas[2].bloqueada === true && js.semanas[2].plazas === 0);
t("texto inventado rechazado", notaPermitida("Quedan 1 plazas para la semana del 9 de noviembre") === null);
t("texto con HTML rechazado", notaPermitida("Queda 1 plaza para la semana del 9 de noviembre<script>") === null);
t("texto calculado aceptado", notaPermitida("Queda 1 plaza para la semana del 9 de noviembre") !== null);
if (ko > 0) process.exit(1);
console.log("ok");

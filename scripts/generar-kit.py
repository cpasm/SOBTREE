#!/usr/bin/env python3
"""Genera el ZIP del Kit IA para asesorías y gestorías a partir de los textos de kits/kit-asesorias/fuente/.

Solo usa la biblioteca estándar de Python (sin python-docx, openpyxl ni reportlab): escribe a mano DOCX, XLSX y PDF
mínimos y válidos. La salida es reproducible: fechas fijas, orden fijo y sin marcas de tiempo, así que los mismos
textos dan el mismo contenido.

Para cambiar el contenido del kit no hace falta tocar código: editad los .md/.csv de la carpeta fuente y volved a
ejecutar este script. La web sirve el ZIP desde public/lib/kits/ (denegado por .htaccess) mediante
public/api/contrata/descargar.php, solo a compras pagadas.

Uso:
  python3 scripts/generar-kit.py              # escribe public/lib/kits/kit-asesorias.zip
  python3 scripts/generar-kit.py --comprobar  # regenera en memoria y comprueba que coincide con el ZIP guardado

Formato de la fuente (Markdown reducido): «# », «## », «### » títulos; «- » viñetas; «1. » listas; «> » bloque
citado (prompts y plantillas); **negrita** y *cursiva* en línea; líneas en blanco separan párrafos.
"""
from __future__ import annotations

import csv
import io
import re
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

RAIZ = Path(__file__).resolve().parent.parent
FUENTE = RAIZ / "kits" / "kit-asesorias" / "fuente"
SALIDA = RAIZ / "public" / "lib" / "kits" / "kit-asesorias.zip"
CARPETA = "Kit-IA-asesorias-Sobtree"
VERSION = "1.0"
FECHA_ZIP = (2026, 10, 31, 0, 0, 0)
FECHA_ISO = "2026-10-31T00:00:00Z"


# ------------------------------------------------------------------------------------------------ Markdown reducido
def bloques(md: str) -> list[tuple[str, str]]:
    """Devuelve (tipo, texto): h1, h2, h3, li, ol, quote, p. Une las líneas de un mismo párrafo."""
    out: list[tuple[str, str]] = []
    for linea in md.splitlines():
        s = linea.rstrip()
        if not s.strip():
            out.append(("blank", ""))
            continue
        if s.startswith("### "):
            out.append(("h3", s[4:]))
        elif s.startswith("## "):
            out.append(("h2", s[3:]))
        elif s.startswith("# "):
            out.append(("h1", s[2:]))
        elif s.startswith("- "):
            out.append(("li", s[2:]))
        elif re.match(r"^\d+\. ", s):
            out.append(("ol", s))
        elif s.startswith(">"):
            out.append(("quote", s[1:].lstrip()))
        elif s.startswith("|"):
            out.append(("p", s))
        else:
            out.append(("p", s))
    # Quita los blancos (solo separan) y los bloques citados vacíos.
    return [(t, x) for t, x in out if t != "blank" and not (t == "quote" and not x)]


def trozos(texto: str) -> list[tuple[str, bool, bool]]:
    """Separa **negrita** y *cursiva*: lista de (texto, negrita, cursiva)."""
    res: list[tuple[str, bool, bool]] = []
    for parte in re.split(r"(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)", texto):
        if not parte:
            continue
        if parte.startswith("**") and parte.endswith("**"):
            res.append((parte[2:-2], True, False))
        elif parte.startswith("*") and parte.endswith("*") and len(parte) > 2:
            res.append((parte[1:-1], False, True))
        else:
            res.append((parte, False, False))
    return res


# ------------------------------------------------------------------------------------------------ ZIP reproducible
def zip_bytes(entradas: list[tuple[str, bytes]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for nombre, datos in entradas:
            info = zipfile.ZipInfo(nombre, date_time=FECHA_ZIP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            info.create_system = 3
            z.writestr(info, datos)
    return buf.getvalue()


# ------------------------------------------------------------------------------------------------ DOCX
def docx(md: str, titulo: str) -> bytes:
    W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

    def run(texto: str, b: bool = False, i: bool = False, size: int | None = None, color: str | None = None) -> str:
        rpr = ""
        if b:
            rpr += "<w:b/>"
        if i:
            rpr += "<w:i/>"
        if color:
            rpr += f'<w:color w:val="{color}"/>'
        if size:
            rpr += f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>'
        rpr = f"<w:rPr>{rpr}</w:rPr>" if rpr else ""
        return f'<w:r>{rpr}<w:t xml:space="preserve">{escape(texto)}</w:t></w:r>'

    def par(contenido: str, estilo: str | None = None, ind: int = 0, antes: int = 0, despues: int = 120, borde: bool = False) -> str:
        ppr = ""
        if estilo:
            ppr += f'<w:pStyle w:val="{estilo}"/>'
        if borde:
            ppr += '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="1A3F8C"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="EEF2FA"/>'
        ppr += f'<w:spacing w:before="{antes}" w:after="{despues}"/>'
        if ind:
            ppr += f'<w:ind w:left="{ind}"/>'
        return f"<w:p><w:pPr>{ppr}</w:pPr>{contenido}</w:p>"

    def inline(texto: str, size: int | None = None) -> str:
        return "".join(run(t, b, i, size) for t, b, i in trozos(texto))

    cuerpo = []
    for tipo, texto in bloques(md):
        if tipo == "h1":
            cuerpo.append(par(run(texto, True, size=36, color="050F2C"), "Title", despues=240))
        elif tipo == "h2":
            cuerpo.append(par(run(texto, True, size=30, color="1A3F8C"), "Heading1", antes=240))
        elif tipo == "h3":
            cuerpo.append(par(run(texto, True, size=26, color="1A3F8C"), "Heading2", antes=200))
        elif tipo == "li":
            cuerpo.append(par(run("• ") + inline(texto), ind=360, despues=60))
        elif tipo == "ol":
            cuerpo.append(par(inline(texto), ind=360, despues=60))
        elif tipo == "quote":
            cuerpo.append(par(inline(texto), ind=284, despues=60, borde=True))
        else:
            cuerpo.append(par(inline(texto)))
    pie = par(run(f"Sobtree · Kit IA para asesorías y gestorías · versión {VERSION} · info@sobtree.com", i=True, size=18, color="5A6B8C"), antes=360)
    documento = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="{W}"><w:body>'
        + "".join(cuerpo) + pie
        + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
        "</w:body></w:document>"
    )
    estilos = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="{W}">'
        '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault></w:docDefaults>'
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
        '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/></w:style>'
        '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr></w:style>'
        '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr></w:style>'
        "</w:styles>"
    )
    tipos = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        "</Relationships>"
    )
    doc_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        "</Relationships>"
    )
    return zip_bytes([
        ("[Content_Types].xml", tipos.encode()),
        ("_rels/.rels", rels.encode()),
        ("docProps/core.xml", core(titulo).encode()),
        ("word/document.xml", documento.encode()),
        ("word/_rels/document.xml.rels", doc_rels.encode()),
        ("word/styles.xml", estilos.encode()),
    ])


def core(titulo: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        f"<dc:title>{escape(titulo)}</dc:title><dc:creator>Sobtree</dc:creator><dc:language>es-ES</dc:language>"
        f'<dcterms:created xsi:type="dcterms:W3CDTF">{FECHA_ISO}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">{FECHA_ISO}</dcterms:modified>'
        "</cp:coreProperties>"
    )


# ------------------------------------------------------------------------------------------------ XLSX
FILAS_DATOS = 30   # filas 2 a 31 para tareas; la 32 queda vacía y la 33 lleva los totales
COLUMNAS = [
    ("Tarea", 34), ("Bloque", 16), ("Quién la hace (rol)", 18), ("Veces al mes", 12), ("Minutos por vez (hoy)", 14),
    ("Horas/mes (hoy)", 12), ("Coste estimado/mes (hoy) €", 16), ("¿Usa datos personales de clientes?", 16),
    ("Prompt del kit que vais a probar", 16), ("Minutos por vez con IA (medido)", 16), ("Horas/mes con IA", 12),
    ("Coste estimado/mes con IA €", 16), ("Diferencia horas/mes (medida)", 16), ("Notas", 34),
]


def col(n: int) -> str:
    return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[n]


def xlsx(instrucciones_md: str, ejemplos: list[dict[str, str]]) -> bytes:
    # Estilos: 0 normal (bloqueado), 1 cabecera, 2 entrada (desbloqueada), 3 calculada (gris, 2 decimales),
    # 4 total (negrita, gris), 5 texto de instrucciones con ajuste, 6 título
    estilos = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>'
        '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>'
        '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FF1A3F8C"/><bgColor indexed="64"/></patternFill></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FFE7E9EE"/><bgColor indexed="64"/></patternFill></fill></fills>'
        '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
        '<border><left style="thin"><color rgb="FFC8CDD8"/></left><right style="thin"><color rgb="FFC8CDD8"/></right><top style="thin"><color rgb="FFC8CDD8"/></top><bottom style="thin"><color rgb="FFC8CDD8"/></bottom><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="7">'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>'
        '<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>'
        '<xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>'
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
        "</cellXfs></styleSheet>"
    )
    NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

    def celda_txt(ref: str, texto: str, s: int = 0) -> str:
        return f'<c r="{ref}" t="inlineStr" s="{s}"><is><t xml:space="preserve">{escape(texto)}</t></is></c>'

    def celda_num(ref: str, valor: str, s: int = 0) -> str:
        return f'<c r="{ref}" s="{s}"><v>{valor}</v></c>'

    def celda_f(ref: str, formula: str, s: int = 3) -> str:
        return f'<c r="{ref}" s="{s}"><f>{escape(formula)}</f></c>'

    # Hoja 1: Cómo usarla
    filas = [f'<row r="1">{celda_txt("A1", "Cómo usar la hoja de medición", 6)}</row>']
    r = 3
    for tipo, texto in bloques(instrucciones_md):
        if tipo == "h1":
            continue
        limpio = "".join(t for t, _, _ in trozos(texto))
        filas.append(f'<row r="{r}">{celda_txt(f"A{r}", limpio, 5)}</row>')
        r += 1
    r += 1
    filas.append(f'<row r="{r}">{celda_txt(f"A{r}", "Sobtree · Kit IA para asesorías y gestorías · versión " + VERSION + " · info@sobtree.com", 0)}</row>')
    hoja1 = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet {NS}><cols><col min="1" max="1" width="110" customWidth="1"/></cols><sheetData>{"".join(filas)}</sheetData></worksheet>'

    # Hoja 2: Parámetros (B1 coste/hora: entrada)
    hoja2 = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet {NS}><cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/><col min="3" max="3" width="60" customWidth="1"/></cols><sheetData>'
        f'<row r="1">{celda_txt("A1", "Coste/hora (€)", 0)}<c r="B1" s="2"/>{celda_txt("C1", "Poned aquí vuestro coste por hora (celda blanca).", 0)}</row>'
        f'<row r="2">{celda_txt("A2", "Moneda", 0)}{celda_txt("B2", "€", 0)}</row>'
        "</sheetData></worksheet>"
    )

    # Hoja 3: Medición
    cab = "".join(celda_txt(f"{col(i)}1", n, 1) for i, (n, _) in enumerate(COLUMNAS))
    filas = [f'<row r="1" ht="45" customHeight="1">{cab}</row>']
    entradas = {0: "tarea", 1: "bloque", 2: "rol", 3: "veces_mes", 4: "minutos_vez", 7: "datos_personales", 8: "prompt", 9: "minutos_ia", 13: "notas"}
    numericas = {3, 4, 9}
    ultima = 1 + FILAS_DATOS
    for i in range(2, ultima + 1):
        ej = ejemplos[i - 2] if i - 2 < len(ejemplos) else {}
        cs = []
        for c in range(len(COLUMNAS)):
            ref = f"{col(c)}{i}"
            if c in entradas:
                v = (ej.get(entradas[c]) or "").strip()
                if v and c in numericas and re.fullmatch(r"\d+(\.\d+)?", v):
                    cs.append(celda_num(ref, v, 2))
                elif v:
                    cs.append(celda_txt(ref, v, 2))
                else:
                    cs.append(f'<c r="{ref}" s="2"/>')
            elif c == 5:
                cs.append(celda_f(ref, f'IF(OR(D{i}="",E{i}=""),"",D{i}*E{i}/60)'))
            elif c == 6:
                cs.append(celda_f(ref, f'IF(OR(F{i}="",Parametros!$B$1=""),"",F{i}*Parametros!$B$1)'))
            elif c == 10:
                cs.append(celda_f(ref, f'IF(OR(J{i}="",D{i}=""),"",D{i}*J{i}/60)'))
            elif c == 11:
                cs.append(celda_f(ref, f'IF(OR(K{i}="",Parametros!$B$1=""),"",K{i}*Parametros!$B$1)'))
            elif c == 12:
                cs.append(celda_f(ref, f'IF(OR(K{i}="",F{i}=""),"",F{i}-K{i})'))
        filas.append(f'<row r="{i}">{"".join(cs)}</row>')
    t = ultima + 2
    tot = [celda_txt(f"A{t}", "TOTAL", 4)] + [celda_f(f"{c}{t}", f"SUM({c}2:{c}{ultima})", 4) for c in "FGKLM"]
    # Las celdas deben ir en orden de columna dentro de la fila.
    tot.sort(key=lambda x: "ABCDEFGHIJKLMN".index(re.search(r'r="([A-Z])', x).group(1)))
    filas.append(f'<row r="{t}">{"".join(tot)}</row>')
    cols = "".join(f'<col min="{i + 1}" max="{i + 1}" width="{w}" customWidth="1"/>' for i, (_, w) in enumerate(COLUMNAS))
    validaciones = (
        '<dataValidations count="2">'
        f'<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="B2:B{ultima}"><formula1>"Documentación,Plazos,Dudas,Otro"</formula1></dataValidation>'
        f'<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="H2:H{ultima}"><formula1>"Sí,No"</formula1></dataValidation>'
        "</dataValidations>"
    )
    hoja3 = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet {NS}>'
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        f"<cols>{cols}</cols><sheetData>{''.join(filas)}</sheetData>"
        # Protección sin contraseña: solo evita borrar fórmulas por error (Revisar → Desproteger hoja).
        '<sheetProtection sheet="1" objects="1" scenarios="1" formatColumns="0" formatRows="0" insertRows="0" deleteRows="0" sort="0" autoFilter="0"/>'
        f"{validaciones}</worksheet>"
    )
    libro = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook {NS}><sheets>'
        '<sheet name="Cómo usarla" sheetId="1" r:id="rId1"/><sheet name="Parametros" sheetId="2" r:id="rId2"/><sheet name="Medición" sheetId="3" r:id="rId3"/>'
        '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'
    )
    libro_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in (1, 2, 3))
        + '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        "</Relationships>"
    )
    tipos = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in (1, 2, 3))
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        "</Relationships>"
    )
    return zip_bytes([
        ("[Content_Types].xml", tipos.encode()),
        ("_rels/.rels", rels.encode()),
        ("docProps/core.xml", core("Hoja de medición · Kit IA para asesorías y gestorías").encode()),
        ("xl/workbook.xml", libro.encode()),
        ("xl/_rels/workbook.xml.rels", libro_rels.encode()),
        ("xl/styles.xml", estilos.encode()),
        ("xl/worksheets/sheet1.xml", hoja1.encode()),
        ("xl/worksheets/sheet2.xml", hoja2.encode()),
        ("xl/worksheets/sheet3.xml", hoja3.encode()),
    ])


# ------------------------------------------------------------------------------------------------ PDF
# Anchos de Helvetica (milésimas de em) para medir líneas. Letras acentuadas: como su letra base.
_ANCHOS = {
    " ": 278, "!": 278, '"': 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333, "*": 389, "+": 584,
    ",": 278, "-": 333, ".": 278, "/": 278, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
    "[": 278, "\\": 278, "]": 278, "_": 556, "«": 556, "»": 556, "–": 556, "—": 1000, "•": 350, "€": 556, "¿": 611, "¡": 333,
    "A": 667, "B": 667, "C": 722, "D": 722, "E": 667, "F": 611, "G": 778, "H": 722, "I": 278, "J": 500, "K": 667, "L": 556,
    "M": 833, "N": 722, "O": 778, "P": 667, "Q": 778, "R": 722, "S": 667, "T": 611, "U": 722, "V": 667, "W": 944, "X": 667,
    "Y": 667, "Z": 611, "a": 556, "b": 556, "c": 500, "d": 556, "e": 556, "f": 278, "g": 556, "h": 556, "i": 222, "j": 222,
    "k": 500, "l": 222, "m": 833, "n": 556, "o": 556, "p": 556, "q": 556, "r": 333, "s": 500, "t": 278, "u": 556, "v": 500,
    "w": 722, "x": 500, "y": 500, "z": 500,
}
_BASE = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")


def ancho(texto: str, size: float, negrita: bool) -> float:
    w = sum(_ANCHOS.get(ch.translate(_BASE), 556 if ch.isdigit() else 600) for ch in texto)
    return w * size / 1000 * (1.08 if negrita else 1.0)


def pdf_txt(texto: str) -> str:
    """Texto en WinAnsi (cp1252) escapado para una cadena PDF."""
    b = texto.encode("cp1252", errors="replace")
    out = []
    for x in b:
        c = chr(x)
        if c in "()\\":
            out.append("\\" + c)
        elif x < 32 or x > 126:
            out.append("\\%03o" % x)
        else:
            out.append(c)
    return "".join(out)


def pdf(md: str, titulo: str) -> bytes:
    ANCHO, ALTO, MARGEN = 595.28, 841.89, 56.7
    util = ANCHO - 2 * MARGEN
    paginas: list[list[str]] = [[]]
    y = ALTO - MARGEN

    def nueva():
        nonlocal y
        paginas.append([])
        y = ALTO - MARGEN

    def lineas(texto: str, size: float, negrita: bool, sangria: float) -> list[str]:
        palabras, res, actual = texto.split(" "), [], ""
        for p in palabras:
            prueba = (actual + " " + p).strip()
            if ancho(prueba, size, negrita) <= util - sangria or not actual:
                actual = prueba
            else:
                res.append(actual)
                actual = p
        if actual:
            res.append(actual)
        return res

    def escribir(texto: str, size: float, negrita: bool = False, sangria: float = 0, antes: float = 0, despues: float = 4, cursiva: bool = False, color: str = "0 0 0", vineta: str = ""):
        nonlocal y
        fuente = "F2" if negrita else ("F3" if cursiva else "F1")
        alto = size * 1.35
        ls = lineas(texto, size, negrita, sangria)
        y -= antes
        if y - alto * min(len(ls), 2) < MARGEN:
            nueva()
        for n, l in enumerate(ls):
            if y - alto < MARGEN:
                nueva()
            y -= alto
            if vineta and n == 0:
                paginas[-1].append(f"BT /F1 {size} Tf {color} rg {MARGEN + sangria - 10:.2f} {y:.2f} Td ({pdf_txt(vineta)}) Tj ET")
            paginas[-1].append(f"BT /{fuente} {size} Tf {color} rg {MARGEN + sangria:.2f} {y:.2f} Td ({pdf_txt(l)}) Tj ET")
        y -= despues

    for tipo, texto in bloques(md):
        limpio = "".join(t for t, _, _ in trozos(texto))
        todo_negrita = all(b for t, b, _ in trozos(texto) if t.strip())
        todo_cursiva = all(i for t, _, i in trozos(texto) if t.strip())
        if tipo == "h1":
            escribir(limpio, 18, True, despues=8, color="0.02 0.06 0.17")
        elif tipo == "h2":
            escribir(limpio, 14, True, antes=8, despues=4, color="0.10 0.25 0.55")
        elif tipo == "h3":
            escribir(limpio, 12, True, antes=8, despues=3, color="0.10 0.25 0.55")
        elif tipo == "li":
            escribir(limpio, 10.5, todo_negrita, sangria=16, despues=2, vineta="•")
        elif tipo == "ol":
            escribir(limpio, 10.5, todo_negrita, sangria=16, despues=2)
        elif tipo == "quote":
            escribir(limpio, 10.5, False, sangria=16, despues=3, cursiva=True, color="0.10 0.25 0.55")
        else:
            escribir(limpio, 10.5, todo_negrita, despues=5, cursiva=todo_cursiva and not todo_negrita)
    total = len(paginas)
    for n, p in enumerate(paginas, 1):
        p.append(f"BT /F3 8 Tf 0.35 0.42 0.55 rg {MARGEN:.2f} 30 Td ({pdf_txt(f'Sobtree · Kit IA para asesorías y gestorías · versión {VERSION} · info@sobtree.com · página {n} de {total}')}) Tj ET")

    objetos: list[bytes] = []
    def obj(contenido: bytes) -> int:
        objetos.append(contenido)
        return len(objetos)
    fuentes = []
    for nombre in ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique"):
        fuentes.append(obj(f"<< /Type /Font /Subtype /Type1 /BaseFont /{nombre} /Encoding /WinAnsiEncoding >>".encode()))
    recursos = f"<< /Font << /F1 {fuentes[0]} 0 R /F2 {fuentes[1]} 0 R /F3 {fuentes[2]} 0 R >> >>"
    id_paginas = len(objetos) + 2 * total + 1  # tras el contenido y la página de cada una va el árbol
    kids = []
    for p in paginas:
        flujo = "\n".join(p).encode("latin-1")
        c = obj(b"<< /Length %d >>\nstream\n" % len(flujo) + flujo + b"\nendstream")
        kids.append(obj(f"<< /Type /Page /Parent {id_paginas} 0 R /MediaBox [0 0 {ANCHO} {ALTO}] /Resources {recursos} /Contents {c} 0 R >>".encode()))
    arbol = obj(f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {total} >>".encode())
    assert arbol == id_paginas
    info = obj(f"<< /Title ({pdf_txt(titulo)}) /Author (Sobtree) /Producer (scripts/generar-kit.py) >>".encode())
    catalogo = obj(f"<< /Type /Catalog /Pages {arbol} 0 R /Lang (es-ES) >>".encode())
    salida = io.BytesIO()
    salida.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    desplaz = []
    for i, o in enumerate(objetos, 1):
        desplaz.append(salida.tell())
        salida.write(b"%d 0 obj\n" % i + o + b"\nendobj\n")
    xref = salida.tell()
    salida.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objetos) + 1))
    for d in desplaz:
        salida.write(b"%010d 00000 n \n" % d)
    salida.write(f"trailer\n<< /Size {len(objetos) + 1} /Root {catalogo} 0 R /Info {info} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return salida.getvalue()


# ------------------------------------------------------------------------------------------------ Kit
def leer(nombre: str) -> str:
    return (FUENTE / nombre).read_text(encoding="utf-8")


def ejemplos() -> list[dict[str, str]]:
    with (FUENTE / "03-hoja-ejemplos.csv").open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def kit() -> bytes:
    archivos = [
        ("00-LEEME.pdf", pdf(leer("00-leeme.md"), "Léeme · Kit IA para asesorías y gestorías")),
        ("01-Prompts.docx", docx(leer("01-prompts.md"), "Prompts · Kit IA para asesorías y gestorías")),
        ("02-Plantillas-email-y-WhatsApp.docx", docx(leer("02-plantillas.md"), "Plantillas · Kit IA para asesorías y gestorías")),
        ("03-Hoja-de-medicion.xlsx", xlsx(leer("03-hoja-instrucciones.md"), ejemplos())),
        ("04-Guia-que-datos-no-pegar-en-una-IA.pdf", pdf(leer("04-guia-datos.md"), "Qué datos no pegar en una IA · Sobtree")),
        # Versiones de texto plano del Léeme y la guía, por si el PDF no se abre.
        ("texto/00-LEEME.md", leer("00-leeme.md").encode()),
        ("texto/04-Guia-que-datos-no-pegar-en-una-IA.md", leer("04-guia-datos.md").encode()),
    ]
    return zip_bytes([(f"{CARPETA}/{n}", d) for n, d in archivos])


def contenido(z: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(z)) as f:
        return {n: f.read(n) for n in f.namelist()}


def main() -> int:
    nuevo = kit()
    if "--comprobar" in sys.argv:
        if not SALIDA.is_file():
            print(f"falta {SALIDA.relative_to(RAIZ)}", file=sys.stderr)
            return 1
        a, b = contenido(SALIDA.read_bytes()), contenido(nuevo)
        if a.keys() != b.keys():
            print("el ZIP guardado no tiene los mismos archivos; ejecutad scripts/generar-kit.py", file=sys.stderr)
            return 1
        distintos = [n for n in a if contenido_igual(a[n], b[n], n) is False]
        if distintos:
            print("el ZIP guardado no corresponde a la fuente: " + ", ".join(distintos), file=sys.stderr)
            return 1
        print("ok: el ZIP corresponde a la fuente")
        return 0
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_bytes(nuevo)
    print(f"escrito {SALIDA.relative_to(RAIZ)} ({len(nuevo)} bytes)")
    for n, d in contenido(nuevo).items():
        print(f"  {n} ({len(d)} bytes)")
    return 0


def contenido_igual(a: bytes, b: bytes, nombre: str) -> bool:
    # DOCX y XLSX son a su vez ZIP: se comparan por su contenido, no por los bytes comprimidos.
    if nombre.endswith((".docx", ".xlsx")):
        return contenido(a) == contenido(b)
    return a == b


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Compara dist (flag apagado) con dist-on (flag encendido). Solo pueden cambiar: la portada (botón y bloque Contrata),
los sitemaps, llms*.txt, /contratar/ y /condiciones/ (solo con el flag) y la privacidad (Stripe). El resto, byte a byte
salvo el parámetro ?v= de caché y el CTA de cabecera/móvil (depende del flag).
Salida: nada si todo coincide; una línea por diferencia."""
import os, re, sys
a, b = sys.argv[1], sys.argv[2]

def norm(t: bytes) -> bytes:
    t = re.sub(rb"\?v=[a-z0-9]+", b"?v=X", t)
    # Cabecera y menú móvil: el texto y el href del CTA principal dependen del flag.
    t = re.sub(
        rb'<a class="btn btn-primary btn-sm header-cta" href="[^"]*">[^<]*</a>',
        b'<a class="HEADER_CTA"></a>',
        t,
    )
    t = re.sub(
        rb'<a class="btn btn-primary" href="(?:/contratar/|/#contacto)">(?:Contrata y empieza a ahorrar|Reservar 25 min)</a>',
        b'<a class="MOBILE_CTA"></a>',
        t,
    )
    # «Prefiero hablar antes» solo existe con el flag; al quitarlo unificamos el espacio sobrante.
    t = re.sub(rb'\s*<a class="mobile-hablar"[^>]*>[^<]*</a>', b'', t)
    t = re.sub(rb'(class="MOBILE_CTA"></a>)\s+', rb'\1', t)
    return t

def ficheros(r):
    out = {}
    for d, _, fs in os.walk(r):
        for f in fs:
            p = os.path.join(d, f)
            out[os.path.relpath(p, r)] = p
    return out

fa, fb = ficheros(a), ficheros(b)
# privacidad: describe Stripe y enlaza las condiciones solo con el flag.
# llms: el CTA de contacto cambia con el flag.
permitidos = lambda r: r.startswith(("contratar/", "condiciones/", "kit-asesorias/", "privacidad/", "sitemap")) or r in (
    "index.html", "llms.txt", "llms-full.txt",
    # /asesorias/: tarjeta del Kit IA solo con el flag (D-119).
    "asesorias/index.html",
)
ignorar = lambda r: r.startswith(("collections/", "data-store.json", "content-", "settings.json")) or r == "content-assets.mjs"
for r in sorted(set(fa) | set(fb)):
    if ignorar(r): continue
    if r not in fa or r not in fb:
        if not permitidos(r): print("solo en uno:", r)
        continue
    if norm(open(fa[r], "rb").read()) != norm(open(fb[r], "rb").read()) and not permitidos(r):
        print("distinto:", r)

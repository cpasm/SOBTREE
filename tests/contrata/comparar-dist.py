#!/usr/bin/env python3
"""Compara dist (flag apagado) con dist-on (flag encendido). Solo pueden cambiar: la portada (botón), los sitemaps y
/contratar/ y /condiciones/ (que solo existen con el flag). El resto, byte a byte salvo el parámetro ?v= de caché.
Salida: nada si todo coincide; una línea por diferencia."""
import os, re, sys
a, b = sys.argv[1], sys.argv[2]
norm = lambda t: re.sub(rb"\?v=[a-z0-9]+", b"?v=X", t)
def ficheros(r):
    out = {}
    for d, _, fs in os.walk(r):
        for f in fs:
            p = os.path.join(d, f)
            out[os.path.relpath(p, r)] = p
    return out
fa, fb = ficheros(a), ficheros(b)
# privacidad: describe Stripe y enlaza las condiciones solo con el flag.
permitidos = lambda r: r.startswith(("contratar/", "condiciones/", "privacidad/", "sitemap")) or r == "index.html"
ignorar = lambda r: r.startswith(("collections/", "data-store.json", "content-", "settings.json")) or r == "content-assets.mjs"
for r in sorted(set(fa) | set(fb)):
    if ignorar(r): continue
    if r not in fa or r not in fb:
        if not permitidos(r): print("solo en uno:", r)
        continue
    if norm(open(fa[r], "rb").read()) != norm(open(fb[r], "rb").read()) and not permitidos(r):
        print("distinto:", r)

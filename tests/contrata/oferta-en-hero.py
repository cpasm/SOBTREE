#!/usr/bin/env python3
"""Comprueba que, con el flag, el <h3> del diagnóstico está entre #diagnostico y #servicios."""
import sys
h = open(sys.argv[1]).read()
d = h.find('id="diagnostico"')
s = h.find('id="servicios"')
o = h.find("<h3>Diagnóstico IA exprés</h3>")
if not (0 <= d < o < s):
    raise SystemExit(f"orden incorrecto: diagnostico={d} oferta={o} servicios={s}")

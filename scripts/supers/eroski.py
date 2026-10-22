"""Precios de Eroski (supermercado.eroski.es) leyendo la ficha HTML de cada producto.

- `ref` es el id numérico de Eroski; la ficha exige un slug en la URL, pero vale cualquiera ("-x").
- Los precios son nacionales: preparar(cp) no necesita elegir tienda.
- Se toma el precio actual (<span itemprop="price" class="offer-now">), que ya incluye la oferta.
- Productos "al peso, compra mínima 500 g" o "bandeja aprox. 560 g": el precio corresponde a ese
  peso, que es el `envase` (con "aprox": true) de la tabla de equivalencias.
Solo usa la biblioteca estándar de Python.
"""
import html
import random
import re
import time
import urllib.request

NOMBRE = "Eroski"
FICHA = "https://supermercado.eroski.es/es/productdetail/{ref}-x/"
CABECERAS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "es-ES,es;q=0.9",
}
PAUSA = (1.5, 2.5)  # segundos entre peticiones (cada ficha pesa ~1 MB)
RE_PRECIO = re.compile(r'itemprop="price"[^>]*>\s*([\d.]+,\d+|\d+(?:\.\d+)?)\s*<')
RE_TITULO = re.compile(r"<title>(.*?)</title>", re.S)


def preparar(cp: str) -> dict:
    # Precios iguales en toda España: basta con un contexto para llevar la cuenta de las pausas.
    return {"ultima": 0.0}


def _pedir(ctx, url):
    espera = ctx.get("ultima", 0.0) + random.uniform(*PAUSA) - time.monotonic()
    if espera > 0:
        time.sleep(espera)
    try:
        req = urllib.request.Request(url, headers=CABECERAS)
        with urllib.request.urlopen(req, timeout=40) as r:
            if r.status != 200:
                raise RuntimeError(f"Eroski respondió {r.status}")
            return r.read().decode("utf-8", "replace")
    finally:
        ctx["ultima"] = time.monotonic()


def precio(ctx: dict, prod: dict) -> dict:
    t = _pedir(ctx, FICHA.format(ref=prod["ref"]))
    if f"item-detail-main-{prod['ref']}" not in t:
        # Si el producto ya no existe, Eroski devuelve otra página (portada, búsqueda…).
        raise RuntimeError(f"Eroski: la ficha de {prod['ref']} no corresponde al producto")
    m = RE_PRECIO.search(t)
    if not m:
        raise RuntimeError(f"Eroski: sin precio en la ficha de {prod['ref']} (¿producto retirado o bloqueo?)")
    texto = m.group(1)
    valor = float(texto.replace(".", "").replace(",", ".")) if "," in texto else float(texto)
    titulo = RE_TITULO.search(t)
    nombre = html.unescape(titulo.group(1)).strip() if titulo else prod.get("nombre", "")
    return {"precio": round(valor, 2), "envase": prod["envase"], "nombre": nombre}

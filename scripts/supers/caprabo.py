"""Precios de Caprabo (capraboacasa.com) leyendo la ficha HTML de cada producto. Solo biblioteca estándar.

- Caprabo es del grupo Eroski y su tienda online es la misma plataforma que supermercado.eroski.es:
  mismos códigos de producto (los de Eroski valen aquí), misma ficha y misma marca propia (EROSKI).
  Los precios sí son los de Caprabo (pueden diferir de los de Eroski).
- `ref` es el id numérico del producto; la ficha exige un slug en la URL, pero vale cualquiera ("-x").
- La web no pide código postal para ver precios: preparar(cp) no necesita elegir tienda.
- Se toma el precio actual (<span itemprop="price">), que ya incluye la oferta.
- Productos "bandeja al peso aprox. 750 g": el precio es el de ese peso, que es el `envase`
  (con "aprox": true) de la tabla de equivalencias.
- Buscador (para ampliar la tabla): /es/search/results/?q=<texto>.
"""
import html
import random
import re
import time
import urllib.request

NOMBRE = "Caprabo"
FICHA = "https://www.capraboacasa.com/es/productdetail/{ref}-x/"
CABECERAS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "es-ES,es;q=0.9",
}
PAUSA = (1.5, 2.5)  # segundos entre peticiones (cada ficha pesa ~650 KB)
RE_PRECIO = re.compile(r'itemprop="price"[^>]*>\s*([\d.]+,\d+|\d+(?:\.\d+)?)\s*<')
RE_TITULO = re.compile(r"<title>(.*?)</title>", re.S)


def preparar(cp: str) -> dict:
    return {"ultima": 0.0}


def _pedir(ctx, url):
    espera = ctx.get("ultima", 0.0) + random.uniform(*PAUSA) - time.monotonic()
    if espera > 0:
        time.sleep(espera)
    try:
        req = urllib.request.Request(url, headers=CABECERAS)
        with urllib.request.urlopen(req, timeout=40) as r:
            if r.status != 200:
                raise RuntimeError(f"Caprabo respondió {r.status}")
            return r.read().decode("utf-8", "replace")
    finally:
        ctx["ultima"] = time.monotonic()


def precio(ctx: dict, prod: dict) -> dict:
    t = _pedir(ctx, FICHA.format(ref=prod["ref"]))
    if f"item-detail-main-{prod['ref']}" not in t:
        # Si el producto ya no existe, la web devuelve otra página (portada, búsqueda…).
        raise RuntimeError(f"Caprabo: la ficha de {prod['ref']} no corresponde al producto")
    m = RE_PRECIO.search(t)
    if not m:
        raise RuntimeError(f"Caprabo: sin precio en la ficha de {prod['ref']} (¿producto retirado o bloqueo?)")
    texto = m.group(1)
    valor = float(texto.replace(".", "").replace(",", ".")) if "," in texto else float(texto)
    titulo = RE_TITULO.search(t)
    nombre = html.unescape(titulo.group(1)).strip() if titulo else prod.get("nombre", "")
    return {"precio": round(valor, 2), "envase": prod["envase"], "nombre": nombre}

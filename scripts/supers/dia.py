"""Precios de DIA (www.dia.es) para Táper. Solo biblioteca estándar.

- preparar(cp): abre sesión como un navegador (Akamai exige cabeceras de Chrome completas, si no da 403),
  guarda las cookies y fija el código postal de entrega.
- precio(ctx, prod): busca por el nombre guardado en la tabla y se queda con el resultado cuyo sku_id
  coincide con prod["ref"]. La búsqueda es JSON y responde mejor que la ficha HTML del producto.
"""
import gzip
import http.cookiejar
import json
import random
import time
import urllib.parse
import urllib.request
import zlib

NOMBRE = "DIA"
WEB = "https://www.dia.es"
PAUSA = (1.5, 3.0)  # segundos entre peticiones

CHROME = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"),
    "sec-ch-ua": '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Accept-Language": "es-ES,es;q=0.9",
    "Accept-Encoding": "gzip, deflate",
}
NAVEGACION = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none", "Sec-Fetch-User": "?1", "Upgrade-Insecure-Requests": "1",
}
API = {
    "Accept": "application/json, text/plain, */*",
    "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-origin",
    "Origin": WEB, "Referer": WEB + "/",
}


def _pausa(ctx):
    # Espera entre peticiones, contando desde la última.
    falta = ctx.get("_ultima", 0) + random.uniform(*PAUSA) - time.time()
    if falta > 0:
        time.sleep(falta)
    ctx["_ultima"] = time.time()


def _pedir(ctx, url, extra, metodo="GET", cuerpo=None):
    _pausa(ctx)
    cab = dict(CHROME)
    cab.update(extra)
    if cuerpo is not None:
        cab["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=cuerpo, headers=cab, method=metodo)
    with ctx["opener"].open(req, timeout=30) as r:
        datos = r.read()
        cod = r.status
        enc = (r.headers.get("Content-Encoding") or "").lower()
    if enc == "gzip":
        datos = gzip.decompress(datos)
    elif enc == "deflate":
        datos = zlib.decompress(datos)
    return cod, datos


def preparar(cp: str) -> dict:
    jar = http.cookiejar.CookieJar()
    ctx = {"opener": urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)), "cp": cp}
    _pedir(ctx, WEB + "/", NAVEGACION)  # cookies de Akamai y de sesión
    url = (f"{WEB}/api/v1/common-aggregator/save-shipping-address?"
           f"new_postal_code={urllib.parse.quote(cp)}&skip_dry_run=true")
    cod, _ = _pedir(ctx, url, API, "PUT", b"null")
    if cod not in (200, 204):
        raise RuntimeError(f"DIA no acepta el código postal {cp} (HTTP {cod})")
    return ctx


def buscar(ctx: dict, texto: str, pagina: int = 1) -> list:
    """Resultados de la búsqueda de la web (lista de search_items)."""
    url = f"{WEB}/api/v1/search-back/search/reduced?q={urllib.parse.quote(texto)}&page={pagina}"
    cod, datos = _pedir(ctx, url, API)
    if cod != 200 or not datos:
        raise RuntimeError(f"Búsqueda vacía en DIA (HTTP {cod})")
    return json.loads(datos).get("search_items") or []


def precio(ctx: dict, prod: dict) -> dict:
    ref = str(prod["ref"])
    # Primero por el nombre exacto; si no aparece, por el código (la búsqueda también lo encuentra a veces).
    for q in (prod.get("nombre"), ref):
        if not q:
            continue
        for it in buscar(ctx, q):
            if str(it.get("sku_id")) == ref:
                p = (it.get("prices") or {}).get("price")
                if p is None:
                    raise RuntimeError(f"DIA no da precio para {ref}")
                return {"precio": float(p), "envase": prod.get("envase"),
                        "nombre": it.get("display_name") or prod.get("nombre")}
    raise LookupError(f"DIA ya no tiene el producto {ref} ({prod.get('nombre')})")

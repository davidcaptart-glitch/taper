"""Precios de Bonpreu/Esclat (compraonline.bonpreuesclat.cat). Solo biblioteca estándar.

- La tienda online es de la plataforma Ocado. Igual que hace la propia web, se abre la portada (da
  cookies de sesión y un token CSRF) y se piden las fichas de muchos productos de golpe con
  PUT /api/webproductpagews/v6/products (cuerpo: lista de `productId`). Así bastan 3-4 peticiones
  para toda la tabla, porque el cortafuegos de AWS (WAF) corta tras unas 6 peticiones seguidas
  (responde 202 con el cuerpo vacío, "challenge") y no deja pasar más hasta pasados unos 10 min.
- `ref` en la tabla de equivalencias es el `productId` (uuid) de Ocado; `codigo` es el código de
  Bonpreu (`retailerProductId`), el que sale en la URL del producto.
- El código postal no cambia los precios de la web (son los mismos en toda la tienda online).
- Entradas con "precio_por": "kilo" (fruta, verdura, carne a peso variable): se devuelve el precio
  por kilo y envase 1000 g.
"""
import http.cookiejar
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

NOMBRE = "Bonpreu"
WEB = "https://www.compraonline.bonpreuesclat.cat"
API = WEB + "/api/webproductpagews/v6/products"
TABLA = Path(__file__).resolve().parent.parent.parent / "data" / "equivalencias" / "bonpreu.json"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
LOTE = 40          # productos por petición
PAUSA = 20         # segundos entre peticiones


class Bloqueo(RuntimeError):
    pass


def _abrir(ctx, req):
    falta = ctx.get("ultima", 0) + PAUSA - time.time()
    if falta > 0:
        time.sleep(falta)
    try:
        with ctx["opener"].open(req, timeout=40) as r:
            estado, cuerpo, waf = r.status, r.read(), r.headers.get("x-amzn-waf-action")
    finally:
        ctx["ultima"] = time.time()
    if estado != 200 or not cuerpo or waf:
        raise Bloqueo(f"Bonpreu bloquea la petición (HTTP {estado}, waf={waf})")
    return cuerpo


def _lote(ctx, ids):
    req = urllib.request.Request(API, data=json.dumps(ids).encode(), method="PUT", headers={
        "User-Agent": UA, "Accept": "application/json", "Content-Type": "application/json",
        "X-CSRF-TOKEN": ctx["csrf"]})
    for p in json.loads(_abrir(ctx, req)).get("products", []):
        ctx["fichas"][p["productId"]] = p


def preparar(cp: str) -> dict:
    ctx = {"cp": cp, "fichas": {}, "error": None,
           "opener": urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))}
    # Portada: cookies de sesión + token CSRF
    req = urllib.request.Request(WEB + "/", headers={"User-Agent": UA, "Accept": "text/html",
                                                      "Accept-Language": "ca-ES,ca;q=0.9,es;q=0.8"})
    html = _abrir(ctx, req).decode("utf-8", "replace")
    m = re.search(r'"csrf":\{"token":"([^"]+)"', html)
    if not m:
        raise RuntimeError("Bonpreu: no encuentro el token CSRF en la portada")
    ctx["csrf"] = m.group(1)
    # Todas las fichas de la tabla, por lotes
    refs = [e["ref"] for e in json.loads(TABLA.read_text(encoding="utf-8"))["productos"].values()]
    for i in range(0, len(refs), LOTE):
        try:
            _lote(ctx, refs[i:i + LOTE])
        except (Bloqueo, urllib.error.URLError) as e:
            ctx["error"] = str(e)   # lo que falte se intentará producto a producto en precio()
            break
    return ctx


def precio(ctx: dict, prod: dict) -> dict:
    p = ctx["fichas"].get(prod["ref"])
    if p is None:
        if ctx.get("bloqueado"):
            raise Bloqueo(f"Bonpreu sigue bloqueando ({ctx['error']})")
        try:
            _lote(ctx, [prod["ref"]])
        except Bloqueo as e:
            ctx["bloqueado"], ctx["error"] = True, str(e)
            raise
        p = ctx["fichas"].get(prod["ref"])
        if p is None:
            raise RuntimeError(f"Bonpreu no encuentra el producto {prod.get('codigo', prod['ref'])}")
    if p.get("available") is False:
        raise RuntimeError(f"Bonpreu: {p.get('name')} no está disponible")
    if prod.get("precio_por") == "kilo":
        up = p.get("unitPrice") or {}
        if up.get("unitName") != "PER_1KG":
            raise RuntimeError(f"Bonpreu: {p.get('name')} no tiene precio por kilo")
        return {"precio": float(up["price"]["amount"]), "envase": 1000, "nombre": p.get("name")}
    return {"precio": float(p["price"]["amount"]), "envase": prod["envase"], "nombre": p.get("name")}

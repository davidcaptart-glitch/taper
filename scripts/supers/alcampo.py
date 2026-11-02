"""Precios de Alcampo (compraonline.alcampo.es). Solo biblioteca estándar.

- La tienda online es de la plataforma Ocado, como la de Bonpreu: se abre la portada (cookies de sesión
  y token CSRF) y se piden las fichas de muchos productos de golpe con
  PUT /api/webproductpagews/v6/products (cuerpo: lista de `productId`). Bastan 2 peticiones para
  toda la tabla (portada + un lote). Si el cortafuegos de AWS (WAF) corta (202 con cuerpo vacío o cabecera
  x-amzn-waf-action), lo que falte se intenta producto a producto en precio() y, si sigue, se para.
- `ref` en la tabla es el `productId` (uuid) de Ocado; `codigo` es el código de Alcampo
  (`retailerProductId`), el que sale en la URL del producto.
- Precios: los de la tienda online sin dirección (región "Vaguada"; Alcampo online es centralizado).
  Alcampo no reparte en 08784, así que no hay una tienda "de Piera" que elegir: preparar(cp) no lo usa.
- Entradas con "precio_por": "kilo" (fruta, verdura, carne a peso variable): se devuelve el precio
  por kilo y envase 1000 g.
- Buscador (para ampliar la tabla): GET /api/webproductpagews/v6/product-pages/search?q=<texto>&tag=web
  &maxPageSize=300&maxProductsToDecorate=300 da hasta 300 resultados con precio en una sola petición
  (productGroups[].decoratedProducts). El WAF corta tras ~6 búsquedas seguidas: espaciarlas ≥40 s.
"""
import http.cookiejar
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

NOMBRE = "Alcampo"
WEB = "https://www.compraonline.alcampo.es"
API = WEB + "/api/webproductpagews/v6/products"
_EQUIV = Path(__file__).resolve().parent.parent.parent / "data" / "equivalencias"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
LOTE = 200         # productos por petición (la API acepta al menos 250): 1 portada + 1 petición por tabla
PAUSA = 20         # segundos entre peticiones


class Bloqueo(RuntimeError):
    pass


def _tabla():
    # La tabla está en data/equivalencias/ cuando el súper está activo, o en pendientes/ mientras no
    for p in (_EQUIV / "alcampo.json", _EQUIV / "pendientes" / "alcampo.json"):
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    return {"productos": {}}


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
        raise Bloqueo(f"Alcampo bloquea la petición (HTTP {estado}, waf={waf})")
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
                                                      "Accept-Language": "es-ES,es;q=0.9"})
    html = _abrir(ctx, req).decode("utf-8", "replace")
    m = re.search(r'"csrf":\{"token":"([^"]+)"', html)
    if not m:
        raise RuntimeError("Alcampo: no encuentro el token CSRF en la portada")
    ctx["csrf"] = m.group(1)
    # Todas las fichas de la tabla, por lotes
    refs = [e["ref"] for e in _tabla()["productos"].values()]
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
            raise Bloqueo(f"Alcampo sigue bloqueando ({ctx['error']})")
        try:
            _lote(ctx, [prod["ref"]])
        except Bloqueo as e:
            ctx["bloqueado"], ctx["error"] = True, str(e)
            raise
        p = ctx["fichas"].get(prod["ref"])
        if p is None:
            raise RuntimeError(f"Alcampo no encuentra el producto {prod.get('codigo', prod['ref'])}")
    if p.get("available") is False:
        raise RuntimeError(f"Alcampo: {p.get('name')} no está disponible")
    if prod.get("precio_por") == "kilo":
        up = p.get("unitPrice") or {}
        if up.get("unitName") not in ("PER_1KG", "PER_KG", "PER_KILOGRAM"):
            raise RuntimeError(f"Alcampo: {p.get('name')} no tiene precio por kilo ({up.get('unitName')})")
        return {"precio": float(up["price"]["amount"]), "envase": 1000, "nombre": p.get("name")}
    return {"precio": float(p["price"]["amount"]), "envase": prod["envase"], "nombre": p.get("name")}

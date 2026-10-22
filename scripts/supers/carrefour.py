"""Precios de Carrefour (carrefour.es/supermercado). Solo biblioteca estándar.

- El buscador de la web está bloqueado por Cloudflare para peticiones automáticas, pero las fichas de
  producto (/supermercado/<nombre>/R-<id>/p) sí se pueden leer: llevan el precio en un bloque JSON-LD.
  `ref` en la tabla de equivalencias es la ruta de esa ficha.
- Cloudflare mira la "huella" TLS del cliente: con la configuración por defecto de Python contesta 403
  ("Just a moment..."). Se fuerza TLS 1.3, que a veces pasa; al primer 403 se pasa a usar `curl` del
  sistema (si está instalado). Aun así Cloudflare rechaza una parte de las peticiones al azar, y si se
  piden muchas páginas seguidas bloquea la IP durante horas: por eso hay una pausa larga entre fichas,
  un reintento por ficha y, tras varias fichas seguidas con 403, se deja de intentar.
- Carrefour no aplica el código postal a los precios online (son nacionales).
- Si un producto se queda sin existencias, su ficha redirige (301) a la categoría: se lanza excepción
  y se conserva el precio anterior. Si dura semanas, conviene cambiarlo en la tabla de equivalencias.
- Productos a peso variable ("600 g aprox"): la tabla lleva "precio_por": "kilo" y se devuelve el
  precio por kilo con envase 1000 g (el JSON-LD de esas fichas ya da el precio por kilo).
"""
import gzip
import html
import json
import random
import re
import shutil
import ssl
import subprocess
import time
import http.client

NOMBRE = "Carrefour"
HOST = "www.carrefour.es"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
CABECERAS = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
             "Accept-Language": "es-ES,es;q=0.9", "Accept-Encoding": "gzip"}
PAUSA = (8.0, 12.0)    # segundos entre fichas
REINTENTO = 30         # pausa antes de repetir una ficha que ha dado 403
MAX_403 = 5            # fichas seguidas con 403 para dar la web por bloqueada en esta ejecución


class Bloqueo(RuntimeError):
    pass


def preparar(cp: str) -> dict:
    return {"cp": cp, "ultima": 0.0, "seguidos_403": 0, "curl": shutil.which("curl")}


def _con_python(ruta):
    ctx = ssl.create_default_context()
    ctx.minimum_version = ssl.TLSVersion.TLSv1_3
    con = http.client.HTTPSConnection(HOST, context=ctx, timeout=30)
    try:
        con.request("GET", ruta, headers=CABECERAS)
        r = con.getresponse()
        cuerpo = r.read()
        if r.getheader("Content-Encoding") == "gzip":
            cuerpo = gzip.decompress(cuerpo)
        return r.status, cuerpo.decode("utf-8", "replace")
    finally:
        con.close()


def _con_curl(ruta, curl):
    r = subprocess.run([curl, "-s", "--compressed", "-w", "\n%{http_code}", "-A", UA,
                        "-H", "Accept: text/html,*/*", "-H", "Accept-Language: es-ES,es;q=0.9",
                        f"https://{HOST}{ruta}"], capture_output=True, timeout=60)
    texto = r.stdout.decode("utf-8", "replace")
    cuerpo, _, codigo = texto.rpartition("\n")
    return int(codigo or 0), cuerpo


def _pedir(ctx, ruta):
    falta = ctx["ultima"] + random.uniform(*PAUSA) - time.time()
    if falta > 0:
        time.sleep(falta)
    try:
        # Si Python ya ha recibido un 403, se usa curl directamente (menos peticiones)
        if not ctx.get("solo_curl"):
            estado, texto = _con_python(ruta)
            if estado != 403 or not ctx["curl"]:
                return estado, texto
            ctx["solo_curl"] = True
        return _con_curl(ruta, ctx["curl"])
    finally:
        ctx["ultima"] = time.time()


def _pagina(ctx, ruta):
    if ctx["seguidos_403"] >= MAX_403:
        raise Bloqueo("Carrefour bloquea las peticiones (403 de Cloudflare)")
    estado, texto = _pedir(ctx, ruta)
    if estado == 403:
        # Cloudflare a veces deja pasar la misma petición poco después: un reintento con pausa larga
        time.sleep(REINTENTO)
        estado, texto = _pedir(ctx, ruta)
    if estado == 403:
        ctx["seguidos_403"] += 1
        raise Bloqueo("Carrefour bloquea las peticiones (403 de Cloudflare)")
    ctx["seguidos_403"] = 0
    if estado in (301, 302):
        # Carrefour redirige a la categoría las fichas de productos sin existencias
        raise RuntimeError(f"Carrefour: producto agotado o retirado ({ruta})")
    if estado != 200:
        raise RuntimeError(f"Carrefour responde HTTP {estado} en {ruta}")
    return texto


def _producto_jsonld(texto):
    for bloque in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', texto, re.S):
        try:
            datos = json.loads(html.unescape(bloque.strip()))
        except ValueError:
            continue
        for d in (datos if isinstance(datos, list) else datos.get("@graph", [datos])):
            if isinstance(d, dict) and d.get("@type") == "Product":
                return d
    return None


def _producto_estado(texto):
    # window.__INITIAL_STATE__ -> pdp.product (offer.price, offer.price_per_unit, variable_weight)
    i = texto.find("window.__INITIAL_STATE__")
    if i < 0:
        return None
    try:
        estado = json.JSONDecoder().raw_decode(texto[texto.index("{", i):])[0]
        return (estado.get("pdp") or {}).get("product")
    except ValueError:
        return None


def _euros(texto):
    # "4,61 €" -> 4.61
    return float(re.sub(r"[^\d,.]", "", str(texto)).replace(".", "").replace(",", ".")) if "," in str(texto) \
        else float(re.sub(r"[^\d.]", "", str(texto)))


def precio(ctx: dict, prod: dict) -> dict:
    texto = _pagina(ctx, prod["ref"])
    ld, st = _producto_jsonld(texto), _producto_estado(texto)
    if not ld and not st:
        raise RuntimeError(f"Carrefour: la ficha {prod['ref']} no trae datos de producto")
    nombre = (ld or {}).get("name") or (st or {}).get("name")
    ofertas = (ld or {}).get("offers") or {}
    if isinstance(ofertas, list):
        ofertas = ofertas[0] if ofertas else {}
    if "OutOfStock" in str(ofertas.get("availability", "")):
        raise RuntimeError(f"Carrefour: {nombre} agotado")
    oferta = (st or {}).get("offer") or {}
    if prod.get("precio_por") == "kilo":
        # Peso variable: el JSON-LD ya da el precio por kilo; la ficha lo confirma en price_per_unit
        if oferta.get("price_per_unit") and (st or {}).get("measure_unit") == "kg":
            return {"precio": _euros(oferta["price_per_unit"]), "envase": 1000, "nombre": nombre}
        if st and not st.get("variable_weight"):
            raise RuntimeError(f"Carrefour: {nombre} ya no se vende a peso")
        valor = ofertas.get("price")
        if valor in (None, ""):
            raise RuntimeError(f"Carrefour: sin precio en {prod['ref']}")
        return {"precio": _euros(valor), "envase": 1000, "nombre": nombre}
    if oferta.get("price"):
        valor = oferta["price"]          # precio del envase tal como sale en la web
    else:
        valor = ofertas.get("price", ofertas.get("lowPrice"))
    if valor in (None, ""):
        raise RuntimeError(f"Carrefour: sin precio en {prod['ref']}")
    return {"precio": _euros(valor), "envase": prod["envase"], "nombre": nombre}

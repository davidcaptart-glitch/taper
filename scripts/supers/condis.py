"""Precios de Condis (buscador Empathy que usa compraonline.condis.es).

Los precios son iguales en todas las tiendas; solo cambia el surtido. Se usa la
tienda 2056 (Esparreguera), porque Condis no reparte en 08784.
"""
import json
import re
import time
import urllib.parse
import urllib.request

NOMBRE = "Condis"

_API = "https://api.empathy.co/search/v1/query/condis/search"
_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
_TIENDA = "2056"   # Condis Esparreguera
_PAUSA = 1.5       # segundos entre peticiones


def preparar(cp: str) -> dict:
    # Sin sesión ni cookies: basta con indicar la tienda.
    return {"store": _TIENDA, "ultima": 0.0}


def _buscar(ctx: dict, texto: str) -> list:
    espera = ctx.get("ultima", 0.0) + _PAUSA - time.time()
    if espera > 0:
        time.sleep(espera)
    params = urllib.parse.urlencode({"query": texto, "lang": "es", "store": ctx.get("store", _TIENDA),
                                     "start": 0, "rows": 12})
    req = urllib.request.Request(f"{_API}?{params}",
                                 headers={"User-Agent": _UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            if r.status != 200:
                raise RuntimeError(f"Condis: HTTP {r.status}")
            datos = json.load(r)
    finally:
        ctx["ultima"] = time.time()
    return datos.get("catalog", {}).get("content", [])


def _precio_unidad(pum: str):
    # "1,30€/Kilo", "8,89€/Kilo PNE", "0,87€/Litro", "9,95€/Kg" → (1.30, factor a g/ml)
    m = re.match(r"\s*([\d.,]+)\s*€\s*/\s*(\w+)", pum or "")
    if not m:
        return None
    factor = {"kilo": 1000, "kg": 1000, "litro": 1000, "l": 1000}.get(m.group(2).lower())
    if not factor:
        return None
    return float(m.group(1).replace(".", "").replace(",", ".")), factor


def precio(ctx: dict, prod: dict) -> dict:
    ref = str(prod["ref"])
    # Buscar por código devuelve exactamente ese producto.
    doc = next((d for d in _buscar(ctx, ref) if str(d.get("id")) == ref), None)
    if not doc:
        raise LookupError(f"Condis: producto {ref} no encontrado")
    euros = (doc.get("price") or {}).get("current")
    if not euros:
        raise ValueError(f"Condis: {ref} sin precio")
    euros = float(euros)

    # El envase sale de la tabla. Si el precio por kilo/litro da un peso parecido
    # (mismo tipo de unidad, peso variable…), se usa ese, que cuadra con el precio.
    envase = prod["envase"]
    pu = _precio_unidad(doc.get("pum"))
    if pu and pu[0] > 0:
        calculado = round(euros / pu[0] * pu[1])
        if abs(calculado - envase) <= 0.3 * envase:
            envase = calculado
    return {"precio": euros, "envase": envase,
            "nombre": " ".join(doc.get("description", prod.get("nombre", "")).split()).title()}

"""Precios de Consum (tienda.consum.es) a partir de su API JSON de catálogo.

- `ref` es el código de producto de Consum.
- Los precios son nacionales: preparar(cp) no necesita elegir tienda.
- La web está detrás de Imperva: pausa de 1,0–1,5 s entre peticiones y User-Agent de navegador.
- Entradas con `"por_kilo": true` (fruta, verdura, carne y pescado a peso variable): se devuelve el
  precio por kilo y envase 1000, porque el precio "por pieza" de Consum es solo una estimación.
Solo usa la biblioteca estándar de Python.
"""
import json
import random
import time
import urllib.request

NOMBRE = "Consum"
API = "https://tienda.consum.es/api/rest/V1.0/catalog/product"
CABECERAS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "es-ES,es;q=0.9",
}
PAUSA = (1.0, 1.5)  # segundos entre peticiones


def preparar(cp: str) -> dict:
    # Precios iguales en toda España: basta con un contexto para llevar la cuenta de las pausas.
    return {"ultima": 0.0}


def _pedir(ctx, url):
    espera = ctx.get("ultima", 0.0) + random.uniform(*PAUSA) - time.monotonic()
    if espera > 0:
        time.sleep(espera)
    try:
        req = urllib.request.Request(url, headers=CABECERAS)
        with urllib.request.urlopen(req, timeout=30) as r:
            if r.status != 200:
                raise RuntimeError(f"Consum respondió {r.status}")
            cuerpo = r.read()
    finally:
        ctx["ultima"] = time.monotonic()
    try:
        return json.loads(cuerpo)
    except ValueError:
        # Imperva devuelve HTML (desafío) cuando bloquea.
        raise RuntimeError("Consum no ha devuelto JSON (¿bloqueo de Imperva?)") from None


def precio(ctx: dict, prod: dict) -> dict:
    d = _pedir(ctx, f"{API}/code/{prod['ref']}")
    precios = (d.get("priceData") or {}).get("prices") or []
    # PRICE = precio normal, OFFER_PRICE = oferta; nos quedamos con el menor.
    # Ojo: "centAmount" viene en euros pese al nombre.
    campo = "centUnitAmount" if prod.get("por_kilo") else "centAmount"
    valores = [p["value"][campo] for p in precios
               if p.get("id") in ("PRICE", "OFFER_PRICE") and p.get("value", {}).get(campo)]
    if not valores:
        raise RuntimeError(f"Consum: sin precio para {prod['ref']}")
    nombre = (d.get("productData") or {}).get("description") or prod.get("nombre", "")
    return {
        "precio": round(float(min(valores)), 2),
        "envase": 1000 if prod.get("por_kilo") else prod["envase"],
        "nombre": nombre.strip(),
    }

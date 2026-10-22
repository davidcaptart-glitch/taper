"""Actualiza data/precios.json con los precios de la tienda online de Mercadona.

Uso:  CODIGO_POSTAL=08784 python scripts/actualizar_precios.py

- Pide a Mercadona el almacén que corresponde al código postal (los precios varían por zona).
- Consulta cada producto de data/productos.json que tenga "mercadona_id", con una pausa entre peticiones.
- Guarda por producto: precio actual, precio anterior (el de la semana pasada) y fecha.
- Si un producto falla, conserva su último precio y lo apunta en "registro".
Solo usa la biblioteca estándar de Python: no hay que instalar nada.
"""
import json
import os
import random
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

RAIZ = Path(__file__).resolve().parent.parent
PRODUCTOS = RAIZ / "data" / "productos.json"
PRECIOS = RAIZ / "data" / "precios.json"
API = "https://tienda.mercadona.es/api"
CABECERAS = {"User-Agent": "Mozilla/5.0 (uso personal: app Taper)", "Accept": "application/json"}
PAUSA = (2.0, 4.0)       # segundos entre peticiones
MAX_REGISTRO = 200       # entradas que se conservan en el registro


def peticion(url, metodo="GET", datos=None):
    cuerpo = json.dumps(datos).encode() if datos is not None else None
    cab = dict(CABECERAS)
    if cuerpo:
        cab["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=cuerpo, headers=cab, method=metodo)
    return urllib.request.urlopen(req, timeout=30)


def almacen_para(cp):
    with peticion(f"{API}/postal-codes/actions/change-pc/", "PUT", {"new_postal_code": cp}) as r:
        wh = r.headers.get("x-customer-wh")
    if not wh:
        raise RuntimeError(f"Mercadona no ha devuelto almacén para el código postal {cp}")
    return wh


def ficha(mid, wh):
    ultimo = None
    for intento in range(2):
        try:
            with peticion(f"{API}/products/{mid}/?lang=es&wh={wh}") as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001 - cualquier fallo se reintenta una vez
            ultimo = e
            if getattr(e, "code", None) == 404:
                break
            time.sleep(5 + intento * 5)
    raise ultimo


def precio_de(prod, d):
    """Precio de un envase tal como lo cuenta la app."""
    pi = d["price_instructions"]
    if prod.get("precio_por") == "kilo":
        # Se vende a granel o en bandejas de peso variable: precio por kg (o l) x tamaño del envase de la app
        factor = prod["envase"] / 1000 if prod["unidad"] in ("g", "ml") else 1
        return round(float(pi["bulk_price"]) * factor, 2)
    return round(float(pi["unit_price"]), 2)


def main():
    cp = os.environ.get("CODIGO_POSTAL", "").strip()
    if not cp:
        sys.exit("Falta la variable CODIGO_POSTAL (por ejemplo CODIGO_POSTAL=08784)")

    hoy = datetime.now(ZoneInfo("Europe/Madrid")).date().isoformat()
    productos = json.loads(PRODUCTOS.read_text(encoding="utf-8"))["productos"]
    previo = json.loads(PRECIOS.read_text(encoding="utf-8")) if PRECIOS.exists() else {}
    viejos = previo.get("productos", {})
    registro = previo.get("registro", [])

    def apunta(producto, motivo):
        print(f"  ! {producto}: {motivo}")
        registro.append({"fecha": hoy, "producto": producto, "motivo": motivo})

    wh = almacen_para(cp)
    print(f"Código postal {cp} -> almacén {wh}")

    nuevos, fallos, aciertos = {}, [], 0
    for i, prod in enumerate(productos):
        pid, mid = prod["id"], prod.get("mercadona_id")
        viejo = viejos.get(pid)
        if not mid:
            if viejo:
                nuevos[pid] = viejo
            apunta(pid, "sin mercadona_id en productos.json")
            fallos.append(pid)
            continue
        if i:
            time.sleep(random.uniform(*PAUSA))
        try:
            d = ficha(mid, wh)
            precio = precio_de(prod, d)
        except Exception as e:  # noqa: BLE001
            if viejo:
                nuevos[pid] = viejo        # se conserva el último precio bueno
            apunta(pid, f"error al consultar el id {mid}: {e}")
            fallos.append(pid)
            continue

        # "anterior" es el precio de la última comprobación de otro día (la semana pasada).
        # Si se lanza dos veces el mismo día, no se pisa.
        if viejo and viejo.get("fecha") != hoy:
            anterior = viejo.get("precio")
        elif viejo:
            anterior = viejo.get("anterior")
        else:
            anterior = None
        pi = d["price_instructions"]
        nuevos[pid] = {
            "mercadona_id": str(mid),
            "nombre_mercadona": d.get("display_name"),
            "formato": f'{d.get("packaging") or ""} {pi.get("unit_size")} {pi.get("size_format")}'.strip(),
            "precio": precio,
            "anterior": anterior,
            "precio_kilo": float(pi["bulk_price"]) if pi.get("bulk_price") else None,
            "fecha": hoy,
        }
        aciertos += 1
        cambio = "" if anterior in (None, precio) else f"  (antes {anterior:.2f})"
        print(f"  {pid}: {precio:.2f} €{cambio}")

    salida = {
        # Si todo ha fallado se mantiene la fecha anterior: la app enseña la fecha real de los precios
        "fecha": hoy if aciertos else previo.get("fecha"),
        "codigo_postal_almacen": wh,
        "productos": nuevos,
        "fallos_ultima_vez": fallos,
        "registro": registro[-MAX_REGISTRO:],
        "ejecutado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    PRECIOS.write_text(json.dumps(salida, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Hecho: {aciertos} precios actualizados, {len(fallos)} fallos")
    if not aciertos:
        sys.exit(1)


if __name__ == "__main__":
    main()

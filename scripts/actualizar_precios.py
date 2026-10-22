"""Actualiza los precios de la tienda online de Mercadona para una o varias zonas.

Uso:  CODIGOS_POSTALES=08784,28001 python scripts/actualizar_precios.py
      (o CODIGO_POSTAL=08784 si solo hay una zona)

- Pide a Mercadona el almacén que corresponde a cada código postal (los precios varían por zona).
  Varios códigos postales pueden compartir almacén: cada almacén se consulta una sola vez.
- El primer código postal es la zona principal: sus precios van a data/precios.json. Las demás zonas van a
  data/precios/<almacén>.json, y data/zonas.json dice qué almacén corresponde a cada código postal.
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
ZONAS_DIR = RAIZ / "data" / "precios"
ZONAS = RAIZ / "data" / "zonas.json"
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


def actualizar_zona(wh, ruta, productos, hoy):
    """Consulta todos los productos en un almacén y escribe su archivo de precios. Devuelve los aciertos."""
    previo = json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {}
    viejos = previo.get("productos", {})
    registro = previo.get("registro", [])

    def apunta(producto, motivo):
        print(f"  ! {producto}: {motivo}")
        registro.append({"fecha": hoy, "producto": producto, "motivo": motivo})

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
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(salida, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Almacén {wh}: {aciertos} precios actualizados, {len(fallos)} fallos")
    return aciertos


def zonas_pedidas():
    """Códigos postales que han pedido los usuarios desde la app (servidor de avisos)."""
    url = os.environ.get("ZONAS_URL", "").strip()
    if not url:
        return []
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=CABECERAS), timeout=20) as r:
            return [str(c) for c in json.load(r).get("cps", [])]
    except Exception as e:  # noqa: BLE001 - sin servidor se sigue con los de siempre
        print(f"  ! no se han podido leer las zonas pedidas: {e}")
        return []


def main():
    lista = os.environ.get("CODIGOS_POSTALES", "") or os.environ.get("CODIGO_POSTAL", "")
    lista += "," + ",".join(zonas_pedidas())
    solo_nuevas = os.environ.get("SOLO_NUEVAS") == "1"   # cada día: solo los códigos postales que aún no tienen almacén
    cps = []
    for cp in lista.replace(";", ",").replace(" ", ",").split(","):
        cp = cp.strip()
        if cp and cp not in cps:
            if len(cp) != 5 or not cp.isdigit():
                print(f"  ! código postal no válido, se ignora: {cp}")
                continue
            cps.append(cp)
    if not cps:
        sys.exit("Falta CODIGOS_POSTALES (por ejemplo CODIGOS_POSTALES=08784,28001) o CODIGO_POSTAL")

    hoy = datetime.now(ZoneInfo("Europe/Madrid")).date().isoformat()
    productos = json.loads(PRODUCTOS.read_text(encoding="utf-8"))["productos"]

    # Código postal -> almacén (si Mercadona no responde, se conserva lo que ya se sabía)
    zonas = json.loads(ZONAS.read_text(encoding="utf-8")) if ZONAS.exists() else {"cp": {}}
    mapa = dict(zonas.get("cp", {}))
    conocidos = set(mapa.values())
    if solo_nuevas:
        cps = [cps[0]] + [cp for cp in cps[1:] if cp not in mapa]
        if len(cps) == 1:
            print("No hay zonas nuevas")
            return
    for cp in cps:
        try:
            mapa[cp] = almacen_para(cp)
            print(f"Código postal {cp} -> almacén {mapa[cp]}")
        except Exception as e:  # noqa: BLE001
            print(f"  ! {cp}: {e}" + (f" (uso el almacén conocido {mapa[cp]})" if cp in mapa else ""))
        time.sleep(1)
    principal = mapa.get(cps[0])
    if not principal:
        sys.exit(f"No se sabe el almacén del código postal principal {cps[0]}")

    almacenes = []
    for cp in cps:
        wh = mapa.get(cp)
        if wh and wh not in almacenes:
            almacenes.append(wh)
    if solo_nuevas:   # solo se descargan almacenes que aún no tenían precios
        almacenes = [wh for wh in almacenes if wh not in conocidos]
    total = 0
    for wh in almacenes:
        ruta = PRECIOS if wh == principal else ZONAS_DIR / f"{wh}.json"
        total += actualizar_zona(wh, ruta, productos, hoy)

    # Se conservan todos los códigos postales y almacenes conocidos
    todos = sorted(set(zonas.get("almacenes", [])) | set(almacenes) | {principal})
    ZONAS.write_text(json.dumps({
        "principal": principal,
        "cp": dict(sorted(mapa.items())),
        "almacenes": todos,
        "actualizado": hoy,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if almacenes and not total:
        sys.exit(1)


if __name__ == "__main__":
    main()

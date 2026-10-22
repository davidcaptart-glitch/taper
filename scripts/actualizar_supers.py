"""Actualiza los precios de los demás supermercados (DIA, Condis, Consum…).

Uso:  CODIGO_POSTAL=08784 python scripts/actualizar_supers.py [dia condis …]

- Usa cada módulo de scripts/supers/<id>.py con su tabla data/equivalencias/<id>.json (ver scripts/supers/LEEME.md).
- Guarda todo en data/precios_supers.json: por supermercado y producto, precio, envase, precio anterior y fecha.
- Si un producto o un supermercado entero falla, conserva el último precio y lo apunta en "fallos".
Solo usa la biblioteca estándar de Python.
"""
import importlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
EQUIV = RAIZ / "data" / "equivalencias"
SALIDA = RAIZ / "data" / "precios_supers.json"
MAX_FALLOS_SEGUIDOS = 6   # si un súper falla tantas veces seguidas, probablemente nos está bloqueando: se para


def cargar(p, defecto):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return defecto


def actualizar_super(sid, cp, previo, hoy):
    eq = cargar(EQUIV / f"{sid}.json", None)
    if not eq:
        raise RuntimeError("sin tabla de equivalencias")
    mod = importlib.import_module(f"supers.{sid}")
    out = {"nombre": mod.NOMBRE, "fecha": previo.get("fecha"), "productos": dict(previo.get("productos", {})), "fallos": []}
    ctx = mod.preparar(cp)
    bien, seguidos = 0, 0
    for pid, prod in eq["productos"].items():
        antes = out["productos"].get(pid, {})
        try:
            r = mod.precio(ctx, prod)
            precio = round(float(r["precio"]), 2)
            out["productos"][pid] = {
                "precio": precio,
                "envase": r.get("envase") or prod.get("envase"),
                "nombre": r.get("nombre") or prod.get("nombre"),
                "aprox": bool(prod.get("aprox")),
                "url": prod.get("url"),
                "anterior": antes.get("precio") if antes.get("fecha") != hoy else antes.get("anterior"),
                "fecha": hoy,
            }
            bien += 1
            seguidos = 0
        except Exception as e:  # noqa: BLE001 - se conserva el precio anterior
            out["fallos"].append(f"{pid}: {e}"[:160])
            seguidos += 1
            if seguidos >= MAX_FALLOS_SEGUIDOS:
                out["fallos"].append("Demasiados fallos seguidos: se para este supermercado hasta la semana que viene")
                break
    # El enlace a la ficha del producto (para hacer el pedido paso a paso desde la app)
    for pid, v in out["productos"].items():
        if pid in eq["productos"] and eq["productos"][pid].get("url"):
            v["url"] = eq["productos"][pid]["url"]
    # Productos que ya no están en la tabla se quitan
    out["productos"] = {k: v for k, v in out["productos"].items() if k in eq["productos"]}
    if bien:
        out["fecha"] = hoy
    print(f"{sid}: {bien}/{len(eq['productos'])} precios, {len(out['fallos'])} fallos")
    return out


def main():
    cp = os.environ.get("CODIGO_POSTAL") or (os.environ.get("CODIGOS_POSTALES") or "08784").split(",")[0].strip()
    hoy = datetime.now(ZoneInfo("Europe/Madrid")).date().isoformat()
    datos = cargar(SALIDA, {"supers": {}})
    pedidos = sys.argv[1:] or sorted(p.stem for p in EQUIV.glob("*.json"))
    for sid in pedidos:
        previo = datos["supers"].get(sid, {})
        try:
            datos["supers"][sid] = actualizar_super(sid, cp, previo, hoy)
        except Exception as e:  # noqa: BLE001 - un súper caído no para a los demás
            print(f"{sid}: no se ha podido actualizar ({e})")
            datos["supers"][sid] = {**previo, "fallos": [f"No se ha podido actualizar: {e}"[:200]]}
    datos["codigo_postal"] = cp
    datos["ejecutado"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

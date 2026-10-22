"""Festivos locales de todos los municipios de Cataluña (datos abiertos de la Generalitat).

Fuente: «Calendari de festes locals a Catalunya», https://analisi.transparenciacatalunya.cat/d/b4eh-r8up
Guarda en data/festivos.json → "locales": {municipio: {año: [fechas]}}, para este año y el siguiente.
Se puede ejecutar cuando se quiera; la acción de los domingos lo hace sola.
"""
import json
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

URL = "https://analisi.transparenciacatalunya.cat/resource/b4eh-r8up.json"
DEST = Path(__file__).resolve().parent.parent / "data" / "festivos.json"


def main():
    hoy = date.today()
    anios = [str(hoy.year), str(hoy.year + 1)]
    q = urllib.parse.urlencode({"$where": "any_calendari in(" + ",".join(f"'{a}'" for a in anios) + ")", "$limit": 50000})
    with urllib.request.urlopen(URL + "?" + q, timeout=60) as r:
        filas = json.load(r)
    locales = {}
    for f in filas:
        nombre, anio, d = f.get("ajuntament_o_nucli_municipal"), f.get("any_calendari"), (f.get("data") or "")[:10]
        if not (nombre and anio and len(d) == 10):
            continue
        locales.setdefault(nombre, {}).setdefault(anio, [])
        if d not in locales[nombre][anio]:
            locales[nombre][anio].append(d)
    for m in locales.values():
        for a in m:
            m[a].sort()
    datos = json.loads(DEST.read_text(encoding="utf-8"))
    if len(locales) > 100:          # si la descarga viene incompleta, se conservan los de antes
        datos["locales"] = dict(sorted(locales.items()))
        datos["fuente_locales"] = "Generalitat de Catalunya, Calendari de festes locals (analisi.transparenciacatalunya.cat)"
    DEST.write_text(json.dumps(datos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"Festivos locales: {len(locales)} municipios y núcleos ({', '.join(anios)})")


if __name__ == "__main__":
    main()

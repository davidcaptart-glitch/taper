# Precios de otros supermercados

Cada supermercado tiene aquí un módulo `<id>.py` (solo biblioteca estándar de Python) y su tabla de
equivalencias en `data/equivalencias/<id>.json`. El script `scripts/actualizar_supers.py` los usa cada
domingo y guarda el resultado en `data/precios_supers.json`.

## Tabla de equivalencias: `data/equivalencias/<id>.json`

```json
{
  "super": "dia",
  "comprobado": "2026-10-22",
  "productos": {
    "arroz": {"ref": "123456", "nombre": "Arroz redondo Dia 1 kg", "envase": 1000, "url": "https://…"},
    "pollo": {"ref": "…", "nombre": "…", "envase": 550, "aprox": true}
  },
  "sin_equivalente": ["tinta"]
}
```

- La clave es el `id` del producto en `data/productos.json`.
- `ref`: lo que el módulo necesita para volver a pedir el precio (código, sku o URL).
- `envase`: tamaño del envase del súper **en la misma unidad que el producto de Táper** (`unidad`: g, ml o ud).
  Así la app compara: precio equivalente = precio / envase × envase de Táper.
- `aprox: true` si el peso es variable (bandejas de carne, fruta a granel…).
- Se elige el producto **del mismo tipo** que el de Mercadona (`nombre_mercadona`), preferiblemente marca
  propia y el más barato comparable. Si no hay nada parecido, va a `sin_equivalente`.

## Módulo: `scripts/supers/<id>.py`

```python
NOMBRE = "DIA"
def preparar(cp: str) -> dict:          # sesión, cookies, tienda para el código postal…
def precio(ctx: dict, prod: dict) -> dict:  # prod = entrada de la tabla
    return {"precio": 1.15, "envase": 1000, "nombre": "…"}   # lanza excepción si falla
```

- Las pausas entre peticiones las pone el propio módulo (respeta lo que tolere cada web).
- Si la web bloquea (403, 202 vacío…), se lanza una excepción: el script conserva el precio anterior.

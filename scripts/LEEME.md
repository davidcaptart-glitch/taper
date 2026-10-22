
## Supermercados en pausa

`data/equivalencias/pendientes/` guarda tablas que funcionan pero no entran en la actualización semanal (que lee solo `data/equivalencias/*.json`). Carrefour está ahí: su web bloquea muchas peticiones (1 de cada 4 falla) y la pasada tarda unos 40 minutos. Para probarlo a mano: copia la tabla a `data/equivalencias/` y ejecuta `python scripts/actualizar_supers.py carrefour`.

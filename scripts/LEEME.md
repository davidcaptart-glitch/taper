
## Supermercados en pausa

`data/equivalencias/pendientes/` guarda tablas que funcionan pero no entran en la actualización semanal (que lee solo `data/equivalencias/*.json`). Carrefour está ahí: su web bloquea muchas peticiones (1 de cada 4 falla) y la pasada tarda unos 40 minutos. Para probarlo a mano: copia la tabla a `data/equivalencias/` y ejecuta `python scripts/actualizar_supers.py carrefour`.

**Caprabo** (`caprabo.py`: misma plataforma y códigos que Eroski, una ficha por producto, ~6 min la pasada) y **Alcampo** (`alcampo.py`: plataforma Ocado como Bonpreu, toda la tabla en 2 peticiones; precios de la tienda online sin dirección, porque Alcampo no reparte en 08784) ya están activos. La web de Alcampo corta tras unas pocas búsquedas seguidas, así que su tabla aún es corta: lo que falta por buscar está en `sin_buscar` dentro de `data/equivalencias/alcampo.json`.

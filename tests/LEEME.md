# Pruebas de Táper

Comprueban que la app hace lo que dice, con el código de verdad (los mismos scripts que `index.html`) y sin navegador.

## Cómo se ejecutan

```
node tests/run.js
```

Tarda unos 15 segundos (con las 5 semillas, unos 20). Al final dice `✓ N comprobaciones · ✗ M fallos` y, si algo falla, el detalle con el día, la comida y el plato. Sale con código 1 si hay algún fallo.

Opciones:

- `node tests/run.js -v`: toda la salida de cada prueba y todos los fallos.
- `node tests/run.js --semillas 1,2,3,4,5`: el mes simulado con otras semillas del azar (por defecto 1, 2 y 3, en paralelo). La misma semilla da siempre el mismo menú.
- `node tests/run.js --solo escenario` (o `sistema`, `casos`): solo una prueba.
- `VER=1 SEMILLA=1 TZ=Europe/Madrid node tests/escenario-david.js`: el menú del mes tal como quedó y lo que faltó al cocinar, para mirarlo a ojo.

Hace falta Node 18 o más. No hay que instalar nada.

## Qué prueba cada archivo

**`sistema.js`**: que todo encaja.
- Cada nombre global se declara una sola vez entre todos los scripts (si dos archivos declaran lo mismo, uno pisa al otro o no carga: así se rompió el historial en la v121).
- Todos los scripts de `index.html` se cargan juntos sin errores.
- Los datos: cada ingrediente de cada receta existe en `productos.json`, cada receta dice cuántos días aguanta en la nevera, los productos tienen envase, unidad y precio, los JSON de `data/` se leen y la versión es la misma en `base.js`, `index.html` y `sw.js`.

**`escenario-david.js`**: un mes entero de uso, día a día (noviembre de 2026).
David (31–50, entrena fuerza lunes y miércoles a las 19:00) y su hijo Lukas (6–9): Lukas está lunes y martes, los miércoles solo a cenar y fines de semana alternos (desde el viernes 6, llega a cenar); de lunes a viernes come en el cole. Táper de lunes a viernes, se cocina el fin de semana, cena cada día; solo, la cena se repite dos noches. Pedido del mes en Mercadona (CP 08784) + fresco cada martes. 300 €/mes. Postre: fruta a mediodía y, en la cena, fruta o yogur alternos. El menú del comedor de Lukas es el de verdad: el PDF de noviembre del cole, su página «Basal» (`fixtures/comedor-basal-nov.json`, los trozos de texto con su posición tal como los da pdf.js), leído con las funciones de «Menú del comedor» (`pdfMenus`, `parsePdfMenu`, `cEntry`).
Cada día: se abre la app (como `boot()`), se marca el fresco el día que llega, se cocina cada comida y cena, se hace lo que la app pide en «Lo que falta» y, si Hoy avisa de algo fresco que caduca, se toca «Ponerlo en el menú». Por el camino: el pedido llega el martes 3 y se guarda en bolsas, se sube el ticket del pedido, una cena fuera (viernes 13), Lukas viene un jueves extra solo a cenar (19), el presupuesto baja a 250 € (sábado 14), una cena se cambia a mano (18), una cena no se cocina (17) y el 24 se prepara diciembre.
Cada día se comprueba:
1. Lo pasado no cambia (días anteriores y lo cocinado) tras cualquier recálculo.
2. Lukas está en cada comida según la custodia, el cole y los cambios del día (calculado aparte, no con la app).
3. En las cenas con Lukas ningún plato se repite en la semana.
4. Las cenas repetidas solo: sin Lukas, no el día de su táper, como mucho 3 raciones, dentro de sus días de nevera.
5. Táper, repetidas y sobras se comen dentro de los días de nevera; el táper, solo de platos que aguantan una noche.
6. Nadie come algo que no puede (mirado también en los datos, no solo con la app).
7. Como mucho 3 platos de pasta y 3 de arroz a la semana, o la app lo avisa.
8. Despensa: nada en negativo, al cocinar baja justo lo de la receta, el pedido en bolsas y su ticket no cuentan doble.
9. Sobras: caducan el día de cocinado + días de nevera y nunca se ofrecen pasadas.
10. La cifra del mes en Hoy, lo pagado (tickets + a mano) y el presupuesto cuadran.
11. Avisos: como mucho 5 al día, nada entre las 22:00 y las 08:00, nada de lo ya hecho (planificar una semana planificada, descongelar algo ya cocinado).
12. Ninguna función de la app lanza un error (ni los que la app se traga con `console.error`).
13. Comedor: la cena con Lukas de un día de cole no comparte tipo de comida (legumbre, pasta, pescado…, según `recipeTypes`) con lo que comió en el cole (salvo lo elegido a mano).
14. Postre: en la cena (alterna) no se repite el tipo de postre del cole (yogur o lácteo en el cole → fruta; fruta → yogur).
15. Postre: la fruta y los yogures de cada día están en la compra de su semana y se descuentan de casa al comerlos (sin que falte).
16. Lo fresco que caduca (`js/caduca.js`): no se avisa de lo que los platos de antes de que caduque gastan entero, nada se pasa sin que Hoy lo haya avisado (el día antes o ese día; se perdona menos del 10 % de un envase) y «Ponerlo en el menú» lo pone en una comida de antes de que caduque.
Y además: lo elegido a mano se respeta, cada comida que se cocina tiene plato, lo que pide cada plato está en casa al cocinarlo (también el primer día, antes de la primera compra, y los lunes, que comen de la compra del martes anterior), rehacer el menú no cambia lo ya comprado y, si una cena no se cocinó, no se ofrece su táper.

**`casos.js`**: situaciones concretas que el azar del mes puede no pisar: descongelar para una cena repetida, Lukas que viene la noche de una cena repetida, el mismo ticket dos veces, guardar el pedido dos veces, el festivo del 8 de diciembre, cuándo caducan las sobras y además:
- el primer día, antes de la primera compra: «Aún no has comprado: usa lo que tengas» (y nada en la compra para ese día); si apuntas lo que tienes en casa, un plato que sale entero de eso;
- días ya comprados: «Rehacer esta semana», rehacerla entera y el menú del comedor no los cambian; «Cambiar plato» pone primero lo que sale de casa y, si eliges uno al que le falta algo, eso va a la próxima compra;
- «Cambiar plato › Con sobras»: se queda al recalcular (también las de la semana anterior), no se vuelve a comprar, se gasta al comerla, no se ofrece lo que ya tiene comida prevista ni lo pasado;
- alguien que «está siempre» (la abuela, que come el táper en casa) está en cada comida y cuenta en las raciones;
- los cambios de un día por comidas (`S.days[d].kids[id] = {comida, cena}`).

## Cómo funciona por dentro

`harness.js` carga los scripts de `index.html` en orden en un contexto `vm` de Node (comparten el ámbito global, como en el navegador) con:
- un reloj falso que se mueve a mano (`app.reloj("2026-11-03T20:30")`), con la hora de Madrid (`run.js` pone `TZ=Europe/Madrid`);
- `localStorage` en memoria, un DOM de mentira donde todo existe y no hace nada, `fetch` que no responde nunca (nada sale a la red) y sin service worker ni notificaciones;
- los datos de `data/` cargados como hace `boot()`; `Math.random` con semilla;
- `render()` y `showDialog()` no pintan nada (no hay pantalla).

`app.ev("código")` ejecuta cualquier cosa dentro de la app (`app.ev("shopping('2026-11').total")`).

## Límites

- No se pinta ninguna pantalla: se prueba la lógica (menú, compra, despensa, avisos, tickets), no el HTML ni los botones.
- El usuario simulado llama a las mismas funciones que los botones (por ejemplo `storePedido`, `markShopDone`, `setSlotRecipe`), copiando lo que hace cada pantalla; si una pantalla cambia lo que llama, hay que cambiarlo aquí.
- El ticket es texto (`fixtures/ticket-mercadona.txt`) y el menú del comedor son los trozos de texto ya sacados del PDF: no se prueba la lectura de fotos ni pdf.js.
- Precios y festivos son los de `data/` de hoy: si cambian, cambian los menús (las reglas deberían seguir cumpliéndose).

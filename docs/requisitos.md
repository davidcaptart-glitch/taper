# Requisitos pendientes de Táper

Lista viva de lo acordado para las próximas fases. La fase 1 (base, precios semanales, publicación) está hecha.

**Principio general: cuanto más personalizada, mejor.** La app aprende continuamente de los gustos,
preferencias, valoraciones e historial de cada persona y sugiere cosas hechas a su medida. Todo lo que
aprende se ve y se corrige en una pantalla "Lo que sé de ti" (por persona: adulto y niños), con:
- **Ingredientes que le gustan** y **que no le gustan** (y los que no puede comer por alergia o intolerancia).
- **Platos que le gustan** y **que no le gustan**, con el motivo cuando lo dio.
- De dónde sale cada dato: cuestionario inicial, valoración de un plato, o aprendido por la app
  (por ejemplo: "3 platos con champiñón valorados 👎").
- Cada elemento se puede mover de lista, borrar o añadir a mano; el siguiente menú ya lo tiene en cuenta.

## Fase 2: menú a tu medida

### Asistente de bienvenida (cada usuario, editable luego en Ajustes)
- **Aparatos**: horno, vitro o fogones, microondas, air fryer. Solo se proponen recetas que se puedan hacer;
  las recetas tendrán variantes por aparato cuando tenga sentido.
- **Código postal**: para usar los precios de su zona (ver "Precios por zona").
- **Quién come en casa**: adultos y, si los hay, cada hijo o hija con:
  - nombre y **edad** (la ración se calcula sola: 3–5 años ≈ 0,5; 6–9 ≈ 0,6; 10–13 ≈ 0,75; 14+ ≈ 1; editable),
  - **cuándo está**: siempre, semanas alternas (con un lunes de referencia), fines de semana alternos,
    días concretos de la semana, o "lo marco cada semana",
  - **sus gustos** (cuestionario propio y valoraciones propias).
  Con niños menores, se evitan platos picantes y se priorizan los que gustan a niños de su edad.
  Textos neutros ("con mis hijos", "con mi pareja"…), no "tu hijo".
- **Objetivos**: de 1 a 3, ordenados por prioridad (el primero manda si chocan):
  rendimiento deportivo, ganar músculo, adelgazar, comer sano y equilibrado, ahorrar, ir rápido.
  Si chocan (ganar músculo + adelgazar) se avisa y se aplica un término medio.
  Los niños siempre "comer sano", adaptado a su edad.
- **Peso** (opcional) para el objetivo de proteína (1,6–2 g/kg al día).
- **Entrenamiento**: si entrena; tipos (varios): fuerza/gimnasio, calistenia, correr, bici, natación,
  deportes de equipo, yoga/pilates, otro; semana habitual (días, mañana/tarde, tipo; hasta 2 sesiones al día).
  Es la plantilla que se propone cada vez que se planifica.
- **Planificación**: frecuencia (diaria, semanal, quincenal, mensual), día y hora del aviso.
  David: semanal, domingo por la tarde.
- **Compra**: por lista, frecuencia, online o en tienda, día de entrega.
- **Gustos**: cuestionario inicial de ingredientes y tipos de plato (me encanta / me gusta / no me gusta /
  no lo como por alergia o intolerancia), uno por cada persona (adulto y niños).

### Planificación
- Asistente de planificación (por defecto domingo 17:00):
  1. Entrenos de la semana (prerrellenado con la plantilla).
  2. Con quién se come y cena cada día: semanas con el hijo, festivos (nacionales, Cataluña y locales de
     Esparreguera; automáticos solo en semanas con él), días sueltos marcados a mano (comida, cena o ambas).
  3. Platos propuestos con 3 alternativas cada uno.
  4. Lista de la compra. 5. Confirmar.
- Solo comida y cena. Cada cena se cocina doble: la otra ración es el táper de la comida del día siguiente.
- Papel de cada comida según las sesiones de antes y después (energía, recuperación, ambas).
  Antes de correr nada pesado (etiqueta "digestiva/pesada" en recetas). Días dobles: proteína alta.
  Tentempié opcional como consejo en días dobles (no entra en el menú salvo que se pida).
- Sobre la marcha: "hoy me apetece otra cosa" (con lo que hay en casa), intercambiar días, "hoy no cocino".
- Las cenas anteriores a la entrega del pedido solo usan lo que ya hay en casa.

### La vida es variable (principio)
- Todo se puede cambiar en cualquier momento, desde el propio menú: quién come, si cocinas, comes fuera o
  tienes un plan, qué plato. La app recalcula tápers, compra y presupuesto.
- Semana tipo por día: comida y cena = cocino / táper / fuera / libre. Caprichos (p. ej. viernes pizza,
  fin de semana carbonara): cuentan para compra y presupuesto, no para objetivos.
- Si dejas de cocinar un plato: cocinar solo el táper, pasarlo al día siguiente o no cocinarlo.
- Cada hijo con su propio horario (uno siempre, otro fines de semana alternos…).

### Después de cada comida
- Se pregunta "¿qué tal?" hora y media después de la hora de cada comida: valoración por persona, o
  "me lo comí / comí fuera / comí otra cosa (cuál y qué tal) / no lo cociné" y, si no se cocinó, pasarlo a otro día.
- Horario de comida y cena configurable. Otras comidas (desayuno, media mañana, merienda, pre y post entreno,
  recena) con su hora. **Pendiente**: proponer opciones para esas comidas, con su compra y su proteína.

### Después de cada entreno
- Cada sesión guarda su hora (semana habitual y planificación). Antes o después de comer se deduce de la hora.
- Una hora después se pregunta "¿Hiciste X a las HH:MM?": sí / no / otra cosa. También se puede añadir un
  entreno no previsto desde "Cambiar este día". La app recalcula lo que necesitan las comidas que quedan y,
  si alguna ya no encaja, propone cambiarla.

### Tras cocinar un plato
- Además de la valoración: "¿Fue fácil de cocinar?" (fácil / normal / complicado: lo complicado sale menos) y
  "¿Lo repetirías?" (a menudo / de vez en cuando / no quiero repetirlo: no vuelve a salir).

### Gustos y aprendizaje
- Valorar cada plato al día siguiente (👍 / 👎 / "bien, pero no a menudo"), por separado tú y el niño.
- "No me gusta" con motivo: ingrediente concreto, preparación, pesado, sabor, mucho trabajo, texto libre.
- Ingredientes vetados. El aprendizaje baja o sube recetas por ingrediente y tipo.
- Historial: qué se cocinó, cuándo, para quién y cómo se valoró. "Más como esto".
- Favoritas con variedad (no dos semanas seguidas).

### Recetas
- Catálogo grande y variado. Primera tanda: 120 recetas (lista aprobada en `docs/recetas-propuestas.md`).
  Segunda tanda: ~100 más (objetivo ~220), y seguir ampliando con el tiempo según los gustos.
- Reglas: máx. 30 min en total y 15 de trabajo, máx. 6 ingredientes (sin contar aceite, sal y especias),
  con calorías, proteína, hidratos y grasa por ración, variantes por aparato, y cuánto aguanta en la nevera
  y si se puede congelar.
- Catálogo de productos de Mercadona, con ingredientes compartidos entre recetas.
- **Modo cocina paso a paso**: pantalla grande con un paso cada vez, temporizadores detectados en el texto
  ("10 min") y pantalla siempre encendida mientras cocinas.

### Cambiar un plato
- Al cambiar un plato, las sugerencias van primero con **lo que ya tienes comprado** (compras marcadas y lo
  que sobra en despensa y congelador), con la etiqueta "Tienes todo" o "Te falta: X, Y".
- Si eliges uno al que le falta algo, lo dice y permite añadirlo a la lista de la compra.

### Cuándo cocinas (en el asistente de bienvenida y editable)
- **Cada día**: como ahora, cada cena se cocina doble y la otra ración es el táper.
- **Todo en un día** (batch cooking, por ejemplo el domingo): la app elige platos que aguanten en la nevera
  los días necesarios (o se congelan y se pasan a la nevera a tiempo), y crea una **sesión de cocina** con los
  platos ordenados para aprovechar el tiempo (horno primero, mientras tanto la vitro…), y cuántos tápers
  salen de cada plato y para qué día.
- **En varios días** (por ejemplo domingo y miércoles): igual, en dos sesiones.
- Lo que no aguanta (pescado, huevo) se coloca en los primeros días tras cocinar o se cocina al momento.

### Compra y presupuesto
- Presupuesto mensual y semanal (semanal propio o mensual / semanas). Gasto real apuntado tras cada compra,
  comparado con lo previsto. Aviso si se pasa, con propuestas para abaratar.
- Compra mensual (despensa, carne para congelar, congelados) + semanal (fresco).
- Cada lista se marca "online" o "en tienda". Online: pedido mínimo (50 € según prensa de 2025) y envío
  (8,20 €), editables; si no se llega al mínimo, propone completar adelantando despensa del mes.
- La lista descuenta lo que ya hay en casa (congelador y despensa).

## Fase 3: congelador y notificaciones
- Fresco o congelado: compara precio por kg y aconseja; guía para repartir y etiquetar bolsas.
- Inventario de congelador (fecha, raciones), aviso a los 3 meses, plan B si se olvida descongelar.
- Notificaciones (Web Push con una tarea de GitHub como "despertador"; la app decide qué mostrar con los
  datos del móvil). Hora y activación configurables:
  descongelar (21:30), qué cocinar hoy (18:30), valorar el plato de ayer (14:00), planificar (según usuario),
  subidas de precio (domingo), presupuesto, congelador. Varios usuarios: una suscripción por móvil.

## Precios por zona
- Variable `CODIGOS_POSTALES` (lista). El script consulta una vez por almacén y guarda
  `data/precios/<almacén>.json` y un índice código postal -> almacén. `data/precios.json` sigue siendo la zona
  de David (3850) para no perder historial.
- Código postal sin zona todavía: precios de una zona cercana con aviso.

## Fase 4: amigos
- Que la app aprenda también de los gustos de amigos. Decidir entre compartir por archivo o enlace (privado,
  manual) o una base de datos gratuita con envío anónimo y voluntario (automático).

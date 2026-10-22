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

### Núcleo familiar
- Cualquier familia: pareja, hijos, otros familiares, compañeros de piso. Cada miembro: nombre, adulto o
  niño (edad), cuándo come en casa, ración (pequeña/normal/grande o por edad), si se lleva táper, y sus propios
  objetivos, entreno, gustos, historial y calendario.
- El menú combina a quien come cada día: gustos y alergias de todos, objetivos de los adultos (los tuyos pesan
  más), entrenos de quien entrena y la ración de cada uno.

### Presupuesto realista
- Siempre se intenta acercarse al máximo: si una semana se pasa, se cambian los platos más caros por otros
  más baratos que sigan encajando.
- Si aun así no llega, se pregunta qué sacrificar: menos pescado y carne, raciones más ajustadas, repetir más
  platos, menos peso a los gustos, compra semanal en tienda (sin envío) o subir el presupuesto a lo que cuesta.
  Se puede dejar decidido en el asistente.

### Resumen del mes
- Al final de cada mes: previsto frente a gastado de verdad, por qué se desvió (envíos, caprichos, semanas que
  no llegaban, envases enteros, compras fuera de lista), proteína, entrenos y comidas fuera. Propone un
  presupuesto realista o medidas para mantener el actual, con botones para aplicarlo.

### Supermercados
- Lista estática en `data/supermercados.json`: Mercadona activo; "próximamente" los que tienen tienda online de
  alimentación con catálogo y precios por zona (Carrefour, DIA, Alcampo, Eroski, Consum, Bonpreu/Esclat,
  Caprabo, Condis, El Corte Inglés/Hipercor, Ahorramas); "difícil" Lidl y Aldi (sin tienda online de
  alimentación: solo tickets). Cada uno hay que comprobarlo al añadirlo.
- Lista de la compra por secciones del supermercado, en el orden de recorrido de la tienda.

### Compartir, usuarios y sugerencias
- Hecho: QR y enlace para compartir desde Perfil. La app se actualiza sola y enseña las novedades.
- Hecho: contador anónimo con GoatCounter (https://taper-david.goatcounter.com, sin cookies, desactivable),
  botón "Enviar sugerencia" (formulario de Google con aviso por correo) y encuesta mensual dentro de la app
  (estrellas, lo que más y menos gusta, cuánto pagaría: 1-3 / 4-6 / 7-9 €). Configuración en `data/config.json`.

### Recetas sugeridas por los usuarios (hecho)
- Botón "Sugerir una receta" (Recetas y Perfil): solo el nombre es obligatorio; detalles opcionales. Se envía al
  formulario de sugerencias como "Receta nueva" con un código (R-XXXX) y se guarda en "Mis recetas sugeridas".
- Para aprobarla: David pasa el código; se añade a `data/recetas.json` con `"sugerida": "R-XXXX"` (y `"autor"` si
  se quiere). Al abrir la app, quien la sugirió recibe "¡Tu receta ya está en Táper!" (y notificación si las
  tiene activadas) y queda como favorita. Las recetas de la comunidad llevan 💡 y su propio filtro.

### Escanear tickets (hecho)
- Leer el ticket digital de Mercadona (PDF) o una foto del de papel (reconocimiento de texto en el móvil).
- Lo que no es comida (limpieza, droguería, higiene, mascotas, hogar…) se descarta directamente del gasto y de
  los cálculos; se reconoce por la sección de Mercadona de cada producto.
- Apuntar el gasto real, relacionar cada línea con los productos, ver en qué se va el dinero (por pasillo, por
  tipo, fuera de la lista), actualizar precios reales y marcar como comprado. Se usa en el resumen del mes.

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
- Cada hijo con su propio horario (uno siempre, otro fines de semana alternos…). Turnos alternos con día del
  cambio, comida de llegada y de salida (p. ej. Lukas: de viernes cena a jueves cena); presencia comida a comida.

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
- Cada lista se marca online, en tienda con entrega a domicilio o en tienda. Las tarifas las pone la app según
  el supermercado (`data/supermercados.json`; Mercadona 2026: online 8,20 € y mínimo 60 €; en tienda con entrega
  6,50 € sin mínimo); si no se llega al mínimo, propone completar adelantando despensa del mes.
- La lista descuenta lo que ya hay en casa (congelador y despensa).

## Fase 3: congelador y notificaciones
- Fresco o congelado: compara precio por kg y aconseja; guía para repartir y etiquetar bolsas.
- Inventario de congelador (fecha, raciones), aviso a los 3 meses, plan B si se olvida descongelar.
- Notificaciones (Web Push con una tarea de GitHub como "despertador"; la app decide qué mostrar con los
  datos del móvil). Hora y activación configurables:
  descongelar (21:30), qué cocinar hoy (18:30), valorar el plato de ayer (14:00), planificar (según usuario),
  subidas de precio (domingo), presupuesto, congelador. Varios usuarios: una suscripción por móvil.

### Inicio del plan (hecho)
- Fecha de inicio en "¿Cuándo planificas?". Antes de esa fecha no hay menú ni compra: "Mientras, gasta lo que
  tienes" pregunta qué hay en casa y propone recetas, primero las que no necesitan comprar nada.

### Diseño (hecho, versión 13)
- Geist, un solo acento, grises cálidos, tarjetas sin bordes, barra inferior con iconos e indicador animado,
  transiciones entre pestañas, hojas que suben desde abajo, Perfil en apartados desplegables.

### Notificaciones (hecho, Cloudflare)
- Servidor `avisos/` (Cloudflare Worker `taper-avisos`, https://taper-avisos.taper-david.workers.dev): cada móvil
  manda sus próximos avisos (descongelar, cocinar hoy, ¿qué tal?, ¿entrenaste?, planificar, congelador); cada
  10 minutos el servidor despierta a los que tienen avisos y el móvil los muestra. Push sin contenido firmado
  con VAPID (la clave privada es un secreto del Worker). Desplegar: `cd avisos && npx wrangler@3 deploy`.

### Invitaciones y coins (hecho, mismo servidor)
- QR personal (`?ref=U-XXXX`). Coins: compartir +1 (máx. 3/día), alguien empieza a usarla con tu invitación +10,
  cada semana que la usa +2, tu uso semanal +1, bienvenida al invitado +5. Pendiente: en qué se gastan.
- Panel de David: `/admin?clave=…` (clave guardada como secreto ADMIN_KEY).

### Imágenes (hecho, parcial)
- Foto de cada producto (tienda de Mercadona), collage de ingredientes por plato y foto propia del plato
  (solo en el móvil). Pendiente: fotos reales de los 220 platos.

### Notificaciones: opciones (decidido: A)
Una app web sin servidor no puede programar avisos en el móvil. Opciones:
- **A. Recomendada: un pequeño servidor gratuito (Cloudflare Workers).** Cada móvil se apunta a los avisos y
  envía sus próximos avisos con hora y texto (descongelar, qué cocinar, ¿qué tal?, ¿entrenaste?, planificar,
  subidas de precio). El servidor los manda a su hora como notificación de Táper, para todos los usuarios.
  Gratis para este uso. Necesita que David cree una cuenta de Cloudflare; el resto lo monta Claude.
  Privacidad: en el servidor solo quedan la suscripción del móvil y los textos de los próximos avisos.
- **B. Sin servidor: recordatorios en el calendario del móvil.** La app genera un archivo de calendario con
  los avisos de la semana (descongelar, cocinar, planificar) y el móvil avisa con sus alarmas. Muy fiable, pero
  hay que volver a añadirlo si cambia el plan, y no sirve para preguntas como "¿qué tal la cena?".
- Ya funciona sin nada de esto: los avisos y preguntas dentro de la app al abrirla.

## Precios por zona
- Variable `CODIGOS_POSTALES` (lista). El script consulta una vez por almacén y guarda
  `data/precios/<almacén>.json` y un índice código postal -> almacén. `data/precios.json` sigue siendo la zona
  de David (3850) para no perder historial.
- Código postal sin zona todavía: precios de una zona cercana con aviso.

## Fase 4: amigos
- Que la app aprenda también de los gustos de amigos. Decidir entre compartir por archivo o enlace (privado,
  manual) o una base de datos gratuita con envío anónimo y voluntario (automático).

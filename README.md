# Táper

App personal para planificar el menú semanal, hacer la lista de la compra y seguir los precios de Mercadona.
Se instala en el móvil desde el navegador y funciona sin conexión. Tus datos (menús, ajustes, valoraciones)
se guardan solo en tu móvil: usa **Ajustes > Copia de seguridad** de vez en cuando.

## Qué hay en cada carpeta

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `css/`, `js/` | La app (`js/plan.js` es el planificador, `js/compra.js` la compra, `js/gustos.js` lo que aprende) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Para instalarla en Android y usarla sin conexión |
| `data/productos.json` | Productos, con su id de Mercadona |
| `data/recetas.json` | Recetas: variantes por aparato, nutrición y cuánto aguantan |
| `data/festivos.json` | Festivos de Cataluña y locales |
| `docs/` | Requisitos acordados y lista de recetas |
| `data/precios.json` | Precios de Mercadona. Lo actualiza GitHub solo cada domingo |
| `scripts/actualizar_precios.py` | El programa que consulta los precios |
| `.github/workflows/precios.yml` | La tarea programada de GitHub que lanza ese programa |

---

# Guía: publicar la app paso a paso

No hace falta saber programar. Tardarás unos 20 minutos la primera vez.

## Paso 1. Crear la cuenta de GitHub

1. Entra en **https://github.com/signup**.
2. Escribe tu correo, una contraseña y un **nombre de usuario**.
   Elígelo con cuidado: formará parte de la dirección de tu app (`https://TU-USUARIO.github.io/taper/`).
3. Resuelve la verificación y escribe el código que te llega por correo.
4. Si te pregunta por un plan, elige **Free** (gratis).

## Paso 2. Instalar GitHub Desktop

Es un programa con botones para subir los archivos sin usar comandos.

1. Descárgalo de **https://desktop.github.com** e instálalo.
2. Ábrelo y pulsa **Sign in to GitHub.com**. Se abrirá el navegador: autoriza y vuelve al programa.
3. Si te pide nombre y correo para los cambios ("Configure Git"), deja los que propone y pulsa **Finish**.

## Paso 3. Crear el repositorio y subir la app

La carpeta ya está preparada como repositorio, con la primera versión guardada.

1. En GitHub Desktop: menú **File > Add local repository…**
2. Pulsa **Choose…**, selecciona la carpeta `C:\Proyectos\Taper` y pulsa **Add repository**.
3. Arriba pulsa **Publish repository**:
   - **Name**: `taper` (en minúsculas, sin tilde)
   - **Desmarca** la casilla *Keep this code private* (GitHub Pages gratis solo funciona con repositorios públicos;
     tus datos personales no se suben, se quedan en tu móvil).
   - Pulsa **Publish repository**.

## Paso 4. Guardar tu código postal

1. En el navegador, entra en `https://github.com/TU-USUARIO/taper`.
2. Pestaña **Settings** (la del engranaje, arriba a la derecha).
3. En el menú de la izquierda: **Secrets and variables > Actions**.
4. Pestaña **Variables** > botón **New repository variable**.
   - **Name**: `CODIGO_POSTAL`
   - **Value**: `08784`
   - Pulsa **Add variable**.

## Paso 5. Activar GitHub Pages

1. Sigue en **Settings**. En el menú de la izquierda, pulsa **Pages**.
2. En **Build and deployment > Source**, elige **Deploy from a branch**.
3. En **Branch**, elige **main** y al lado **/ (root)**. Pulsa **Save**.
4. Espera uno o dos minutos y recarga la página. Arriba aparecerá:
   *"Your site is live at `https://TU-USUARIO.github.io/taper/`"*. Esa es la dirección de tu app.

## Paso 6. Descargar los precios por primera vez

1. Pestaña **Actions** del repositorio.
2. A la izquierda, pulsa **Actualizar precios**.
3. A la derecha, botón **Run workflow** > **Run workflow** (el verde).
4. Espera 2 o 3 minutos. Si sale un círculo verde ✅, ya está.
   Si sale una ✖ roja, pulsa sobre ella, copia lo que pone y pídeme ayuda.

A partir de ahora se ejecutará sola **cada domingo a las 05:00**.

## Paso 7. Instalar la app en tu Android

1. Abre **Chrome** en el móvil y entra en `https://TU-USUARIO.github.io/taper/`.
2. Pulsa el menú **⋮** (arriba a la derecha) > **Instalar aplicación** (o *Añadir a pantalla de inicio*).
3. Ya tienes el icono de Táper. Funciona aunque no tengas conexión.

---

## Cómo subir cambios más adelante

Cuando cambiemos algo de la app:

1. Abre GitHub Desktop.
2. **Primero** pulsa **Fetch origin** y, si aparece, **Pull origin**.
   (GitHub guarda los precios nuevos cada domingo; así traes esos cambios antes de subir los tuyos.)
3. Escribe un resumen en **Summary**, pulsa **Commit to main** y luego **Push origin**.
4. En uno o dos minutos la app estará actualizada. En el móvil, ciérrala y vuelve a abrirla.

## Añadir la zona de precios de un amigo

Cuando alguien pulse "Pedir mi zona" en la app, te llegará al formulario de sugerencias un mensaje
"AÑADIR CÓDIGO POSTAL: 28001". Para añadirlo:

1. Abre `https://github.com/davidcaptart-glitch/taper/settings/variables/actions`.
2. Edita la variable **CODIGOS_POSTALES** y añade el código al final, separado por una coma: `08784,28001`.
   El primero (el tuyo) es la zona principal.
3. El domingo siguiente se descargarán sus precios (o lánzalo a mano en Actions > Actualizar precios).
   Cada zona nueva añade unos 4 minutos a la tarea.

## Si algo falla

- **La app dice "Precios estimados"**: aún no se ha ejecutado el paso 6, o ha fallado. Mira la pestaña Actions.
- **Algún producto no actualiza su precio**: abre `data/precios.json` en GitHub y busca `registro` al final:
  ahí se apunta qué producto falló y por qué (por ejemplo, Mercadona ha retirado ese id).
- **La tarea del domingo deja de ejecutarse**: GitHub desactiva las tareas de repositorios sin actividad
  durante 60 días. Como la tarea guarda los precios cada semana, no debería pasar; si pasa, en Actions
  saldrá un botón para volver a activarla.

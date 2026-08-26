# Zalent — Manual de uso

**Gestor de CVs y talento con IA, que funciona en tu propio ordenador.**

Zalent te ayuda a guardar cientos de currículums, encontrar al candidato que
buscas escribiendo con tus palabras, y saber quién encaja mejor en cada oferta.
Todo ocurre **dentro de tu equipo**: los CVs no se suben a ningún sitio.

> Un producto de **CocoBrain**. Olaz, el coco con cerebro, es quien te acompaña
> por la app.

---

## Índice

1. [Instalar Zalent](#1-instalar-zalent)
2. [El primer arranque](#2-el-primer-arranque)
3. [La contraseña maestra — léelo antes de ponerla](#3-la-contraseña-maestra--léelo-antes-de-ponerla)
4. [Importar currículums](#4-importar-currículums)
5. [Buscar candidatos](#5-buscar-candidatos)
6. [La ficha de un candidato](#6-la-ficha-de-un-candidato)
7. [Ofertas de empleo (Vacantes)](#7-ofertas-de-empleo-vacantes)
8. [El Pipeline](#8-el-pipeline)
9. [Etiquetas y filtros](#9-etiquetas-y-filtros)
10. [Que aprenda de ti](#10-que-aprenda-de-ti)
11. [El Panel](#11-el-panel)
12. [Ajustes](#12-ajustes)
13. [Protección de datos (RGPD)](#13-protección-de-datos-rgpd)
14. [Problemas frecuentes](#14-problemas-frecuentes)
15. [Qué NO hace Zalent todavía](#15-qué-no-hace-zalent-todavía)

---

## 1. Instalar Zalent

**Qué necesitas:** un ordenador con Windows de 64 bits. Nada más — ni cuenta, ni
suscripción, ni conexión a internet para el uso normal.

1. Ejecuta `Zalent_0.1.4_x64-setup.exe`.
2. **Windows te mostrará un aviso azul** que dice *"Windows protegió tu PC"*.
   Es normal y no significa que haya un virus: aparece con **cualquier** programa
   que no haya pagado un certificado de firma digital (unos 300 € al año). Pulsa
   **"Más información"** y luego **"Ejecutar de todas formas"**.
3. Se instala solo, sin pedirte permisos de administrador.

Para actualizar a una versión nueva, ejecuta el instalador nuevo encima. **No
perderás tus datos.** Eso sí: cierra Zalent antes, o el instalador dará error
al no poder reemplazar un archivo en uso.

---

## 2. El primer arranque

La primera vez, Olaz te da la bienvenida y te explica en unos pasos qué puedes
hacer. Al terminar te deja directamente en **Importar**, que es por donde se
empieza.

A la izquierda tienes el menú, siempre visible:

| Sección | Para qué sirve |
|---|---|
| **Candidatos** | La lista de todo tu talento. Buscar, ver fichas, editar. |
| **Importar** | Meter CVs nuevos en Zalent. |
| **Vacantes** | Tus ofertas de empleo y quién está en cada una. |
| **Pipeline** | En qué fase está cada candidato de una oferta. |
| **Panel** | Números y salud de tus datos, de un vistazo. |
| **Ajustes** | Seguridad, privacidad, sonido, apariencia y borrado. |

---

## 3. La contraseña maestra — léelo antes de ponerla

Ve a **Ajustes → Seguridad** y ponla **antes de meter CVs reales**.

**Qué hace:** cifra los currículums guardados y, si lo activas, también la base
de datos entera. Sin ella, los archivos quedan **legibles** para cualquiera que
tenga acceso a tu ordenador o a una copia de seguridad.

> ### ⚠️ No hay forma de recuperarla
>
> La contraseña **es** la llave con la que se cifran tus datos. No se guarda en
> ninguna parte, ni en tu equipo ni en ningún servidor. Eso es lo que hace que
> nadie pueda espiar tus datos… y también significa que **si la olvidas, nadie
> puede devolvértela y los datos son irrecuperables**. Ni tú, ni CocoBrain, ni
> nadie.
>
> Guárdala como guardarías la llave de una caja fuerte.

Cuando la tengas puesta, Zalent te la pedirá cada vez que la abras.

**Para quitarla:** desde la misma pantalla. Zalent descifra tus datos
automáticamente antes de eliminarla, para que nunca te quedes con archivos que
no se puedan abrir.

---

## 4. Importar currículums

Tres formas, en la pantalla **Importar**:

- **Arrastrar CVs** a la zona grande (puedes soltar muchos a la vez).
- **Importar una carpeta entera**, con el botón de abajo.
- **Importar uno y revisar**, si prefieres comprobar los datos antes de guardar.

Formatos admitidos: **PDF** y **Word moderno (.docx)**. El Word antiguo (`.doc`)
no está soportado.

### CVs escaneados
Si un PDF es en realidad una foto (un CV escaneado), Zalent lo detecta y aplica
**reconocimiento de texto** automáticamente. Tarda un poco más y el resultado es
menos exacto — conviene revisar esas fichas.

### Rellenar con IA (opcional)
Hay una casilla **"Rellenar con IA"**. Sirve para que un modelo de inteligencia
artificial saque el **puesto, los estudios y las habilidades**, que es donde las
reglas automáticas se quedan cortas.

- **Es opcional y viene apagada.**
- **Funciona en tu ordenador**, sin enviar nada a internet.
- **La primera vez hay que descargar el modelo: unos 4,7 GB.** Es la única vez
  que Zalent necesita conexión. Después funciona sin internet para siempre.
- **Es lenta**: unos 30-40 segundos por CV. Para 200 CVs son horas. Sin la IA,
  esos mismos 200 CVs entran en un par de minutos.

Consejo: importa primero sin IA para tenerlos dentro, y usa la IA cuando tengas
tiempo o para lotes pequeños importantes.

### Si un CV se lee mal
Zalent te avisa cuando un currículum ha quedado pobre (apenas texto, o texto
"fragmentado" porque la plantilla tenía las letras muy separadas). Es importante
hacerle caso: **si el texto no se extrajo, la búsqueda no encontrará a esa
persona**, aunque el dato esté en su CV. Puedes completar la ficha a mano.

---

## 5. Buscar candidatos

En **Candidatos**, arriba, tienes la barra de búsqueda. Escribe **como
hablarías**, no con palabras sueltas:

> *"gente con experiencia en atención al cliente y algo de inglés"*

Zalent busca **por significado**, no solo por coincidencia exacta. Encuentra a
alguien que puso "trato con el público" aunque tú hayas escrito "atención al
cliente". Y además resalta **el trozo del CV** por el que lo ha elegido, para
que puedas comprobarlo en un vistazo.

También funciona la búsqueda directa: si escribes el nombre de una empresa o de
una persona, aparecerá.

---

## 6. La ficha de un candidato

Pulsa sobre cualquier candidato para abrir su ficha.

- **Editar** cualquier dato (todo lo automático es corregible).
- **Ver el CV original**, tal y como llegó.
- **Notas** con fecha y hora: el historial de lo que ha pasado con esa persona.
- **Etiquetas** para clasificarlo a tu manera.
- **Asignarlo a una oferta**.
- **👍 / 👎** para enseñarle a Zalent qué perfiles te gustan.
- **🖨 Dossier PDF**: genera un documento presentable para enseñar a un cliente
  o a tu jefe.

### Asistente IA
Si tienes el modelo descargado, la ficha ofrece tres ayudas:

| Ayuda | Qué te da |
|---|---|
| **Resumen del perfil** | Un párrafo con lo esencial de la persona. |
| **Preguntas de entrevista** | Preguntas concretas basadas en su CV. |
| **Email de rechazo** | Un borrador educado (menciona la oferta si está en una). |

**Todo lo que genera es un borrador para que lo revises**, nunca un dato que se
guarde solo. Léelo antes de usarlo: el modelo a veces altera un nombre propio o
un idioma.

---

## 7. Ofertas de empleo (Vacantes)

Crea una oferta con su título y su descripción, y pega el texto de la vacante.

Lo potente: **Zalent puntúa a toda tu base de candidatos contra esa oferta** y
te explica por qué encaja cada uno y qué le falta. En lugar de leer 200 CVs,
miras los 10 primeros.

Un mismo candidato puede estar en **varias ofertas a la vez** sin duplicarse.

> **Importante:** borrar una oferta **nunca** borra a los candidatos ni sus CVs.
> Solo deshace la asociación. Tu almacén de talento es único y siempre queda.

---

## 8. El Pipeline

El seguimiento de un proceso de selección, en columnas, **por oferta**:

**Nuevo → Entrevista → Oferta enviada → Descartado**

Arrastra las tarjetas de una columna a otra según avance el proceso. Cada
oferta tiene su propio pipeline: la misma persona puede estar en "Entrevista"
para un puesto y en "Nuevo" para otro.

---

## 9. Etiquetas y filtros

Las etiquetas son **libres**: tú decides. No hay listas cerradas ni categorías
impuestas, porque Zalent sirve igual para una funeraria que para una empresa de
software.

Ejemplos: `carnet B`, `disponibilidad inmediata`, `turno noche`, `bilingüe`.

Puedes filtrar la lista de candidatos por ellas. Y en **Importar** hay un botón
de **clasificación automática** que propone etiquetas para los CVs que aún no
tienen ninguna.

---

## 10. Que aprenda de ti

Cada vez que pulsas **👍** o **👎** en un candidato, Zalent ajusta su forma de
ordenar los resultados hacia lo que a ti te gusta. No hace falta configurar
nada: úsalo y mejora.

Si quieres empezar de cero: **Ajustes → Búsqueda e IA → Olvidar mis
preferencias**.

---

## 11. El Panel

Un resumen de tu base de talento: cuántos candidatos tienes, cómo se reparten
por **fases del pipeline**, y la **calidad de tus datos** (cuántas fichas están
incompletas). Útil para detectar de un vistazo que hay 40 CVs sin clasificar o
sin correo electrónico.

---

## 12. Ajustes

| Sección | Qué encuentras |
|---|---|
| **Privacidad** | Confirmación de qué sale de tu equipo (nada) y avisos si quedan copias sin cifrar. |
| **Seguridad** | Contraseña maestra, cifrado de los CVs y de la base de datos, limpieza de archivos sobrantes. |
| **Búsqueda e IA** | Reconstruir el índice de búsqueda; olvidar tus preferencias aprendidas. |
| **Datos** | Espacio ocupado y **borrado total**. |
| **Apariencia** | Tema claro, oscuro o el del sistema. Volver a ver la introducción. |
| **Sonido** | Avisos sonoros. Vienen **apagados**; tres niveles (silencio / solo lo importante / todo). |
| **Acerca de** | Versión y créditos. |

### Cifrar la base de datos
En **Seguridad**, si tienes contraseña maestra, puedes cifrar la base entera.
El proceso es seguro: hace una copia, cifra en un archivo nuevo, **comprueba que
no falta nada** y solo entonces reemplaza el original. Puede tardar unos
segundos. Es reversible.

---

## 13. Protección de datos (RGPD)

Un currículum es un **dato personal**, y la ley europea da derechos a esa
persona. Zalent trae las herramientas para cumplirlos:

- **Derecho de supresión ("derecho al olvido")**: al borrar un candidato se
  elimina de verdad — su ficha, sus notas, sus etiquetas y **el archivo del CV**.
  No hay papelera de la que rescatarlo.
- **Anonimizar**: borra los datos identificativos pero conserva la información
  agregada, si necesitas estadísticas sin guardar a la persona.
- **Borrado total**: en Ajustes → Datos, deja Zalent como recién instalado.
- **Portabilidad**: exportación a CSV.
- **Todo local**: no hay terceros implicados, así que no necesitas contratos de
  encargado de tratamiento con nadie.

> **Recomendación:** activa la contraseña maestra antes de trabajar con CVs
> reales. Y recuerda que los currículums no se guardan para siempre: informa a
> los candidatos y borra lo que ya no necesites.

---

## 14. Problemas frecuentes

**Windows dice que protegió mi PC.**
Normal: la app no está firmada digitalmente. "Más información" → "Ejecutar de
todas formas". (Ver punto 1.)

**El instalador da error de archivo en uso.**
Zalent o su motor de IA siguen abiertos. Cierra la app y vuelve a intentarlo.

**Busco a alguien que sé que está y no aparece.**
Casi siempre es que **su CV no se leyó bien** al importarlo (escaneado, o
plantilla con letras espaciadas). Abre su ficha y mira el texto extraído. La
solución es completar la ficha a mano.

**La importación con IA va lentísima.**
Es esperable: 30-40 segundos por CV, porque el modelo funciona en tu procesador
y no en la nube. Desactiva la casilla si tienes prisa.

**No me deja usar la IA.**
Hace falta descargar el modelo una vez (4,7 GB) desde la pantalla Importar. Es
el único momento en que Zalent necesita internet.

**He olvidado la contraseña maestra.**
No hay solución. Los datos cifrados no se pueden recuperar (ver punto 3).

---

## 15. Qué NO hace Zalent todavía

Por honestidad, para que sepas dónde están los límites:

- **No es multiusuario.** Cada persona tiene su propia base de datos en su
  equipo. Dos personas no comparten candidatos.
- **No sincroniza entre ordenadores.** Es deliberado: los datos no salen de tu
  máquina.
- **No se actualiza sola.** Cada versión nueva se instala a mano.
- **Solo Windows** por ahora.
- **El Word antiguo (`.doc`) no está soportado.** Solo `.docx` y PDF.
- **Las tarjetas del Pipeline se mueven solo con el ratón**, todavía no con el
  teclado.

---

_Zalent · versión 0.1.4 · un producto de CocoBrain_

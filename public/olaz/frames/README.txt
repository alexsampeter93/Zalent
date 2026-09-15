FRAMES DE OLAZ ANIMADO
======================

Suelta aquí los frames numerados de cada animación de Olaz.

NOMBRES
-------
<nombre>-01.png, <nombre>-02.png, ... <nombre>-NN.png
(numeración de dos dígitos, empezando en 01)

Ejemplos:
  olaz-wave-01.png ... olaz-wave-08.png   (Olaz saludando, 8 frames)
  olaz-peek-01.png ... olaz-peek-06.png   (Olaz asomando, 6 frames)

ESPECIFICACIONES
----------------
- Lienzo CUADRADO y del MISMO tamaño en todos los frames (p.ej. 512x512).
- Fondo TRANSPARENTE (PNG con alfa).
- Olaz REGISTRADO igual en cada frame (que no "salte" el centro,
  salvo que ese desplazamiento sea parte del efecto).
- 6-12 frames bastan para un bucle suave.

CÓMO SE USA EN LA APP
---------------------
Con el componente <OlazSprite name="olaz-wave" frames={8} fps={10} />.

# Carrusel EVA: "Cómo funciona EVA" (8 slides animadas)

Carrusel para Instagram, 8 videos de 1080×1350 (4:5), 6 s cada uno, 60 fps, sin música
(con pista de audio silenciosa para compatibilidad). Fondo claro, logo EVA negro.

| # | Slide | Qué anima |
|---|---|---|
| 1 | Portada · "Tu coaching, en una sola app." | Logo EVA ensamblándose + 4 módulos orbitando |
| 2 | Paso 01 · Tu marca | Cambio de color de marca en vivo sobre la app del alumno |
| 3 | Paso 02 · Alumnos | Código de coach decodificándose + alumnos uniéndose |
| 4 | Paso 03 · Rutinas | Bloques aterrizando en el tablero + prescripción y doble progresión |
| 5 | Paso 04 · Nutrición | Anillo de macros, kcal contando, comidas del día |
| 6 | Paso 05 · Entrenamiento | Series marcándose, timer de descanso, récord personal |
| 7 | Paso 06 · Progreso | Adherencia semanal + insignias reales de la app |
| 8 | CTA · "Prueba EVA gratis." | Fondo cian, botón y logo final |

Una línea con un punto brillante recorre el borde inferior y "cruza" de una slide a la siguiente
al deslizar. El progreso N/8 del encabezado se llena durante cada slide.

## Render

```bash
cd tools/promo-video/carousel
ln -s ../node_modules node_modules   # o npm install playwright
FFMPEG=/ruta/a/ffmpeg ./batch.sh      # -> out/eva_carrusel_01..08.mp4
# un fotograma suelto:  PAGE="carousel.html?s=4" W=1080 H=1350 node render.mjs stills 3
```

`carousel.html?s=N` elige la slide; `render(t)` es determinista (mismo motor que el video).

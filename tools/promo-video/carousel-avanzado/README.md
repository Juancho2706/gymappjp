# Carrusel EVA "Nivel avanzado": 2 funciones difíciles, paso a paso

8 slides animadas de 1080×1350 (4:5), 6 s cada una, 60 fps, sin música (pista silenciosa para
compatibilidad). Diseño oscuro tipo instrumento; logo EVA (figura + "EVA" en blanco) siempre visible.
Un electrocardiograma continuo recorre el borde inferior y empalma de una slide a la siguiente.

| # | Capítulo | Slide | Datos reales usados |
|---|---|---|---|
| 1 | — | Lo difícil, hecho fácil | — |
| 2 | A · Fuerza | Doble progresión: el concepto | Rango 8–12 reps; al completar el tope sube +2,5 kg |
| 3 | A · Fuerza | Actívala en 3 toques | Campos del `BlockEditSheet`: Reps, «¿Cómo sube el peso?» → «Al completar las reps», incremento |
| 4 | A · Fuerza | EVA lleva la cuenta | Semanas S1–S4: 80 kg hasta 12·12·12, luego 82,5 kg |
| 5 | B · Cardio | Zonas de FC a su medida | `packages/cardio/zones.ts`: Tanaka 208 − 0,7·edad; Karvonen; Z1 50–60 % … Z5 90–100 % (30 años, FC reposo 60 → Z4 162–174 bpm) |
| 6 | B · Cardio | Un HIIT en un toque | `INTERVAL_TEMPLATES`: 8×400m @ Z4 = 10 min calent. + 8×400 m + 90 s recup. + 5 min vuelta a la calma |
| 7 | B · Cardio | Tu alumno sigue el ritmo | Timer por fases (trabajo por distancia → «Completé 400 m», recuperación 90 s) |
| 8 | — | Lo difícil, resuelto (CTA) | eva-app.cl |

## Render

```bash
cd tools/promo-video/carousel-avanzado
ln -s ../node_modules node_modules   # o npm install playwright
FFMPEG=/ruta/a/ffmpeg ./batch.sh      # -> out/eva_avanzado_01..08.mp4
```

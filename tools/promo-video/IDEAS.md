# Serie de reels EVA: próximos videos

Formato fijo para toda la serie: reel 9:16 de 30 s, 5 pasos, phonk a 120 BPM, voz de Cami,
"EVA" en blanco (Russo One). Un solo flujo real de la app por video. El motor de este proyecto
(`anim*.js` + `render.mjs` + `mix_final.py`) se reutiliza: cambia el contenido, no la estructura.

Recomendación: abrir con el **hook en los segundos 0–2** (pregunta o dolor) y dejar el logo para
el cierre; en Reels los primeros 2 segundos deciden la retención.

## Prioridad

| # | Video | Qué muestra (existe en el repo) | Hook |
|---|---|---|---|
| 1 | Tu app, tu marca | White-label: logo y color del coach, app instalable (`coach/settings`, `brand-preview`) | "¿Y si tus alumnos tuvieran TU app?" |
| 2 | Plan de nutrición en 30 s | `nutrition-v2`: builder, grupos de comidas, macros | "La rutina ya la viste. Ahora la dieta." |
| 3 | La experiencia del alumno | App del alumno: entrenar con timer/descanso (`rest-cue`, alarmas), registrar series, cerrar el día | "Esto es lo que ve tu alumno." |
| 4 | Logros y constancia | Insignias: Constancia, Mes constante, Día cerrado, Meta de proteína, Primer registro… | "Alumnos que no abandonan." |
| 5 | Check-in y progreso | `check-in` + `bodycomp`: reportes y curvas de evolución | "El progreso, en números." |
| 6 | War Room | Panel del coach: quién entrena, quién se atrasó, a quién escribir (`CoachWarRoom`) | "Tienes 40 alumnos. Esto te dice a quién atender hoy." |
| 7 | Cobros automáticos | Suscripciones e integración Flow | "Deja de perseguir transferencias." |

Orden de publicación sugerido: 1 → 3 → 2 → 4 (primero lo que diferencia, luego lo que se siente,
luego lo funcional).

## Formatos extra

- **"1 día de un coach con EVA"**: recorrido rápido lunes → viernes (video de marca).
- **Antes / después**: Excel + WhatsApp + PDFs vs EVA en split screen.
- **Mitos del coaching online en 15 s**: contenido de valor con cierre de EVA (alcance orgánico).
- **Plantillas y cardio**: videos cortos de nicho para clientes o prospectos que evalúan.

## Proceso por video

1. Guion de voz (7 líneas, una por escena) + prompt de música → generar en ElevenLabs.
2. Adaptar escenas en `anim.js` / `anim_v.js` con datos y textos reales de la funcionalidad.
3. `node render.mjs` (16:9 y 9:16) → `python3 mix_final.py musica.wav voz.mp3` → mux.

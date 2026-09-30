# Prompts ElevenLabs usados en el video "Crea una rutina en 30 segundos"

## Música (ElevenLabs Music v2.5)

Resultado: `source-audio/phonk_automotivo_elevenlabs.wav` (57 s; en el video se corta en 28,5 s,
justo en su silencio natural). El drop cae en el segundo 4, igual que el primer corte del video.

Por qué 120 BPM: todos los cortes del video caen en múltiplos de 0,5 s (4,0 · 8,5 · 12,5 · 18,5 ·
23,0 · 27,7), así que a 120 BPM la música pega con cada transición. Sin voces ni chants para no
chocar con la voz en off.

```
Brazilian phonk (funk mandelão / automotivo style) background track for a 30-second fitness app promo reel with a Spanish voiceover on top. 120 BPM, E minor, instrumental only, no vocals, no chants, no vocal chops.

Signature sound: a catchy, detuned 808 cowbell melody as the main hook, heavy distorted 808 bass with pitch slides, punchy funk carioca tamborzão drum pattern, crisp claps and snappy rim shots, fast hi-hat rolls, gritty saturated lo-fi texture, dark but energetic, confident gym/drift energy. Mix the cowbell and bass slightly back so a voice sits clearly in the midrange.

Arrangement, in order:
Start with 4 seconds of tension: filtered cowbell melody alone, a reversed cymbal and a rising riser, one deep 808 hit at 0.5s and a big impact at 1.5s.
At exactly 4 seconds, the drop: full tamborzão drums, distorted 808 bass and the cowbell hook at full power.
Keep the groove driving and steady from 4 to 18 seconds.
At 18.5 seconds, a half-second break with only the bass slide, then slam back in.
Keep full energy from 19 to 27 seconds.
At 27.7 seconds, one final huge 808 impact with a reverb tail and the cowbell ringing out alone until 30 seconds. Clean ending, no fade-in.
```

Ajustes opcionales:
- Muy sucio o tapa la voz → agregar `less distortion on the drums, leave space in the 1–4 kHz range for voice`.
- Muy lento/blando → cambiar `funk mandelão / automotivo style` por `aggressive montagem phonk` (mantener 120 BPM).

## Voz en off (ElevenLabs TTS, voz "Cami – Warm, Energetic Spanish")

Resultado: `source-audio/voz_cami_elevenlabs.mp3` (las 7 líneas en un solo archivo, 29,3 s).
`mix_final.py` lo divide por las pausas y coloca cada línea en su escena (`LINES`).

Ajustes: stability 50, similarity 75, style ~30, speed 1.0–1.05.

| # | En el video | Texto |
|---|---|---|
| 1 | 0,30 s | Así se crea una rutina en EVA… en treinta segundos. |
| 2 | 4,10 s | Primero, configura: estructura semanal, ocho semanas y sus fases. |
| 3 | 8,65 s | Luego, elige tus días y arma el tablero de tu semana. |
| 4 | 12,55 s | Busca en el catálogo, arrastra… o solo toca para agregar. Tu semana completa, en segundos. |
| 5 | 18,55 s | Prescribe series, reps, RIR y descanso, con progresión automática. |
| 6 | 23,35 s | Guarda, asigna, y tu alumno la recibe al instante en su app. |
| 7 | 27,55 s | Tú entrenas. EVA lleva el resto. |

## SFX

Sintetizados en `mix_final.py` (pocos y bajos): golpes del logo, 2 whooshes de transición,
6 clics clave, chime de guardado, ding de notificación e impacto final.

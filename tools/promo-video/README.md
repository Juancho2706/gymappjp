# Video promocional EVA: "Crea una rutina en 30 segundos"

Motion graphics de 30 s que recorre el flujo real del builder de rutinas del coach
(`apps/web/src/app/coach/builder/[clientId]`): **Configura → Construye → Añade → Prescribe → Asigna**.

| Archivo | Formato |
|---|---|
| `out/eva_rutina_30s_16x9.mp4` | 1920×1080, 60 fps (YouTube / web) |
| `out/eva_reel_30s_9x16.mp4` | 1080×1920, 60 fps (Instagram Reels / TikTok / Shorts) |
| `out/final_mix.wav` | Mezcla final: phonk ElevenLabs Music + voz ElevenLabs (Cami) + SFX mínimos, -14 LUFS |
| `out/music_sfx.wav` | Pista temporal sintetizada (versión anterior) |

## Cómo está hecho

- `index.html` + `anim.js` (16:9) e `index_v.html` + `anim_v.js` (9:16): la animación es
  **determinista**; `window.render(t)` pinta el cuadro exacto del segundo `t`.
- `render.mjs`: levanta un servidor local, abre la página con Playwright y captura cuadro a
  cuadro a 120 fps; ffmpeg mezcla pares de cuadros (motion blur) y exporta a 60 fps.
- `audio.py`: sintetiza la música y los SFX temporales (numpy).
- `mix_final.py`: mezcla final. Corta la música en 28,5 s, divide la voz (un solo archivo) en
  sus 7 frases y las coloca en su escena, hace ducking + recorte de medios en la música bajo la
  voz, suma SFX mínimos y normaliza a -14 LUFS.
- `mix_vo.sh`: variante anterior que mezcla las voces de ElevenLabs (`vo_01`…`vo_07`) en su tiempo exacto, con
  ducking de la música y normalización a -14 LUFS.
- Assets: `mark.png` y `mark-outline.png` son recortes de `apps/web/public/LOGOS` y
  `apps/mobile/assets`. El texto "EVA" usa Russo One (inclinada, blanca); `fonts/` tiene además
  Archivo, Inter y JetBrains Mono (todas OFL).

## Re-renderizar

```bash
cd tools/promo-video
npm install                                   # playwright
export FFMPEG=/ruta/a/ffmpeg                  # necesita libx264 (p. ej. pip install imageio-ffmpeg)

# 16:9
node render.mjs video out/eva_silent.mp4 60 2
# 9:16 (reel)
PAGE=index_v.html W=1080 H=1920 node render.mjs video out/eva_reel_silent.mp4 60 2

# audio final y mux (requiere numpy)
python3 mix_final.py source-audio/phonk_automotivo_elevenlabs.wav source-audio/voz_cami_elevenlabs.mp3      # -> out/final_mix.wav
$FFMPEG -i out/eva_reel_silent.mp4 -i out/final_mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest out/eva_reel_30s_9x16.mp4

```

Para revisar cuadros sueltos: `node render.mjs stills 1.5 12 20` → `stills/`.

## Guion de voz (ElevenLabs, voz Cami)

Posiciones finales en el video (ver `LINES` en `mix_final.py`):

| # | Entra en | Texto |
|---|---|---|
| 1 | 0,3 s | Así se crea una rutina en EVA… en treinta segundos. |
| 2 | 4,1 s | Primero, configura: estructura semanal, ocho semanas y sus fases. |
| 3 | 8,65 s | Luego, elige tus días y arma el tablero de tu semana. |
| 4 | 12,55 s | Busca en el catálogo, arrastra… o solo toca para agregar. Tu semana completa, en segundos. |
| 5 | 18,55 s | Prescribe series, reps, RIR y descanso, con progresión automática. |
| 6 | 23,35 s | Guarda, asigna, y tu alumno la recibe al instante en su app. |
| 7 | 27,55 s | Tú entrenas. EVA lleva el resto. |

## Más documentación

- `PROMPTS.md`: prompts exactos de música y voz usados en ElevenLabs.
- `IDEAS.md`: próximos videos de la serie y proceso para producirlos.
- `source-audio/`: audios originales de ElevenLabs (música completa de 57 s y voz de Cami).

## Música (ElevenLabs Music v2.5)

Brazilian phonk a 120 BPM (los cortes del video caen cada 0,5 s), drop en el segundo 4, instrumental.
El prompt usado está en `PROMPTS.md`; la pista se corta en 28,5 s.

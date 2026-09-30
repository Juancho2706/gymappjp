# Video promocional EVA: "Crea una rutina en 30 segundos"

Motion graphics de 30 s que recorre el flujo real del builder de rutinas del coach
(`apps/web/src/app/coach/builder/[clientId]`): **Configura → Construye → Añade → Prescribe → Asigna**.

| Archivo | Formato |
|---|---|
| `out/eva_rutina_30s_16x9.mp4` | 1920×1080, 60 fps (YouTube / web) |
| `out/eva_reel_30s_9x16.mp4` | 1080×1920, 60 fps (Instagram Reels / TikTok / Shorts) |
| `out/music_sfx.wav` | Música + SFX temporales (sintetizados, 120 BPM, sincronizados) |

## Cómo está hecho

- `index.html` + `anim.js` (16:9) e `index_v.html` + `anim_v.js` (9:16): la animación es
  **determinista**; `window.render(t)` pinta el cuadro exacto del segundo `t`.
- `render.mjs`: levanta un servidor local, abre la página con Playwright y captura cuadro a
  cuadro a 120 fps; ffmpeg mezcla pares de cuadros (motion blur) y exporta a 60 fps.
- `audio.py`: sintetiza la música y los SFX temporales (numpy).
- `mix_vo.sh`: mezcla las voces de ElevenLabs (`vo_01`…`vo_07`) en su tiempo exacto, con
  ducking de la música y normalización a -14 LUFS.
- Assets: `mark.png`, `mark-outline.png` y `wordmark.png` son recortes de
  `apps/web/public/LOGOS` y `apps/mobile/assets`; `fonts/` tiene Archivo, Inter y JetBrains Mono (OFL).

## Re-renderizar

```bash
cd tools/promo-video
npm install                                   # playwright
export FFMPEG=/ruta/a/ffmpeg                  # necesita libx264 (p. ej. pip install imageio-ffmpeg)

# 16:9
node render.mjs video out/eva_silent.mp4 60 2
# 9:16 (reel)
PAGE=index_v.html W=1080 H=1920 node render.mjs video out/eva_reel_silent.mp4 60 2

# audio y mux
python3 audio.py                              # -> out/music_sfx.wav (requiere numpy)
$FFMPEG -i out/eva_reel_silent.mp4 -i out/music_sfx.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest out/eva_reel_30s_9x16.mp4

# con voz en off (vo_01..vo_07 en esta carpeta)
./mix_vo.sh out/music_sfx.wav out/eva_reel_silent.mp4 out/eva_reel_30s_9x16_vo.mp4
```

Para revisar cuadros sueltos: `node render.mjs stills 1.5 12 20` → `stills/`.

## Guion de voz (ElevenLabs)

| # | Entra en | Texto |
|---|---|---|
| 1 | 0,3 s | Así se crea una rutina en EVA… en treinta segundos. |
| 2 | 4,2 s | Primero, configura: estructura semanal, ocho semanas y sus fases. |
| 3 | 8,7 s | Luego, elige tus días y arma el tablero de tu semana. |
| 4 | 12,7 s | Busca en el catálogo, arrastra… o solo toca para agregar. Tu semana completa, en segundos. |
| 5 | 18,7 s | Prescribe series, reps, RIR y descanso, con progresión automática. |
| 6 | 23,2 s | Guarda, asigna, y tu alumno la recibe al instante en su app. |
| 7 | 27,85 s | Tú entrenas. EVA lleva el resto. |

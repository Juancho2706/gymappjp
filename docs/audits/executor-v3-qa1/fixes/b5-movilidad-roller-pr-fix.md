# Fix B5 — Movilidad + Roller + PR RN + JuicyButton RN

Rama `fix/executor-v3-qa1`. Sin commits. Informes: 08-movilidad-roller.md (todos) + 09-estados-momentos.md (delta PR RN) + pendiente wave A JuicyButton RN.

## Roller WEB — BLOCKER R1 + R2/R3/R7/R8/R9 (RollerStepV3.tsx + globals.css)
- **R1**: reconstruido el layout del mockup. Fuera la fila horizontal `[−][num][+]`. Ahora: contador VERTICAL (`.exec-v3-counter` flex-column) número gigante → "de N" → "Pasadas"; botón HÉROE juicy `+1 pasada` full-width 92px (`.exec-v3-juicy .exec-v3-plusbtn`, badge `+` con tinta `--exec-brand-ink`); "−1" discreto (`.exec-v3-minusghost`) centrado para corregir.
- **R3**: número 88→116px (`.exec-v3-bignumber`).
- **R2**: micro-rebote al SUMAR — `@keyframes exec-v3-tickpop` (scale 1→1.12→1, cubic-bezier(.4,0,.2,1)), retrigger por `key={pop}` (sólo sube en +1), off en reduced-motion.
- **R7**: sublabel separado — "de {N}" (14px `.exec-v3-goalof`) + "Pasadas" (11px .16em `.exec-v3-counter-lbl`).
- **R8**: sufijo "por lado" en la línea de objetivo cuando `side_mode==='per_side'`.
- **R9**: overlay "En loop" + dot live (`.exec-v3-medialbl` / `.exec-v3-live` con pulso 1.6s) sobre la media.

## Movilidad WEB — M1/M2/M3/M4/M5/M6/M7/M8 (MobilityStepV3.tsx + globals.css)
- **M1**: CTA juicy `Listo este lado` / `Listo` (`.exec-v3-mob-cta` 60px full-width, acento recovery via `.exec-v3-juicy` en scope calm). En per_side lado izq → avanza a derecho; último/single → pausa el countdown.
- **M2**: anillo strokeWidth 12→23 (ambos círculos, SVG inline; sólo movilidad).
- **M3**: número hold 56→60px (`.exec-v3-holdnum`; alinea también con el phasenum 60px del cardio, mismo class).
- **M4**: título de pantallas serenas → `#eef4f6` vía `[data-exec-v3] .exec-v3-calm .exec-v3-exname` (scope calm = movilidad+roller, no toca fuerza).
- **M5**: overlay "Mantén" + dot live sobre la media.
- **M6**: sidepill pad 8/18→10/20, font 17→19px, dot 13→14px.
- **M7**: holdlbl "Sostén" color `#8f8f9c`→`#8fa3ab`, margin-top 6→8.
- **M8**: `.exec-v3-mobset` letter-spacing .04em→.06em.
- **M9**: chip "Movilidad · {músculo}" — se deja enriquecido (consistente web/RN), decisión del informe.

## RN — A1/M2/M3/M4/M5/M7/M10/M11/R3/R5/R9
- **A1** (exec-theme.ts): modo coach `recovery: accent` → `recovery: EVA_EXEC_RECOVERY` (#18ABD4 aqua FIJO en ambos temas, paridad con web `.exec-v3-calm`).
- **MobilityScreenV3**: MEDIA_HEIGHT 168→150 (M10) + borde `#2a333a` (M10); anillo strokeWidth 14→23 (M2); número 56→60 + `#eef4f6` (M3/M4); "Sostén" color aqua→`#8fa3ab`, margin 6→8 (M7); título → `#eef4f6` (M4); overlay "Mantén" + dot live (M5); "luego" colores `#6f7c82` / `#9fb2b9` (M11).
- **RollerScreenV3**: número 104→116 + `#eef4f6` (R3); título → `#eef4f6`; borde media → `#2a333a`; overlay "En loop" + dot live (R9); **Completar** de JuicyButton → Pressable PLANO secundario (`#1c1c24`/borde `#2f2f3a`/texto `#e8e8ee`, 54px) — el héroe sigue siendo `+1 pasada` (R5).

## PR EN VIVO RN — informe 09 (PrCelebration.tsx + celebration-host.tsx)
- Toast pill (radius 999) → **banner-card rect** del mockup `.a3e-prbanner`: radio 15, fondo/borde dorado `exec.pr` (#f5c451), medalla 34px, **kicker** "¡PR! Nuevo récord" / "Mejor 1RM" (según `kind`), valor "{kg} kg — tu mejor marca".
- Debajo, chip **"Anterior {prev} kg · Superado"** (`.a3e-prev`): dashed `#34343f`, valor tachado (decoración dorada), flecha `ArrowUp` dorada, "Superado" dorado.
- Datos SIN tocar: `PrCelebrationState` ya cargaba `prevBest`/`kind`; sólo se cablearon al componente vía celebration-host. pr-adapter intacto. Confeti + reduced-motion preservados.

## JuicyButton RN (primitivo compartido V3) — pendiente wave A
- borderRadius 15→16 (barra de sombra + cara).
- letterSpacing 0.3→0.8.
- height default 56→60 (callers con height explícito intactos: Cardio 56, ConnectSensor 56, Mobility 58, Roller 72, SessionComplete 60, SessionStart 66; usan default DualWheelPicker "Listo" y ExerciseListV3 "Volver" → ahora 60, OK).
- breathe: ciclo ya era 2.6s (1300ms × repeatReverse = paridad con `@keyframes exec-v3-breathe 2.6s`); pico de escala 1.035→1.03 (= 50% del keyframe web). Documentado.

## Diferidos (con razón)
- **R4 (Completar al pie de Roller WEB)**: el cierre de serie vive DENTRO del `LogSetForm` reusado (motor de resiliencia INTOCABLE). Un botón "Completar" extra forkearía el submit/draft. El submit del LogSetForm activo ES la completación; se añadió el timerchip pero no un segundo commit.
- **R6 (timerchip WEB con tiempo corriendo)**: el cronómetro web usa el `WorkoutTimerProvider` global (Stopwatch), no expone elapsed inline sin tocar el motor de conteo. RN ya muestra el tiempo (su stopwatch es local). Se mantiene el chip "Cronómetro · Opcional".

## Notas
- globals.css editado sólo con anclas únicas (Edit); el archivo lo tocan otros workers en paralelo — sin Write completo.
- White-label respetado: juicy/badge usan `--exec-brand`/`--exec-brand-ink`; en scope calm resuelven a recovery aqua. RN recovery aqua fijo.
- Curvas cubic-bezier(.4,0,.2,1) + prefers-reduced-motion (web) / reducedMotion (RN) respetados.

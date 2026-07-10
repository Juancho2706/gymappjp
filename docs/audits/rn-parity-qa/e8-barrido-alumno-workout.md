# E8 · Barrido paridad RN — Dominio ALUMNO / WORKOUT

Fecha: 2026-07-09 · Revisor E8-01 (solo lectura). Referencia web: `research/03-web-alumno-screens.md` §6 (ejecucion), §11 (historial), §4.5 (hero). Arbol mobile: `apps/mobile/app/alumno/**`, `apps/mobile/components/alumno/workout/**`.

| Pantalla / componente | Veredicto | Detalle (archivo:linea) |
|---|---|---|
| Tab Mi entrenamiento (lista de planes) | GAP-menor | `app/alumno/(tabs)/workout.tsx`. Lista planes del programa + badge HOY (137) + sync offline (163). Fiel como lista, pero: (a) sin estado de error — `load().catch(()=>setLoading(false))` (45) cae a empty; (b) no muestra progreso/completado por plan (el hero web §4.5 tiene ProgressRing + logged/target + estados Empezar/Continuar/Ver registro). El tab es patron RN aditivo (web entra via dashboard hero, no hay tab dedicado). |
| ExecutorV2 — shell + modo Lista | OK | `components/alumno/workout/ExecutorV2.tsx`. Fondo ink-950, wake-lock (74), OfflineBanner (466), SessionHeader, secciones Calent/Principal/Enfriam con barra-acento (511-525), banner allDone (501), barra fija Finalizar+descanso 90s (540). Cap 4h via `capped`. |
| SessionHeader (progreso + toggle) | GAP-menor | `SessionHeader.tsx`. Back+titulo+eyebrow semana+subline programa, toggle Lista/Pasos (72-95), ProgressBar (98), linea "Ejercicio X de Y · N/M series · vol · tiempo · %" (100-109). FALTA la tuerca de Ajustes del header web (WorkoutTimerSettingsPanel: toggle auto-timer + sonido). ExecutorV2:539 marca "modo protagonista + ajustes de alarma" como WAVE-B-SEAM. |
| Modo Paso a paso | OK | `StepperExecution` via ExecutorV2:487-493; buildStepModel (397), rail stepViews (410), auto-avance una-vez-por-paso (442-451), firstIncompleteStepIndex al entrar (436). |
| SingleExerciseCard | OK | `SingleExerciseCard.tsx`. Fila musculo+acciones Detalles/Cambiar/Tecnica (108-153), badge+deshacer sustitucion (156-172), nombre+dots/check (174-191), prescripcion sets×reps·kg·desc·tempo·RIR (202-220), chip sobrecarga (213), "Ultima vez" tap-autofill + "Supera tu marca" (222-247), cue tecnica (250), disclosure Detalles con tecnica/nota/sobrecarga/historial (255-299), grid tipado cardio/movilidad (194-199). |
| Keypad numerico + esfuerzo | OK | `TypedKeypad.tsx` + `KeypadHost.tsx`. Display es-CL coma decimal, chips incremento + presets de paso persistidos (184-249), grid 3×4 (253), tap targets ≥56px. EffortScale RPE/RIR dots 1-10 cableado en KeypadHost:207-214. Modos strength/typed (52-65). Draft restaurado (ExecutorV2:184). |
| SubstituteExerciseSheet | OK | `ExecutorV2.tsx:574-592`. Strength-only, `canSubstitute` solo antes del 1er set (367,382), rehidrata desde log substituted_* (129-139), guard anti-PR-falso (301). |
| Timers (descanso/hold/interval/stopwatch) | GAP-menor | `RestTimerBar` montado por `timers/TimerProvider.tsx:156`. Barra con mute (330), ±15s, pausa/reset, alarma en loop+haptica, warmup. Auto-rest al commit (ExecutorV2:243-244) y manual 90s (544). FALTA exponer in-workout el toggle de auto-timer (siempre auto) — el panel de ajustes web no tiene equivalente (mute inline + sonido en /perfil lo cubren parcialmente). |
| WorkoutSummaryOverlay (cierre rico) | OK | `WorkoutSummaryOverlay.tsx`. Hero Duracion+stat adaptativo+series/reps (265-290), PRs con guard anti-falso + 1RM Epley + "superaste tus X del <fecha>" (293-329), por-ejercicio (332), cardio/movilidad polimorfico (350-367), MuscleMapSvg+volumen (370-392), "Lo que viene" (395), prompt check-in variant-aware (409, 506-548). Share-cards branded resumen+PR (435-464). Confetti reduce-motion aware (241). |
| Historial de entrenos | GAP-menor | `app/alumno/(tabs)/history.tsx`. 1 Card con filas dia+divisor hairline (89-120), 90d/"3 meses" default → 180d/"6 meses" (53-55, 122), empty (67), disclaimer "Solo ves tus propios registros" (137). Sin estado de error (`load().catch(()=>setLoading(false))` 30 cae a empty). |

## Resumen
Dominio de ejecucion RN a paridad ALTA con web md. Motor puro compartido (`@eva/workout-engine`) elimina drift en pasos/keypad/summary/typed. Sin tokens legacy (ink-950/sport/ember/on-dark). 3 GAP-menor cosmeticos/funcionales, cero GAP-mayor:

1. **Ajustes de timer in-workout** (auto-timer toggle + alarma) ausentes del header — marcado WAVE-B-SEAM en el codigo. Mitigado por mute inline + sonido en /perfil.
2. **Tab workout sin progreso/completado por plan** ni estado de error (el hero web muestra ring+estados).
3. **History sin estado de error** (cae a empty).

Sin gaps de estructura, gating (cardio module gate OK en ExecutorV2:109-111), textos ni offline (OfflineBanner + colas + wake-lock presentes).

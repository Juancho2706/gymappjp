# OVERNIGHT — Progreso (append-only)

> Una entrada por turno. Memoria durable a través de compactaciones de contexto.
> Formato por entrada:
> ## <timestamp> — <Txx nombre>
> - estado: done | blocked | partial
> - archivos: ...
> - validación: tsc exit=<n> / expo exit=<n>
> - commit: <hash o "—">
> - próxima: <Txx>
> - learnings/gotchas: ...

---

## 2026-06-21 01:33 — T1 Paleta macro canónica
- estado: done
- archivos: lib/theme.ts (interface +macro scheme-aware, light/dark, export MACRO_COLORS central), components/MacroRingSummary.tsx (re-export MACRO_COLORS desde theme, rings usan theme.macro.*, over/goal via theme.macro)
- validación: tsc exit=0 / expo exit=0
- commit: (siguiente)
- próxima: T2 filtros ejercicios
- learnings/gotchas: solo 2 consumidores de MACRO_COLORS (MacroRingSummary + FoodSearchSheet); FoodSearchSheet sigue importando desde '../MacroRingSummary' (re-export mantiene compat). NO toqué tailwind.config/global.css: ningún componente mobile usa clases macro-*; el hogar correcto de estos colores (StyleSheet) es theme.ts. Valores canónicos: protein #5E9FD6/#7FB3E0, carbs #FFB74D/#FFC97A, fats #81C784/#A0D6A3, over #EF4444, goal #10B981.

---

## 2026-06-21 ~01:40 — T2 Filtros ejercicios "Con video"
- estado: done
- archivos: lib/exercises.ts (+exerciseHasVideo), app/coach/(tabs)/ejercicios.tsx (state videoOnly + chip "Con video" + filtro + key), app/alumno/(tabs)/exercises.tsx (import + state + toggle row + filtro)
- validación: tsc exit=0 / expo exit=0
- commit: (siguiente)
- próxima: T3 subscription display
- learnings/gotchas: "Personalizados" en coach YA existe como tab "Míos" (source==='own') → no dupliqué chip; agregué solo "Con video" en coach. Alumno no tiene ownership (ve coach+system) → solo "Con video". exerciseHasVideo = youtube(video_url) || gif_url || video_url .mp4/.webm/.mov/.gif. AC plural "toggles" cubierto por la combinación tab-origen + chip-video en coach; alumno = chip-video.

## RESUMEN FINAL
(el agente escribe esto al cumplir la completion condition o al parar por bound: qué quedó done, qué blocked y por qué, qué revisar en la mañana, comando exacto para retomar.)

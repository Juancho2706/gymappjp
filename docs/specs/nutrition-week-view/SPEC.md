# SPEC — Semana completa de nutrición (week view) · Nutrición V2 coach + alumno

## Problema
Con multi-día (variantes por día de semana) ni el coach ni el alumno pueden ver la semana:
el alumno solo ve HOY (perdió la navegación por fecha que V1 tenía) y su tab Plan apila las 7
variantes expandidas (~9.700 px) sin selector; el coach no tiene ninguna pantalla que muestre
la comida de dos días a la vez ni la adherencia semanal del alumno. Pedido del CEO: ambos roles
deben poder ver el lunes o el sábado aunque hoy sea miércoles.

Auditoría y factibilidad completas: `D:\tmp\nutricion-ui-audit-20260729\` (10 reportes, 2026-07-29).

## Objetivo
Navegación semanal Lu-Do en las 4 superficies (alumno web/RN, coach web/RN) construida sobre
los datos que YA viajan al cliente. Cero migraciones, cero endpoints nuevos.

## Decisiones (recomendación Fable 2026-07-29; pendiente ratificación CEO)
- **Días pasados = solo lectura estricta.** Hoy es la única superficie con registro. El pasado
  muestra resultados congelados del snapshot; el futuro muestra el plan proyectado SIN controles.
- **La semana vive dentro de los tabs existentes** (Hoy y Plan del alumno; ficha del coach).
  Sin cuarto tab ni pantalla nueva.
- **Gates comerciales intactos**: sin Nutrición Pro la semana colapsa honesta a 1 variante
  (se muestra igual); la ventana de 30 días del historial del coach base se respeta tal cual.
- Vista "Mi semana" tipo agenda y grid desktop del coach: fase posterior (no en este alcance).

## Alcance
1. **Helper puro compartido** `packages/nutrition-v2/week-view.ts`: `buildNutritionWeek()` +
   tipo `NutritionWeekDayState` (`past-logged | past-empty | today | future`) + tests.
2. **Alumno web + RN — tab Plan**: selector Lu-Do (7 chips) + UNA card de variante visible
   (la del día seleccionado, hoy preseleccionado). "Metas diarias" lee la variante seleccionada.
3. **Alumno web + RN — tab Hoy**: tira Lu-Do sticky navegable. Día pasado → modo lectura con
   resultados reales y banner "Estás viendo el {día} · Volver a hoy". Día futuro → preview del
   plan proyectado, sin checkboxes, steppers ni bulk. Hoy = experiencia actual intacta.
4. **Coach web — ficha** `[clientId]`: navegación `?date=` (el RPC ya acepta `p_local_date`) con
   la misma tira; adherencia por día visible en los chips (desde `recentDays`).
5. **Coach RN — ficha**: misma tira sobre `clientDetail` cacheado.

## Reglas de datos (no negociables, ver factibilidad)
- La semana se pinta del plan YA descargado (`plan.dayVariants`); cero fetch por celda.
- **PROHIBIDO** llamar `get_nutrition_today_v2` en loop: es volatile (materializa snapshots) y
  revienta con fecha > hoy+1 (`nutrition_v2_snapshot_date_out_of_window`).
- Días futuros: proyección client-side con `resolveNutritionDayVariantForDow` (replica el
  order-by del snapshot SQL — legítimo).
- Días pasados: `history` disperso; **el snapshot del historial SIEMPRE gana** sobre la
  proyección. `consumed = null` ≠ "registro en cero": estados distintos.
- Días legacy V1: reusar `describeLegacyHistoryDay` para no mostrar 0 kcal falsos.

## Fuera de alcance
Registro/corrección en días pasados; RPC `get_nutrition_week_v2` (opción B, solo si QA muestra
cruces de versión feos); vista agenda "Mi semana"; grid semanal desktop del coach; quick-edit
por día (ola 2); retiro de V1.

## Éxito
- Alumno responde "¿qué me toca el sábado?" y "¿qué comí el lunes?" sin salir del módulo.
- Coach responde "¿cómo viene la semana de Catalina?" desde la ficha con cero llamadas extra.
- `pnpm lint && pnpm typecheck && pnpm test` verdes; tests nuevos de `week-view.ts` cubren:
  plan sin default, dos variantes con el mismo dow, semana con huecos, día legacy, semana que
  cruza cambio de versión (snapshot gana).

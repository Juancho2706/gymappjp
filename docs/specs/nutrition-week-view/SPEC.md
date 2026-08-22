# SPEC — Semana completa de nutrición (week view) · Nutrición V2 coach + alumno

> **CERRADA — 2026-08-17.** Implementación verificada en el árbol (auditoría specs-vs-código);
> evidencia clave: `packages/nutrition-v2/week-view.ts` + `WeekDayNav` web/RN.

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

## Regla cerrada 2026-08-22 — «futuro visible, solo lectura»

Origen: feedback de un alumno vía su coach — *«Si soy alumno no me deja ver mi dieta de la semana.
Quiero saber qué alimentos tengo el lunes para ir al supermercado»*.

- **Los 7 días de la semana son seleccionables en las 4 superficies, futuro incluido.** No existe
  ni debe agregarse ningún guard que apague el chip de un día futuro: la tira es el único
  navegador de la semana y un día no tocable es, para el alumno, un día que "no lo deja ver".
- **El futuro se muestra en SOLO LECTURA**: metas y franjas proyectadas del plan vigente, sin
  botones de registrar / agregar / escanear, sin steppers, sin bulk y sin anillo de consumo (no
  hay nada consumido que anillar). Va con aviso arriba que ubica: *"Estás viendo el {día}"* +
  *"Vista previa de tu plan: vas a poder registrar cuando llegue el día"*, y salida "Volver a hoy".
- **Mirar un día NUNCA escribe.** Se mantiene la prohibición dura: cero `get_nutrition_today_v2`
  con fecha ≠ hoy (es `volatile`, materializa snapshots y revienta con fecha > hoy+1) y cero fetch
  por celda. Todo sale del plan ya descargado + UNA página del historial de la semana.
- **El día PASADO sigue mostrando el resultado congelado, no la prescripción** (regla 2: el
  snapshot gana; proyectar la prescripción de un día viejo con el plan de hoy sería mentir cuando
  el coach republicó). Para que la pregunta real del alumno igual se conteste, el resumen del día
  pasado lleva un **puente de un toque al tab Plan en ese mismo día** ("Ver el plan del lunes"):
  RN cambia de tab con el día precargado, web enlaza `?view=plan&dow=N`. Si el día viene de otra
  semana (abierto desde Historial), se traslada al día equivalente de la semana vigente
  (`alignNutritionIsoToWeekOf`) — el Plan solo conoce la semana actual.
- Sigue **fuera de alcance** navegar a otras semanas (la siguiente incluida): "qué me toca el
  lunes" se contesta con el patrón semanal del tab Plan, que es el mismo que aplicará.
- Lista de compras: **idea anotada, no implementada**.

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

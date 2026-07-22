# 4A-04 — Vista Historial

Archivos RN: `apps/mobile/app/alumno/nutrition-v2/index.tsx` (bloques `HistoryTab`, `HistoryDayCard`,
`HistoryMacro`, `HistoryDayDetail`). Comparte archivo con 4A-02/03/05/06 → wave separada.
Referencia web: `apps/web/src/app/c/[coach_slug]/nutrition-v2/page.tsx:418-497`.

## Web (fuente de verdad)

- Lista de `NutritionCard` por día, pageSize 14, cursor `?before=` con botón
  "Ver días anteriores" (`page.tsx:487-494`). SIN scroll infinito, SIN expansión de detalle.
- Card de día (`page.tsx:446-484`): título fecha relativa (`formatNutritionShortDate(..., {relative:true})`,
  `font-display text-lg`); si día SOLO-legado con macros → `MacroChipRow sm`; si no →
  "N registro(s) · X kcal" (`text-sm tabular-nums text-muted`, línea 463-469) o los copys legados
  (`completionsLabel` / "Registrado en el sistema anterior"); línea secundaria y `mealsLabel`
  (line-clamp-2) para legados mixtos; badge "Historial anterior" en pill ámbar FIJO
  (`border-amber-300 bg-amber-50 text-amber-800`, línea 479-481).
- Empty: StatePanel ilustración `historial-vacio` "Todavía no hay historial" (+ descripción, 430-437).

## RN actual y deltas

1. **Paginación.** RN usa FlashList + `onEndReached` (scroll infinito, `index.tsx:1647-1656`) con
   footers "Cargando días anteriores…" / "No hay más días." — web usa botón "Ver días anteriores".
   El scroll infinito es una adaptación nativa razonable PERO cambia contenido observable (footers
   no-web). Decisión: mantener scroll infinito como adaptación escrita; footers con copy web
   ("Ver días anteriores" no aplica; documentar) — o portar el botón. Owner decide; default de la
   ola: adaptación documentada, sin footers extra salvo el spinner.

2. **Columna derecha kcal/target.** RN `index.tsx:1771-1776`: "X kcal" + "de Y kcal" a la derecha —
   NO existe en web. **Delta RN-extra.** Cierre: eliminar; la kcal va en la línea
   "N registros · X kcal" como web (`page.tsx:468`).

3. **Fila de macros P/C/G por día.** RN `index.tsx:1779-1785` (`HistoryMacro`) — no existe en web.
   **Delta RN-extra.** Eliminar.

4. **Badge de estrategia por día.** RN `index.tsx:1732` (`StrategyBadge compact`) — no existe en web.
   **Delta RN-extra.** Eliminar.

5. **Detalle expandible por día.** RN `index.tsx:1787-1804` + `HistoryDayDetail` — tap expande y
   fetchea el read-model del día. Web NO tiene detalle. **Delta RN-extra mayor** (funcionalidad
   completa no presente en web). Por filtro §1 (no diseños nuevos), se retira o se eleva al owner
   como excepción escrita ANTES de implementar; la ola no lo conserva por defecto.

6. **Línea de resumen no-legado.** Web: "N registro(s) · X kcal" (`page.tsx:468`).
   RN `index.tsx:1755-1759`: "N registro(s) · M corrección(es) · último HH:MM" (sin kcal).
   **Delta de contenido.** Cierre: copy web exacto.

7. **Badge "Historial anterior".** Web pill ámbar FIJO (`page.tsx:479-481`, canvas ámbar idéntico en
   light/dark en la superficie del alumno V2 — mismo patrón que los avisos amber del Today).
   RN `index.tsx:1733-1737` usa `warning-500/40 + warning-700`. Delta de token: web usa la rampa
   ámbar cruda documentada del DS web para estos avisos; RN debe mapear al MISMO canvas que ya usa el
   kit para tono warning (consistente con `toneClasses.warning` del kit web que también es amber).
   En la práctica: paridad visual aceptable si coincide con el resto de los avisos ámbar del kit RN;
   documentar la elección una sola vez (aplica también a 4A-06/08).

8. **Copys legados y a11y.** `describeLegacyHistoryDay` compartido — paridad de datos verificada
   (mismos labels). RN agrega `accessibilitySummary` — adaptación válida.

9. **Estados.** Empty copy en paridad ("Todavía no hay historial" vs RN "Todavía no hay historial" —
   RN `index.tsx:1663` dice "Todavía no hay historial" con título `offline ? 'Sin conexión' : ...` — ok);
   falta ilustración `historial-vacio` (4A-07). Skeleton variant history en paridad razonable.

## Comprobación objetiva

Cuenta con historial mixto (días V2 + legados): captura web vs RN; verificar que la card de día
muestra SOLO fecha + resumen + badge legado (sin macros, sin kcal derecha, sin estrategia, sin
detalle), y el copy "N registros · X kcal".

## Cierre (2026-07-21)

- Decisión owner fila 1 ejecutada: se retiraron el detalle expandible (estados/`toggleDay`/
  `detailControllerRef`, `HistoryDayDetail`, `historyEntryToRow`), la fila de macros P/C/G
  (`HistoryMacro`), la columna kcal/target a la derecha, el `StrategyBadge` compact por día y
  `formatClock`. La card quedó `View` plana no-interactiva, idéntica al web (`HistoryView`).
- Copy del resumen no-legado alineado 1:1 al web: `N registro(s) · day.consumed.calories kcal`
  (kcal cruda, sin `formatNutritionCalories`, sin "último HH:MM"); estilo `text-sm` + `tabular-nums`.
  Ramas legadas (`completionsLabel` / "Registrado en el sistema anterior") heredan el mismo estilo.
- Badge "Historial anterior" mapeado al canvas warning del kit RN (`toneClasses.warning` =
  `border-warning-500/30 bg-warning-500/10` + `text-warning-700`), tamaño `text-[11px] px-2 py-1`
  como el pill ámbar del web; movido a la derecha de la fila `justify-between` (sibling, no inline).
- Scroll infinito conservado por decisión owner fila 4 (adaptación nativa); del footer sobrevive
  SOLO el indicador "Cargando días anteriores…" mientras `loadingMore` — se retiró "No hay más días.".
- La a11y compuesta (`accessibilityLabel`/`accessibilitySummary` del `Pressable`) se retiró junto con
  el `Pressable`: al ser card plana, la fecha y el resumen se anuncian solos, como en web.

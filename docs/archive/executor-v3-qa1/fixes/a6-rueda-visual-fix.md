# Cierre A6 — Rueda dual: presentación

Unidad **a6-rueda-visual**. Informes: `10-rueda-dual-teclado.md` (todos) + `14-bug-rueda-lag.md`
(sólo Dialog/blur y re-render al girar; el gesto de LogSetForm es de otra unidad y NO se tocó).

## Archivos tocados
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/DualWheelPicker.tsx` (reescrito)
- `apps/web/src/app/globals.css` (bloque `.exec-wheel-*`, ediciones quirúrgicas)
- `apps/mobile/components/alumno/workout/v3/DualWheelPicker.tsx`
- `apps/mobile/components/alumno/workout/v3/ExerciseScreenV3.tsx` (caller: pasa subtítulo)

## Deltas cerrados — WEB (informe 10)
- **[BLOCKER]** Dialog centrado → **bottom sheet** `.exec-wheel-sheet` (base-ui `Dialog` primitivo
  directo, sin `DialogContent`): `fixed bottom-0`, `66dvh` + `max-height:96dvh` (landscape), radios
  24/24/34/34, borde `#33333f`, handle 40×5 `#45454f`, slide-up con `translateY(100%)` en
  `data-starting/ending-style`. SIN X, SIN gradiente decorativo.
- **[MAYOR]** Fondo `#1d1d26` (superficie elevada) en vez de `--ink-950`.
- **[MAYOR]** Item central **27px/900/#fff**; cápsula `.exec-wheel-cap` con **borde completo 2px**
  `color-mix(brand 55%)` + `box-shadow 0 0 0 3px color-mix(brand 12%)` + bg `color-mix(brand 16%,#16161d)`,
  radio 13.
- **[MAYOR]** Vecinos con profundidad graduada por `data-dist` (pintado directo al DOM): f1 `.5/scale .9/#9a9aa6`,
  f2 `.24/scale .78/#8f8f9c`, base 22px/800/#b7b7c2 (curva `cubic-bezier(.4,0,.2,1)`).
- **[MAYOR]** Botón "Listo" juicy real: `box-shadow 0 5px 0`, `:active translateY(5px)`, texto
  `var(--exec-brand-ink)`, check en círculo `.exec-wheel-done-ck` (fondo `color-mix(brand-ink 22%)`),
  58px/radio 16/18px/900.
- **[MINOR]** Quitado el "×" central (markup + regla CSS `.exec-wheel-x`).
- **[MINOR]** Nota inferior "Centrada en tu valor anterior · **tick háptico** por paso".
- **[MINOR]** Encabezados columna `letter-spacing .14em`, `#7f7f8c`. Mask `26%/74%`.

## Deltas cerrados — WEB (informe 14, sólo lo de mi unidad)
- **[MAYOR causa B]** Lag de apertura: eliminado TODO `backdrop-filter`. Backdrop plano
  `rgba(6,6,10,.62)` con fade; ya no usa el `Dialog` genérico con doble blur.
- **[MAYOR causa C]** Lag al girar: índice vivo en **refs** (no `setState` del padre por tope),
  resaltado por manipulación directa del DOM (`data-dist`/`aria-selected`), columna en `memo`, items
  memoizados (una sola creación), `vibrate` con throttle 35ms (igual que RN).
- **[MENOR causa D]** `getComputedStyle` movido de render a `useEffect`.

## Deltas cerrados — RN (informe 10)
- **[MAYOR]** Item central crece a 27px: `CENTER_SCALE = 27/22` en la interpolación de escala.
- **[MINOR]** Quitado el fondo hundido por columna (`surfaceSunken` + `borderRadius:16` → transparente).
- **[MINOR]** Cápsula: borde `accent 0.55` (antes 0.9), radio 13; hairlines a **blanco `rgba(255,255,255,.14)`**.
- **[MINOR]** `ITEM_HEIGHT 44→46`, `snapPoints 54%→66%`, opacidad vecinos `.5/.24`, escala `.9/.78`
  (alineado al mockup).
- **[MINOR]** Subtítulo "{ejercicio} · N de M" (props aditivas + caller `ExerciseScreenV3`) + nota
  inferior "Centrada en tu valor anterior · tick háptico por paso".

## Pendientes (no cerrados) y por qué
1. **Web — título "Serie N" + subtítulo no visibles todavía.** Se agregaron props aditivas
   (`setNumber`, `exerciseName`, `totalSets`) con **fallback** al título genérico "Ajustar peso y reps".
   El único caller es `LogSetForm.tsx` (MOTOR INTOCABLE en esta wave), que aún no las pasa → hoy muestra
   el fallback. Cerrar exige que la unidad dueña de LogSetForm agregue 3 props en el render de
   `<DualWheelPicker>` (la serie/ejercicio/total ya los conoce). Contrato listo del lado del componente.
2. **Web — causa A del informe 14 ("no sale" el teclado/rueda).** Vive en `LogSetForm.tsx` (gesto
   pointer, `onFocus` anulado, `touch-action`). Explícitamente de OTRA unidad; no se tocó.
3. **RN — dims del botón "Listo"** (56/17/15 vs mockup 58/18/16). Están en `JuicyButton.tsx`
   (componente compartido reusado por todo el ejecutor), fuera de mi unidad. MINOR; no re-teñir/re-medir
   un primitivo compartido sin brief.

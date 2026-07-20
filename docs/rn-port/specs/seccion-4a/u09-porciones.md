# 4A-09 — Porciones (chips de franja, fila del día, sheet de equivalencias)

Archivos RN: `apps/mobile/components/alumno/nutrition-v2/*` (`PortionChip.tsx`,
`PortionSlotSection.tsx`, `PortionDayCoverageRow.tsx`, `PortionEquivalencesSheet.tsx`,
`PortionSnackbar.tsx`, `usePortionMarks.ts`) + `lib/nutrition-v2-portions.ts`. Disjunto.
Referencias web: `_components/PortionMarks.tsx`, `PortionCoverageRow.tsx`, `PortionSlotSection.tsx`,
`PortionEquivalencesSheet.tsx`, `portion-marks.logic.ts`.

Estado general: recién construido en ambos lados sobre la misma SPEC — el contrato (idempotencia,
delta optimista, deshacer, exceso, segmentos primary) está EN PARIDAD. Los deltas son finos:

## PortionChip / PortionSlotSection

1. **Contenedor del chip.** Web `PortionSlotSection.tsx:148`: botón `w-full min-h-11 rounded-control
   border border-border-subtle bg-surface-card px-2.5 py-1.5` (chip con borde y fondo).
   RN `PortionChip.tsx:139`: `min-h-11 rounded-control px-1` SIN borde ni fondo. **Delta visual.**
2. **Check de completado en el chip de franja.** RN `PortionChip.tsx:177-183` muestra `Check` success
   al completar; web NO (el chip de franja solo muestra contador y "+n"; el check vive en la fila del
   DÍA, `PortionCoverageRow.tsx:97-99`). **Delta RN-extra**: retirar del chip de franja.
3. **Badge de exceso.** Web `PortionSlotSection.tsx:217-221`: pill ámbar con borde
   (`border-amber-300 bg-amber-50 text-amber-800 rounded-pill`). RN `PortionChip.tsx:177-180`: texto
   plano `text-warning-700` sin pill. Delta: pill.
4. **Contador.** Web `:222`: `text-xs font-semibold tabular-nums text-muted`. RN `:174-176`:
   `font-mono text-text-body`. Delta fino de tono (muted) y familia (web no usa mono aquí).
5. **Segmentos.** Web `SegmentDot` 41-78: 12px (half 7px), borde `border-primary/60` al llenarse,
   derivado = relleno `bg-primary/70` + anillo; pending = `opacity-60` del segmento + puntito ámbar
   `animate-pulse` (173-179). RN `Segment` 60-97: 14px (half 8), derivado relleno `bg-primary` pleno
   (web 70%), pending = mitad `bg-primary/50` + puntito warning SIN pulso. Deltas finos: tamaño,
   alpha del derivado, borde primary/60, pulso del puntito (Moti loop).
6. **Confirmación de exceso.** Web `PortionSlotSection.tsx:265-294`: caja `role=alertdialog` ámbar con
   botones [Cancelar tone=neutral] [Sí tone=warning] en ese orden, sin timeout.
   RN `PortionSlotSection.tsx:133-164`: caja warning con [Sí bg-primary] [Cancelar texto] y timeout
   6s (`EXTRA_CONFIRM_TIMEOUT_MS`). Deltas: orden, tonos (el "Sí" web es warning, no primary),
   timeout RN-extra (retirar o documentar).
7. **Botón [Equivalencias].** Web `:299-306`: icono `BookOpen` + texto primary `min-h-9` con hover
   `bg-primary/10`. RN `:167-174`: solo texto. Delta: icono.
8. **Long-press.** Web 450ms (`LONG_PRESS_MS`, `:32`); RN 350ms (`PortionChip.tsx:137`). Delta fino;
   unificar a 450 o documentar el default RN.

## PortionDayCoverageRow ("Porciones de hoy")

9. **Filtro de filas.** Web `PortionCoverageRow.tsx:51`: `items.filter(row => row.prescribed > 0)` y
   null si queda vacío. RN `PortionDayCoverageRow.tsx:80`: solo chequea length del array completo.
   **Delta funcional**: un grupo con prescribed=0 (solo extra) pinta chip en RN y no en web.
10. **Estado completo del chip del día.** Web `:69-99`: chip completo cambia a canvas esmeralda
    (borde/fondo/texto emerald + barra `bg-emerald-500`) y check emerald. RN `DayChip` 43-71: siempre
    `border-border-subtle bg-surface-sunken`, barra siempre `bg-primary`, check `theme.success`.
    **Delta visual**: portar el estado completo (success ramp RN = mapa sancionado del emerald web).
11. **Contenedor.** Web: card `p-3 shadow-sm` con `h2 text-sm font-medium`; RN: `NutritionCard` p-4.
    Delta fino de padding.
12. **Exceso.** Web badge pill ámbar (101-104); RN texto plano warning-700 (64-67). Delta: pill.

## PortionEquivalencesSheet

13. **Buscador (FALTA).** Web `PortionEquivalencesSheet.tsx:173-188`: input search con icono, aria
    `sheetSearchAria`, placeholder `sheetSearchPlaceholder`, filtro por nombre y estado
    "sin resultados" (`sheetNoResults`, 191-196). RN: NO tiene buscador. **Delta funcional mayor.**
14. **Tabs de grupo.** Web `:142-167`: pill activa `bg-primary/100 text-white` con texto
    `"{code} · {name}"`. RN `:138-170`: activa `bg-primary/10 text-primary` con GroupDot + nombre.
    Delta visual/estructura.
15. **Header.** Web `:110-139`: `PortionGroupCircle md` + título + línea "≈ kcal · P · C · G" + badge
    referencial + botón X. RN: mismo contenido (líneas 172-186) con orden tabs-antes-del-header
    (web: header antes de tabs). Delta de orden menor; el cierre nativo lo aporta `Sheet` (adaptación).
16. **CTAs del pie.** Web `:227-249`: fila `flex` con [Marcar 1 porción] tone nutrition→warning cuando
    `confirmExtra` + [Registrar alimento] neutral, lado a lado.
    RN `:103-134`: apilados; el botón de marcar NO cambia a warning en confirmación. Deltas: layout y tono.
17. **Aviso anti-duplicado en el pie.** RN `:111-118` muestra `dupWarning` siempre que haya marcadas;
    web NO lo muestra en el sheet (solo dentro de RegisterFoodDialog, `TodayExperience.tsx:866-873`).
    **Delta RN-extra**: retirar del sheet (el aviso pertenece al flujo de registro, 4A-10).
18. **Registro preseleccionando franja.** Web `onRegister(slotCode)` abre el diálogo con la franja
    preseleccionada (`TodayExperience.tsx:412-415`); RN navega a add-food con `slot` param
    (`index.tsx:697-701`) — paridad funcional vía 4A-10.

## Hook / snackbar (comportamiento)

19. **Toasts.** Web sonner: "marcada/½ marcada + Deshacer 5s", fallo con "Reintentar" (6s), offline sin
    optimismo (`PortionMarks.tsx:181-185,219-272`). RN `PortionSnackbar` + `usePortionMarks`: mismo
    contrato con cola offline extra (adaptación nativa). Verificar copys idénticos vía
    `PORTIONS_COPY` compartido (ambos importan `nutrition-portions-copy`) — **en paridad**.
20. **Offline.** Web: toast y NO marca (UX-c). RN: encola con optimismo (unsynced dot). Adaptación
    nativa deliberada de la SPEC porciones — conservar, ya documentada en la spec de porciones F1.

## Comprobación objetiva

Plan jotap con porciones: captura franja + fila del día + sheet en web móvil vs RN; checklist de los
puntos 1-17; buscador del sheet filtra y muestra "sin resultados"; grupo completo pinta chip esmeralda
solo en la fila del día.

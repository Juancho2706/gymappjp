# Reporte de implementación — unidad `ficha-analisis-plan`

Gate: `npx tsc --noEmit` en `apps/mobile` = **exit 0 limpio**. NO commiteado.

Archivos propios tocados (solo estos 2):
- `apps/mobile/components/coach/clientDetail/AnalisisTab.tsx`
- `apps/mobile/components/coach/clientDetail/PlanTab.tsx`

## Cambios aplicados (dentro de mis 2 archivos)

### PlanTab.tsx
1. **BOMBA -999 (gotcha 6a) — reparación central.** Reemplazado `@gorhom/bottom-sheet` crudo
   (`BottomSheetModal` + `BottomSheetScrollView`, `snapPoints=['70%']` + `enableDynamicSizing={false}`)
   por `<Sheet nativeModal>` (`components/Sheet.tsx`, path `<Modal>` RN, patrón ronda 7). API declarativa:
   `open={selected != null}` / `onClose={() => setSelected(null)}`. Eliminados `sheetRef`/`useRef` y el
   `present()` imperativo. `snapPoints={['85%']}` = tope de max-height (paridad web `max-h-[88vh]`).
   Mirror de `TechniqueSheet.tsx:141-158`.
2. **P6 botón "Cerrar"** — añadido vía `footer` del Sheet (`<Button label="Cerrar" variant="secondary">`).
   Además el Sheet dibuja su X por defecto (showCloseButton), igual que el `SheetContent` web.
3. **P8 empty-state CTA** — `EmptyState` ahora lleva `action` = `<Button "Crear o asignar programa"
   variant="sport" leftIcon={Plus}>` (copy VERBATIM web `ProgramTabB7.tsx:344`). Copy del vacío alineado a
   web VERBATIM: título "Sin programa asignado", subtítulo "Este alumno no tiene un plan de entrenamiento
   activo." (antes "Sin programa activo" / "...no tiene un programa asignado"). Icono → `ClipboardX` (web).
4. **ExerciseDetail sheet — paridad de prescripción (P2).**
   - Orden VERBATIM web (`ProgramTabB7.tsx:478-500`): Series × reps → **Obj. peso** → Descanso → **RIR → Tempo**
     (antes RN tenía Tempo antes de RIR, y label "Peso objetivo" → ahora "Obj. peso").
   - **RIR** ahora filtra `!= null && !== ''` (ProgramBlock.rir es `string|null`, type-safe).
   - **Contenedor con borde** para la tabla (`prescriptionBox`, hairline entre filas) + **icono sport por fila**
     (Dumbbell/Weight/Timer/Gauge/Clock, `color={theme.primary}`) — cierra el P2 "sin iconos sport / sin contenedor".
   - **Chip de músculo con `Target`** (o fallback texto "Ejercicio del programa") en vez de texto plano.
   - **Header "NOTAS DEL COACH"** sobre el bloque de notas (web `:796`).
5. **P7 botón builder** — `variant="outline"` → **`"sport"`** (primaria, web `buttonVariants({variant:'sport'})`),
   label "Editar en el builder" → **"Editar en builder"** (VERBATIM web `:705`).
6. **Badge A/B** — quitado `tone="warning"` → tono default (primary), alineado a web `sport` (P2).

### AnalisisTab.tsx
1. **P0 peso corporal** — el detalle de sesión pintaba `{weightKg ?? 0}×{repsDone ?? 0}`; ahora
   `weightKg` null → **"PC"** y `repsDone` null → **"—"** (web `TrainingTabB4Panels.tsx:729-731`).
   El cálculo de tonelaje sigue usando `?? 0` (correcto para la suma).
2. **Hex crudos fuera del theme → tokens (P1).**
   - Alerta de desequilibrio `#F59E0B14/#F59E0B40/#F59E0B` → clases NativeWind `bg-warning-100
     border-warning-600/25` + icono `AlertTriangle className="text-warning-600"` + texto `text-warning-700`
     (paridad exacta con los tokens de la alerta web). Icono coloreado vía `cssInterop(AlertTriangle, …)`
     (patrón `SubstituteExerciseSheet.tsx:18-21`). `#F59E0B` es el `≈ warning-500` documentado.
   - Chart de fuerza `AreaTrend color="#06B6D4"` → **`theme.primary`** (el sparkline web ES sport-500 →
     tokenización + alineación a web). `MetricBox` Pico 1RM `color="#06B6D4"` → `theme.primary`.
   - Línea de media móvil del tonelaje `lineColor="#F59E0B"` → **`theme.cyan`** (token existente, distinto
     de las barras sport). Nota: esa línea es un extra RN (web no la tiene).
   - Estilos `alert`/`alertTxt` (ya sin uso) eliminados.

## PENDIENTE-DECISIÓN-CEO (gestos/flujos; NO auto-sancionados — se conservan)
1. **Scrub táctil en charts** (AnalisisTab `AreaTrend`/`BarComposed`) — interactivo en RN, estático en web. Conservado.
2. **Swipe fling L/R en historial** (AnalisisTab `SessionHistory`) — gesto añadido RN. Conservado.
3. **Pager de PRs** (WeeklyPRBanner — NO es mi archivo). Conservado por defecto.
4. **Selector de fecha arbitraria (Entreno)** — web permite CUALQUIER día (`<input date>`); RN solo chips de
   días-con-sesión. Restaurar exige `DateTimePicker` nativo (nuevo gesto/superficie). Gap P1 sin resolver.
5. **Editar-en-builder sin `programId`** — `onEdit` navega a `/coach/program-builder?clientId=…` sin `programId`
   (padre `[clientId].tsx`, read-only). Verificar que el builder RN resuelva el programa activo por clientId.
6. **Gotcha 6d device-TZ (PlanTab `resolveProgramWeek` `Date.now()` y `todayDow` `new Date().getDay()`)** —
   es paridad-con-web (ambos device-local, `profileProgramUtils.ts:18-21`), NO regresión. Endurecer a
   `getSantiagoIsoYmdForUtcInstant` = decisión CEO. Dejado como estaba.

## BLOQUEADO POR DATOS (archivo AJENO `lib/coach-client-detail.ts` — va a cambiosShell, NO tocado)
El select mobile (`:691-705`) y los tipos (`:121-155`, `:192-199`) no traen campos → estos P0/P1 no se pueden
portar desde mis archivos:
- **Entreno / detalle de sesión:** banner de sustitución de máquina ocupada (P0, falta `substituted_exercise_name`),
  micro-línea "Meta"/prescripción + badge de progresión (P1), color del peso según meta (P1), notas por serie
  StickyNote (P1, falta `note`), RIR por set, `plan.title` en el header. Requiere ampliar `getCoachClientDayDetail`
  + `WorkoutDaySet`.
- **Programa:** header card **inversa** "PROGRAMA ACTIVO" (P1), badge de vigencia días-restantes/Vencido (P1, calcular
  desde `start/end_date`), **barra de fases + leyenda** y **sección "Estructura del ciclo"** (P1, falta `program_phases`),
  **agrupación de superseries** (P1, falta `superset_group`), microciclo L–D 1..7 con cards de "Descanso" +
  resumen de grupos musculares por día (P1), semántica del progreso `%`+fallback sin-fechas (P1), **poster
  `thumbnail_url`** + placeholder/spinner en el sheet (P2).

## OTROS (fuera de mis 2 archivos → cambiosShell)
- **WeeklyPRBanner.tsx** (archivo ajeno, no en mi brief): hex crudos `#F59E0B` + `CONFETTI_COLORS`, falta línea
  "Antes:" incondicional, confetti sin reduce-motion, identidad naranja sólido vs gradient ember/sport. Sin tocar.
- **Filtro por grupo muscular en Fuerza + MetricInfo/glosario** (Entreno): el RPC entrega solo top-4 fijo
  (`coach-client-detail.ts:897`), no todas las series → el filtro por grupo depende de datos ajenos. MetricInfo
  (`InfoTooltip` existe) es additivo, no portado en esta pasada.
- **Gif height 220 vs 150 web** (PlanTab sheet): divergencia menor conservada; el poster/placeholder está
  data-bloqueado de todos modos.
- **Necesidad de token `warning` en `lib/theme.ts`** (ajeno): resuelto en esta unidad vía clases NativeWind
  `warning-*` (que sí compilan), sin tocar theme.ts.

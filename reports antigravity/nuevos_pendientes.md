# Nuevos pendientes — Builder & informe maestro

Documento generado cruzando **`public/quirky-stirring-rabin.md`**, **`reports antigravity/status_report.md`** y **revisión del código** en `src/app/coach/builder/[clientId]/` (y acciones relacionadas).  
Objetivo: lista de pendientes **real** (lo que el informe pide y el repo aún no cubre o solo cubre en parte).

---

## 1. Sobre `status_report.md` (desactualizado)

Ese archivo describe un estado **antiguo**: marca como pendientes cosas que **ya están implementadas** en el código actual, por ejemplo:

| Lo que dice `status_report.md` | Realidad en código (verificado) |
|--------------------------------|----------------------------------|
| §3.1–3.2 Mobile swipe / dots pendiente | `WeeklyPlanBuilder.tsx`: `activeMobileDayIndex`, swipe, tabs con conteo |
| §2.4 Días de descanso pendiente | `DayColumn.tsx` + `usePlanBuilder` `TOGGLE_REST_DAY`, UI luna/sol |
| §3.3 Quick edit pendiente | `ExerciseBlock.tsx`: doble click sets/reps inline |
| §4.3 Historial cliente pendiente | `BlockEditSheet.tsx` + `getExerciseHistoryAction` |
| §4.1 Plantillas pendiente | `TemplatePickerDialog`, `AssignToClientsDialog`, acciones |
| Fase 3 supersets / undo / balance sin iniciar | Supersets en `DayColumn`/`ExerciseBlock`; undo/redo en `usePlanBuilder` + atajos; `MuscleBalancePanel` |

**Recomendación:** actualizar o archivar `status_report.md` y usar este documento + `PENDIENTE.md` como fuente de verdad.

---

## 2. Qué ya está hecho respecto al informe (§10 Fases 1–3)

Coincide con **`PENDIENTE.md` (sección COMPLETADO)** y con el código:

- Fase 1 quick wins (GIFs, colores, stats, recientes, borrador, copiar día, volumen, duración/fechas, notas globales).
- Fase 2: refactor (`DayColumn`, `ExerciseBlock`, `BlockEditSheet`, `ProgramConfigHeader`), `usePlanBuilder`, mobile (swipe, sheet, tap-to-add), quick edit, descanso, historial, templates, asignación masiva, preview, **modo ciclo**.
- Fase 3: supersets, undo/redo, balance radar, progresión por bloque, A/B, print, **fases** (`program_phases` + `ProgramPhasesBar`), **secciones** W/P/E, **overrides** + sync plantilla, migración SQL aplicada.

No se repiten aquí como tareas; el backlog siguiente es **todo lo demás del informe** que no entró en esas fases o quedó parcial.

---

## 3. Pendientes verificados (informe + código)

Leyenda: **Hecho** = cubierto de forma razonable · **Parcial** · **Pendiente**.

### 3.1 Arquitectura y persistencia

| Ref. informe | Tema | Estado | Notas |
|--------------|------|--------|--------|
| **1.4** | Guardado atómico (RPC / transacción) ante DELETE+INSERT | **Pendiente** | Sigue el patrón destructivo en `saveWorkoutProgramAction` |
| **1.1** | `hooks/useDragAndDrop.ts`, `DayRestToggle.tsx` como archivos dedicados | **Opcional** | Funcionalidad existe; solo reorganización |
| **8.4** | Error Boundary en el board | **Pendiente** | |
| **8.1–8.3** | Virtualización catálogo, memo/callbacks, tipos DnD sin `any` | **Pendiente** | Alineado con `PENDIENTE.md` |

### 3.2 Catálogo y biblioteca (§2.3, §6)

| Ref. | Tema | Estado | Notas |
|------|------|--------|--------|
| **2.3** | Favoritos del coach (star, Supabase o localStorage) | **Pendiente** | Solo hay **Recientes** (`DraggableExerciseCatalog.tsx`) |
| **2.3** | Hover = tooltip con GIF a la derecha (sin abrir modal) | **Pendiente** | Hay **modal** de preview al click en icono, no tooltip hover |
| **2.3** | Filtro por **equipment** | **Pendiente** | Filtro por grupo muscular; sin `equipment` en UI |
| **2.3** | Vista grid 2 columnas “explorar” | **Pendiente** | |
| **6.1** | Hover en **card del día** → GIF en tooltip | **Pendiente** | Thumbnail en card sí; sin tooltip hover |
| **6.1** | Click thumb card día → pantalla completa | **Pendiente** | No aparece `expandedGif` u equivalente en builder |

### 3.3 Días, layout y visual (§2.1, §2.4, §2.6, §4.4, §5–§7)

| Ref. | Tema | Estado | Notas |
|------|------|--------|--------|
| **2.1** | Columnas `min-w-[220px]` / `max-w-[260px]`, `max-h-[calc(100vh-120px)]` explícitos | **Parcial** | Hay `min-w-[280px]` etc. en `DayColumn`; no coincide con spec del doc |
| **2.4** | Barra de progreso de “carga semanal” (sets×ej) bajo título | **Pendiente** | Hay contadores numéricos + puntos de color, no barra de progreso |
| **2.6** | **Nota por día** (texto largo, distinto del título) | **Pendiente** | `DayState` tiene `title`, no campo `notes` persistido por día |
| **2.6** | Secciones C/P/E | **Hecho** | `section`, droppables, W/P/E |
| **4.4** | Timeline **Semana 1 \| 2 \| 3** con inicio/fin calendario | **Parcial** | Existe **timeline de fases** (`ProgramPhasesBar`), no la franja genérica por `weeks_to_repeat` + fechas |
| **5.1–5.3** | Más breakpoints, layout tablet, 7 columnas sin scroll en desktop grande | **Pendiente** | Sigue dominando `md:` |
| **5.4** | `-webkit-overflow-scrolling: touch` (iOS) | **Pendiente** | |
| **6.3** | Sugerencias rápidas de título de día (Push, Pull, …) | **Pendiente** | Título libre editable |
| **7.2** | Estado vacío con CTA “+ Añadir” siempre visible | **Parcial** | Copy actual distinto del mock del informe |
| **7.3** | Micro-animaciones (contador día, pulse guardar, shake validación) | **Pendiente** | |
| **7.4** | Subtítulo header “X semanas · N días activos” | **Pendiente** | Parte de la info está en config colapsable |

### 3.4 Mobile (§3)

| Ref. | Tema | Estado | Notas |
|------|------|--------|--------|
| **3.1** | Vista acordeón vertical alternativa | **Pendiente** | Tabs + swipe actuales |
| **3.1** | Emoji / preview muscular en tab | **Pendiente** | |
| **3.2** | Sheet mínimo: solo búsqueda + grid de grupos como atajos | **Parcial** | Sheet 3 alturas; no el spec exacto del doc |
| **3.2** | Haptic + micro-animación al tap-add | **Pendiente** | |
| **3.3** | Sheet edición en 2 pasos (Quick vs “Más opciones”) | **Pendiente** | `BlockEditSheet` lista larga; quick edit está en **card**, no en sheet |
| **3.4** | Feedback visual durante los 300 ms del `TouchSensor` | **Pendiente** | `WeeklyPlanBuilder.tsx` usa `delay: 300` |

### 3.5 Flujo coach (§4, §9)

| Ref. | Tema | Estado | Notas |
|------|------|--------|--------|
| **4.1** | “Copiar un día desde plantilla X” sin reemplazar todo el plan | **Pendiente** | Copiar día entre días del **mismo** builder sí |
| **9.4 V2** | Fases con plan de ejercicios distinto por fase | **Pendiente** | En `PENDIENTE.md` como evolución |
| **9.5** | “Usar como base para otro cliente” (abrir builder sin asignar) | **Parcial** | Duplicar / templates existen; flujo explícito puede faltar |
| **9.6** | Estilo visual “base en gris / modificado en blanco” | **Parcial** | Badges Base/Modif.; no el esquema de color del doc |
| **9.7** | Progresión: peso sugerido en **vista cliente** por semana | **No verificado aquí** | Badge en builder sí; cliente app fuera de este grep |
| **9.9** | Exportar preview como imagen | **Pendiente** | Preview modal; sin export imagen |
| **9.10** | Botón explícito “Empieza hoy” | **Parcial** | Fecha por defecto hoy + flexible; no botón dedicado citado en doc |

### 3.6 Producto / datos

| Tema | Estado | Notas |
|------|--------|--------|
| Sync plantilla por `exercise_id` además de posición | **Pendiente** | En `PENDIENTE.md` |
| `MUSCLE_GROUPS` vs DB real | **Pendiente** | `src/lib/constants.ts` — deuda en `PENDIENTE.md` |

### 3.7 Verificación manual (informe — checklist final)

- [ ] Regresión mobile iOS Safari + Android Chrome  
- [ ] Tablet ~768px  
- [ ] DnD touch extremo a extremo  
- [ ] GIFs y lazy load bajo red lenta  
- [ ] Borrador localStorage vs guardado manual  
- [ ] Builder “offline” solo con borrador (sin prometer sync)  

---

## 4. Priorización sugerida (backlog)

Orden orientativo por impacto / esfuerzo:

1. **Alta:** **1.4** atomicidad de guardado · **MUSCLE_GROUPS** vs DB · **Error Boundary** (8.4).  
2. **Media:** virtualización catálogo (8.1) · tipos DnD (8.3) · **3.4** feedback touch · **5.4** iOS scroll · **4.4** timeline por semanas de programa si se distingue de fases.  
3. **UX rica:** favoritos · equipment · notas por día · sheet 2 pasos · sugerencias título día · hover tooltips · layout tablet.  
4. **Nice-to-have:** acordeón mobile · grid catálogo · animaciones §7.3 · export imagen preview · V2 fases con ejercicios.

---

## 5. Documentos relacionados

| Archivo | Uso |
|---------|-----|
| `PENDIENTE.md` | Cierre Fases 1–3 + mejoras técnicas y deuda ya listadas |
| `public/quirky-stirring-rabin.md` | Visión completa y contexto (mucho más amplio que las 3 fases) |
| Este archivo | **Gap analysis** informe ↔ código tras implementación reciente |

---

_Última revisión de código: 2026-04-07._

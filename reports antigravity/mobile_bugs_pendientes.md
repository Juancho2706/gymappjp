# Mobile Bugs Pendientes — WeeklyPlanBuilder

_Detectados en screenshot del usuario, 2026-04-07_

---

## Bug 1 — Badge "CAMBIOS SIN GUARDAR" se corta en el header

**Síntoma:** El badge naranja queda cortado porque está dentro de un `<h1>` con `max-w-[200px]` que trunca el texto.

**Fix:** En `WeeklyPlanBuilder.tsx`, sacar el badge del `<h1>` y ponerlo en una segunda línea `<p>` debajo del nombre del programa, visible solo en mobile (`md:hidden`). En desktop puede seguir donde está o desaparecer (ya cabe).

**Archivo:** `src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx`  
**Zona:** `<header>` → bloque del nombre del programa + badge `hasUnsavedChanges`

---

## Bug 2 — Demasiado padding/espacio entre el builder y los bordes del móvil

**Síntoma:** El builder no ocupa el ancho completo del teléfono — tiene márgenes laterales que consumen espacio valioso en mobile.

**Causa probable:** El layout de coach (`src/app/coach/layout.tsx`) envuelve el `<main>` con `px-4 py-6` o similar. El builder necesita "romper" ese padding.

**Fix:**
1. En la página del builder (`page.tsx` dentro de `[clientId]/`), leer si hay clases de padding aplicadas por el layout.
2. Opción A: Agregar `className="-mx-4 -my-6"` o `className="!p-0 -m-4"` al div raíz del builder para cancelar el padding del layout.
3. Opción B: En `coach/layout.tsx`, condicionalmente quitar el padding cuando la ruta es `/coach/builder/*` (usando `usePathname`).
4. Opción C (más limpia): El div raíz del builder ya tiene `h-[100dvh]` — agregar también `w-screen` y `fixed inset-0 z-10` para que sea full-bleed.

**Archivos a revisar:**
- `src/app/coach/layout.tsx` — ver el padding del `<main>`
- `src/app/coach/builder/[clientId]/page.tsx` — ver si pasa props al builder
- `src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx` — div raíz (línea ~300)

---

## Bug 3 — Config/Configuración no se puede reabrir en mobile

**Síntoma:** El `ProgramConfigHeader` tiene un botón "Ocultar" pero en mobile no hay ningún botón para volver a mostrarlo.

**Fix:** En `WeeklyPlanBuilder.tsx`, el botón de Settings (`<Settings>`) en el header mobile debe estar **siempre visible** y hacer toggle del estado `showConfig`. Actualmente el botón existe en desktop pero en mobile se oculta o no hay acceso al toggle. 

Adicionalmente, colapsar los botones secundarios (Plantillas, Preview, Balance, Imprimir, Undo, Redo) en un `<DropdownMenu>` con trigger `<MoreVertical>` en mobile para liberar espacio en el header y que el botón de Settings sea visible.

**Estructura header mobile propuesta:**
```
[←] [Nombre programa]    [⋯MoreVertical] [Settings] [Guardar]
```

**Archivo:** `src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx`  
**Zona:** `<header>` → botones de acción

**Detalle del DropdownMenu (mobile only, `md:hidden`):**
- Plantillas (LayoutTemplate)
- Vista Previa (Eye)
- Asignar a Clientes (Users) 
- Balance Muscular (BarChart3)
- Imprimir (Printer)
- --- separador ---
- Deshacer / Rehacer (Undo2 / Redo2)

---

## Orden de implementación sugerido

1. **Bug 3** (Settings toggle) — más impactante funcionalmente, bloquea al usuario
2. **Bug 2** (padding) — inspeccionar `coach/layout.tsx` primero, una línea de fix
3. **Bug 1** (badge cortado) — cambio simple de JSX en el header

---

## Notas

- `MoreVertical` ya está importado en `WeeklyPlanBuilder.tsx`
- `DropdownMenu` y sus subcomponentes ya están importados en `WeeklyPlanBuilder.tsx`
- El estado `showConfig` (o similar) ya existe para el `ProgramConfigHeader`

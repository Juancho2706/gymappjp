---
status: implemented-pending-qa
owner: product-engineering
last_verified: "2026-08-28"
canonical: false
---

# SPEC — «+ Nueva» pregunta qué crear (biblioteca de programas, web + RN)

> **IMPLEMENTADA EN CÓDIGO — 2026-08-28.** Mockup aprobado por el owner (artifact
> `9d979bfa-f5c0-4dc8-8356-5f0f1c89cf51`, «Incompleto y Nueva»). Sin cambios nativos ⇒ sale por
> OTA a runtime 1.1.2 + deploy web. Queda el QA en device/navegador del owner (ver [TASKS](TASKS.md)).

## Problema

El CTA hero de la biblioteca de programas («+ Nueva» en RN, «Nueva plantilla» en web) tenía una
sola salida: el builder de programas. Crear un **ejercicio personalizado** exigía saber que vive
detrás de «Ejercicios»/«Lista de ejercicios» → «Crear». Pedido literal del owner: «que ese botón de
nueva haga salir un modal diciendo si es nuevo ejercicio personalizado o nueva rutina, para hacerle
la vida más simple a los coachs».

## Decisión

Tocar «+ Nueva» abre una hoja de elección **«¿Qué querés crear?»** («Elegí qué sumar a tu
biblioteca.») con dos filas de la misma anatomía (chip de ícono + título + subtítulo + chevron):

| Fila | Tono | Destino |
|---|---|---|
| **Programa nuevo** — «Plantilla o rutina para asignar a tus alumnos» | sport (marca) | igual que hoy: builder en modo plantilla |
| **Ejercicio personalizado** — «Queda en tu biblioteca para usarlo en cualquier programa» | success (el verde del chip «Ejercicios») | catálogo de ejercicios con `?create=1`, que abre el formulario de alta solo |

- «Cancelar» debajo; deslizar / tocar afuera cierra. Un toque más solo para quien crea un programa.
- `?create=1` se consume **una vez por montaje** y se limpia de la URL/params (volver atrás o
  refrescar no lo reabre). Sin permiso de rol: el aviso que ya existía («Sin permiso» en RN, toast
  «Tu rol no permite crear ejercicios» en web).
- Analytics: `library_new_pressed` y `library_new_choice { choice: 'program' | 'exercise' }`
  (web agrega `surface: 'desktop' | 'mobile'`).
- Web responsive: `sm+` = dropdown anclado al botón «Nueva»; `<sm` (PWA) = bottom sheet con las
  mismas filas. Sin hooks de media query (CSS puro, cero flash en SSR).

## Fuera de alcance

- Crear el ejercicio **dentro** de la hoja (el formulario ya existe en el catálogo; no se duplica).
- Cambiar «Lista de ejercicios» / «Áreas del builder» de la web.

## Superficies

- RN: `apps/mobile/app/coach/(tabs)/builder.tsx` (hoja `Sheet` nativeModal) +
  `apps/mobile/app/coach/(tabs)/ejercicios.tsx` (`?create=1`). `ProgramLibraryHero.tsx` no se
  usa (huérfano) y no se tocó.
- Web: `apps/web/src/app/coach/workout-programs/components/LibraryHeader.tsx` (dropdown + sheet) +
  `apps/web/src/app/coach/exercises/ExerciseCatalogClient.tsx` (`?create=1`).

## Hermana del mismo tren (arregla, sin spec propia)

Hoja «Entrenamiento incompleto» del alumno RN (`components/alumno/home/ActiveProgramSection.tsx`,
`DoubleIntentSheet`): las dos filas usaban `bg-sport-100` sin `dark:` y en oscuro ese token es el
azul de marca crudo ⇒ fondo sólido + título azul claro ilegible. Ahora `border-sport-500/25
bg-sport-100 dark:bg-sport-100/[0.16]` + título `text-strong`, el mismo patrón que el banner
warning de esa pantalla y que la web (`WorkoutDoneSheet.tsx`, que ya estaba bien).

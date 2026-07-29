'use client'

import { useEffect } from 'react'

/**
 * Clase que se pone en `<body>` mientras haya al menos un sheet V2 del alumno abierto. El nav
 * del alumno (la cápsula flotante `nav.client-nav-mobile`) se oculta por CSS con esta clase
 * (ver globals.css). Fix determinista al bug de apilamiento: el `<main>` de la vista alumno es
 * `relative z-0`, así que crea su propio contexto de apilamiento y atrapa el z-index del sheet
 * DENTRO de él; la cápsula del nav vive como hermana del `main` a `z-index:59`, por encima de todo
 * el subárbol del `main`. En vez de pelear el z-index, ocultamos la cápsula mientras el sheet vive.
 */
const SHEET_OPEN_BODY_CLASS = 'eva-v2-sheet-open'
/**
 * Contador de referencias de sheets abiertos: la clase del body solo se retira cuando se cierra
 * el ÚLTIMO sheet (soporta aperturas anidadas / transiciones con dos modales montados a la vez,
 * p. ej. el sheet de equivalencias que cierra abriendo el `TodayModal` de registrar alimento).
 */
let openSheetCount = 0

/**
 * Marca el `<body>` mientras `open` sea true para que la cápsula del nav del alumno se oculte y
 * nunca tape los inputs ni los CTAs del sheet. Compartido por `TodayModal` y
 * `PortionEquivalencesSheet` para que ambos usen el MISMO contador de referencias.
 */
export function useSheetBodyMarker(open: boolean): void {
  useEffect(() => {
    if (!open) return
    openSheetCount += 1
    document.body.classList.add(SHEET_OPEN_BODY_CLASS)
    return () => {
      openSheetCount = Math.max(0, openSheetCount - 1)
      if (openSheetCount === 0) document.body.classList.remove(SHEET_OPEN_BODY_CLASS)
    }
  }, [open])
}

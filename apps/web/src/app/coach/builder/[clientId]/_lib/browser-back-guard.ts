/**
 * «Atrás» del NAVEGADOR en el builder web — decisión pura (SPEC `plan-vivo-y-guardado`, R3.3).
 *
 * El builder ya cubría el cierre de pestaña (`beforeunload`) y su propia flecha ← (`requestExit`),
 * pero el botón «atrás» del navegador se llevaba el trabajo del día sin preguntar. App Router no
 * expone un guard de navegación, así que el componente arma UN sentinela de historial al montar y
 * escucha `popstate`; este módulo es la regla que aplica cuando ese `popstate` llega.
 *
 * Las DOS ramas importan igual:
 *  · con cambios sin guardar hay que reponer el sentinela ANTES de preguntar, para que «Seguir
 *    editando» deje el historial exactamente como estaba (si no, el segundo «atrás» sale sin aviso);
 *  · sin nada que perder hay que salir DE VERDAD al mismo destino que la flecha ←. Si solo se
 *    consumiera el sentinela, el coach apretaría «atrás» y se quedaría en la misma pantalla —
 *    peor que no tener guard.
 *
 * PURO a propósito (sin React ni DOM): es la parte de la mecánica que se puede testear sin
 * navegador, que es justo donde vivía el bug de la primera versión.
 */

import { shouldConfirmExit, type ExitGuardState } from '@eva/plan-builder'

export interface BrowserBackState extends ExitGuardState {
    /** Destino de la salida real: el MISMO href que usa la flecha ← de la cabecera. */
    backHref: string
}

export type BrowserBackEffect =
    /** Hay algo que perder: se repone el sentinela y se pregunta con el AlertDialog del DS. */
    | { type: 'confirm'; rearmSentinel: true }
    /** Nada que perder: el «atrás» tiene que navegar de verdad. */
    | { type: 'leave'; href: string }

export function resolveBrowserBack({ dirty, saving, backHref }: BrowserBackState): BrowserBackEffect {
    return shouldConfirmExit({ dirty, saving })
        ? { type: 'confirm', rearmSentinel: true }
        : { type: 'leave', href: backHref }
}

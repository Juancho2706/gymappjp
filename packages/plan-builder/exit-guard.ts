/**
 * Guard de salida del builder de programas — decisión + copy, compartidos web ↔ mobile.
 *
 * El builder tiene autosave local del borrador en las DOS plataformas (RN AsyncStorage, debounce
 * 2500 ms · web localStorage, debounce 3000 ms), así que el «perdés todo» clásico es MENTIRA: al
 * salir con cambios sin guardar el borrador sigue en el dispositivo, lo que no queda es el
 * programa persistido en el servidor. El copy lo dice tal cual para no asustar de más ni prometer
 * de menos.
 *
 * PURA a propósito: RN no tiene runner de tests (`vitest.config.ts` no incluye `apps/mobile/**`),
 * así que la única forma de cubrir la regla en las dos plataformas es un módulo sin JSX ni APIs de
 * plataforma, testeado una sola vez desde `packages/**`.
 */

/** Título del diálogo (RN `Alert.alert` · web `AlertDialogTitle`). */
export const EXIT_GUARD_TITLE = '¿Salir del builder?'

/**
 * Cuerpo del diálogo. Voz de la app = tuteo (el resto del builder dice «Ingresa un nombre»,
 * «Agrega al menos un ejercicio»); mezclarlo con voseo en el mismo diálogo se lee como un bug.
 */
export const EXIT_GUARD_BODY =
    'Tienes cambios sin guardar. Se conservan como borrador en este dispositivo, pero no quedan en el programa.'

/** Acción de cancelar (la que no pierde nada: es la default). */
export const EXIT_GUARD_STAY = 'Seguir editando'

/** Acción destructiva. */
export const EXIT_GUARD_LEAVE = 'Salir'

export interface ExitGuardState {
    /** ¿Hay ediciones posteriores al último guardado? (`dirty` en RN, `hasUnsavedChanges` en web). */
    dirty: boolean
    /** ¿Hay un guardado en vuelo? (`saving` en RN, `isPending` en web). */
    saving: boolean
}

/**
 * ¿Hay que pedir confirmación antes de salir?
 *
 * Guardando NO se pregunta: el guardado en vuelo va a limpiar el estado sucio solo, y frenar al
 * coach con un diálogo sobre cambios que se están persistiendo justo ahí es ruido puro.
 */
export function shouldConfirmExit({ dirty, saving }: ExitGuardState): boolean {
    return dirty && !saving
}

/** Qué tiene que hacer el builder cuando el usuario aprieta «atrás». */
export type BuilderBackAction =
    /** Hay una hoja/overlay encima: el back la cierra a ELLA y no toca la navegación. */
    | 'close-overlay'
    /** Nada encima y hay cambios sin guardar: se pregunta antes de salir. */
    | 'confirm-exit'
    /** Nada encima y nada que perder: se sale derecho. */
    | 'exit'

export interface BuilderBackState extends ExitGuardState {
    /** Hojas/overlays montados encima del builder (bottom sheets, modales propios). */
    openOverlays: number
}

/**
 * Decisión del back de hardware de Android.
 *
 * El orden importa y es la razón de que esto exista: `@gorhom/bottom-sheet` (5.2.14) NO
 * registra ningún listener de `hardwareBackPress` —cero coincidencias de `BackHandler` en su
 * fuente—, así que nadie cerraba las hojas del builder al apretar back. Sin este guard el
 * back saltaba directo a «¿Salir del builder?» CON la hoja abierta encima, y aceptar dejaba
 * la pantalla montada. Primero se cierra lo que está encima; recién sin nada encima corre la
 * regla de salida.
 */
export function resolveBuilderBack({ openOverlays, dirty, saving }: BuilderBackState): BuilderBackAction {
    if (openOverlays > 0) return 'close-overlay'
    return shouldConfirmExit({ dirty, saving }) ? 'confirm-exit' : 'exit'
}

/**
 * Destino de la flecha «atrás» del builder web: la ficha del alumno, o la biblioteca de plantillas
 * cuando el programa no tiene alumno. Es exactamente el href que tenía el `<Link>` de la cabecera
 * antes de pasar por el guard — el guard NO cambia a dónde se va, solo si se pregunta antes.
 */
export function builderBackHref(clientId: string | null | undefined): string {
    return clientId ? `/coach/clients/${clientId}` : '/coach/templates'
}

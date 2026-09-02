import { describe, expect, it } from 'vitest'
import {
    EXIT_GUARD_BODY,
    EXIT_GUARD_TITLE,
    builderBackHref,
    resolveBuilderBack,
    shouldConfirmExit,
} from './exit-guard'

/**
 * Este test es la ÚNICA cobertura automatizada del guard en las dos plataformas: web monta el
 * `AlertDialog` y RN el `Alert.alert`, pero la regla de «¿pregunto o no?» es esta función y RN no
 * tiene runner propio (`vitest.config.ts` no incluye `apps/mobile/**`).
 */
describe('shouldConfirmExit', () => {
    it('sin cambios sale derecho', () => {
        expect(shouldConfirmExit({ dirty: false, saving: false })).toBe(false)
    })

    it('con cambios sin guardar pregunta', () => {
        expect(shouldConfirmExit({ dirty: true, saving: false })).toBe(true)
    })

    it('mientras se guarda NO pregunta (el guardado en vuelo limpia el estado sucio solo)', () => {
        expect(shouldConfirmExit({ dirty: true, saving: true })).toBe(false)
    })

    it('guardando y limpio tampoco pregunta', () => {
        expect(shouldConfirmExit({ dirty: false, saving: true })).toBe(false)
    })
})

describe('resolveBuilderBack', () => {
    it('con una hoja abierta NO pregunta: el back cierra la hoja', () => {
        // El bug que motiva esto: @gorhom/bottom-sheet no registra listener de
        // `hardwareBackPress`, así que el back con el catálogo de ejercicios abierto mostraba
        // «¿Salir del builder?» encima de la hoja y aceptar se iba con la hoja montada.
        expect(resolveBuilderBack({ openOverlays: 1, dirty: true, saving: false })).toBe('close-overlay')
    })

    it('la hoja gana también sin cambios sin guardar', () => {
        expect(resolveBuilderBack({ openOverlays: 1, dirty: false, saving: false })).toBe('close-overlay')
        expect(resolveBuilderBack({ openOverlays: 3, dirty: false, saving: true })).toBe('close-overlay')
    })

    it('sin nada encima cae en la regla de salida de siempre', () => {
        expect(resolveBuilderBack({ openOverlays: 0, dirty: true, saving: false })).toBe('confirm-exit')
        expect(resolveBuilderBack({ openOverlays: 0, dirty: false, saving: false })).toBe('exit')
        expect(resolveBuilderBack({ openOverlays: 0, dirty: true, saving: true })).toBe('exit')
    })

    it('un contador negativo o cero se trata como «nada encima»', () => {
        expect(resolveBuilderBack({ openOverlays: 0, dirty: true, saving: false })).toBe('confirm-exit')
        expect(resolveBuilderBack({ openOverlays: -1, dirty: true, saving: false })).toBe('confirm-exit')
    })
})

describe('builderBackHref', () => {
    it('con alumno vuelve a su ficha', () => {
        expect(builderBackHref('abc-123')).toBe('/coach/clients/abc-123')
    })

    it('sin alumno vuelve a la biblioteca de plantillas', () => {
        expect(builderBackHref(null)).toBe('/coach/templates')
        expect(builderBackHref(undefined)).toBe('/coach/templates')
        expect(builderBackHref('')).toBe('/coach/templates')
    })
})

describe('copy del guard', () => {
    it('no promete que se pierde todo: hay autosave del borrador', () => {
        expect(EXIT_GUARD_TITLE).toContain('¿Salir')
        expect(EXIT_GUARD_BODY).toContain('borrador')
        expect(EXIT_GUARD_BODY.toLowerCase()).not.toContain('pierdes')
        expect(EXIT_GUARD_BODY.toLowerCase()).not.toContain('perdés')
    })
})

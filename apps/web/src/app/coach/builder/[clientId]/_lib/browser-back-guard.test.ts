import { describe, expect, it } from 'vitest'
import { resolveBrowserBack } from './browser-back-guard'

/**
 * SPEC `docs/specs/plan-vivo-y-guardado` R3.3 — el «atrás» del NAVEGADOR.
 *
 * El arnés de abajo espeja la mecánica real del builder (`WeeklyPlanBuilder.tsx`): al montar se
 * empuja UN sentinela con la misma url, el listener de `popstate` vive todo el montaje y decide
 * con el estado FRESCO. Se simula acá porque el bug de la primera versión no era de copy ni de
 * estilo: era de secuencia (el sentinela se ataba a `hasUnsavedChanges` y el segundo ciclo de
 * edición quedaba sin guard), y una secuencia se testea sin navegador.
 */

const BACK_HREF = '/coach/clients/66666666-6666-4666-8666-666666666666'
const SENTINELA = 'builder#sentinela'

class BuilderBackSession {
    /** Entradas del historial, de la más vieja a la más nueva. */
    history: string[]
    dialogOpen = false
    navigatedTo: string | null = null
    dirty = false
    saving = false

    constructor() {
        // Montaje: la ficha del alumno, el builder, y el sentinela — UNO, siempre.
        this.history = ['/coach/clients/…', '/coach/builder/…']
        this.history.push(SENTINELA)
    }

    edit() { this.dirty = true }
    save() { this.dirty = false; this.saving = false }

    /** El coach aprieta «atrás»: el navegador consume la entrada y recién ahí llega `popstate`. */
    back() {
        this.history.pop()
        const effect = resolveBrowserBack({ dirty: this.dirty, saving: this.saving, backHref: BACK_HREF })
        if (effect.type === 'leave') {
            this.navigatedTo = effect.href
            return
        }
        this.history.push(SENTINELA)
        this.dialogOpen = true
    }

    /** «Seguir editando» del AlertDialog. */
    stay() { this.dialogOpen = false }
}

describe('resolveBrowserBack — regla de decisión del handler', () => {
    it('con cambios sin guardar: se pregunta y se repone el sentinela', () => {
        expect(resolveBrowserBack({ dirty: true, saving: false, backHref: BACK_HREF }))
            .toEqual({ type: 'confirm', rearmSentinel: true })
    })

    it('sin cambios: sale de verdad, al mismo destino que la flecha ←', () => {
        expect(resolveBrowserBack({ dirty: false, saving: false, backHref: BACK_HREF }))
            .toEqual({ type: 'leave', href: BACK_HREF })
    })

    it('guardando no se pregunta: el guardado en vuelo limpia el estado solo', () => {
        expect(resolveBrowserBack({ dirty: true, saving: true, backHref: BACK_HREF }))
            .toEqual({ type: 'leave', href: BACK_HREF })
    })
})

describe('«atrás» del navegador — los cuatro escenarios del builder', () => {
    it('1) sucio → atrás: aparece el diálogo y «Seguir editando» deja el historial como estaba', () => {
        const s = new BuilderBackSession()
        const before = [...s.history]

        s.edit()
        s.back()

        expect(s.dialogOpen).toBe(true)
        expect(s.navigatedTo).toBeNull()
        s.stay()
        expect(s.history).toEqual(before)
    })

    it('2) sucio → guardar → atrás: sale de verdad, sin diálogo', () => {
        const s = new BuilderBackSession()

        s.edit()
        s.save()
        s.back()

        expect(s.dialogOpen).toBe(false)
        expect(s.navigatedTo).toBe(BACK_HREF)
    })

    it('3) sucio → guardar → ensuciar otra vez → atrás: vuelve a preguntar (regresión)', () => {
        const s = new BuilderBackSession()

        s.edit()
        s.save()
        s.edit()
        s.back()

        expect(s.dialogOpen).toBe(true)
        expect(s.navigatedTo).toBeNull()
        // Y sigue habiendo exactamente UN sentinela: rearmar por ciclo acumulaba entradas
        // huérfanas y obligaba a apretar «atrás» N veces para salir.
        expect(s.history.filter((h) => h === SENTINELA)).toHaveLength(1)
    })

    it('4) limpio desde el arranque → atrás: sale a la primera', () => {
        const s = new BuilderBackSession()

        s.back()

        expect(s.navigatedTo).toBe(BACK_HREF)
        expect(s.dialogOpen).toBe(false)
    })

    it('el diálogo se puede repetir: «Seguir editando» no gasta el guard', () => {
        const s = new BuilderBackSession()

        s.edit()
        s.back()
        s.stay()
        s.back()

        expect(s.dialogOpen).toBe(true)
        expect(s.navigatedTo).toBeNull()
    })
})

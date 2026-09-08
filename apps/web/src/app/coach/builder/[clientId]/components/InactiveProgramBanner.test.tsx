import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InactiveProgramBanner, inactiveProgramNotice } from './InactiveProgramBanner'

/**
 * SPEC `docs/specs/plan-vivo-y-guardado` (R1.1, R1.2). El incidente del 07-09-2026 fue exactamente
 * esto: `is_active = false` llegaba al builder y NADIE lo leía, así que el coach editó una tarde
 * entera un plan que su alumna ya no veía. Lo que se protege acá es la regla, no el estilo:
 * inactivo ⇒ el aviso aparece con el copy fijado en el PLAN; activo ⇒ no aparece nada.
 */

const CLIENT_ID = '66666666-6666-4666-8666-666666666666'
const ACTIVE = { id: '77777777-7777-4777-8777-777777777777', name: 'Fuerza · Bloque 2' }

describe('inactiveProgramNotice — copy exacto del PLAN', () => {
    it('inactivo con rutina activa: título, cuerpo que nombra el programa vivo y CTA', () => {
        expect(inactiveProgramNotice({
            programIsActive: false,
            clientName: 'Angela',
            activeProgramName: 'Fuerza · Bloque 2',
        })).toEqual({
            title: 'Angela ya no ve esta rutina.',
            body: 'Quedó guardada como historial cuando le asignaste «Fuerza · Bloque 2». Lo que edites acá no le va a llegar.',
            cta: 'Ir a la rutina que Angela está usando',
        })
    })

    it('inactivo sin ninguna rutina activa: cuerpo alternativo y sin CTA', () => {
        expect(inactiveProgramNotice({
            programIsActive: false,
            clientName: 'Angela',
            activeProgramName: null,
        })).toEqual({
            title: 'Angela ya no ve esta rutina.',
            body: 'Quedó guardada como historial y Angela no tiene ninguna rutina activa.',
            cta: null,
        })
    })

    it('sin nombre del alumno: no queda un hueco en la frase', () => {
        const notice = inactiveProgramNotice({ programIsActive: false, clientName: '  ' })
        expect(notice?.title).toBe('Tu alumno ya no ve esta rutina.')
        expect(notice?.body).toBe('Quedó guardada como historial y tu alumno no tiene ninguna rutina activa.')
    })

    it('activo o desconocido (plantilla, programa nuevo): no hay nada que avisar', () => {
        expect(inactiveProgramNotice({ programIsActive: true, clientName: 'Angela' })).toBeNull()
        expect(inactiveProgramNotice({ programIsActive: null, clientName: 'Angela' })).toBeNull()
        expect(inactiveProgramNotice({ clientName: 'Angela' })).toBeNull()
    })
})

describe('InactiveProgramBanner — render', () => {
    it('con is_active === false pinta el aviso y linkea a la rutina que el alumno usa', () => {
        const { container } = render(
            <InactiveProgramBanner
                programIsActive={false}
                clientId={CLIENT_ID}
                clientName="Angela"
                activeProgram={ACTIVE}
            />
        )

        expect(container.textContent).toContain('Angela ya no ve esta rutina.')
        expect(container.textContent).toContain(
            'Quedó guardada como historial cuando le asignaste «Fuerza · Bloque 2». Lo que edites acá no le va a llegar.'
        )

        const cta = screen.getByRole('link', { name: 'Ir a la rutina que Angela está usando' })
        expect(cta).toHaveAttribute('href', `/coach/builder/${CLIENT_ID}?programId=${ACTIVE.id}`)

        // No descartable: el estado de lo que se edita no es un tip que se cierre.
        expect(screen.queryByRole('button')).toBeNull()
    })

    it('sin rutina activa: avisa igual y no ofrece un link a ningún lado', () => {
        const { container } = render(
            <InactiveProgramBanner
                programIsActive={false}
                clientId={CLIENT_ID}
                clientName="Angela"
                activeProgram={null}
            />
        )

        expect(container.textContent).toContain(
            'Quedó guardada como historial y Angela no tiene ninguna rutina activa.'
        )
        expect(screen.queryByRole('link')).toBeNull()
    })

    it('con is_active === true no aparece nada', () => {
        const { container } = render(
            <InactiveProgramBanner
                programIsActive
                clientId={CLIENT_ID}
                clientName="Angela"
                activeProgram={ACTIVE}
            />
        )

        expect(container).toBeEmptyDOMElement()
    })
})

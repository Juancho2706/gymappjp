import { afterAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { WorkoutPlanCards, type WorkoutPlanCardItem } from './WorkoutPlanCard'

/**
 * Regresión EVA-NEXTJS-18 (Hydration Error, substatus `regressed`, último evento 2026-09-04T23:10:50Z
 * sobre el release `f9ba8a3f` en `/c/7LQ8B/dashboard`).
 *
 * QUÉ PINNEA: el sub-label de una day-card de CICLO ya cerrada («Hecho 26 ago») se arma con la tabla
 * fija de `@/lib/date-utils` y no con `toLocaleDateString`/`Intl`. Ese texto viaja en el HTML del
 * servidor (la tira se hidrata, no está detrás de `dynamic({ ssr:false })` ni de un sheet cerrado), y
 * el WebKit de iOS 26 abrevia el mes con punto («26 ago.», «2 sept.») mientras el Node 24 de Vercel
 * no: un solo carácter de diferencia y React tira el mismatch. Es exactamente lo que ya cerró el
 * barrido O7.1 en la grilla de PRs (`PersonalRecordsList`, commit `613f870a`) y que esta call site se
 * había salteado.
 *
 * No hace falta mockear nada: `useBasePath` y `useWorkoutLaunch` caen a un default sin provider, y el
 * `WorkoutDoneSheet` no se monta hasta que se toca una card.
 */

const TZ_ORIGINAL = process.env.TZ

afterAll(() => {
    process.env.TZ = TZ_ORIGINAL
})

/** Día de ciclo YA cerrado: es el único camino que pinta una fecha en el render inicial. */
function diaDeCicloHecho(overrides: Partial<WorkoutPlanCardItem> = {}): WorkoutPlanCardItem {
    return {
        id: 'plan-1',
        title: 'Empuje',
        day_of_week: 1,
        mode: 'cycle',
        dayLabel: 'Día 1',
        dayLabelLong: 'Día 1 de 5',
        status: 'done',
        isToday: false,
        dateIso: '2026-08-26',
        // En ciclo no hay atribución de calendario: sin esto el sub-label sería «Hecho el martes».
        doneOnDate: null,
        doneOnLabel: null,
        completionPct: 1,
        ...overrides,
    }
}

/** HTML del servidor de la tira, tal cual lo emite Next antes de hidratar. */
function htmlDelServidor(plans: WorkoutPlanCardItem[]): string {
    return renderToStaticMarkup(<WorkoutPlanCards coachSlug="mi-coach" plans={plans} />)
}

describe('WorkoutPlanCard — fecha del sub-label sin Intl (EVA-NEXTJS-18, O7.7)', () => {
    it('un día de ciclo cerrado imprime «Hecho 26 ago», sin el punto que agrega el ICU de iOS 26', () => {
        const html = htmlDelServidor([diaDeCicloHecho()])
        expect(html).toContain('Hecho 26 ago')
        expect(html).not.toMatch(/ago\./)
    })

    it('septiembre — «Hecho 2 sept», la abreviatura donde más divergen los ICU («sep» / «sept.»)', () => {
        const html = htmlDelServidor([diaDeCicloHecho({ dateIso: '2026-09-02' })])
        expect(html).toContain('Hecho 2 sept')
        expect(html).not.toMatch(/sept\./)
    })

    it('el HTML es idéntico con la TZ del alumno (America/New_York) y con la del runtime (UTC)', () => {
        // Los dos lados del mismatch real: Vercel renderiza en UTC y el iPhone del alumno hidrata en
        // America/New_York (contexto `culture` del evento de Sentry). Mismo string ⇒ no hay mismatch.
        const plans = [
            diaDeCicloHecho(),
            diaDeCicloHecho({ id: 'plan-2', title: 'Tirón', day_of_week: 2, dateIso: '2026-09-02' }),
        ]

        process.env.TZ = 'UTC'
        const enElServidor = htmlDelServidor(plans)

        process.env.TZ = 'America/New_York'
        const enElNavegador = htmlDelServidor(plans)

        expect(enElNavegador).toBe(enElServidor)
    })

    it('un día de ciclo cerrado sin fecha registrada dice «Hecho» pelado, nunca «Invalid Date»', () => {
        const html = htmlDelServidor([diaDeCicloHecho({ dateIso: '' })])
        expect(html).toContain('Hecho')
        expect(html).not.toContain('Invalid Date')
    })
})

import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { getTodayInSantiago } from '@/lib/date-utils'
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

afterEach(() => {
    cleanup()
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

/**
 * Hoja «Ya hiciste» (SPEC `vuelta-nueva-salud-y-reloj` §3.5, CA1.5). Lo que pinnea:
 *
 *  · Un día hecho ANTES de hoy intercambia las dos opciones —posición, jerarquía y DESTINO—: primero
 *    «Entrenarlo hoy» (`?repetir=`) y debajo «Corregir registros del {fecha}» (`?fecha=`). El bug que
 *    evita es el clásico de este cambio: renombrar los botones y dejar los `href` cruzados.
 *  · El día hecho HOY no cambia nada: «Revisar y editar» sola, sin «Repetir hoy» (índice único por
 *    día: repetir hoy sobre hoy pisaría la misma fila).
 *
 * La hoja es el MISMO componente en las dos superficies de la web: bottom sheet en móvil y modal
 * centrado en `md+` (overrides `md:` de `WorkoutDoneSheet.tsx`), así que el contenido se prueba una vez.
 */
function abrirLaHoja(item: WorkoutPlanCardItem): void {
    render(<WorkoutPlanCards coachSlug="mi-coach" plans={[item]} />)
    fireEvent.click(screen.getByRole('button', { name: /revisar o repetir/i }))
}

describe('WorkoutPlanCard — hoja «Ya hiciste» de un día de ciclo', () => {
    it('día hecho ANTES de hoy: «Entrenarlo hoy» primero y «Corregir registros del 26 ago» debajo', () => {
        abrirLaHoja(diaDeCicloHecho())

        // El título NO cambia (decisión del SPEC: la hoja deja de aparecer en la vuelta nueva; cuando
        // aparece, es verdad).
        expect(screen.getByText('Ya hiciste este entrenamiento')).toBeTruthy()

        const opciones = screen.getAllByRole('link')
        expect(opciones.map((a) => a.textContent)).toEqual([
            'Entrenarlo hoySesión nueva de hoy, con tus valores del 26 ago ya cargados',
            'Corregir registros del 26 agoCambia lo que anotaste ese día. No cuenta como entreno de hoy.',
        ])
        // Los destinos viajan CON el rótulo: entrenar hoy siembra (`?repetir=`), corregir edita esa fecha.
        expect(opciones[0].getAttribute('href')).toBe('/c/mi-coach/workout/plan-1?repetir=2026-08-26')
        expect(opciones[1].getAttribute('href')).toBe('/c/mi-coach/workout/plan-1?fecha=2026-08-26')
    })

    it('día hecho HOY: «Revisar y editar» sola, sin repetir y sin el copy de corrección', () => {
        const hoy = getTodayInSantiago().iso
        abrirLaHoja(diaDeCicloHecho({ dateIso: hoy, isToday: true }))

        const opciones = screen.getAllByRole('link')
        expect(opciones).toHaveLength(1)
        expect(opciones[0].textContent).toBe('Revisar y editarAbre tus registros de ese día y corrige lo que quieras')
        // `?desde=hecho`: la sesión es de hoy, así que jamás se abre el modo solo-UPDATE del día pasado.
        expect(opciones[0].getAttribute('href')).toBe('/c/mi-coach/workout/plan-1?desde=hecho')
        expect(screen.queryByText('Entrenarlo hoy')).toBeNull()
        expect(screen.queryByText('Repetir hoy')).toBeNull()
    })
})

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { StudentLivePreview, blockObjectiveLabel, buildStudentPreviewGroups } from './StudentLivePreview'
import type { BuilderBlock, DayState } from '../types'

function block(over: Partial<BuilderBlock> & { uid: string }): BuilderBlock {
    return {
        exercise_id: 'ex-1',
        exercise_name: 'Sentadilla',
        muscle_group: 'Piernas',
        sets: 4,
        reps: '8-10',
        section: 'main',
        section_template_id: null,
        superset_group: null,
        ...over,
    }
}

function day(blocks: BuilderBlock[], over: Partial<DayState> = {}): DayState {
    return { id: 1, name: 'Lunes', title: 'Tren inferior', blocks, ...over }
}

describe('StudentLivePreview — render con 2 bloques', () => {
    it('muestra el nombre del alumno, el día y las dos tarjetas con series × reps y descanso', () => {
        const days = [
            day([
                block({ uid: 'b1', exercise_name: 'Sentadilla', sets: 4, reps: '8-10', rest_time: '90s' }),
                block({ uid: 'b2', exercise_name: 'Peso muerto rumano', sets: 3, reps: '12' }),
            ]),
        ]
        render(<StudentLivePreview studentName="Matías Soto" days={days} />)

        expect(screen.getByText(/Así lo ve Matías/)).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Tren inferior' })).toBeInTheDocument()
        expect(screen.getByText('2 ejercicios · 7 series')).toBeInTheDocument()

        const list = screen.getByRole('list')
        expect(within(list).getByText('Sentadilla')).toBeInTheDocument()
        expect(within(list).getByText('4 × 8-10')).toBeInTheDocument()
        expect(within(list).getByText('90s')).toBeInTheDocument()
        expect(within(list).getByText('Peso muerto rumano')).toBeInTheDocument()
        expect(within(list).getByText('3 × 12')).toBeInTheDocument()
    })

    it('sin alumno usa copy genérico y no rompe', () => {
        render(<StudentLivePreview days={[day([block({ uid: 'b1' })])]} />)
        expect(screen.getByText(/Así lo ve tu alumno/)).toBeInTheDocument()
    })

    it('día de descanso: le dice al coach que el alumno no ve nada que hacer', () => {
        render(<StudentLivePreview studentName="Matías" days={[day([], { is_rest: true })]} />)
        expect(screen.getByText(/Descanso: no le aparece nada que hacer/)).toBeInTheDocument()
    })

    it('día vacío invita a agregar, no muestra una lista falsa', () => {
        render(<StudentLivePreview studentName="Matías" days={[day([])]} />)
        expect(screen.getByText(/Este día está vacío/)).toBeInTheDocument()
        expect(screen.queryByRole('list')).not.toBeInTheDocument()
    })

    it('el día activo manda: con dos días muestra el pedido, no el primero con contenido', () => {
        const days = [
            day([block({ uid: 'b1', exercise_name: 'Sentadilla' })]),
            day([block({ uid: 'b2', exercise_name: 'Dominadas' })], { id: 2, name: 'Martes', title: 'Tren superior' }),
        ]
        render(<StudentLivePreview studentName="Matías" days={days} activeDayId={2} />)
        expect(screen.getByRole('heading', { name: 'Tren superior' })).toBeInTheDocument()
        expect(screen.getByText('Dominadas')).toBeInTheDocument()
        expect(screen.queryByText('Sentadilla')).not.toBeInTheDocument()
    })

    it('la superserie contigua se rotula como tal (misma forma que la ejecución)', () => {
        const days = [
            day([
                block({ uid: 'b1', exercise_name: 'Press banca', superset_group: 'A' }),
                block({ uid: 'b2', exercise_name: 'Remo', superset_group: 'A' }),
            ]),
        ]
        render(<StudentLivePreview studentName="Matías" days={days} />)
        expect(screen.getByText('Superserie A')).toBeInTheDocument()
    })
})

describe('buildStudentPreviewGroups (contrato de forma con la ejecución)', () => {
    it('sin áreas custom agrupa por las secciones legacy de siempre', () => {
        const groups = buildStudentPreviewGroups([
            block({ uid: 'b1', section: 'warmup' }),
            block({ uid: 'b2', section: 'main' }),
        ])
        expect(groups.map((g) => g.label)).toEqual(['Calentamiento', 'Principal'])
    })

    it('una letra huérfana NO se pinta como superserie', () => {
        const groups = buildStudentPreviewGroups([block({ uid: 'b1', superset_group: 'A' })])
        expect(groups[0].runs[0].type).toBe('single')
    })
})

describe('blockObjectiveLabel', () => {
    it('fuerza: series × repeticiones', () => {
        expect(blockObjectiveLabel(block({ uid: 'b1', sets: 4, reps: '8-10' }))).toBe('4 × 8-10')
    })

    it('fuerza sin prescripción ⇒ null (la tarjeta lo marca «Sin prescripción»)', () => {
        expect(blockObjectiveLabel(block({ uid: 'b1', sets: 0, reps: '' }))).toBeNull()
    })

    it('cardio usa el resumen tipado compartido, no «sets × reps»', () => {
        const label = blockObjectiveLabel(
            block({ uid: 'b1', exercise_type: 'cardio', sets: 1, reps: '', duration_sec: 1200, hr_zone: 2 }),
        )
        expect(label).toContain('20min')
        expect(label).toContain('Z2')
    })
})

/**
 * Cierre de la vista en <1024 px (QA del owner 22-08). El toggle se mudó a la CABECERA del builder
 * porque al pie lo tapaban el FAB «+» y el pill «Guardar»; el «✕» de esta cabecera es el camino de
 * vuelta y solo existe en el modo plegable (el panel fijo de escritorio no se cierra).
 */
describe('StudentLivePreview — cierre del modo plegable', () => {
    const days = [day([block({ uid: 'b1' })])]

    it('sin `onClose` no hay botón de cierre (panel fijo de escritorio)', () => {
        render(<StudentLivePreview studentName="Matías Soto" days={days} />)
        expect(screen.queryByRole('button', { name: 'Cerrar la vista del alumno' })).toBeNull()
    })

    it('con `onClose` pinta el «✕» y lo dispara', () => {
        const onClose = vi.fn()
        render(<StudentLivePreview studentName="Matías Soto" days={days} onClose={onClose} />)
        const close = screen.getByRole('button', { name: 'Cerrar la vista del alumno' })
        // Tap target del kit: 44 px.
        expect(close.className).toContain('size-11')
        fireEvent.click(close)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('`floatingActionsBelow` reserva la altura REAL del stack flotante, safe-area incluida', () => {
        const { container } = render(
            <StudentLivePreview studentName="Matías" days={days} floatingActionsBelow />,
        )
        const scroller = container.querySelector('.overflow-y-auto') as HTMLElement
        expect(scroller.className).toContain('pb-[calc(env(safe-area-inset-bottom,0px)+96px)]')
    })
})

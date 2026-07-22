import { describe, expect, it } from 'vitest'

import { celebrationTierFor, type WorkoutCelebrationEvent } from './celebration'

describe('celebrationTierFor — epica', () => {
    it('sesion_completada siempre es epica', () => {
        expect(celebrationTierFor('sesion_completada')).toBe('epica')
    })

    it('pr_detectado con isRealPR es epica', () => {
        expect(celebrationTierFor('pr_detectado', { isRealPR: true })).toBe('epica')
    })

    it('pr_detectado SIN PR real no celebra (null)', () => {
        expect(celebrationTierFor('pr_detectado', { isRealPR: false })).toBeNull()
        expect(celebrationTierFor('pr_detectado')).toBeNull() // sin ctx = sin PR real
    })
})

describe('celebrationTierFor — media', () => {
    it('ejercicio_completado y ronda_cerrada son media', () => {
        expect(celebrationTierFor('ejercicio_completado')).toBe('media')
        expect(celebrationTierFor('ronda_cerrada')).toBe('media')
    })
})

describe('celebrationTierFor — micro', () => {
    it('serie_cerrada, pasada_roller y cambio_lado son micro', () => {
        expect(celebrationTierFor('serie_cerrada')).toBe('micro')
        expect(celebrationTierFor('pasada_roller')).toBe('micro')
        expect(celebrationTierFor('cambio_lado')).toBe('micro')
    })
})

describe('celebrationTierFor — cues que NO celebran (null)', () => {
    const cues: WorkoutCelebrationEvent[] = [
        'descanso_inicio',
        'descanso_aviso',
        'descanso_fin',
        'fase_intervalo',
    ]
    it.each(cues)('%s no celebra', (event) => {
        expect(celebrationTierFor(event)).toBeNull()
    })
})

describe('celebracion — dosificacion (no inflacionar la recompensa)', () => {
    it('solo sesion_completada y PR real llegan a epica', () => {
        const allEvents: WorkoutCelebrationEvent[] = [
            'serie_cerrada',
            'ejercicio_completado',
            'ronda_cerrada',
            'pr_detectado',
            'descanso_inicio',
            'descanso_aviso',
            'descanso_fin',
            'cambio_lado',
            'pasada_roller',
            'fase_intervalo',
            'sesion_completada',
        ]
        const epicas = allEvents.filter((e) => celebrationTierFor(e, { isRealPR: true }) === 'epica')
        expect(epicas.sort()).toEqual(['pr_detectado', 'sesion_completada'])
    })
})

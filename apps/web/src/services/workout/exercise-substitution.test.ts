import { describe, it, expect } from 'vitest'
import {
    rankSubstitutes,
    classifyEquipment,
    normalizeEquipment,
    equipmentLabel,
    SUBSTITUTION_REASON,
    type RankableExercise,
} from './exercise-substitution'

/** Helper: candidato con defaults de scope sistema (sin dueño). */
function ex(partial: Partial<RankableExercise> & { id: string; name: string }): RankableExercise {
    return {
        muscle_group: 'Pectorales',
        equipment: 'dumbbell',
        secondary_muscles: null,
        coach_id: null,
        org_id: null,
        team_id: null,
        ...partial,
    }
}

describe('normalizeEquipment / classifyEquipment', () => {
    it('normaliza contaminantes ES legacy', () => {
        expect(normalizeEquipment('Corporal')).toBe('body weight')
        expect(normalizeEquipment('  PESO LIBRE ')).toBe('dumbbell')
        expect(normalizeEquipment('Otro')).toBe('other')
        expect(normalizeEquipment(null)).toBe('other')
    })

    it('clasifica por tier (texto libre sucio EN/ES)', () => {
        expect(classifyEquipment('leverage machine')).toBe('machine')
        expect(classifyEquipment('smith machine')).toBe('machine')
        expect(classifyEquipment('sled machine')).toBe('machine')
        expect(classifyEquipment('cable')).toBe('cable')
        expect(classifyEquipment('dumbbell')).toBe('free_weight')
        expect(classifyEquipment('barbell')).toBe('free_weight')
        expect(classifyEquipment('Corporal')).toBe('body_weight')
        expect(classifyEquipment('body weight')).toBe('body_weight')
        expect(classifyEquipment('band')).toBe('band')
        expect(classifyEquipment('quién sabe')).toBe('other')
    })

    it('equipmentLabel devuelve etiqueta ES por tier', () => {
        expect(equipmentLabel('leverage machine')).toBe('Máquina')
        expect(equipmentLabel('dumbbell')).toBe('Peso libre')
        expect(equipmentLabel('body weight')).toBe('Peso corporal')
    })
})

describe('rankSubstitutes — máquina ocupada', () => {
    const current = ex({
        id: 'cur',
        name: 'Press de pecho en máquina',
        muscle_group: 'Pectorales',
        equipment: 'leverage machine',
    })

    const candidates: RankableExercise[] = [
        ex({ id: 'same-machine', name: 'Press inclinado en máquina', equipment: 'leverage machine' }),
        ex({ id: 'free', name: 'Press con mancuernas', equipment: 'dumbbell' }),
        ex({ id: 'cable', name: 'Aperturas en cable', equipment: 'cable' }),
        ex({ id: 'bw', name: 'Flexiones', equipment: 'body weight' }),
        ex({ id: 'other-machine', name: 'Press en smith', equipment: 'smith machine' }),
    ]

    it('des-prioriza el MISMO implemento de la máquina ocupada (queda último)', () => {
        const ranked = rankSubstitutes(current, candidates)
        expect(ranked[ranked.length - 1].id).toBe('same-machine')
    })

    it('sube peso libre > cable > peso corporal > otra máquina', () => {
        const ranked = rankSubstitutes(current, candidates).map((r) => r.id)
        expect(ranked.indexOf('free')).toBeLessThan(ranked.indexOf('cable'))
        expect(ranked.indexOf('cable')).toBeLessThan(ranked.indexOf('bw'))
        expect(ranked.indexOf('bw')).toBeLessThan(ranked.indexOf('other-machine'))
        expect(ranked.indexOf('other-machine')).toBeLessThan(ranked.indexOf('same-machine'))
    })
})

describe('rankSubstitutes — invariantes', () => {
    it('excluye el ejercicio actual', () => {
        const current = ex({ id: 'cur', name: 'Curl', equipment: 'dumbbell', muscle_group: 'Bíceps' })
        const ranked = rankSubstitutes(current, [current, ex({ id: 'a', name: 'Curl martillo', muscle_group: 'Bíceps' })])
        expect(ranked.map((r) => r.id)).not.toContain('cur')
    })

    it('filtra a mismo grupo muscular (filtro duro)', () => {
        const current = ex({ id: 'cur', name: 'Curl', muscle_group: 'Bíceps', equipment: 'dumbbell' })
        const ranked = rankSubstitutes(current, [
            ex({ id: 'same', name: 'Curl martillo', muscle_group: 'Bíceps' }),
            ex({ id: 'other', name: 'Sentadilla', muscle_group: 'Cuádriceps' }),
        ])
        expect(ranked.map((r) => r.id)).toEqual(['same'])
    })

    it('respeta el tope top-N (default 5)', () => {
        const current = ex({ id: 'cur', name: 'A', muscle_group: 'Hombros', equipment: 'leverage machine' })
        const many = Array.from({ length: 12 }, (_, i) => ex({ id: `c${i}`, name: `Ej ${String(i).padStart(2, '0')}`, muscle_group: 'Hombros' }))
        expect(rankSubstitutes(current, many)).toHaveLength(5)
        expect(rankSubstitutes(current, many, { limit: 3 })).toHaveLength(3)
    })

    it('orden estable: la MISMA entrada produce el MISMO orden', () => {
        const current = ex({ id: 'cur', name: 'A', muscle_group: 'Glúteos', equipment: 'leverage machine' })
        const cands = [
            ex({ id: 'x', name: 'Hip thrust', muscle_group: 'Glúteos', equipment: 'barbell' }),
            ex({ id: 'y', name: 'Patada de glúteo', muscle_group: 'Glúteos', equipment: 'cable' }),
            ex({ id: 'z', name: 'Peso muerto', muscle_group: 'Glúteos', equipment: 'barbell' }),
        ]
        const a = rankSubstitutes(current, cands).map((r) => r.id)
        const b = rankSubstitutes(current, cands).map((r) => r.id)
        expect(a).toEqual(b)
        // Empate de tier (barbell x y z) → sistema primero, luego name asc: "Hip thrust" < "Peso muerto".
        expect(a.indexOf('x')).toBeLessThan(a.indexOf('z'))
    })

    it('tiebreak: system-scope antes que scope propio con el mismo score', () => {
        const current = ex({ id: 'cur', name: 'A', muscle_group: 'Dorsales', equipment: 'cable' })
        const owned = ex({ id: 'owned', name: 'AAA propio', muscle_group: 'Dorsales', equipment: 'cable', coach_id: 'coach-1' })
        const system = ex({ id: 'system', name: 'ZZZ sistema', muscle_group: 'Dorsales', equipment: 'cable' })
        // Mismo tier/score; 'AAA' < 'ZZZ' por nombre, pero sistema gana el tiebreak → va primero.
        const ranked = rankSubstitutes(current, [owned, system]).map((r) => r.id)
        expect(ranked[0]).toBe('system')
    })

    it('no es máquina: mismo equipment primero (criterio Fitbod)', () => {
        const current = ex({ id: 'cur', name: 'Curl', muscle_group: 'Bíceps', equipment: 'dumbbell' })
        const ranked = rankSubstitutes(current, [
            ex({ id: 'machine', name: 'Curl máquina', muscle_group: 'Bíceps', equipment: 'leverage machine' }),
            ex({ id: 'same', name: 'Curl martillo', muscle_group: 'Bíceps', equipment: 'dumbbell' }),
        ]).map((r) => r.id)
        expect(ranked[0]).toBe('same')
    })

    it('constante de motivo es única y estable', () => {
        expect(SUBSTITUTION_REASON).toBe('machine_busy')
    })
})

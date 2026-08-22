import { describe, expect, it } from 'vitest'
import {
    EMPTY_FIRST_ROUTINE_STATE,
    FIRST_ROUTINE_CARDS,
    builderTourStorageKey,
    dismissAllFirstRoutineCards,
    dismissFirstRoutineCard,
    firstRoutineStorageKey,
    isFirstRoutineDone,
    parseFirstRoutineState,
    serializeFirstRoutineState,
    visibleFirstRoutineCards,
} from './first-routine'

describe('claves por coach (F4.2 — cierra la deuda de la clave global de WeeklyPlanBuilder)', () => {
    it('dos coaches distintos NO comparten la memoria de las tarjetas', () => {
        expect(firstRoutineStorageKey('coach-a')).not.toBe(firstRoutineStorageKey('coach-b'))
    })

    it('la clave incluye el coachId literal', () => {
        expect(firstRoutineStorageKey('coach-a')).toContain('coach-a')
    })

    it('sin coach cae en una clave anónima propia, nunca en la global vieja', () => {
        const anon = firstRoutineStorageKey(null)
        expect(anon).toBe(firstRoutineStorageKey('   '))
        expect(anon).not.toContain('builder_onboarding_seen_short_v1')
    })

    it('las tres memorias del tour viejo quedan namespaceadas y separadas entre sí', () => {
        const keys = [
            builderTourStorageKey('coach-a', 'short'),
            builderTourStorageKey('coach-a', 'help'),
            builderTourStorageKey('coach-a', 'config-hint'),
        ]
        expect(new Set(keys).size).toBe(3)
        for (const key of keys) expect(key).toContain('coach-a')
        expect(builderTourStorageKey('coach-b', 'short')).not.toBe(keys[0])
    })
})

describe('estado de las 3 tarjetas', () => {
    it('arranca con las 3 visibles', () => {
        expect(visibleFirstRoutineCards(EMPTY_FIRST_ROUTINE_STATE)).toHaveLength(3)
        expect(isFirstRoutineDone(EMPTY_FIRST_ROUTINE_STATE)).toBe(false)
    })

    it('«Entendido» cierra solo esa tarjeta y respeta el orden del resto', () => {
        const next = dismissFirstRoutineCard(EMPTY_FIRST_ROUTINE_STATE, 'cambia-ejercicio')
        const visible = visibleFirstRoutineCards(next)
        expect(visible.map((c) => c.id)).toEqual(['reordena', 'ab-despues'])
        expect(isFirstRoutineDone(next)).toBe(false)
    })

    it('cerrar dos veces la misma tarjeta es idempotente', () => {
        const once = dismissFirstRoutineCard(EMPTY_FIRST_ROUTINE_STATE, 'reordena')
        const twice = dismissFirstRoutineCard(once, 'reordena')
        expect(twice).toBe(once)
        expect(twice.dismissed).toEqual(['reordena'])
    })

    it('«Listo» de la tercera cierra la serie completa', () => {
        const next = dismissAllFirstRoutineCards()
        expect(visibleFirstRoutineCards(next)).toHaveLength(0)
        expect(isFirstRoutineDone(next)).toBe(true)
    })

    it('la última tarjeta es la que dice «Listo»; las otras «Entendido»', () => {
        expect(FIRST_ROUTINE_CARDS[FIRST_ROUTINE_CARDS.length - 1].cta).toBe('Listo')
        expect(FIRST_ROUTINE_CARDS.slice(0, -1).every((c) => c.cta === 'Entendido')).toBe(true)
    })
})

describe('persistencia', () => {
    it('round-trip: lo serializado se vuelve a leer igual', () => {
        const state = dismissFirstRoutineCard(EMPTY_FIRST_ROUTINE_STATE, 'ab-despues')
        expect(parseFirstRoutineState(serializeFirstRoutineState(state))).toEqual(state)
    })

    it('storage vacío / nulo ⇒ estado vacío', () => {
        expect(parseFirstRoutineState(null)).toEqual(EMPTY_FIRST_ROUTINE_STATE)
        expect(parseFirstRoutineState('')).toEqual(EMPTY_FIRST_ROUTINE_STATE)
    })

    it('JSON roto o de otra forma ⇒ estado vacío, nunca una excepción', () => {
        expect(parseFirstRoutineState('{no-json')).toEqual(EMPTY_FIRST_ROUTINE_STATE)
        expect(parseFirstRoutineState('[]')).toEqual(EMPTY_FIRST_ROUTINE_STATE)
        expect(parseFirstRoutineState('{"dismissed":"reordena"}')).toEqual(EMPTY_FIRST_ROUTINE_STATE)
    })

    it('ids desconocidos se descartan y los repetidos no duplican', () => {
        const parsed = parseFirstRoutineState('{"dismissed":["reordena","inventado","reordena"]}')
        expect(parsed.dismissed).toEqual(['reordena'])
    })
})

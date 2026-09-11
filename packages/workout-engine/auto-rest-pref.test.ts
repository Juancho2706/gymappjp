/**
 * W1.T4 — resolvers PUROS de la preferencia D5 «Pasar solo al descanso»
 * (specs/cuenta-atras-en-pantalla, DATA-TESTING §3.6 / §3.6.a / §3.7 / §6.1).
 *
 * Sin React y sin storage real: acá se congelan las 4 cohortes de R1, la variante `'off'` de R25 (que
 * entra como FILA de la tabla, nunca como rama muerta), las 8 entradas del resolver del modal con un
 * caso por exclusión, y los 5 casos F5 que prueban que el default sale de `hasHistory := !showModal`.
 */
import { describe, expect, it } from 'vitest'
import {
    AUTOREST_DEFAULT_STRATEGY,
    isFirstWorkout,
    isUsableAutoRestClientId,
    resolveAutoRestDefault,
    resolveShowAutoRestModal,
    type AutoRestModalMode,
} from './auto-rest-pref'

const CLIENT = '11111111-2222-4333-8444-555555555555'

/** Entrada base del resolver del modal: primer entreno de verdad (la única cohorte que nace OFF). */
function modalInput(over: Partial<Parameters<typeof resolveShowAutoRestModal>[0]> = {}) {
    return {
        seen: false,
        previousHistoryCount: 0,
        exerciseMaxesCount: 0,
        sessionLogsCount: 0,
        isDemo: false,
        mode: 'normal' as AutoRestModalMode,
        stepIndex: 0,
        storageAvailable: true,
        clientId: CLIENT,
        ...over,
    }
}

function defaultInput(over: Partial<Parameters<typeof resolveAutoRestDefault>[0]> = {}) {
    return {
        storedNew: null as string | null,
        storedLegacy: null as string | null,
        hasHistory: true,
        storageAvailable: true,
        strategy: 'cohort' as 'cohort' | 'off',
        ...over,
    }
}

describe('AUTOREST_DEFAULT_STRATEGY (R25)', () => {
    it('el tren sale con la estrategia por COHORTE (Q1 = A, respondida por el owner el 10-09)', () => {
        expect(AUTOREST_DEFAULT_STRATEGY).toBe('cohort')
    })
})

describe('resolveAutoRestDefault — las 4 cohortes de R1 (§3.6)', () => {
    it('(1) la clave nueva presente manda: ON', () => {
        expect(resolveAutoRestDefault(defaultInput({ storedNew: '1', hasHistory: false }))).toEqual({
            enabled: true,
            source: 'stored',
        })
    })

    it('(1) la clave nueva presente manda: OFF', () => {
        expect(resolveAutoRestDefault(defaultInput({ storedNew: '0', hasHistory: true }))).toEqual({
            enabled: false,
            source: 'stored',
        })
    })

    it('(2, retirado 11-09) `omni_autotimer` ya NO decide: cae a la cohorte aunque exista', () => {
        // Un OFF device-scoped viejo no apaga la preferencia de un alumno con historial…
        expect(resolveAutoRestDefault(defaultInput({ storedLegacy: 'false', hasHistory: true }))).toEqual({
            enabled: true,
            source: 'cohort-history',
        })
        // …ni un ON viejo enciende a uno sin historial (primer entreno sigue siendo OFF + modal).
        expect(resolveAutoRestDefault(defaultInput({ storedLegacy: 'true', hasHistory: false }))).toEqual({
            enabled: false,
            source: 'cohort-first',
        })
    })

    it('NO toca las cohortes 1 y 2: lo que el alumno ya eligió manda sobre cualquier default', () => {
        expect(resolveAutoRestDefault(defaultInput({ strategy: 'off', storedNew: '1' }))).toEqual({
            enabled: true,
            source: 'stored',
        })
        // El carril legacy ya no cuenta como «elección del alumno»: con `strategy: 'off'` colapsa a OFF.
        expect(resolveAutoRestDefault(defaultInput({ strategy: 'off', storedLegacy: 'true' }))).toEqual({
            enabled: false,
            source: 'strategy-off',
        })
    })
})

describe('isUsableAutoRestClientId (R32/CA-93)', () => {
    it('acepta un uuid y rechaza todo lo demás', () => {
        expect(isUsableAutoRestClientId(CLIENT)).toBe(true)
        expect(isUsableAutoRestClientId(CLIENT.toUpperCase())).toBe(true)
        expect(isUsableAutoRestClientId(null)).toBe(false)
        expect(isUsableAutoRestClientId(undefined)).toBe(false)
        expect(isUsableAutoRestClientId('')).toBe(false)
        expect(isUsableAutoRestClientId('   ')).toBe(false)
        expect(isUsableAutoRestClientId('undefined')).toBe(false)
        expect(isUsableAutoRestClientId('123')).toBe(false)
    })
})

describe('isFirstWorkout (R14)', () => {
    it('exige las TRES señales del bundle vacías', () => {
        expect(isFirstWorkout({ previousHistoryCount: 0, exerciseMaxesCount: 0, sessionLogsCount: 0 })).toBe(true)
        expect(isFirstWorkout({ previousHistoryCount: 1, exerciseMaxesCount: 0, sessionLogsCount: 0 })).toBe(false)
        expect(isFirstWorkout({ previousHistoryCount: 0, exerciseMaxesCount: 1, sessionLogsCount: 0 })).toBe(false)
        expect(isFirstWorkout({ previousHistoryCount: 0, exerciseMaxesCount: 0, sessionLogsCount: 1 })).toBe(false)
    })
})

describe('resolveShowAutoRestModal — las 8 entradas, un caso por exclusión (§3.7)', () => {
    it('primer entreno de verdad ⇒ se muestra', () => {
        expect(resolveShowAutoRestModal(modalInput())).toBe(true)
    })

    it('`seen` ⇒ no se muestra', () => {
        expect(resolveShowAutoRestModal(modalInput({ seen: true }))).toBe(false)
    })

    it('historial no vacío (cualquiera de las 3 señales) ⇒ no se muestra', () => {
        expect(resolveShowAutoRestModal(modalInput({ previousHistoryCount: 1 }))).toBe(false)
        expect(resolveShowAutoRestModal(modalInput({ exerciseMaxesCount: 1 }))).toBe(false)
        expect(resolveShowAutoRestModal(modalInput({ sessionLogsCount: 1 }))).toBe(false)
    })

    it('`isDemo` ⇒ no se muestra (T6: el coach entra como su demo por «Vive tu app»)', () => {
        expect(resolveShowAutoRestModal(modalInput({ isDemo: true }))).toBe(false)
    })

    it('`mode !== "normal"` ⇒ no se muestra (fecha / repetir / recuperar)', () => {
        for (const mode of ['past-date', 'repeat', 'recover'] as AutoRestModalMode[]) {
            expect(resolveShowAutoRestModal(modalInput({ mode }))).toBe(false)
        }
    })

    it('`stepIndex > 0` ⇒ no se muestra (sale en el PRIMER ejercicio)', () => {
        expect(resolveShowAutoRestModal(modalInput({ stepIndex: 1 }))).toBe(false)
    })

    it('storage inaccesible ⇒ no se muestra (T8: un modal repetido es hostigamiento)', () => {
        expect(resolveShowAutoRestModal(modalInput({ storageAvailable: false }))).toBe(false)
    })

    it('`clientId` nulo o no-uuid ⇒ no se muestra (R32)', () => {
        expect(resolveShowAutoRestModal(modalInput({ clientId: null }))).toBe(false)
        expect(resolveShowAutoRestModal(modalInput({ clientId: '' }))).toBe(false)
        expect(resolveShowAutoRestModal(modalInput({ clientId: 'undefined' }))).toBe(false)
    })

    it('R32 · el resolver NO conoce `rest_time`: un primer ejercicio sin descanso sigue mostrando el modal', () => {
        // La firma no admite `restTimeSec`; el assert es de TIPO además de valor. Si alguien la agrega,
        // este objeto deja de compilar contra la firma y el test cae — que es exactamente el guard.
        const input = modalInput()
        expect(Object.keys(input)).not.toContain('restTimeSec')
        expect(resolveShowAutoRestModal(input)).toBe(true)
    })
})

describe('F5 · el default sale de `hasHistory := !showModal` (§3.6.a) — los 5 casos obligatorios', () => {
    /** Cadena real del tren: primero el modal, después la cohorte. */
    function resolveChain(over: Parameters<typeof modalInput>[0], strategy: 'cohort' | 'off' = 'cohort') {
        const showModal = resolveShowAutoRestModal(modalInput(over))
        const { enabled, source } = resolveAutoRestDefault({
            storedNew: null,
            storedLegacy: null,
            hasHistory: !showModal,
            storageAvailable: over.storageAvailable ?? true,
            strategy,
        })
        return { showModal, enabled, source }
    }

    it('(a) veterano con mesociclo NUEVO (3 señales vacías, ya vio el modal) ⇒ ON, no OFF (§9 T9)', () => {
        expect(resolveChain({ seen: true })).toEqual({
            showModal: false,
            enabled: true,
            source: 'cohort-history',
        })
    })

    it('(b) alumno demo con las 3 señales vacías ⇒ ON', () => {
        expect(resolveChain({ isDemo: true })).toEqual({
            showModal: false,
            enabled: true,
            source: 'cohort-history',
        })
    })

    it('(c) `mode: "repeat"` y `stepIndex: 2` ⇒ ON', () => {
        expect(resolveChain({ mode: 'repeat', stepIndex: 2 })).toEqual({
            showModal: false,
            enabled: true,
            source: 'cohort-history',
        })
    })

    it('(d) storage inaccesible ⇒ ON y SIN modal (T8)', () => {
        expect(resolveChain({ storageAvailable: false })).toEqual({
            showModal: false,
            enabled: true,
            source: 'cohort-history',
        })
    })

    it('(e) primer entreno de verdad ⇒ modal + OFF: la ÚNICA cohorte que nace apagada', () => {
        expect(resolveChain({})).toEqual({
            showModal: true,
            enabled: false,
            source: 'cohort-first',
        })
    })

    it('`clientId` nulo ⇒ sin modal y con el default de cohorte ON (R32, nunca OFF sin decisión)', () => {
        expect(resolveChain({ clientId: null })).toEqual({
            showModal: false,
            enabled: true,
            source: 'cohort-history',
        })
    })

    it('R25 · los mismos 5 casos con `strategy: "off"` dan OFF en las cohortes 3 y 4', () => {
        for (const over of [
            { seen: true },
            { isDemo: true },
            { mode: 'repeat' as AutoRestModalMode, stepIndex: 2 },
            { storageAvailable: false },
            {},
        ]) {
            expect(resolveChain(over, 'off')).toMatchObject({ enabled: false, source: 'strategy-off' })
        }
    })
})

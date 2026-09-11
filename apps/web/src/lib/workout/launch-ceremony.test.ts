// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
    clearCeremonyDom,
    clearMorphFlag,
    isCeremonyActive,
    markCeremonyDom,
    markMorphFlag,
    readAndConsumeMorphFlag,
} from './launch-ceremony'

const MORPH_KEY = 'eva:exec-v3-morph'

/** Escribe la marca con una antigüedad concreta (el módulo la valida contra `Date.now()`). */
function writeMorphFlagAgedMs(ageMs: number): void {
    sessionStorage.setItem(MORPH_KEY, JSON.stringify({ t: Date.now() - ageMs }))
}

describe('marca de morph con TTL', () => {
    beforeEach(() => {
        sessionStorage.clear()
        clearCeremonyDom()
    })

    it('acepta la marca recién escrita y la consume una sola vez', () => {
        markMorphFlag()
        expect(readAndConsumeMorphFlag()).toBe(true)
        expect(sessionStorage.getItem(MORPH_KEY)).toBeNull()
        expect(readAndConsumeMorphFlag()).toBe(false)
    })

    // TTL = 20 s (antes 10 s): el ejecutor que monta a los 11-15 s en 3G ya NO pierde la marca, así que
    // no repite el `SessionIntro` después del Despegue (Sentry EVA-NEXTJS-1P).
    it('acepta una marca de 15 s (fresca con TTL de 20 s)', () => {
        writeMorphFlagAgedMs(15_000)
        expect(readAndConsumeMorphFlag()).toBe(true)
    })

    it('rechaza una marca de 25 s (ceremonia abandonada)', () => {
        writeMorphFlagAgedMs(25_000)
        expect(readAndConsumeMorphFlag()).toBe(false)
        // Igual la borra: una marca rancia no debe sobrevivir para la próxima entrada.
        expect(sessionStorage.getItem(MORPH_KEY)).toBeNull()
    })

    it('acepta el valor legado "1" (sesión abierta durante un deploy)', () => {
        sessionStorage.setItem(MORPH_KEY, '1')
        expect(readAndConsumeMorphFlag()).toBe(true)
    })

    it('devuelve false sin marca, con basura, o después de abortar', () => {
        expect(readAndConsumeMorphFlag()).toBe(false)
        sessionStorage.setItem(MORPH_KEY, 'no-json')
        expect(readAndConsumeMorphFlag()).toBe(false)
        markMorphFlag()
        clearMorphFlag()
        expect(readAndConsumeMorphFlag()).toBe(false)
    })
})

describe('marca de ceremonia en el DOM', () => {
    beforeEach(() => { clearCeremonyDom() })

    // El ejecutor la usa como red de seguridad: si `sessionStorage` falló o el TTL venció, la señal
    // `eva:exec-v3-ready` igual sale mientras esta marca esté viva (B3).
    it('marca y limpia `data-exec-ceremony` en <html>', () => {
        expect(isCeremonyActive()).toBe(false)
        markCeremonyDom()
        expect(isCeremonyActive()).toBe(true)
        expect(document.documentElement.getAttribute('data-exec-ceremony')).toBe('1')
        clearCeremonyDom()
        expect(isCeremonyActive()).toBe(false)
    })
})

import { describe, it, expect } from 'vitest'
import { isPrefetchRequest } from './prefetch-request'

/** Helper: construye Headers desde un objeto plano (claves case-insensitive). */
function h(init: Record<string, string>): Headers {
    return new Headers(init)
}

describe('isPrefetchRequest — matriz de headers (Phase 5, pura)', () => {
    it('next-router-prefetch === "1" → true', () => {
        expect(isPrefetchRequest(h({ 'next-router-prefetch': '1' }))).toBe(true)
    })

    it('next-router-prefetch con otro valor ("0") → false', () => {
        expect(isPrefetchRequest(h({ 'next-router-prefetch': '0' }))).toBe(false)
    })

    it('purpose === "prefetch" → true', () => {
        expect(isPrefetchRequest(h({ purpose: 'prefetch' }))).toBe(true)
    })

    it('purpose === "navigate" (navegación real) → false', () => {
        expect(isPrefetchRequest(h({ purpose: 'navigate' }))).toBe(false)
    })

    it('Sec-Purpose "prefetch" simple → true', () => {
        expect(isPrefetchRequest(h({ 'Sec-Purpose': 'prefetch' }))).toBe(true)
    })

    it('Sec-Purpose "prefetch;prerender" (Chrome prerender) → true', () => {
        expect(isPrefetchRequest(h({ 'Sec-Purpose': 'prefetch;prerender' }))).toBe(true)
    })

    it('Sec-Purpose sin "prefetch" ("prerender") → false', () => {
        expect(isPrefetchRequest(h({ 'Sec-Purpose': 'prerender' }))).toBe(false)
    })

    it('clave case-insensitive (SEC-PURPOSE mayúsculas) → true', () => {
        expect(isPrefetchRequest(h({ 'SEC-PURPOSE': 'prefetch' }))).toBe(true)
    })

    it('sin headers de prefetch → false (navegación real corre el middleware completo)', () => {
        expect(isPrefetchRequest(h({}))).toBe(false)
    })

    it('headers no relacionados → false', () => {
        expect(isPrefetchRequest(h({ accept: 'text/html', 'user-agent': 'x' }))).toBe(false)
    })

    it('múltiples señales presentes → true (corto-circuita en la primera)', () => {
        expect(
            isPrefetchRequest(h({ 'next-router-prefetch': '1', purpose: 'prefetch' }))
        ).toBe(true)
    })
})

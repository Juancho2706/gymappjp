/**
 * Guard de medición del Despegue (QA5 · taps muertos en MIUI/HyperOS). El módulo bajo test
 * (`apps/mobile/lib/measure-guard`) es PURO —no importa react-native— y es el que hace que
 * `measureMorphOriginSafe` (session-morph) garantice el disparo de la navegación: con el rect si
 * `measureInWindow` contestó a tiempo, o con `null` (origen sintético del Despegue) si el ROM se comió
 * el callback. Lo que cuida esta suite: (a) el camino feliz no cambia, (b) el fallback dispara al vencer
 * la ventana, (c) jamás dispara dos veces (una medición tardía NO puede lanzar un segundo `router.push`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveOrFallback } from '../../apps/mobile/lib/measure-guard'

/** Rect de una day-card (96px) como el que devuelve `measureInWindow`. */
type Rect = { x: number; y: number; width: number; height: number } | null
const RECT: Rect = { x: 10, y: 20, width: 96, height: 120 }

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('resolveOrFallback · guard de medición nativa', () => {
  it('respuesta a tiempo → dispara UNA vez con el valor real y cancela el fallback', () => {
    const spy = vi.fn()
    const resolve = resolveOrFallback<Rect>(spy, null, 120)
    resolve(RECT)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(RECT)
    vi.advanceTimersByTime(5000)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('el ROM nunca contesta → dispara igual con el fallback al vencer la ventana (tap NO queda muerto)', () => {
    const spy = vi.fn()
    resolveOrFallback<Rect>(spy, null, 120)
    vi.advanceTimersByTime(119)
    expect(spy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(null)
  })

  it('medición TARDÍA después del fallback → se ignora (nunca dos navegaciones)', () => {
    const spy = vi.fn()
    const resolve = resolveOrFallback<Rect>(spy, null, 120)
    vi.advanceTimersByTime(200)
    expect(spy).toHaveBeenCalledWith(null)
    resolve(RECT)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(null)
  })

  it('dos respuestas seguidas (callback nativo duplicado) → una sola llamada', () => {
    const spy = vi.fn()
    const resolve = resolveOrFallback<Rect>(spy, null, 120)
    resolve(RECT)
    resolve(RECT)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('respuesta síncrona con null (nodo sin measureInWindow) → un solo disparo con null', () => {
    const spy = vi.fn()
    const resolve = resolveOrFallback<Rect>(spy, null, 120)
    resolve(null)
    vi.advanceTimersByTime(5000)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(null)
  })
})

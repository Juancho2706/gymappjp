/**
 * Adopción EXACTA del reloj de cardio al drenar un comando que llegó desde los botones de la
 * notificación (`apps/mobile/components/alumno/workout/v3/cardio-adoption.ts`).
 *
 * Es la aritmética que cierra la deuda "pausa desde el lockscreen cuenta el tiempo pausado como
 * corrido": el handler headless congela/re-ancla los instantes absolutos y la pantalla ADOPTA ese
 * valor. Módulo PURO con el reloj inyectable ⇒ cero mocks nativos (el snapshot entra como tipo).
 */
import { describe, expect, it } from 'vitest'
import { planCardioAdoption } from '../../apps/mobile/components/alumno/workout/v3/cardio-adoption'
import type { CardioLiveSnapshot } from '../../apps/mobile/components/alumno/workout/timers/cardio-remote-commands'

const NOW = 1_800_000_000_000

const base = (over: Partial<CardioLiveSnapshot> & Pick<CardioLiveSnapshot, 'mode'>): CardioLiveSnapshot => ({
  title: 'Cardio · Trote suave',
  ...over,
})

describe('planCardioAdoption · reanudar', () => {
  it('intervalos: adopta el restante del fin absoluto que re-ancló el handler', () => {
    // El handler ya descontó la pausa: `endEpochMs` es "ahora + lo que quedaba" en el momento del press.
    const snap = base({ mode: 'interval', endEpochMs: NOW + 42_000 })
    expect(planCardioAdoption(snap, true, 12, NOW)).toEqual({ action: 'adopt', seconds: 42, running: true })
  })

  it('countdown: idem, sin importar lo que pinte la pantalla (su cuenta derivó durante la pausa)', () => {
    const snap = base({ mode: 'countdown', endEpochMs: NOW + 90_000 })
    expect(planCardioAdoption(snap, true, 5, NOW)).toEqual({ action: 'adopt', seconds: 90, running: true })
  })

  it('cronómetro: adopta los transcurridos derivados del inicio absoluto', () => {
    const snap = base({ mode: 'stopwatch', startEpochMs: NOW - 75_000 })
    expect(planCardioAdoption(snap, true, 300, NOW)).toEqual({ action: 'adopt', seconds: 75, running: true })
  })

  it('cronómetro recién arrancado: 0 s transcurridos es un valor legítimo que SÍ se adopta', () => {
    const snap = base({ mode: 'stopwatch', startEpochMs: NOW })
    expect(planCardioAdoption(snap, true, 40, NOW)).toEqual({ action: 'adopt', seconds: 0, running: true })
  })

  it('cuenta regresiva agotada mientras el JS dormía: no resucita el reloj, sólo lo deja corriendo', () => {
    const snap = base({ mode: 'interval', endEpochMs: NOW - 5_000 })
    expect(planCardioAdoption(snap, true, 0, NOW)).toEqual({ action: 'settle', running: true })
  })
})

describe('planCardioAdoption · pausar', () => {
  it('intervalos: adopta el restante CONGELADO cuando la pantalla ya derivó', () => {
    // La pausa ocurrió con la app dormida: el hero siguió contando y pinta 12 s cuando el handler
    // congeló 40 s. Sin adopción, esos 28 s de pausa se contarían como corridos.
    const snap = base({ mode: 'interval', endEpochMs: null, pausedRemainingSec: 40 })
    expect(planCardioAdoption(snap, false, 12, NOW)).toEqual({ action: 'adopt', seconds: 40, running: false })
  })

  it('cronómetro: adopta los transcurridos congelados', () => {
    const snap = base({ mode: 'stopwatch', startEpochMs: null, pausedElapsedSec: 61 })
    expect(planCardioAdoption(snap, false, 88, NOW)).toEqual({ action: 'adopt', seconds: 61, running: false })
  })

  it('con la app despierta el valor coincide (±1 s) y basta con detener el reloj', () => {
    const snap = base({ mode: 'countdown', endEpochMs: null, pausedRemainingSec: 40 })
    expect(planCardioAdoption(snap, false, 41, NOW)).toEqual({ action: 'settle', running: false })
    expect(planCardioAdoption(snap, false, 39, NOW)).toEqual({ action: 'settle', running: false })
    // 2 s de diferencia ya es deriva real: se adopta.
    expect(planCardioAdoption(snap, false, 38, NOW)).toEqual({ action: 'adopt', seconds: 40, running: false })
  })

  it('sin referencia local (hero sin spec) adopta igual el valor congelado', () => {
    const snap = base({ mode: 'interval', endEpochMs: null, pausedRemainingSec: 40 })
    expect(planCardioAdoption(snap, false, null, NOW)).toEqual({ action: 'adopt', seconds: 40, running: false })
  })

  it('fase ya consumida por "Fase siguiente" (0 s): nada que adoptar, sólo detener', () => {
    const snap = base({ mode: 'interval', endEpochMs: null, pausedRemainingSec: 0 })
    expect(planCardioAdoption(snap, false, 30, NOW)).toEqual({ action: 'settle', running: false })
  })
})

describe('planCardioAdoption · sin espejo', () => {
  it('un press huérfano (snapshot ya limpiado) sólo honra el estado pedido', () => {
    expect(planCardioAdoption(null, true, 30, NOW)).toEqual({ action: 'settle', running: true })
    expect(planCardioAdoption(null, false, 30, NOW)).toEqual({ action: 'settle', running: false })
  })
})

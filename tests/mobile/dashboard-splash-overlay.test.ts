import { beforeEach, describe, expect, it } from 'vitest'
import {
  beginSplashHandoff,
  endSplashHandoff,
  getDashboardReadySnapshot,
  markDashboardReady,
  markSplashHandoffPainted,
  resetDashboardReadyStore,
  resolveSplashOverlayPhase,
  subscribeDashboardReady,
  type SplashHandoff,
} from '../../apps/mobile/context/DashboardReadyContext'

/** Handoff sin marca de coach: la espera es de EVA y lo dice (firma montada). */
const EVA: SplashHandoff = { mark: null, signature: true, slow: false, halo: 0.55 }

/** Handoff branded: el gate ya cerro su crossfade y entrega la marca del coach. */
const BRANDED: SplashHandoff = {
  mark: { accent: '#12A971', displayName: 'Josefit', greetingName: 'Juan', logoUri: null },
  signature: false,
  slow: true,
  halo: 0.82,
}

describe('resolveSplashOverlayPhase', () => {
  const base = { handoff: EVA, ready: false, timedOut: false, suppressed: false }

  it('sin handoff el overlay no existe (deep link, login, navegacion posterior)', () => {
    expect(resolveSplashOverlayPhase({ ...base, handoff: null })).toBe('hidden')
    // Ni un ready ni un tope pueden materializarlo: sin cold start con sesion no hay splash.
    expect(resolveSplashOverlayPhase({ ...base, handoff: null, ready: true })).toBe('hidden')
    expect(resolveSplashOverlayPhase({ ...base, handoff: null, timedOut: true })).toBe('hidden')
  })

  it('con handoff y dashboard sin resolver se queda pintando', () => {
    expect(resolveSplashOverlayPhase(base)).toBe('holding')
    expect(resolveSplashOverlayPhase({ ...base, handoff: BRANDED })).toBe('holding')
  })

  it('el primer load resuelto lo manda al fade-out', () => {
    expect(resolveSplashOverlayPhase({ ...base, ready: true })).toBe('dismissing')
  })

  it('el tope de seguridad lo retira aunque la home nunca marque ready', () => {
    expect(resolveSplashOverlayPhase({ ...base, timedOut: true })).toBe('dismissing')
  })

  it('jamas tapa una pantalla que exige interaccion (bloqueo biometrico)', () => {
    expect(resolveSplashOverlayPhase({ ...base, suppressed: true })).toBe('dismissing')
  })
})

describe('store del handoff', () => {
  beforeEach(() => resetDashboardReadyStore())

  it('arma UNA sola vez por proceso JS (= por cold start)', () => {
    beginSplashHandoff(EVA)
    expect(getDashboardReadySnapshot().handoff).toBe(EVA)
    // Un segundo emisor —o el efecto del gate re-ejecutado— no puede re-armar el splash.
    beginSplashHandoff(BRANDED)
    expect(getDashboardReadySnapshot().handoff).toBe(EVA)
  })

  it('no vuelve a armar despues de cerrarse: el cold start ya paso', () => {
    beginSplashHandoff(EVA)
    endSplashHandoff()
    expect(getDashboardReadySnapshot().handoff).toBeNull()
    beginSplashHandoff(BRANDED)
    expect(getDashboardReadySnapshot().handoff).toBeNull()
  })

  it('markDashboardReady es idempotente: notifica una sola vez', () => {
    let notifications = 0
    const unsubscribe = subscribeDashboardReady(() => {
      notifications += 1
    })
    markDashboardReady()
    markDashboardReady()
    markDashboardReady()
    unsubscribe()
    expect(notifications).toBe(1)
    expect(getDashboardReadySnapshot().ready).toBe(true)
  })

  it('marcar ready sin handoff no crea ningun overlay', () => {
    markDashboardReady()
    const { handoff, ready } = getDashboardReadySnapshot()
    expect(handoff).toBeNull()
    expect(resolveSplashOverlayPhase({ handoff, ready, timedOut: false, suppressed: false })).toBe('hidden')
  })

  it('painted: arranca en false y sin handoff no se puede marcar (un onDisplay tardio no arma nada)', () => {
    expect(getDashboardReadySnapshot().painted).toBe(false)
    markSplashHandoffPainted()
    expect(getDashboardReadySnapshot().painted).toBe(false)
  })

  it('painted: el overlay avisa una sola vez que su primer frame esta pintado', () => {
    beginSplashHandoff(BRANDED)
    let notifications = 0
    const unsubscribe = subscribeDashboardReady(() => {
      notifications += 1
    })
    markSplashHandoffPainted()
    markSplashHandoffPainted()
    unsubscribe()
    expect(notifications).toBe(1)
    expect(getDashboardReadySnapshot().painted).toBe(true)
    expect(getDashboardReadySnapshot().handoff).toBe(BRANDED)
  })

  it('painted: cerrar el overlay antes de pintar suelta igual al gate (nunca queda colgado)', () => {
    beginSplashHandoff(EVA)
    expect(getDashboardReadySnapshot().painted).toBe(false)
    endSplashHandoff()
    expect(getDashboardReadySnapshot().painted).toBe(true)
    expect(getDashboardReadySnapshot().handoff).toBeNull()
  })

  it('el snapshot es estable por referencia entre mutaciones (no re-renderiza de gratis)', () => {
    const first = getDashboardReadySnapshot()
    expect(getDashboardReadySnapshot()).toBe(first)
    markDashboardReady()
    expect(getDashboardReadySnapshot()).not.toBe(first)
    const second = getDashboardReadySnapshot()
    markDashboardReady()
    expect(getDashboardReadySnapshot()).toBe(second)
  })
})

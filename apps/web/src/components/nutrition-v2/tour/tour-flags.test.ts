// @vitest-environment jsdom
// Opt-in por archivo: desde el reparto por projects (vitest.config.ts, 2026-09-02) los
// `*.test.ts` corren en `node`, y este ejercita DOM real (window/document/localStorage).
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TOUR_FLAG_VERSION, clearTourSeen, hasSeenTour, markTourSeen, tourFlagKey } from './tour-flags'

/**
 * D4 de la SPEC `nutrition-onboarding-tour`: memoria por coach y por tour, versionada, sin backend.
 * Lo que se fija acá es el contrato de la clave (que es lo que hace que subir a `v2` re-arranque el
 * tour una vez) y las dos degradaciones que no pueden explotar: sin `window` (SSR) y con el storage
 * bloqueado (Safari privado / cookies de terceros).
 */

afterEach(() => {
  // Primero se devuelve el `window` real: el test de SSR lo deja en `undefined` y limpiar el storage
  // antes explotaría acá en vez de en el test que corresponde.
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('tourFlagKey', () => {
  it('arma `eva.tour.<tourId>.<version>.<coachId>`', () => {
    expect(tourFlagKey('editor', 'coach-1')).toBe(`eva.tour.editor.${TOUR_FLAG_VERSION}.coach-1`)
    expect(TOUR_FLAG_VERSION).toBe('v1')
  })

  it('sin coach identificado usa un cajón propio en vez de escribir `null` en la clave', () => {
    expect(tourFlagKey('hub', null)).toBe('eva.tour.hub.v1.anon')
    expect(tourFlagKey('hub', undefined)).toBe('eva.tour.hub.v1.anon')
    expect(tourFlagKey('hub', '   ')).toBe('eva.tour.hub.v1.anon')
  })
})

describe('marcar y leer', () => {
  it('un tour sin marcar no está visto; marcarlo lo deja visto y borrarlo lo revierte', () => {
    expect(hasSeenTour('editor', 'coach-1')).toBe(false)

    markTourSeen('editor', 'coach-1')
    expect(hasSeenTour('editor', 'coach-1')).toBe(true)
    expect(window.localStorage.getItem('eva.tour.editor.v1.coach-1')).toBe('1')

    clearTourSeen('editor', 'coach-1')
    expect(hasSeenTour('editor', 'coach-1')).toBe(false)
  })

  it('la memoria es por COACH y por TOUR: no se contagian', () => {
    markTourSeen('editor', 'coach-1')

    expect(hasSeenTour('editor', 'coach-2')).toBe(false)
    expect(hasSeenTour('hub', 'coach-1')).toBe(false)
  })

  it('una clave de otra versión NO cuenta como visto (subir de versión re-arranca una vez)', () => {
    // Cómo se vería una marca escrita por una versión distinta del guion.
    window.localStorage.setItem('eva.tour.editor.v2.coach-1', '1')
    window.localStorage.setItem('eva.tour.editor.coach-1', '1')

    expect(hasSeenTour('editor', 'coach-1')).toBe(false)
  })

  it('un valor distinto del canónico no cuenta como visto', () => {
    window.localStorage.setItem('eva.tour.editor.v1.coach-1', 'true')

    expect(hasSeenTour('editor', 'coach-1')).toBe(false)
  })
})

describe('degradaciones', () => {
  it('sin `window` (render de servidor) devuelve «visto» y no escribe nada', () => {
    vi.stubGlobal('window', undefined)

    expect(hasSeenTour('editor', 'coach-1')).toBe(true)
    expect(() => markTourSeen('editor', 'coach-1')).not.toThrow()
    expect(() => clearTourSeen('editor', 'coach-1')).not.toThrow()
  })

  it('con el storage bloqueado es fail-closed: «visto» (jamás auto-arrancar en loop)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage bloqueado')
    })

    expect(hasSeenTour('editor', 'coach-1')).toBe(true)
    expect(() => markTourSeen('editor', 'coach-1')).not.toThrow()
  })
})

import { describe, expect, it } from 'vitest'
import { FEATURE_DOMAIN_KEYS, type FeatureDomain } from '@eva/feature-prefs'
import { CLIENT_TAB_DOMAIN, resolveClientTab, visibleClientTabs, type ClientTab } from '../../apps/mobile/lib/client-tabs'

/**
 * W1.9 — pestañas de la ficha del alumno (RN) gobernadas por el master switch por DOMINIO.
 *
 * `apps/mobile/lib/client-tabs.ts` es PURO: solo importa el TYPE `ClientTab` de `ClientTabBar`
 * (`import type`, se borra al compilar). Si alguna vez ese import dejara de ser type-only, este
 * archivo reventaría al importar react-native/expo-linear-gradient bajo el runner de la raíz — o
 * sea, el propio test es el guard de esa regla.
 *
 * Lo que se pinnea:
 *  - qué pestaña cuelga de qué dominio (Entreno y Programa ⇒ `training`, Nutrición ⇒ `nutrition`;
 *    Resumen y Progreso de ninguno);
 *  - fail-OPEN: solo el `false` explícito oculta (mapa vacío / dominios ajenos ⇒ las 5);
 *  - regla 4A: si la pestaña activa se oculta, la ficha cae a «Resumen».
 */

const ALL_ON = Object.fromEntries(FEATURE_DOMAIN_KEYS.map((d) => [d, true])) as Record<FeatureDomain, boolean>
const off = (...domains: FeatureDomain[]): Record<FeatureDomain, boolean> => {
  const out = { ...ALL_ON }
  for (const domain of domains) out[domain] = false
  return out
}

/** Las 5 pestañas reales de la ficha RN, en el orden en que las arma `[clientId].tsx`. */
const TABS: { value: ClientTab; label: string }[] = [
  { value: 'overview', label: 'Resumen' },
  { value: 'progreso', label: 'Progreso' },
  { value: 'analisis', label: 'Entreno' },
  { value: 'plan', label: 'Programa' },
  { value: 'nutricion', label: 'Nutrición' },
]

const values = (tabs: { value: ClientTab }[]) => tabs.map((t) => t.value)

describe('visibleClientTabs', () => {
  it('con los 5 dominios prendidos deja las 5 pestañas en su orden original', () => {
    expect(values(visibleClientTabs(TABS, ALL_ON))).toEqual(['overview', 'progreso', 'analisis', 'plan', 'nutricion'])
  })

  it('training apagado saca Entreno y Programa (Resumen y Progreso nunca se ocultan)', () => {
    expect(values(visibleClientTabs(TABS, off('training')))).toEqual(['overview', 'progreso', 'nutricion'])
  })

  it('nutrition apagado saca solo Nutrición', () => {
    expect(values(visibleClientTabs(TABS, off('nutrition')))).toEqual(['overview', 'progreso', 'analisis', 'plan'])
  })

  it('cardio, movement y bodycomp no gobiernan ninguna pestaña de la ficha', () => {
    expect(values(visibleClientTabs(TABS, off('cardio', 'movement', 'bodycomp')))).toHaveLength(5)
  })

  it('fail-OPEN: un mapa vacío (config vieja / sin resolver) deja las 5', () => {
    expect(values(visibleClientTabs(TABS, {} as Record<FeatureDomain, boolean>))).toHaveLength(5)
  })

  it('el mapa pestaña→dominio no toca Resumen ni Progreso', () => {
    expect(CLIENT_TAB_DOMAIN.overview).toBeUndefined()
    expect(CLIENT_TAB_DOMAIN.progreso).toBeUndefined()
    expect(CLIENT_TAB_DOMAIN.analisis).toBe('training')
    expect(CLIENT_TAB_DOMAIN.plan).toBe('training')
    expect(CLIENT_TAB_DOMAIN.nutricion).toBe('nutrition')
  })
})

describe('resolveClientTab', () => {
  it('4A: Nutrición con nutrition apagado cae a Resumen', () => {
    expect(resolveClientTab('nutricion', off('nutrition'))).toBe('overview')
  })

  it('4A: Programa con training apagado cae a Resumen', () => {
    expect(resolveClientTab('plan', off('training'))).toBe('overview')
  })

  it('Progreso sobrevive aunque estén los 5 dominios apagados', () => {
    expect(resolveClientTab('progreso', off(...FEATURE_DOMAIN_KEYS))).toBe('progreso')
  })

  it('conserva la pestaña elegida cuando su dominio sigue prendido', () => {
    expect(resolveClientTab('nutricion', ALL_ON)).toBe('nutricion')
    expect(resolveClientTab('analisis', off('nutrition'))).toBe('analisis')
  })
})

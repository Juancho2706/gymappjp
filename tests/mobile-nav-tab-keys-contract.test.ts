// Contrato barra inferior RN <-> registro compartido del nav (Ola de orden W1.11).
//
// `MOBILE_TAB_KEYS` vive en `apps/mobile/components/coach/coach-tab-keys.ts`, un modulo PURO que se
// extrajo de `CoachMobileChrome.tsx` justamente para poder importarlo desde el runner raiz sin
// arrastrar react-native / lucide-react-native / reanimated (gotcha ya conocido:
// project_ci_root_test_mobile_dep_gotcha).
//
// AVISO PARA W2.5: la barra se rediseña con un boton «Mas» y este array deja de ser la lista plana
// de hoy. Cuando eso pase, el caso (c) de abajo es el que hay que actualizar A CONCIENCIA: fija el
// drift conocido (que entradas del registro NO aparecen hoy en la barra), no un ideal.
import { describe, expect, it } from 'vitest'
import { NAV_MODULES, REACTIVATE_NAV_ITEM } from '@eva/coach-nav'
import { MOBILE_TAB_KEYS } from '../apps/mobile/components/coach/coach-tab-keys'

const REGISTRY_KEYS = NAV_MODULES.map((m) => m.key)
const KNOWN_KEYS = new Set([...REGISTRY_KEYS, REACTIVATE_NAV_ITEM.key])

describe('MOBILE_TAB_KEYS <-> NAV_MODULES', () => {
  it('(a) cada key de la barra existe en el registro (o es el item de reactivacion)', () => {
    const inventadas = MOBILE_TAB_KEYS.filter((key) => !KNOWN_KEYS.has(key))
    expect(inventadas).toEqual([])
  })

  it('(b) no hay keys duplicadas en la barra', () => {
    expect(new Set(MOBILE_TAB_KEYS).size).toBe(MOBILE_TAB_KEYS.length)
  })

  it('(c) drift conocido: las entradas del registro ausentes de la barra son exactamente 3', () => {
    const enBarra = new Set<string>(MOBILE_TAB_KEYS)
    const ausentes = REGISTRY_KEYS.filter((key) => !enBarra.has(key))
    // Soporte no tiene tab propio en RN; Cardio y Movimiento son modulos comprables que hoy se
    // alcanzan desde el hub de herramientas, no desde la barra. W2.5 los mueve a «Mas».
    expect(ausentes).toEqual(['support', 'cardio', 'movement'])
  })
})

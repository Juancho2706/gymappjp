// Contrato barra inferior RN <-> registro compartido del nav (Ola de orden W1.11, actualizado en W2.5).
//
// `MOBILE_TAB_KEYS` vive en `apps/mobile/components/coach/coach-tab-keys.ts`, un modulo PURO que se
// extrajo de `CoachMobileChrome.tsx` justamente para poder importarlo desde el runner raiz sin
// arrastrar react-native / lucide-react-native / reanimated (gotcha ya conocido:
// project_ci_root_test_mobile_dep_gotcha). Por eso este test NO importa nada con JSX de apps/mobile.
//
// Que significa el array DESDE W2.5: ya no es «el orden de la barra» (la barra la arma
// `buildMobileBar` con la especialidad del coach) sino las keys del nav CON DESTINO en RN — el
// dominio de `NAV_ROUTE`. Incluye `more`, que es un SLOT de la barra y a proposito NO vive en
// `NAV_MODULES`.
import { describe, expect, it } from 'vitest'
import { MORE_NAV_ITEM, NAV_MODULES, REACTIVATE_NAV_ITEM } from '@eva/coach-nav'
import { MOBILE_TAB_KEYS } from '../apps/mobile/components/coach/coach-tab-keys'

const REGISTRY_KEYS = NAV_MODULES.map((m) => m.key)
const KNOWN_KEYS = new Set([...REGISTRY_KEYS, REACTIVATE_NAV_ITEM.key, MORE_NAV_ITEM.key])

describe('MOBILE_TAB_KEYS <-> NAV_MODULES', () => {
  it('(a) cada key de la barra existe en el registro (o es el item de reactivacion o el slot «Mas»)', () => {
    const inventadas = MOBILE_TAB_KEYS.filter((key) => !KNOWN_KEYS.has(key))
    expect(inventadas).toEqual([])
  })

  it('(b) no hay keys duplicadas en la barra', () => {
    expect(new Set(MOBILE_TAB_KEYS).size).toBe(MOBILE_TAB_KEYS.length)
  })

  it('(c) drift conocido: las entradas del registro sin destino propio en RN son exactamente 2', () => {
    const conDestino = new Set<string>(MOBILE_TAB_KEYS)
    const ausentes = REGISTRY_KEYS.filter((key) => !conDestino.has(key))
    // Recalculado A CONCIENCIA en W2.5 contra el registro real (11 entradas): Cardio y Movimiento
    // YA tienen destino (pantallas de stack, alcanzables desde la hoja «Mas»), asi que salen de la
    // lista. Quedan `funciones` y `support`: no tienen ruta propia en el mapa de RN porque su
    // `href` del registro (`/coach/settings/funciones`, `/coach/support`) ya resuelve tal cual en
    // Expo Router — la hoja «Mas» los navega por ahi.
    expect(ausentes).toEqual(['funciones', 'support'])
  })

  it('(d) el slot «Mas» NO es una entrada del registro (es un lugar de la barra, no una superficie)', () => {
    expect(MOBILE_TAB_KEYS).toContain(MORE_NAV_ITEM.key)
    expect(REGISTRY_KEYS).not.toContain(MORE_NAV_ITEM.key)
  })
})

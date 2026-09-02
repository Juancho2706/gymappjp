import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { deriveSportTokens } from '@eva/brand-kit'
import { isOwnBrandColor } from '../../apps/mobile/lib/loader-identity'
import { GLOWS, glowSport } from '../../apps/mobile/lib/shadows'
import { brandVars, DARK_SCHEME_VARS, LIGHT_SCHEME_VARS } from '../../apps/mobile/lib/theme'

/**
 * El white-label de CLASES (bg-sport-*, text-sport-*, bg-cta-fill, bg-primary…) depende de que el
 * objeto que devuelve `vars()` de NativeWind llegue INTACTO al `style` de la <View> proveedora.
 *
 * `vars()` devuelve un objeto VACÍO y guarda el juego de variables en un WeakMap global claveado
 * por la IDENTIDAD de ese objeto (react-native-css-interop, `runtime/native/api.ts` →
 * `opaqueStyles.set(style, …)`; lo lee `getOpaqueStyles` en `runtime/native/styles.ts`, que ante
 * un miss devuelve el objeto tal cual y lo trata como estilo plano). Cualquier copia
 * —`{ ...vars(x) }`, `Object.assign({}, vars(x))`, `StyleSheet.flatten`— pierde la clave del
 * WeakMap y deja al subárbol SIN una sola variable: la app entera cae a los tokens estáticos de
 * `global.css`, o sea azul EVA en cualquier marca. Es exactamente el QA del owner del 22-08
 * (marca rosa por preset, app azul) y estuvo vivo desde el primer commit del ThemeContext.
 */
const MOBILE_DIR = path.resolve(__dirname, '..', '..', 'apps', 'mobile')

// El barrido de `apps/mobile` en busca de copias de `vars()` (`{ ...vars(x) }`,
// `Object.assign({}, vars(x))`, `flatten(vars(x))`) ya no se hace leyendo el árbol
// como texto: vive en la regla eslint `local/no-nativewind-vars-copy`
// (tools/eslint-rules/), que corre en `pnpm lint` sobre todo `apps/mobile`. Lo que
// sigue acá son las afirmaciones sobre VALORES, que sí son trabajo de un test.

/**
 * Guardia de la regla "sin marca propia NO se emite override" (`brandThemeVars` en
 * context/ThemeContext.tsx). No es cosmética: la rampa derivada ancla el color del coach en el
 * paso 500, así que emitirla para el azul de fábrica correría la rampa EVA entera un escalón.
 */
describe('rampa EVA de fábrica', () => {
  it('el azul EVA NO es "color propio" — por eso la cuenta sin marca conserva los tokens', () => {
    expect(isOwnBrandColor('#1462DC')).toBe(false)
    expect(isOwnBrandColor('#007AFF')).toBe(false)
    expect(isOwnBrandColor('#E11D74')).toBe(true)
  })

  it('derivar desde el azul EVA NO reproduce la rampa estática (motivo del guard)', () => {
    const derived = deriveSportTokens('#1462DC')
    // Token estático `--color-sport-500` = rgb(38 128 255) = #2680FF; el derivado ancla en 500.
    expect(derived.ramp['500'].toLowerCase()).toBe('#1462dc')
    expect(derived.ramp['500'].toLowerCase()).not.toBe('#2680ff')
  })

  it('los vars de esquema siguen trayendo la rampa EVA por modo', () => {
    expect(LIGHT_SCHEME_VARS['--color-sport-600']).toBe('20 98 220')
    expect(DARK_SCHEME_VARS['--color-sport-600']).toBe('127 176 255')
  })
})

/**
 * `ForceScheme` re-declara estos vars para SCOPEAR un esquema a un subárbol (el ejecutor y toda
 * la familia de entrada van dark forzado). Mientras el `{ ...vars(…) }` los tiraba a la basura el
 * drift contra `global.css` era invisible; ahora se ve, así que se compara a máquina.
 */
describe('LIGHT/DARK_SCHEME_VARS son espejo de global.css', () => {
  const css = fs.readFileSync(path.join(MOBILE_DIR, 'global.css'), 'utf8')
  const readVars = (block: string) => {
    const out: Record<string, string> = {}
    for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
    return out
  }
  const rootVars = readVars(css.slice(css.indexOf(':root {'), css.indexOf('.dark:root,')))
  const darkVars = readVars(css.slice(css.indexOf('.dark:root,')))

  it.each([
    ['LIGHT', LIGHT_SCHEME_VARS, () => rootVars],
    ['DARK', DARK_SCHEME_VARS, () => darkVars],
  ])('%s coincide con el bloque de global.css', (_name, scheme, block) => {
    const cssVars = block()
    const drift = Object.entries(scheme)
      .filter(([key, value]) => cssVars[key] !== value)
      .map(([key, value]) => `${key}: css=${cssVars[key] ?? '(ausente)'} theme.ts=${value}`)
    expect(drift).toEqual([])
  })
})

describe('brandVars con marca propia', () => {
  const ROSE = '#E11D74'

  it('reescribe la rampa sport y el relleno de CTA con el color del coach', () => {
    const light = brandVars(ROSE, 'light')
    const rose = deriveSportTokens(ROSE)
    const channels = (hex: string) => {
      const h = hex.replace('#', '')
      return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`
    }
    expect(light['--color-sport-500']).toBe(channels(rose.ramp['500']))
    expect(light['--color-cta-fill']).toBe(channels(rose.ctaFill))
    // Y NO el token estático azul.
    expect(light['--color-sport-500']).not.toBe('38 128 255')
    expect(light['--color-cta-fill']).not.toBe('26 107 230')
  })

  it('en oscuro pisa los MISMOS 100/600/700 que redeclara el bloque .dark de global.css', () => {
    const dark = brandVars(ROSE, 'dark')
    expect(dark['--color-sport-600']).not.toBe(DARK_SCHEME_VARS['--color-sport-600'])
    expect(dark['--color-sport-700']).not.toBe(DARK_SCHEME_VARS['--color-sport-700'])
    expect(dark['--color-sport-100']).not.toBe(DARK_SCHEME_VARS['--color-sport-100'])
  })
})

/**
 * `shadowColor` de RN no acepta una CSS-var: el halo de marca se resuelve en runtime o queda
 * clavado en azul, que fue el "FAB rosa con halo azul" del QA.
 */
describe('glowSport', () => {
  it('sin color propio devuelve el halo EVA TAL CUAL (misma referencia)', () => {
    expect(glowSport(null)).toBe(GLOWS.sport)
    expect(glowSport('#1462DC')).toBe(GLOWS.sport)
    expect(glowSport('no-es-un-hex')).toBe(GLOWS.sport)
  })

  it('con marca propia conserva la geometría del DS y cambia solo el color', () => {
    const glow = glowSport('#E11D74')
    expect(glow.shadowColor).toBe(deriveSportTokens('#E11D74').ramp['500'])
    expect(glow.shadowOpacity).toBe(GLOWS.sport.shadowOpacity)
    expect(glow.shadowRadius).toBe(GLOWS.sport.shadowRadius)
    expect(glow.shadowOffset).toEqual(GLOWS.sport.shadowOffset)
    expect(glow.elevation).toBe(GLOWS.sport.elevation)
  })
})

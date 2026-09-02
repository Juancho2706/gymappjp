import { afterEach, describe, expect, it } from 'vitest'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { LAUNCH_BRAND_FALLBACK_LOGO, resolveLaunchBrand } from '@/lib/workout/exec-launch-brand'

// ────────────────────────────────────────────────────────────────────────────
// Despegue del ejecutor V3 (web) — resolución de la marca del coach para el
// círculo central. El bug que motiva la suite: los triggers del bottom-sheet
// «Revisar y editar» / «Repetir hoy» viven en un PORTAL (`document.body`), o
// sea HERMANOS del wrapper `/c`, y `closest('[data-primary-color]')` devolvía
// `null` → el Despegue perdía el logo Y la inicial y caía al glifo genérico.
// ────────────────────────────────────────────────────────────────────────────

const LOGO_LIGHT = 'https://cdn.example/josefit/logo.png'
const LOGO_DARK = 'https://cdn.example/josefit/logo-dark.png'

/**
 * Monta el wrapper `/c` (mismos datasets que emite `layout.tsx`) + un trigger DENTRO y otro FUERA,
 * este último dentro de un contenedor hermano que simula el portal del sheet.
 */
function mountLayout(attrs: string) {
    document.body.innerHTML = `
        <div data-primary-color="#1462DC" ${attrs}>
            <button id="dentro">Empezar entrenamiento</button>
        </div>
        <div id="portal"><a id="fuera" href="#">Repetir hoy</a></div>`
}

const trigger = (id: string) => document.getElementById(id)

afterEach(() => {
    document.body.innerHTML = ''
})

describe('resolveLaunchBrand — trigger dentro del wrapper /c', () => {
    it('prefiere la variante oscura del logo (la ceremonia es dark-only)', () => {
        mountLayout(`data-brand-name="Jose Fit" data-logo-url="${LOGO_LIGHT}" data-logo-dark="${LOGO_DARK}"`)
        expect(resolveLaunchBrand(trigger('dentro'))).toEqual({
            logoUrl: LOGO_DARK,
            initial: 'J',
            brandName: 'Jose Fit',
        })
    })

    it('cae al logo claro cuando el coach no tiene variante oscura', () => {
        mountLayout(`data-brand-name="Jose Fit" data-logo-url="${LOGO_LIGHT}"`)
        expect(resolveLaunchBrand(trigger('dentro')).logoUrl).toBe(LOGO_LIGHT)
    })

    it('el relleno EVA del layout NO cuenta como logo propio: cae a la inicial', () => {
        mountLayout(`data-brand-name="EVA Demo" data-logo-url="${BRAND_APP_ICON}"`)
        expect(resolveLaunchBrand(trigger('dentro'))).toEqual({
            logoUrl: null,
            initial: 'E',
            brandName: 'EVA Demo',
        })
    })
})

describe('resolveLaunchBrand — trigger portaleado (regresión del sheet «Repetir hoy»)', () => {
    it('encuentra el wrapper a nivel documento aunque el trigger sea su hermano', () => {
        mountLayout(`data-brand-name="Jose Fit" data-logo-url="${LOGO_LIGHT}" data-logo-dark="${LOGO_DARK}"`)
        // `closest` no llega desde el portal: sin el respaldo a nivel documento esto daba todo null.
        expect(trigger('fuera')?.closest('[data-primary-color]')).toBeNull()
        expect(resolveLaunchBrand(trigger('fuera'))).toEqual({
            logoUrl: LOGO_DARK,
            initial: 'J',
            brandName: 'Jose Fit',
        })
    })

    it('entrega el mismo resultado que el trigger de dentro (handoff idéntico)', () => {
        mountLayout(`data-brand-name="Jose Fit" data-logo-url="${LOGO_LIGHT}" data-logo-dark="${LOGO_DARK}"`)
        expect(resolveLaunchBrand(trigger('fuera'))).toEqual(resolveLaunchBrand(trigger('dentro')))
    })
})

describe('resolveLaunchBrand — sin wrapper en el documento', () => {
    it('devuelve todo null sin lanzar (SSR / fuera de /c)', () => {
        document.body.innerHTML = '<a id="suelto" href="#">Repetir hoy</a>'
        expect(resolveLaunchBrand(trigger('suelto'))).toEqual({
            logoUrl: null,
            initial: null,
            brandName: null,
        })
    })

    it('tolera un trigger nulo', () => {
        document.body.innerHTML = ''
        expect(resolveLaunchBrand(null)).toEqual({ logoUrl: null, initial: null, brandName: null })
    })
})

describe('resolveLaunchBrand — trigger nulo CON el wrapper montado', () => {
    // Contrato NUEVO (respaldo a nivel documento): antes `resolveLaunchBrand(null)` devolvia
    // siempre todo null; ahora, bajo `/c`, resuelve la marca del wrapper igual que un trigger
    // portaleado. El test de arriba pasa solo porque limpia el body primero, asi que este fija la
    // diferencia real.
    it('resuelve la marca del wrapper aunque no haya trigger', () => {
        mountLayout(`data-brand-name="Jose Fit" data-logo-url="${LOGO_LIGHT}" data-logo-dark="${LOGO_DARK}"`)
        expect(resolveLaunchBrand(null)).toEqual({
            logoUrl: LOGO_DARK,
            initial: 'J',
            brandName: 'Jose Fit',
        })
    })

    it('entrega lo mismo que un trigger de dentro (el handoff no depende de la ref)', () => {
        mountLayout(`data-brand-name="Jose Fit" data-logo-url="${LOGO_LIGHT}"`)
        expect(resolveLaunchBrand(null)).toEqual(resolveLaunchBrand(trigger('dentro')))
    })
})

describe('LAUNCH_BRAND_FALLBACK_LOGO', () => {
    it('es el ícono EVA — último eslabón de logo → inicial → EVA', () => {
        expect(LAUNCH_BRAND_FALLBACK_LOGO).toBe(BRAND_APP_ICON)
    })
})

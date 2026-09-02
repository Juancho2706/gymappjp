import { describe, expect, it } from 'vitest'
import {
    buildCoachOgPngResponse,
    coachOgBrandNameFontSize,
    coachOgBrandNameStyle,
    coachOgFallbackArtwork,
    coachOgImageVersion,
    coachOgMinimalPng,
    estimateCoachOgTextWidth,
    COACH_OG_BRAND_NAME_MIN_FONT_SIZE,
    COACH_OG_CONTENT_WIDTH,
    COACH_OG_IMAGE_HEIGHT,
    COACH_OG_IMAGE_WIDTH,
    COACH_OG_PADDING,
    isDarkBackground,
    resolveCoachOgArtwork,
    safeHexColor,
} from './coach-og-image'
import { BRAND_PRIMARY_COLOR } from './brand-assets'

const base = {
    primaryColor: '#111827',
    logoUrl: null,
    logoUrlDark: null,
    brandName: 'Jose Fit',
    brandingAllowed: true,
}

describe('buildCoachOgPngResponse', () => {
    // El header que arregla la preview de WhatsApp: sin Content-Length el cliente Android descarta
    // la miniatura. Este test es la barrera contra la regresión.
    it('emite Content-Length igual a los bytes reales del PNG', async () => {
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]).buffer
        const res = buildCoachOgPngResponse(png)

        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toBe('image/png')
        const length = res.headers.get('Content-Length')
        expect(length).toBe(String(png.byteLength))
        expect(Number(length)).toBe((await res.arrayBuffer()).byteLength)
    })

    it('mantiene el s-maxage que hace que Vercel cachee la imagen en el edge', () => {
        const cache = buildCoachOgPngResponse(new ArrayBuffer(1)).headers.get('Cache-Control')
        expect(cache).toContain('s-maxage=86400')
        expect(cache).toContain('public')
    })
})

describe('resolveCoachOgArtwork', () => {
    it('logo del coach centrado sobre su color de marca', () => {
        expect(resolveCoachOgArtwork({ ...base, primaryColor: '#FF6B00', logoUrl: 'https://cdn/logo.png' })).toEqual({
            kind: 'logo',
            background: '#FF6B00',
            logoUrl: 'https://cdn/logo.png',
        })
    })

    it('fondo oscuro ⇒ gana la variante logo_url_dark; fondo claro ⇒ el logo normal', () => {
        const logos = { logoUrl: 'https://cdn/light.png', logoUrlDark: 'https://cdn/dark.png' }
        expect(resolveCoachOgArtwork({ ...base, primaryColor: '#0B0B0C', ...logos })).toMatchObject({
            logoUrl: 'https://cdn/dark.png',
        })
        expect(resolveCoachOgArtwork({ ...base, primaryColor: '#FFE066', ...logos })).toMatchObject({
            logoUrl: 'https://cdn/light.png',
        })
    })

    it('con una sola variante usa esa (un logo con contraste imperfecto se ve; ninguno, no)', () => {
        expect(resolveCoachOgArtwork({ ...base, primaryColor: '#FFE066', logoUrlDark: 'https://cdn/dark.png' })).toMatchObject({
            logoUrl: 'https://cdn/dark.png',
        })
        expect(resolveCoachOgArtwork({ ...base, primaryColor: '#0B0B0C', logoUrl: 'https://cdn/light.png' })).toMatchObject({
            logoUrl: 'https://cdn/light.png',
        })
    })

    it('sin logo ⇒ el nombre de la marca sobre el mismo fondo', () => {
        expect(resolveCoachOgArtwork({ ...base, primaryColor: '#1462DC' })).toEqual({
            kind: 'brandName',
            background: '#1462DC',
            brandName: 'Jose Fit',
            color: '#FFFFFF',
        })
    })

    it('sin logo y sin nombre ⇒ figura EVA sobre azul EVA', () => {
        expect(resolveCoachOgArtwork({ ...base, primaryColor: '#1462DC', brandName: '   ' })).toEqual({
            kind: 'eva',
            background: BRAND_PRIMARY_COLOR,
        })
    })

    it('color inválido ⇒ azul EVA de fondo (los colores del coach son texto libre en DB)', () => {
        expect(resolveCoachOgArtwork({ ...base, primaryColor: 'rojo', logoUrl: 'https://cdn/logo.png' })).toMatchObject({
            background: BRAND_PRIMARY_COLOR,
        })
    })

    it('tier inválido (fail-closed) ⇒ preview de EVA aunque tenga logo', () => {
        expect(
            resolveCoachOgArtwork({ ...base, logoUrl: 'https://cdn/logo.png', brandingAllowed: false }),
        ).toEqual({ kind: 'eva', background: BRAND_PRIMARY_COLOR })
    })
})

describe('coachOgFallbackArtwork', () => {
    it('logo que satori no pudo dibujar ⇒ nombre de la marca, mismo fondo', () => {
        const art = resolveCoachOgArtwork({ ...base, primaryColor: '#0B0B0C', logoUrl: 'https://cdn/roto.tiff' })
        expect(coachOgFallbackArtwork(art, 'Jose Fit')).toEqual({
            kind: 'brandName',
            background: '#0B0B0C',
            brandName: 'Jose Fit',
            color: '#FFFFFF',
        })
    })

    it('sin nombre cae a EVA, y lo que no es logo pasa intacto', () => {
        const art = resolveCoachOgArtwork({ ...base, logoUrl: 'https://cdn/roto.tiff' })
        expect(coachOgFallbackArtwork(art, null)).toEqual({ kind: 'eva', background: BRAND_PRIMARY_COLOR })

        const evaArt = resolveCoachOgArtwork({ ...base, brandName: null })
        expect(coachOgFallbackArtwork(evaArt, null)).toBe(evaArt)
    })
})

describe('coachOgImageVersion', () => {
    it('es estable para las mismas partes y cambia cuando el coach cambia el logo', () => {
        const before = coachOgImageVersion('https://cdn/v1.png', null, '#1462DC', 'Jose Fit')
        expect(coachOgImageVersion('https://cdn/v1.png', null, '#1462DC', 'Jose Fit')).toBe(before)
        expect(coachOgImageVersion('https://cdn/v2.png', null, '#1462DC', 'Jose Fit')).not.toBe(before)
        expect(coachOgImageVersion('https://cdn/v1.png', 'https://cdn/dark.png', '#1462DC', 'Jose Fit')).not.toBe(before)
        expect(coachOgImageVersion('https://cdn/v1.png', null, '#FF6B00', 'Jose Fit')).not.toBe(before)
    })

    it('cambia con el tier: el fail-closed de branding cambia el ARTE sin tocar logo ni color', () => {
        const pro = coachOgImageVersion('https://cdn/v1.png', null, '#1462DC', 'Jose Fit', 'pro')
        expect(coachOgImageVersion('https://cdn/v1.png', null, '#1462DC', 'Jose Fit', 'free')).not.toBe(pro)
        expect(coachOgImageVersion('https://cdn/v1.png', null, '#1462DC', 'Jose Fit', 'pro')).toBe(pro)
    })

    it('sirve como query string tal cual (sin escapar) y tolera ausencias', () => {
        const v = coachOgImageVersion(null, undefined, '', 'Mi Coach')
        expect(v).toMatch(/^[0-9a-z]+$/)
        expect(encodeURIComponent(v)).toBe(v)
    })
})

describe('helpers de composición', () => {
    it('isDarkBackground distingue el negro del amarillo pastel', () => {
        expect(isDarkBackground('#0B0B0C')).toBe(true)
        expect(isDarkBackground('#1462DC')).toBe(true)
        expect(isDarkBackground('#FFE066')).toBe(false)
    })

    it('safeHexColor solo acepta hex de 6 dígitos', () => {
        expect(safeHexColor('#AbC123', '#000000')).toBe('#AbC123')
        expect(safeHexColor('#ABC', '#000000')).toBe('#000000')
        expect(safeHexColor(null, '#000000')).toBe('#000000')
    })

    it('el nombre largo baja de tamaño para no desbordar los 1200×630', () => {
        expect(COACH_OG_IMAGE_WIDTH).toBe(1200)
        expect(COACH_OG_IMAGE_HEIGHT).toBe(630)
        expect(coachOgBrandNameFontSize('Ana')).toBeGreaterThan(coachOgBrandNameFontSize('Jose Fit Studio'))
        expect(coachOgBrandNameFontSize('Jose Fit Studio')).toBeGreaterThan(
            coachOgBrandNameFontSize('Centro de Alto Rendimiento Norte'),
        )
    })
})

describe('nombre de marca: no-desborde real (hallazgo B-7)', () => {
    // El test viejo solo comparaba los tres tamaños ENTRE SI: no probaba el desborde que su nombre
    // prometia. Lo que desborda es la palabra mas larga (no se puede partir en dos lineas), y
    // satori NO achica solo: recorta.
    const CASOS = [
        'Ana',
        'Jose Fit Studio',
        'Centro de Alto Rendimiento Norte',
        'EntrenamientoPersonalizadoPro',
        'Hipertrofia',
        'ClubDeportivoMetropolitanoDeAltoRendimientoSantiago',
    ]

    it('el ancho util es el lienzo menos los dos margenes', () => {
        expect(COACH_OG_CONTENT_WIDTH).toBe(COACH_OG_IMAGE_WIDTH - 2 * COACH_OG_PADDING)
    })

    const palabraMasLarga = (nombre: string) =>
        nombre.split(/\s+/).reduce((a, b) => (a.length >= b.length ? a : b))

    it('la palabra mas larga entra en el ancho util al tamaño elegido (o toca el piso legible)', () => {
        for (const nombre of CASOS) {
            const fontSize = coachOgBrandNameFontSize(nombre)
            const ancho = estimateCoachOgTextWidth(palabraMasLarga(nombre), fontSize)
            // Achicar tiene un piso: por debajo el nombre no se lee en la miniatura. En ese extremo
            // (una sola palabra de 50+ chars) el que evita el recorte es `wordBreak: break-word`,
            // que parte la palabra en dos lineas — verificado en el test del estilo.
            if (fontSize > COACH_OG_BRAND_NAME_MIN_FONT_SIZE) {
                expect(ancho).toBeLessThanOrEqual(COACH_OG_CONTENT_WIDTH)
            } else {
                expect(coachOgBrandNameStyle(nombre, '#FFFFFF').wordBreak).toBe('break-word')
            }
        }
    })

    it('el nombre de una sola palabra normal entra sin partirse', () => {
        for (const nombre of ['Hipertrofia', 'EntrenamientoPersonalizadoPro']) {
            const fontSize = coachOgBrandNameFontSize(nombre)
            expect(fontSize).toBeGreaterThan(COACH_OG_BRAND_NAME_MIN_FONT_SIZE)
            expect(estimateCoachOgTextWidth(nombre, fontSize)).toBeLessThanOrEqual(COACH_OG_CONTENT_WIDTH)
        }
    })

    it('el caso que fallaba: 29 chars sin espacios ya no se dibuja a 84 px', () => {
        const nombre = 'EntrenamientoPersonalizadoPro'
        expect(estimateCoachOgTextWidth(nombre, 84)).toBeGreaterThan(COACH_OG_CONTENT_WIDTH)
        expect(coachOgBrandNameFontSize(nombre)).toBeLessThan(84)
    })

    it('nunca baja del piso legible', () => {
        for (const nombre of CASOS) {
            expect(coachOgBrandNameFontSize(nombre)).toBeGreaterThanOrEqual(COACH_OG_BRAND_NAME_MIN_FONT_SIZE)
        }
    })

    it('el estilo deja envolver: wrap + maxWidth + corte de palabra + centrado', () => {
        const style = coachOgBrandNameStyle('Centro de Alto Rendimiento Norte', '#FFFFFF')
        expect(style).toMatchObject({
            flexWrap: 'wrap',
            maxWidth: '100%',
            textAlign: 'center',
            wordBreak: 'break-word',
            color: '#FFFFFF',
        })
        expect(style.fontSize).toBe(coachOgBrandNameFontSize('Centro de Alto Rendimiento Norte'))
        // `overflow: hidden` era lo que RECORTABA el nombre: no puede volver.
        expect(style).not.toHaveProperty('overflow')
    })
})

describe('coachOgMinimalPng (ultimo recurso, hallazgo B-4)', () => {
    it('es un PNG valido y no vacio', () => {
        const bytes = new Uint8Array(coachOgMinimalPng())
        expect(bytes.byteLength).toBeGreaterThan(0)
        // Firma PNG: 89 50 4E 47 0D 0A 1A 0A.
        expect(Array.from(bytes.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    })

    it('sale como respuesta 200 con Content-Length (nunca un 500)', async () => {
        const res = buildCoachOgPngResponse(coachOgMinimalPng())
        expect(res.status).toBe(200)
        expect(Number(res.headers.get('Content-Length'))).toBe((await res.arrayBuffer()).byteLength)
    })
})

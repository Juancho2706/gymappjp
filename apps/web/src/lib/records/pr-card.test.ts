import { describe, expect, it } from 'vitest'
import { safeColor, rasterLogo, fmtWeight, reducePrFromRows } from './pr-card'

// ymd estable por día calendario UTC (evita depender del TZ de Santiago en el test unitario).
const ymdUtc = (iso: string) => iso.slice(0, 10)

describe('safeColor', () => {
    it('acepta hex #RRGGBB válido', () => {
        expect(safeColor('#2680FF', '#000000')).toBe('#2680FF')
        expect(safeColor('#abcdef', '#000000')).toBe('#abcdef')
    })
    it('cae al fallback con color inválido/ausente', () => {
        expect(safeColor(null, '#111111')).toBe('#111111')
        expect(safeColor(undefined, '#111111')).toBe('#111111')
        expect(safeColor('red', '#111111')).toBe('#111111')
        expect(safeColor('#FFF', '#111111')).toBe('#111111') // 3-dígitos no permitido
        expect(safeColor('#2680FF80', '#111111')).toBe('#111111') // 8-dígitos no permitido
    })
})

describe('rasterLogo', () => {
    it('acepta raster http(s)', () => {
        expect(rasterLogo('https://cdn.x/logo.png')).toBe('https://cdn.x/logo.png')
        expect(rasterLogo('http://x/a.JPG')).toBe('http://x/a.JPG')
    })
    it('rechaza vacío, data:, svg/webp/avif y rutas relativas', () => {
        expect(rasterLogo(null)).toBeNull()
        expect(rasterLogo('')).toBeNull()
        expect(rasterLogo('data:image/png;base64,AAAA')).toBeNull()
        expect(rasterLogo('https://x/logo.svg')).toBeNull()
        expect(rasterLogo('https://x/logo.webp?v=2')).toBeNull()
        expect(rasterLogo('https://x/logo.avif')).toBeNull()
        expect(rasterLogo('/LOGOS/eva-icon.png')).toBeNull()
    })
})

describe('fmtWeight', () => {
    it('usa coma decimal es-CL y deja enteros intactos', () => {
        expect(fmtWeight(180)).toBe('180')
        expect(fmtWeight(82.5)).toBe('82,5')
    })
})

describe('reducePrFromRows', () => {
    it('devuelve null sin filas', () => {
        expect(reducePrFromRows([], ymdUtc)).toBeNull()
    })

    it('primer record: prevKg 0, delta = peso', () => {
        const r = reducePrFromRows(
            [{ weight_kg: 100, logged_at: '2026-01-01T10:00:00Z' }],
            ymdUtc
        )
        expect(r).toEqual({ weightKg: 100, achievedAt: '2026-01-01T10:00:00Z', prevKg: 0, deltaKg: 100 })
    })

    it('calcula delta vs record anterior cuando el máximo sube', () => {
        const r = reducePrFromRows(
            [
                { weight_kg: 80, logged_at: '2026-01-01T10:00:00Z' },
                { weight_kg: 90, logged_at: '2026-02-01T10:00:00Z' },
                { weight_kg: 100, logged_at: '2026-03-01T10:00:00Z' },
            ],
            ymdUtc
        )
        expect(r).toEqual({
            weightKg: 100,
            achievedAt: '2026-03-01T10:00:00Z',
            prevKg: 90,
            deltaKg: 10,
        })
    })

    it('toma el peso TOPE del día y el instante de ese set', () => {
        const r = reducePrFromRows(
            [
                { weight_kg: 60, logged_at: '2026-01-01T08:00:00Z' },
                { weight_kg: 95, logged_at: '2026-01-01T09:30:00Z' },
                { weight_kg: 70, logged_at: '2026-01-01T10:00:00Z' },
            ],
            ymdUtc
        )
        expect(r?.weightKg).toBe(95)
        expect(r?.achievedAt).toBe('2026-01-01T09:30:00Z')
        expect(r?.prevKg).toBe(0)
    })

    it('un máximo igualado más tarde NO cambia el record ni prevKg (>, la primera vez gana)', () => {
        const r = reducePrFromRows(
            [
                { weight_kg: 120, logged_at: '2026-01-01T10:00:00Z' },
                { weight_kg: 120, logged_at: '2026-02-01T10:00:00Z' },
            ],
            ymdUtc
        )
        expect(r).toEqual({
            weightKg: 120,
            achievedAt: '2026-01-01T10:00:00Z',
            prevKg: 0,
            deltaKg: 120,
        })
    })

    it('ignora weight_kg null y ordena por día aunque lleguen desordenados', () => {
        const r = reducePrFromRows(
            [
                { weight_kg: 110, logged_at: '2026-03-01T10:00:00Z' },
                { weight_kg: null, logged_at: '2026-01-15T10:00:00Z' },
                { weight_kg: 100, logged_at: '2026-01-01T10:00:00Z' },
            ],
            ymdUtc
        )
        expect(r).toEqual({
            weightKg: 110,
            achievedAt: '2026-03-01T10:00:00Z',
            prevKg: 100,
            deltaKg: 10,
        })
    })

    it('redondea el delta a 1 decimal', () => {
        const r = reducePrFromRows(
            [
                { weight_kg: 82.5, logged_at: '2026-01-01T10:00:00Z' },
                { weight_kg: 85.2, logged_at: '2026-02-01T10:00:00Z' },
            ],
            ymdUtc
        )
        expect(r?.deltaKg).toBe(2.7)
    })
})

import { describe, it, expect } from 'vitest'
import { Zap, Crown, Rocket, TrendingUp, Building2, Leaf } from 'lucide-react'
import { TIER_ICON, TIER_COLOR, TIER_ICON_BG, TIER_BADGE } from './tier-display'

/**
 * Golden master del slice (Fase 2). Pinea los mapas de display por tier extraídos verbatim de
 * page.tsx: exhaustividad sobre los 6 tiers (incl. legacy growth/scale, que renderizan el plan
 * actual de coaches grandfathered), strings de clase byte-idénticos, e identidad de iconos.
 */

const ALL_TIERS = ['free', 'starter', 'pro', 'elite', 'growth', 'scale']

describe('TIER maps — exhaustividad', () => {
    it('cubren exactamente los 6 tiers (sin faltantes ni extras)', () => {
        expect(Object.keys(TIER_ICON).sort()).toEqual([...ALL_TIERS].sort())
        expect(Object.keys(TIER_COLOR).sort()).toEqual([...ALL_TIERS].sort())
        expect(Object.keys(TIER_ICON_BG).sort()).toEqual([...ALL_TIERS].sort())
    })
})

describe('TIER_ICON — identidad de componentes', () => {
    it('mapea cada tier a su icono lucide', () => {
        expect(TIER_ICON.free).toBe(Leaf)
        expect(TIER_ICON.starter).toBe(Zap)
        expect(TIER_ICON.pro).toBe(Rocket)
        expect(TIER_ICON.elite).toBe(Crown)
        expect(TIER_ICON.growth).toBe(TrendingUp)
        expect(TIER_ICON.scale).toBe(Building2)
    })
})

describe('TIER_COLOR / TIER_ICON_BG — strings byte-idénticos', () => {
    it('TIER_COLOR', () => {
        expect(TIER_COLOR).toEqual({
            free: 'text-slate-400', starter: 'text-sky-400', pro: 'text-violet-400',
            elite: 'text-amber-400', growth: 'text-emerald-400', scale: 'text-rose-400',
        })
    })
    it('TIER_ICON_BG', () => {
        expect(TIER_ICON_BG).toEqual({
            free: 'bg-slate-500/10 border-slate-500/20', starter: 'bg-sky-500/10 border-sky-500/20',
            pro: 'bg-violet-500/10 border-violet-500/20', elite: 'bg-amber-500/10 border-amber-500/20',
            growth: 'bg-emerald-500/10 border-emerald-500/20', scale: 'bg-rose-500/10 border-rose-500/20',
        })
    })
})

describe('TIER_BADGE — Partial solo pro+growth', () => {
    it('exactamente pro y growth, el resto undefined', () => {
        expect(Object.keys(TIER_BADGE).sort()).toEqual(['growth', 'pro'])
        expect(TIER_BADGE.pro).toEqual({ label: 'Más popular', cls: 'bg-violet-500/15 text-violet-400' })
        expect(TIER_BADGE.growth).toEqual({ label: 'Nuevo', cls: 'bg-emerald-500/15 text-emerald-400' })
        expect(TIER_BADGE.starter).toBeUndefined()
        expect(TIER_BADGE.free).toBeUndefined()
        expect(TIER_BADGE.elite).toBeUndefined()
        expect(TIER_BADGE.scale).toBeUndefined()
    })
})

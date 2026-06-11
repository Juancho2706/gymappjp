import { describe, expect, it } from 'vitest'
import { getVisibleNavItems, NAV_MODULES } from './coach-nav'

// Matriz de módulos por contexto (separación de flujos — regresión del smoke 2026-06-09:
// josefit en standalone veía "Equipo").

const keys = (items: ReturnType<typeof getVisibleNavItems>) => items.map((i) => i.key)

describe('getVisibleNavItems — matriz por contexto', () => {
    it('standalone (status propio): todo lo personal, SIN Equipo', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'active' }))
        expect(k).toEqual(['dashboard', 'clients', 'programs', 'exercises', 'nutrition', 'brand', 'billing', 'support'])
        expect(k).not.toContain('team')
    })

    it('sin workspace (single-contexto sin preferencia) ⇒ standalone', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: null, subscriptionStatus: 'active' }))
        expect(k).toContain('brand')
        expect(k).not.toContain('team')
    })

    it('coach_team: Equipo y Opciones SÍ; Marca/Suscripción NO', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'coach_team', subscriptionStatus: 'team_managed' }))
        expect(k).toEqual(['dashboard', 'clients', 'team', 'programs', 'exercises', 'nutrition', 'settings_team', 'support'])
    })

    it('coach_team con status personal activo (multi-contexto como josefit): igual sin Marca/Suscripción', () => {
        // El layout simula team_managed en contexto team, pero el registro también lo garantiza por contexts.
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'coach_team', subscriptionStatus: 'active' }))
        expect(k).not.toContain('brand')
        expect(k).not.toContain('billing')
        expect(k).toContain('team')
    })

    it('enterprise_coach: sin Equipo, sin Marca/Suscripción', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'enterprise_coach', subscriptionStatus: 'org_managed' }))
        expect(k).toEqual(['dashboard', 'clients', 'programs', 'exercises', 'nutrition', 'support'])
    })

    it('cuenta managed nunca ve Marca/Suscripción aunque el workspace sea standalone-like (cinturón)', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'team_managed' }))
        expect(k).not.toContain('brand')
        expect(k).not.toContain('billing')
    })

    it('status bloqueado ⇒ solo Reactivar (en cualquier contexto)', () => {
        for (const ws of ['coach_standalone', 'coach_team', 'enterprise_coach'] as const) {
            const items = getVisibleNavItems({ activeWorkspaceType: ws, subscriptionStatus: 'past_due' })
            expect(items).toHaveLength(1)
            expect(items[0].key).toBe('reactivate')
        }
    })

    it('el registro declara "team" SOLO en coach_team y brand/billing SOLO en standalone', () => {
        const team = NAV_MODULES.find((m) => m.key === 'team')!
        expect(team.contexts).toEqual(['coach_team'])
        for (const key of ['brand', 'billing']) {
            expect(NAV_MODULES.find((m) => m.key === key)!.contexts).toEqual(['coach_standalone'])
        }
        // C: "Opciones" (hub context-aware de /coach/settings) existe SOLO en coach_team.
        expect(NAV_MODULES.find((m) => m.key === 'settings_team')!.contexts).toEqual(['coach_team'])
    })

    it('enterprise_coach NUNCA ve settings (ni brand ni settings_team)', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'enterprise_coach', subscriptionStatus: 'org_managed' }))
        expect(k).not.toContain('brand')
        expect(k).not.toContain('settings_team')
    })
})

describe('getVisibleNavItems — módulos toggleables (entitlements, specs movida)', () => {
    it('sin enabledModules los items con entitlement quedan ocultos (default OFF)', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'active' }))
        expect(k).not.toContain('cardio')
        expect(k).not.toContain('movement')
    })

    it('con el módulo ON aparecen en standalone y team, en su posición', () => {
        const enabledModules = { cardio: true, movement_assessment: true }
        for (const ws of ['coach_standalone', 'coach_team'] as const) {
            const k = keys(getVisibleNavItems({
                activeWorkspaceType: ws,
                subscriptionStatus: ws === 'coach_team' ? 'team_managed' : 'active',
                enabledModules,
            }))
            expect(k).toContain('cardio')
            expect(k).toContain('movement')
        }
    })

    it('ON parcial: solo aparece el módulo habilitado', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_team',
            subscriptionStatus: 'team_managed',
            enabledModules: { cardio: true },
        }))
        expect(k).toContain('cardio')
        expect(k).not.toContain('movement')
    })

    it('enterprise NUNCA ve los módulos movida aunque estén ON (v1 fuera de enterprise)', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'enterprise_coach',
            subscriptionStatus: 'org_managed',
            enabledModules: { cardio: true, movement_assessment: true },
        }))
        expect(k).not.toContain('cardio')
        expect(k).not.toContain('movement')
    })
})

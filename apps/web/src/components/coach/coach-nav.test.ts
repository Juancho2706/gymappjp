import { describe, expect, it } from 'vitest'
import { getVisibleNavItems, splitNavItems, NAV_MODULES } from './coach-nav'

// Matriz de módulos por contexto (separación de flujos — regresión del smoke 2026-06-09:
// josefit en standalone veía "Equipo").

const keys = (items: ReturnType<typeof getVisibleNavItems>) => items.map((i) => i.key)

describe('getVisibleNavItems — matriz por contexto', () => {
    it('standalone (status propio): todo lo personal con "Opciones" (marca+suscripción colapsadas), SIN Equipo ni Ejercicios top-level', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'active' }))
        expect(k).toEqual(['dashboard', 'clients', 'programs', 'nutrition', 'options', 'support'])
        expect(k).not.toContain('team')
        // Movida 1: brand/billing dejaron de ser entradas top-level (cards dentro del hub "Opciones").
        expect(k).not.toContain('brand')
        expect(k).not.toContain('billing')
        // Movida 2: 'exercises' ya no es entrada del nav (botón dentro de Programas).
        expect(k).not.toContain('exercises')
    })

    it('sin workspace (single-contexto sin preferencia) ⇒ standalone', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: null, subscriptionStatus: 'active' }))
        expect(k).toContain('options')
        expect(k).not.toContain('team')
    })

    it('coach_team: Equipo y Opciones SÍ; Marca/Suscripción NO', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'coach_team', subscriptionStatus: 'team_managed' }))
        expect(k).toEqual(['dashboard', 'clients', 'team', 'programs', 'nutrition', 'settings_team', 'support'])
    })

    it('coach_team con status personal activo (multi-contexto como josefit): igual sin "Opciones" standalone', () => {
        // El layout simula team_managed en contexto team, pero el registro también lo garantiza por contexts.
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'coach_team', subscriptionStatus: 'active' }))
        expect(k).not.toContain('options')
        expect(k).toContain('team')
    })

    it('enterprise_coach: sin Equipo, sin Opciones (marca/suscripción)', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'enterprise_coach', subscriptionStatus: 'org_managed' }))
        expect(k).toEqual(['dashboard', 'clients', 'programs', 'nutrition', 'support'])
    })

    it('cuenta managed nunca ve "Opciones" standalone aunque el workspace sea standalone-like (cinturón)', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'team_managed' }))
        expect(k).not.toContain('options')
    })

    it('status bloqueado ⇒ solo Reactivar (en cualquier contexto)', () => {
        for (const ws of ['coach_standalone', 'coach_team', 'enterprise_coach'] as const) {
            const items = getVisibleNavItems({ activeWorkspaceType: ws, subscriptionStatus: 'past_due' })
            expect(items).toHaveLength(1)
            expect(items[0].key).toBe('reactivate')
        }
    })

    it('el registro declara "team" SOLO en coach_team y "options" (hub marca+suscripción) SOLO en standalone', () => {
        const team = NAV_MODULES.find((m) => m.key === 'team')!
        expect(team.contexts).toEqual(['coach_team'])
        // Movida 1: "Opciones" standalone = entrada única que reemplaza brand+billing.
        expect(NAV_MODULES.find((m) => m.key === 'options')!.contexts).toEqual(['coach_standalone'])
        // brand/billing dejaron de existir en el registro (colapsadas en cards del hub).
        expect(NAV_MODULES.find((m) => m.key === 'brand')).toBeUndefined()
        expect(NAV_MODULES.find((m) => m.key === 'billing')).toBeUndefined()
        // Movida 2: 'exercises' ya no existe en el registro (botón dentro de Programas).
        expect(NAV_MODULES.find((m) => m.key === 'exercises')).toBeUndefined()
        // C: "Opciones" team (hub context-aware de /coach/settings) existe SOLO en coach_team.
        expect(NAV_MODULES.find((m) => m.key === 'settings_team')!.contexts).toEqual(['coach_team'])
    })

    it('enterprise_coach NUNCA ve settings (ni options ni settings_team)', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'enterprise_coach', subscriptionStatus: 'org_managed' }))
        expect(k).not.toContain('options')
        expect(k).not.toContain('settings_team')
    })
})

describe('getVisibleNavItems — master switch de dominio (feature-prefs _enabled)', () => {
    it('el registro marca la entrada "nutrition" con featureDomain "nutrition"', () => {
        const nutrition = NAV_MODULES.find((m) => m.key === 'nutrition')!
        expect(nutrition.featureDomain).toBe('nutrition')
    })

    it('Nutrición se OCULTA cuando el dominio está en disabledDomains', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            disabledDomains: new Set(['nutrition']),
        }))
        expect(k).not.toContain('nutrition')
        // El resto del nav permanece intacto (solo se filtra el dominio apagado).
        expect(k).toEqual(['dashboard', 'clients', 'programs', 'options', 'support'])
    })

    it('Nutrición se MUESTRA cuando el dominio NO está en disabledDomains (set vacío)', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            disabledDomains: new Set(),
        }))
        expect(k).toContain('nutrition')
    })

    it('Nutrición se MUESTRA cuando disabledDomains está ausente/null (fail-open = HOY)', () => {
        for (const disabled of [undefined, null] as const) {
            const k = keys(getVisibleNavItems({
                activeWorkspaceType: 'coach_standalone',
                subscriptionStatus: 'active',
                disabledDomains: disabled,
            }))
            expect(k).toContain('nutrition')
        }
    })

    it('el filtro de dominio aplica en team también (Nutrición existe en todos los contextos)', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_team',
            subscriptionStatus: 'team_managed',
            disabledDomains: new Set(['nutrition']),
        }))
        expect(k).not.toContain('nutrition')
        expect(k).toEqual(['dashboard', 'clients', 'team', 'programs', 'settings_team', 'support'])
    })

    it('un dominio desconocido en disabledDomains no afecta ninguna entrada', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            disabledDomains: new Set(['workouts', 'unknown']),
        }))
        expect(k).toEqual(['dashboard', 'clients', 'programs', 'nutrition', 'options', 'support'])
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

describe('reorden del registro (cardio/movement al final) — F3', () => {
    // El registro mueve cardio/movement al FINAL (después de support) para que en mobile (bottom
    // bar plano por orden de registro) queden contiguos al final. Estos asserts blindan que ese
    // reorden NO altera las listas visibles cuando los módulos están OFF (el filtro de entitlement
    // actúa ANTES de que el orden importe), porque module-matrix.spec.ts las assertea byte-idénticas.

    it('los módulos toggleables están declarados al final del registro (después de support)', () => {
        const supportIdx = NAV_MODULES.findIndex((m) => m.key === 'support')
        const cardioIdx = NAV_MODULES.findIndex((m) => m.key === 'cardio')
        const movementIdx = NAV_MODULES.findIndex((m) => m.key === 'movement')
        expect(cardioIdx).toBeGreaterThan(supportIdx)
        expect(movementIdx).toBeGreaterThan(supportIdx)
        // Y son los DOS últimos del registro (ningún core declarado después).
        expect(NAV_MODULES.slice(supportIdx + 1).map((m) => m.key)).toEqual(['cardio', 'movement'])
    })

    it('con módulos OFF las listas existentes NO cambian (verificación explícita del reorden)', () => {
        // Exactamente las mismas listas que assertean los specs de la matriz, post-reorden.
        expect(keys(getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'active' })))
            .toEqual(['dashboard', 'clients', 'programs', 'nutrition', 'options', 'support'])
        expect(keys(getVisibleNavItems({ activeWorkspaceType: 'coach_team', subscriptionStatus: 'team_managed' })))
            .toEqual(['dashboard', 'clients', 'team', 'programs', 'nutrition', 'settings_team', 'support'])
        expect(keys(getVisibleNavItems({ activeWorkspaceType: 'enterprise_coach', subscriptionStatus: 'org_managed' })))
            .toEqual(['dashboard', 'clients', 'programs', 'nutrition', 'support'])
    })

    it('con módulos ON cardio/movement quedan AL FINAL del array visible (no en medio)', () => {
        for (const ws of ['coach_standalone', 'coach_team'] as const) {
            const k = keys(getVisibleNavItems({
                activeWorkspaceType: ws,
                subscriptionStatus: ws === 'coach_team' ? 'team_managed' : 'active',
                enabledModules: { cardio: true, movement_assessment: true },
            }))
            // Los dos últimos son los módulos, en orden de registro.
            expect(k.slice(-2)).toEqual(['cardio', 'movement'])
            // support (último core) precede a ambos módulos.
            expect(k.indexOf('support')).toBeLessThan(k.indexOf('cardio'))
        }
    })
})

describe('splitNavItems — partición core / módulos (F3)', () => {
    it('discriminador: items con entitlement van a modules, el resto a core', () => {
        const items = getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            enabledModules: { cardio: true, movement_assessment: true },
        })
        const { core, modules } = splitNavItems(items)
        expect(modules.map((m) => m.key)).toEqual(['cardio', 'movement'])
        expect(modules.every((m) => m.entitlement != null)).toBe(true)
        expect(core.every((m) => m.entitlement == null)).toBe(true)
    })

    it('grupos disjuntos y cobertura total (core ∪ modules = items, sin solapamiento)', () => {
        const items = getVisibleNavItems({
            activeWorkspaceType: 'coach_team',
            subscriptionStatus: 'team_managed',
            enabledModules: { cardio: true, movement_assessment: true },
        })
        const { core, modules } = splitNavItems(items)
        expect(core.length + modules.length).toBe(items.length)
        const coreKeys = new Set(core.map((m) => m.key))
        const moduleKeys = new Set(modules.map((m) => m.key))
        // Disjuntos: ninguna key aparece en ambos grupos.
        for (const k of coreKeys) expect(moduleKeys.has(k)).toBe(false)
    })

    it('modules vacío cuando no hay entitlements ON (grupo MÓDULOS no se renderiza)', () => {
        const items = getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'active' })
        const { core, modules } = splitNavItems(items)
        expect(modules).toEqual([])
        expect(core).toEqual(items)
    })

    it('preserva el orden relativo de items dentro de cada grupo (estable)', () => {
        const items = getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            enabledModules: { cardio: true, movement_assessment: true },
        })
        const { core, modules } = splitNavItems(items)
        // El orden de core coincide con su orden en items (solo se quitan los módulos del medio/final).
        expect(core.map((m) => m.key)).toEqual(items.filter((i) => i.entitlement == null).map((m) => m.key))
        expect(modules.map((m) => m.key)).toEqual(items.filter((i) => i.entitlement != null).map((m) => m.key))
    })

    it('ON parcial: solo el módulo habilitado entra en modules', () => {
        const items = getVisibleNavItems({
            activeWorkspaceType: 'coach_team',
            subscriptionStatus: 'team_managed',
            enabledModules: { cardio: true },
        })
        const { modules } = splitNavItems(items)
        expect(modules.map((m) => m.key)).toEqual(['cardio'])
    })

    it('lista vacía ⇒ ambos grupos vacíos (función pura, sin throw)', () => {
        const { core, modules } = splitNavItems([])
        expect(core).toEqual([])
        expect(modules).toEqual([])
    })
})

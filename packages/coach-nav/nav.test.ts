import { describe, expect, it } from 'vitest'
import {
    getVisibleNavItems,
    groupNavItems,
    splitNavItems,
    splitForSidebar,
    coachWorkspaceTypeFromKind,
    isNavItemActiveForPath,
    GESTION_ORDER,
    NAV_MODULES,
    REACTIVATE_NAV_ITEM,
    type NavModule,
} from './nav'
// FEATURE_DOMAIN_KEYS es la lista canonica de dominios de @eva/feature-prefs (paquete puro,
// aliaseado por el vitest raiz). nav.ts NO lo importa (se mantiene desacoplado, ver comentario
// de `featureDomain` en nav.ts), pero el TEST si puede — es el contrato cruzado de W1.12.
import { FEATURE_DOMAIN_KEYS } from '@eva/feature-prefs'

// Matriz de modulos por contexto (separacion de flujos — regresion del smoke 2026-06-09:
// josefit en standalone veia "Equipo").

const keys = (items: NavModule[]) => items.map((i) => i.key)

// Listas COMPLETAS esperadas por contexto con todo prendido (post W2.1B + W2.2). Se declaran una
// sola vez para que un cambio del registro rompa en un lugar y no en quince.
const STANDALONE_FULL = ['dashboard', 'clients', 'programs', 'nutrition', 'funciones', 'options', 'support', 'cardio', 'movement']
const TEAM_MANAGED_FULL = ['dashboard', 'clients', 'team', 'programs', 'nutrition', 'settings_team', 'support', 'cardio', 'movement']
const TEAM_ACTIVE_FULL = ['dashboard', 'clients', 'team', 'programs', 'nutrition', 'funciones', 'settings_team', 'support', 'cardio', 'movement']
const ENTERPRISE_FULL = ['dashboard', 'clients', 'programs', 'nutrition', 'support']

describe('getVisibleNavItems — matriz por contexto', () => {
    it('standalone (status propio): todo lo personal con "Opciones" (marca+suscripción colapsadas), SIN Equipo ni Ejercicios top-level', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'active' }))
        expect(k).toEqual(STANDALONE_FULL)
        expect(k).not.toContain('team')
        expect(k).not.toContain('brand')
        expect(k).not.toContain('billing')
        expect(k).not.toContain('exercises')
    })

    it('sin workspace (single-contexto sin preferencia) ⇒ standalone', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: null, subscriptionStatus: 'active' }))
        expect(k).toContain('options')
        expect(k).not.toContain('team')
    })

    it('coach_team: Equipo y Opciones SÍ; Marca/Suscripción NO', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'coach_team', subscriptionStatus: 'team_managed' }))
        expect(k).toEqual(TEAM_MANAGED_FULL)
    })

    it('coach_team con status personal activo (multi-contexto como josefit): igual sin "Opciones" standalone', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'coach_team', subscriptionStatus: 'active' }))
        expect(k).toEqual(TEAM_ACTIVE_FULL)
        expect(k).not.toContain('options')
        expect(k).toContain('team')
    })

    it('enterprise_coach: sin Equipo, sin Opciones (marca/suscripción)', () => {
        const k = keys(getVisibleNavItems({ activeWorkspaceType: 'enterprise_coach', subscriptionStatus: 'org_managed' }))
        expect(k).toEqual(ENTERPRISE_FULL)
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
        expect(NAV_MODULES.find((m) => m.key === 'options')!.contexts).toEqual(['coach_standalone'])
        expect(NAV_MODULES.find((m) => m.key === 'brand')).toBeUndefined()
        expect(NAV_MODULES.find((m) => m.key === 'billing')).toBeUndefined()
        expect(NAV_MODULES.find((m) => m.key === 'exercises')).toBeUndefined()
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
        expect(k).toEqual(STANDALONE_FULL.filter((key) => key !== 'nutrition'))
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
        expect(k).toEqual(TEAM_MANAGED_FULL.filter((key) => key !== 'nutrition'))
    })

    it('el registro marca Programas/Cardio/Movimiento con su featureDomain (onboarding v2)', () => {
        const byKey = new Map(NAV_MODULES.map((i) => [i.key, i]))
        expect(byKey.get('programs')?.featureDomain).toBe('training')
        expect(byKey.get('cardio')?.featureDomain).toBe('cardio')
        expect(byKey.get('movement')?.featureDomain).toBe('movement')
    })

    it('el filtro por dominio es GENERICO: apaga training igual que nutrition', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            disabledDomains: new Set(['training']),
        }))
        expect(k).not.toContain('programs')
        expect(k).toEqual(STANDALONE_FULL.filter((key) => key !== 'programs'))
    })

    it('la persona nutricionista (training+cardio+movement apagados) deja el panel de nutricion', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            disabledDomains: new Set(['training', 'cardio', 'movement']),
        }))
        expect(k).toEqual(['dashboard', 'clients', 'nutrition', 'funciones', 'options', 'support'])
    })

    it('el dominio es el UNICO gate del nav para cardio/movement (W2.1B: ya no compone con entitlement)', () => {
        // Antes de W2.1B hacia falta modulo comprado Y dominio prendido. Con D1 («todo incluido,
        // solo se cobra el cupo») el modulo dejo de existir como paywall: manda la preferencia.
        const ctx = { activeWorkspaceType: 'coach_standalone' as const, subscriptionStatus: 'active' }
        expect(keys(getVisibleNavItems(ctx))).toContain('cardio')
        expect(keys(getVisibleNavItems({ ...ctx, disabledDomains: new Set(['cardio']) }))).not.toContain('cardio')
        expect(keys(getVisibleNavItems({ ...ctx, disabledDomains: new Set(['movement']) }))).not.toContain('movement')
    })

    it('los consumidores que solo resuelven nutrition no pierden ninguna entrada nueva', () => {
        // Espejo de lo que pasaban web (coach/layout.tsx) y RN (CoachMobileChrome) antes de W1.
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            disabledDomains: new Set(['nutrition']),
        }))
        expect(k).toEqual(['dashboard', 'clients', 'programs', 'funciones', 'options', 'support', 'cardio', 'movement'])
    })

    it('un dominio desconocido en disabledDomains no afecta ninguna entrada', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            disabledDomains: new Set(['workouts', 'unknown']),
        }))
        expect(k).toEqual(STANDALONE_FULL)
    })
})

describe('W2.1B · retiro del `entitlement` legado (cardio/movement)', () => {
    it('NINGUNA entrada del registro declara ya `entitlement`', () => {
        // El campo sigue VIVO en el tipo y en el filtro (mecanismo para un modulo futuro); lo que
        // se retiro son las 2 entradas que lo usaban como paywall heredado.
        expect(NAV_MODULES.filter((m) => m.entitlement != null).map((m) => m.key)).toEqual([])
        expect(NAV_MODULES.find((m) => m.key === 'cardio')!.entitlement).toBeUndefined()
        expect(NAV_MODULES.find((m) => m.key === 'movement')!.entitlement).toBeUndefined()
    })

    it('SIN enabledModules y con disabledDomains vacío, cardio/movement aparecen en standalone y team', () => {
        for (const ws of ['coach_standalone', 'coach_team'] as const) {
            const k = keys(getVisibleNavItems({
                activeWorkspaceType: ws,
                subscriptionStatus: ws === 'coach_team' ? 'team_managed' : 'active',
                disabledDomains: new Set(),
            }))
            expect(k).toContain('cardio')
            expect(k).toContain('movement')
        }
    })

    it('enterprise NUNCA ve cardio/movement (fuera de sus `contexts`, no por entitlement)', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'enterprise_coach',
            subscriptionStatus: 'org_managed',
            enabledModules: { cardio: true, movement_assessment: true },
        }))
        expect(k).not.toContain('cardio')
        expect(k).not.toContain('movement')
        expect(NAV_MODULES.find((m) => m.key === 'cardio')!.contexts).toEqual(['coach_standalone', 'coach_team'])
    })

    it('`enabledModules` pasó a ser un NO-OP para el registro actual (ON, OFF y ausente dan lo mismo)', () => {
        const base = { activeWorkspaceType: 'coach_standalone' as const, subscriptionStatus: 'active' }
        const sinModulos = keys(getVisibleNavItems(base))
        const conModulos = keys(getVisibleNavItems({ ...base, enabledModules: { cardio: true, movement_assessment: true } }))
        const modulosOff = keys(getVisibleNavItems({ ...base, enabledModules: { cardio: false, movement_assessment: false } }))
        expect(conModulos).toEqual(sinModulos)
        expect(modulosOff).toEqual(sinModulos)
    })

    it('el mecanismo `entitlement` sigue vivo para un item que lo declare (item sintético, registro intacto)', () => {
        // `getVisibleNavItems` solo itera NAV_MODULES, asi que su rama de entitlement quedo
        // inalcanzable desde el registro real: lo que se puede probar hoy es que el TIPO lo acepta
        // y que los helpers que SI reciben items siguen discriminando por el campo.
        const sintetico: NavModule = {
            key: 'futuro_modulo',
            href: '/coach/futuro',
            label: 'Futuro',
            icon: 'Settings',
            contexts: ['coach_standalone'],
            entitlement: 'body_composition',
        }
        expect(sintetico.entitlement).toBe('body_composition')
        const { core, modules } = splitNavItems([sintetico])
        expect(modules.map((m) => m.key)).toEqual(['futuro_modulo'])
        expect(core).toEqual([])
    })
})

describe('reorden del registro (cardio/movement al final) — F3', () => {
    it('los módulos toggleables están declarados al final del registro (después de support)', () => {
        const supportIdx = NAV_MODULES.findIndex((m) => m.key === 'support')
        const cardioIdx = NAV_MODULES.findIndex((m) => m.key === 'cardio')
        const movementIdx = NAV_MODULES.findIndex((m) => m.key === 'movement')
        expect(cardioIdx).toBeGreaterThan(supportIdx)
        expect(movementIdx).toBeGreaterThan(supportIdx)
        expect(NAV_MODULES.slice(supportIdx + 1).map((m) => m.key)).toEqual(['cardio', 'movement'])
    })

    it('con los dominios apagados las listas se recortan a las entradas sin featureDomain', () => {
        const off = new Set(['nutrition', 'training', 'cardio', 'movement', 'bodycomp'])
        expect(keys(getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'active', disabledDomains: off })))
            .toEqual(['dashboard', 'clients', 'funciones', 'options', 'support'])
        expect(keys(getVisibleNavItems({ activeWorkspaceType: 'coach_team', subscriptionStatus: 'team_managed', disabledDomains: off })))
            .toEqual(['dashboard', 'clients', 'team', 'settings_team', 'support'])
        expect(keys(getVisibleNavItems({ activeWorkspaceType: 'enterprise_coach', subscriptionStatus: 'org_managed', disabledDomains: off })))
            .toEqual(['dashboard', 'clients', 'support'])
    })

    it('con los dominios prendidos cardio/movement quedan AL FINAL del array visible (no en medio)', () => {
        for (const ws of ['coach_standalone', 'coach_team'] as const) {
            const k = keys(getVisibleNavItems({
                activeWorkspaceType: ws,
                subscriptionStatus: ws === 'coach_team' ? 'team_managed' : 'active',
            }))
            expect(k.slice(-2)).toEqual(['cardio', 'movement'])
            expect(k.indexOf('support')).toBeLessThan(k.indexOf('cardio'))
        }
    })
})

describe('W2.2 · entrada de nav «funciones»', () => {
    const funciones = NAV_MODULES.find((m) => m.key === 'funciones')!

    it('el registro la declara sin entitlement y sin featureDomain (el interruptor no se apaga a sí mismo)', () => {
        expect(funciones.href).toBe('/coach/settings/funciones')
        expect(funciones.label).toBe('Funciones')
        expect(funciones.shortLabel).toBe('Func.')
        expect(funciones.icon).toBe('SlidersHorizontal')
        expect(funciones.contexts).toEqual(['coach_standalone', 'coach_team'])
        expect(funciones.entitlement).toBeUndefined()
        expect(funciones.featureDomain).toBeUndefined()
    })

    it('va inmediatamente ANTES de "options" en el registro (lectura Equipo → Funciones → Opciones → Soporte)', () => {
        const idx = NAV_MODULES.findIndex((m) => m.key === 'funciones')
        expect(NAV_MODULES[idx + 1].key).toBe('options')
        expect(idx).toBeGreaterThan(NAV_MODULES.findIndex((m) => m.key === 'team'))
    })

    it('aparece en standalone y en team (coach con status propio); NUNCA en enterprise', () => {
        expect(keys(getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'active' }))).toContain('funciones')
        expect(keys(getVisibleNavItems({ activeWorkspaceType: 'coach_team', subscriptionStatus: 'active' }))).toContain('funciones')
        expect(keys(getVisibleNavItems({ activeWorkspaceType: 'enterprise_coach', subscriptionStatus: 'org_managed' }))).not.toContain('funciones')
    })

    it('los coaches administrados (team_managed / org_managed) NO la ven — misma regla que "Opciones"', () => {
        // A un coach administrado el panel se lo define el tenant; RN (settings/mi-panel.tsx) y web
        // (settings/funciones) ya rechazan la pantalla, el nav no puede ofrecerla.
        for (const status of ['team_managed', 'org_managed'] as const) {
            for (const ws of ['coach_standalone', 'coach_team'] as const) {
                const k = keys(getVisibleNavItems({ activeWorkspaceType: ws, subscriptionStatus: status }))
                expect({ status, ws, funciones: k.includes('funciones') }).toEqual({ status, ws, funciones: false })
                expect({ status, ws, options: k.includes('options') }).toEqual({ status, ws, options: false })
            }
        }
    })

    it('no se apaga por ningún dominio (sobrevive a los 5 apagados) — es la salida del callejón', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            disabledDomains: new Set(FEATURE_DOMAIN_KEYS),
        }))
        expect(k).toContain('funciones')
    })

    it('el registro tiene 11 entradas con keys únicas', () => {
        expect(NAV_MODULES).toHaveLength(11)
        expect(new Set(NAV_MODULES.map((m) => m.key)).size).toBe(NAV_MODULES.length)
        expect(NAV_MODULES.map((m) => m.key)).toEqual([
            'dashboard', 'clients', 'team', 'programs', 'nutrition',
            'funciones', 'options', 'settings_team', 'support', 'cardio', 'movement',
        ])
    })
})

describe('splitNavItems — @deprecated tras W2.1B (partición core / módulos)', () => {
    it('discriminador: items con entitlement van a modules, el resto a core (mecanismo intacto)', () => {
        const sintetico: NavModule = {
            key: 'futuro_modulo',
            href: '/coach/futuro',
            label: 'Futuro',
            icon: 'Settings',
            contexts: ['coach_standalone'],
            entitlement: 'nutrition_exchanges',
        }
        const items = [...getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'active' }), sintetico]
        const { core, modules } = splitNavItems(items)
        expect(modules.map((m) => m.key)).toEqual(['futuro_modulo'])
        expect(modules.every((m) => m.entitlement != null)).toBe(true)
        expect(core.every((m) => m.entitlement == null)).toBe(true)
    })

    it('con el registro REAL, `modules` sale siempre vacío (por eso queda @deprecated)', () => {
        for (const ws of ['coach_standalone', 'coach_team', 'enterprise_coach'] as const) {
            const items = getVisibleNavItems({
                activeWorkspaceType: ws,
                subscriptionStatus: ws === 'coach_standalone' ? 'active' : 'team_managed',
            })
            const { core, modules } = splitNavItems(items)
            expect({ ws, modules: modules.map((m) => m.key) }).toEqual({ ws, modules: [] })
            expect(core).toEqual(items)
        }
    })

    it('grupos disjuntos y cobertura total (core ∪ modules = items, sin solapamiento)', () => {
        const items = getVisibleNavItems({ activeWorkspaceType: 'coach_team', subscriptionStatus: 'team_managed' })
        const { core, modules } = splitNavItems(items)
        expect(core.length + modules.length).toBe(items.length)
        const coreKeys = new Set(core.map((m) => m.key))
        const moduleKeys = new Set(modules.map((m) => m.key))
        for (const k of coreKeys) expect(moduleKeys.has(k)).toBe(false)
    })

    it('preserva el orden relativo de items dentro de cada grupo (estable)', () => {
        const items = getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'active' })
        const { core, modules } = splitNavItems(items)
        expect(core.map((m) => m.key)).toEqual(items.filter((i) => i.entitlement == null).map((m) => m.key))
        expect(modules.map((m) => m.key)).toEqual(items.filter((i) => i.entitlement != null).map((m) => m.key))
    })

    it('lista vacía ⇒ ambos grupos vacíos (función pura, sin throw)', () => {
        const { core, modules } = splitNavItems([])
        expect(core).toEqual([])
        expect(modules).toEqual([])
    })
})

describe('splitForSidebar — @deprecated (W2.4 la retira cuando CoachSidebar migre a groupNavItems)', () => {
    it('secundario = solo Soporte con el registro real (el tramo de módulos quedó vacío tras W2.1B)', () => {
        const items = getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'active' })
        const { primary, secondary } = splitForSidebar(items)
        expect(secondary.map((m) => m.key)).toEqual(['support'])
        // Consecuencia deliberada del retiro: Cardio/Movimiento pasan a `primary` y por fin se
        // pintan en el sidebar de HOY (que solo consume `primary`). Estado intermedio hasta W2.4.
        expect(primary.map((m) => m.key)).toEqual(['dashboard', 'clients', 'programs', 'nutrition', 'funciones', 'options', 'cardio', 'movement'])
    })

    it('el discriminador `entitlement` sigue mandando a secondary si un item lo declara', () => {
        const sintetico: NavModule = {
            key: 'futuro_modulo',
            href: '/coach/futuro',
            label: 'Futuro',
            icon: 'Settings',
            contexts: ['coach_standalone'],
            entitlement: 'cardio',
        }
        const { primary, secondary } = splitForSidebar([sintetico])
        expect(secondary.map((m) => m.key)).toEqual(['futuro_modulo'])
        expect(primary).toEqual([])
    })

    it('en team el secundario también es solo Soporte', () => {
        const items = getVisibleNavItems({ activeWorkspaceType: 'coach_team', subscriptionStatus: 'team_managed' })
        const { secondary } = splitForSidebar(items)
        expect(secondary.map((m) => m.key)).toEqual(['support'])
    })

    it('status bloqueado ⇒ solo Reactivar en primary, secundario vacío', () => {
        const items = getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'expired' })
        const { primary, secondary } = splitForSidebar(items)
        expect(primary.map((m) => m.key)).toEqual(['reactivate'])
        expect(secondary).toEqual([])
    })
})

describe('coachWorkspaceTypeFromKind — puente enum mobile (WorkspaceKind) -> web (CoachWorkspaceType)', () => {
    it('standalone -> coach_standalone', () => {
        expect(coachWorkspaceTypeFromKind('standalone')).toBe('coach_standalone')
    })

    it('team_owner y team_member colapsan a coach_team', () => {
        expect(coachWorkspaceTypeFromKind('team_owner')).toBe('coach_team')
        expect(coachWorkspaceTypeFromKind('team_member')).toBe('coach_team')
    })

    it('enterprise -> enterprise_coach', () => {
        expect(coachWorkspaceTypeFromKind('enterprise')).toBe('enterprise_coach')
    })

    it('el resultado alimenta getVisibleNavItems y produce la matriz correcta por kind', () => {
        // team_member (managed) => ve Equipo + hub team, nunca "Opciones" standalone.
        const teamKeys = getVisibleNavItems({
            activeWorkspaceType: coachWorkspaceTypeFromKind('team_member'),
            subscriptionStatus: 'team_managed',
        }).map((i) => i.key)
        expect(teamKeys).toContain('team')
        expect(teamKeys).not.toContain('options')

        // standalone => ve Opciones, nunca Equipo.
        const soloKeys = getVisibleNavItems({
            activeWorkspaceType: coachWorkspaceTypeFromKind('standalone'),
            subscriptionStatus: 'active',
        }).map((i) => i.key)
        expect(soloKeys).toContain('options')
        expect(soloKeys).not.toContain('team')
    })
})

describe('isNavItemActiveForPath — matcher de ruta activa (href + activeAliases, swap V2 canary)', () => {
    const nutrition = NAV_MODULES.find((m) => m.key === 'nutrition')!
    const dashboard = NAV_MODULES.find((m) => m.key === 'dashboard')!

    it('el registro declara el alias /coach/nutrition-v2 en la entrada Nutrición', () => {
        expect(nutrition.href).toBe('/coach/nutrition-plans')
        expect(nutrition.activeAliases).toContain('/coach/nutrition-v2')
    })

    it('Nutrición activa en su href canónico (exacto y subruta)', () => {
        expect(isNavItemActiveForPath(nutrition, '/coach/nutrition-plans')).toBe(true)
        expect(isNavItemActiveForPath(nutrition, '/coach/nutrition-plans/new')).toBe(true)
    })

    it('Nutrición activa en el alias V2 (exacto y subruta) — swap del cockpit bajo canary', () => {
        expect(isNavItemActiveForPath(nutrition, '/coach/nutrition-v2')).toBe(true)
        expect(isNavItemActiveForPath(nutrition, '/coach/nutrition-v2/some-client-id')).toBe(true)
    })

    it('Nutrición NO activa en rutas ajenas ni en prefijos falsos del alias', () => {
        expect(isNavItemActiveForPath(nutrition, '/coach/dashboard')).toBe(false)
        expect(isNavItemActiveForPath(nutrition, '/coach/nutrition-v2extra')).toBe(false)
        expect(isNavItemActiveForPath(nutrition, '/coach/nutrition-plans-archive')).toBe(false)
    })

    it('un item sin activeAliases (dashboard) no se ilumina por rutas de otro item', () => {
        expect(dashboard.activeAliases).toBeUndefined()
        expect(isNavItemActiveForPath(dashboard, '/coach/nutrition-v2')).toBe(false)
        expect(isNavItemActiveForPath(dashboard, '/coach/dashboard')).toBe(true)
    })

    it('«Funciones» se ilumina en su ruta y NO desde el hub "Opciones" (href más específico)', () => {
        const funciones = NAV_MODULES.find((m) => m.key === 'funciones')!
        const options = NAV_MODULES.find((m) => m.key === 'options')!
        expect(isNavItemActiveForPath(funciones, '/coach/settings/funciones')).toBe(true)
        expect(isNavItemActiveForPath(funciones, '/coach/settings')).toBe(false)
        // Nota para W2.4: el hub SI matchea la subruta (prefijo estandar del nav), asi que el
        // sidebar tiene que resolver el item activo por el href MAS LARGO, no por el primero.
        expect(isNavItemActiveForPath(options, '/coach/settings/funciones')).toBe(true)
    })
})

describe('W1 · Ola de orden — contrato de dominios', () => {
    it('training en disabledDomains oculta "programs" y deja el resto', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            disabledDomains: new Set(['training']),
        }))
        expect(k).not.toContain('programs')
    })

    it('bodycomp en disabledDomains es un no-op: ningun NavModule declara featureDomain "bodycomp" hoy', () => {
        // OUTLINE §3: bodycomp no tiene superficie top-level en el nav (a diferencia de
        // nutrition/training/cardio/movement). W2/W3 pueden agregar una entrada con
        // featureDomain: 'bodycomp' a conciencia — si eso pasa, este assert se rompe adrede
        // y hay que revisar el caso nuevo, no solo actualizar el expect.
        expect(NAV_MODULES.every((m) => m.featureDomain !== 'bodycomp')).toBe(true)

        const withBodycomp = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            disabledDomains: new Set(['bodycomp']),
        }))
        const withoutDisabled = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
        }))
        expect(withBodycomp).toEqual(withoutDisabled)
    })

    it('los 5 dominios apagados a la vez, en standalone: quedan solo las entradas sin featureDomain', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            disabledDomains: new Set(['nutrition', 'training', 'cardio', 'movement', 'bodycomp']),
        }))
        expect(k).toEqual(['dashboard', 'clients', 'funciones', 'options', 'support'])
    })

    it('los 5 dominios apagados a la vez, en coach_team: quedan Equipo + hub team', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'coach_team',
            subscriptionStatus: 'team_managed',
            disabledDomains: new Set(['nutrition', 'training', 'cardio', 'movement', 'bodycomp']),
        }))
        expect(k).toEqual(['dashboard', 'clients', 'team', 'settings_team', 'support'])
    })

    it('los 5 dominios apagados a la vez, en enterprise_coach: solo dashboard/clients/support (sin settings)', () => {
        const k = keys(getVisibleNavItems({
            activeWorkspaceType: 'enterprise_coach',
            subscriptionStatus: 'org_managed',
            disabledDomains: new Set(['nutrition', 'training', 'cardio', 'movement', 'bodycomp']),
        }))
        expect(k).toEqual(['dashboard', 'clients', 'support'])
    })

    it('contrato cruzado: todo featureDomain declarado en NAV_MODULES pertenece a FEATURE_DOMAIN_KEYS de @eva/feature-prefs', () => {
        const declaredDomains = NAV_MODULES
            .map((m) => m.featureDomain)
            .filter((d): d is string => d != null)
        expect(declaredDomains.length).toBeGreaterThan(0)
        for (const domain of declaredDomains) {
            expect(FEATURE_DOMAIN_KEYS as readonly string[]).toContain(domain)
        }
    })

    it('regresion: el set de dominios apagado no afecta a REACTIVATE_NAV_ITEM cuando el status esta bloqueado', () => {
        const items = getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'past_due',
            disabledDomains: new Set(['nutrition', 'training', 'cardio', 'movement', 'bodycomp']),
        })
        expect(items).toEqual([REACTIVATE_NAV_ITEM])
    })
})

describe('W2 · groupNavItems — Principal / Tu trabajo / Gestión', () => {
    const NAV_DOMAINS = ['training', 'nutrition', 'cardio', 'movement'] as const
    // Entradas de nav por dominio, EN ORDEN DE REGISTRO (bodycomp no tiene: OUTLINE §3).
    const KEY_BY_DOMAIN: Record<string, string> = {
        training: 'programs',
        nutrition: 'nutrition',
        cardio: 'cardio',
        movement: 'movement',
    }
    const REGISTRY_DOMAIN_ORDER = ['training', 'nutrition', 'cardio', 'movement']

    const CONTEXTS = [
        { ws: 'coach_standalone' as const, status: 'active', gestion: ['funciones', 'options', 'support'] },
        { ws: 'coach_team' as const, status: 'active', gestion: ['team', 'funciones', 'settings_team', 'support'] },
        { ws: 'enterprise_coach' as const, status: 'org_managed', gestion: ['support'] },
    ]
    const DISABLED_CASES: ReadonlyArray<ReadonlyArray<string>> = [
        [],
        ['cardio'],
        ['training', 'nutrition'],
        ['nutrition', 'training', 'cardio', 'movement', 'bodycomp'],
    ]

    const groupFor = (ws: string, status: string, disabled: ReadonlyArray<string>) =>
        groupNavItems(getVisibleNavItems({
            activeWorkspaceType: ws,
            subscriptionStatus: status,
            disabledDomains: new Set(disabled),
        }))

    it('matriz 3 contextos × 4 sets de disabledDomains: `trabajo` = dominios ON con entrada, en orden de registro', () => {
        for (const ctx of CONTEXTS) {
            for (const disabled of DISABLED_CASES) {
                const { trabajo } = groupFor(ctx.ws, ctx.status, disabled)
                const enterprise = ctx.ws === 'enterprise_coach'
                const esperado = REGISTRY_DOMAIN_ORDER
                    // enterprise no declara cardio/movement en sus `contexts` (nada que ver con dominios).
                    .filter((d) => !(enterprise && (d === 'cardio' || d === 'movement')))
                    .filter((d) => !disabled.includes(d))
                    .map((d) => KEY_BY_DOMAIN[d])
                expect({ ws: ctx.ws, disabled, trabajo: keys(trabajo) }).toEqual({ ws: ctx.ws, disabled, trabajo: esperado })
                // Nada sin featureDomain se cuela en «Tu trabajo».
                expect(trabajo.every((i) => i.featureDomain != null)).toBe(true)
            }
        }
    })

    it('con los 5 dominios apagados `trabajo` queda vacío y principal/gestión NO cambian', () => {
        for (const ctx of CONTEXTS) {
            const todoOn = groupFor(ctx.ws, ctx.status, [])
            const todoOff = groupFor(ctx.ws, ctx.status, ['nutrition', 'training', 'cardio', 'movement', 'bodycomp'])
            expect({ ws: ctx.ws, trabajo: keys(todoOff.trabajo) }).toEqual({ ws: ctx.ws, trabajo: [] })
            expect(keys(todoOff.principal)).toEqual(keys(todoOn.principal))
            expect(keys(todoOff.gestion)).toEqual(keys(todoOn.gestion))
        }
    })

    it('`principal` es siempre Dashboard + Alumnos, en ese orden, en los 3 contextos', () => {
        for (const ctx of CONTEXTS) {
            for (const disabled of DISABLED_CASES) {
                const { principal } = groupFor(ctx.ws, ctx.status, disabled)
                expect({ ws: ctx.ws, principal: keys(principal) }).toEqual({ ws: ctx.ws, principal: ['dashboard', 'clients'] })
            }
        }
    })

    it('`gestion` sigue GESTION_ORDER en cada contexto (verdad del registro, no del deseo)', () => {
        for (const ctx of CONTEXTS) {
            const { gestion } = groupFor(ctx.ws, ctx.status, [])
            expect({ ws: ctx.ws, gestion: keys(gestion) }).toEqual({ ws: ctx.ws, gestion: ctx.gestion })
        }
    })

    it('coach_team ADMINISTRADO (team_managed) pierde «Funciones» de Gestión — regla de `getVisibleNavItems`', () => {
        const { gestion } = groupFor('coach_team', 'team_managed', [])
        expect(keys(gestion)).toEqual(['team', 'settings_team', 'support'])
    })

    it('reordena: `gestion` NO respeta el orden de entrada sino GESTION_ORDER', () => {
        const items = getVisibleNavItems({ activeWorkspaceType: 'coach_team', subscriptionStatus: 'active' })
        // En el registro `team` viene antes que `funciones` y `settings_team` DESPUES de `options`.
        const desordenado = [...items].reverse()
        expect(keys(groupNavItems(desordenado).gestion)).toEqual(['team', 'funciones', 'settings_team', 'support'])
        expect(keys(groupNavItems(desordenado).principal)).toEqual(['dashboard', 'clients'])
    })

    it('un item desconocido cae al FINAL de `gestion`, preservando el orden de entrada entre desconocidos', () => {
        const extra = (key: string): NavModule => ({
            key,
            href: `/coach/${key}`,
            label: key,
            icon: 'Settings',
            contexts: ['coach_standalone'],
        })
        const items = [...getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'active' }), extra('zeta'), extra('alfa')]
        const { gestion } = groupNavItems(items)
        expect(keys(gestion)).toEqual(['funciones', 'options', 'support', 'zeta', 'alfa'])
    })

    it('`reactivate` (status bloqueado) cae en `gestion` sin romper nada', () => {
        const items = getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'expired' })
        const { principal, trabajo, gestion } = groupNavItems(items)
        expect(principal).toEqual([])
        expect(trabajo).toEqual([])
        expect(keys(gestion)).toEqual(['reactivate'])
    })

    it('la unión de los 3 grupos es EXACTAMENTE la lista de entrada (sin pérdida ni duplicado)', () => {
        for (const ctx of CONTEXTS) {
            for (const disabled of DISABLED_CASES) {
                const items = getVisibleNavItems({
                    activeWorkspaceType: ctx.ws,
                    subscriptionStatus: ctx.status,
                    disabledDomains: new Set(disabled),
                })
                const { principal, trabajo, gestion } = groupNavItems(items)
                const union = [...principal, ...trabajo, ...gestion]
                expect(union).toHaveLength(items.length)
                expect(new Set(keys(union)).size).toBe(items.length)
                expect([...keys(union)].sort()).toEqual([...keys(items)].sort())
            }
        }
    })

    it('es PURA: no filtra de nuevo ni muta la entrada', () => {
        const items = getVisibleNavItems({ activeWorkspaceType: 'coach_standalone', subscriptionStatus: 'active' })
        const antes = keys(items)
        const { principal, trabajo, gestion } = groupNavItems(items)
        expect(keys(items)).toEqual(antes)
        expect(principal.length + trabajo.length + gestion.length).toBe(items.length)
        // Lista vacia => 3 grupos vacios, sin throw.
        expect(groupNavItems([])).toEqual({ principal: [], trabajo: [], gestion: [] })
    })

    it('GESTION_ORDER cubre todas las keys de gestión que el registro puede producir', () => {
        const dominios = new Set(NAV_DOMAINS as readonly string[])
        const gestionables = NAV_MODULES
            .filter((m) => m.key !== 'dashboard' && m.key !== 'clients' && m.featureDomain == null)
            .map((m) => m.key)
        for (const key of gestionables) expect(GESTION_ORDER).toContain(key)
        // Y ninguna key de GESTION_ORDER es un dominio de trabajo disfrazado.
        for (const key of GESTION_ORDER) {
            const item = NAV_MODULES.find((m) => m.key === key)
            expect(item?.featureDomain == null).toBe(true)
            expect(dominios.has(item?.featureDomain ?? '')).toBe(false)
        }
    })
})

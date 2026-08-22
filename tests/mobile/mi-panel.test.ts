import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * «Opciones › Mi panel» en la app (`apps/mobile/lib/mi-panel.ts`, TASKS W8.2.2).
 *
 * Lo que este test pinnea:
 *  - qué botones aparecen según persona / demo / estado de la guía (la regla que evita ofrecer
 *    «Borrar» sin demo o «Sembrar» a una persona que no tiene alumno de ejemplo);
 *  - el payload de guardado: `alsoOther` se apaga en las personas sin segunda pregunta y
 *    `reorderPanel` viaja SIEMPRE (su presencia es lo que separa «Mi panel» del primer ingreso);
 *  - el master switch de un dominio preserva preset y secciones: apagar Cardio no puede borrarle
 *    los toggles finos de Nutrición a nadie;
 *  - un dominio sin fila arranca PRENDIDO (fail-open, igual que el resolver del server);
 *  - la clave de la píldora es la misma que usa `components/coach/GuidePill.tsx` (duplicada a
 *    propósito porque ese módulo no la exporta).
 *
 * GOTCHA de resolución (mismo patrón que `coach-persona.test.ts`): los ids bare resuelven distinto
 * desde `tests/` que desde `apps/mobile/`, así que los módulos del app se mockean por PATH
 * ABSOLUTO con `vi.doMock` + `import()` dinámico.
 */

const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)

type ApiCall = { path: string; options: Record<string, unknown> }

let calls: ApiCall[] = []
let apiFetchImpl: (p: string, options: Record<string, unknown>) => Promise<unknown>
let selectRows: unknown[] = []
let selectThrows = false
let lastSelect: { coachId: string | null; domains: unknown } = { coachId: null, domains: null }

async function loadModule() {
    vi.resetModules()
    vi.doMock(mobileLib('api'), () => ({
        apiFetch: (p: string, options: Record<string, unknown>) => {
            calls.push({ path: p, options })
            return apiFetchImpl(p, options)
        },
    }))
    vi.doMock(mobileLib('supabase'), () => ({
        supabase: {
            from: () => {
                const chain: Record<string, unknown> = {}
                Object.assign(chain, {
                    select: () => chain,
                    eq: (_col: string, value: string) => {
                        lastSelect.coachId = value
                        return chain
                    },
                    in: (_col: string, values: unknown) => {
                        lastSelect.domains = values
                        if (selectThrows) throw new Error('rls')
                        return Promise.resolve({ data: selectRows, error: null })
                    },
                })
                return chain
            },
        },
    }))
    return import(mobileLib('mi-panel'))
}

beforeEach(() => {
    calls = []
    selectRows = []
    selectThrows = false
    lastSelect = { coachId: null, domains: null }
    apiFetchImpl = async () => ({ ok: true })
})

describe('resolveMiPanelVisibility', () => {
    it('con demo sembrado: se puede borrar, no re-sembrar', async () => {
        const { resolveMiPanelVisibility } = await loadModule()
        expect(
            resolveMiPanelVisibility({
                persona: 'strength',
                demoClientId: 'demo-1',
                guide: { dismissed: false, hidden: false },
            }),
        ).toEqual({
            canDeleteDemo: true,
            canReseedDemo: false,
            personaHasNoDemo: false,
            demoName: 'Matías',
            canRestoreGuide: false,
        })
    })

    it('sin demo y con persona que trae uno: se ofrece volver a sembrarlo', async () => {
        const { resolveMiPanelVisibility } = await loadModule()
        const v = resolveMiPanelVisibility({
            persona: 'nutrition',
            demoClientId: null,
            guide: { dismissed: false, hidden: false },
        })
        expect(v.canReseedDemo).toBe(true)
        expect(v.canDeleteDemo).toBe(false)
        expect(v.demoName).toBe('Ana')
    })

    it('persona `other`: no hay alumno de ejemplo que sembrar', async () => {
        const { resolveMiPanelVisibility } = await loadModule()
        const v = resolveMiPanelVisibility({
            persona: 'other',
            demoClientId: null,
            guide: { dismissed: false, hidden: false },
        })
        expect(v.canReseedDemo).toBe(false)
        expect(v.personaHasNoDemo).toBe(true)
        expect(v.demoName).toBeNull()
    })

    it('un demoClientId en blanco NO cuenta como demo', async () => {
        const { resolveMiPanelVisibility } = await loadModule()
        const v = resolveMiPanelVisibility({
            persona: 'strength',
            demoClientId: '   ',
            guide: { dismissed: false, hidden: false },
        })
        expect(v.canDeleteDemo).toBe(false)
        expect(v.canReseedDemo).toBe(true)
    })

    it('coach sin persona: ni sembrar ni copy de demo', async () => {
        const { resolveMiPanelVisibility } = await loadModule()
        const v = resolveMiPanelVisibility({
            persona: null,
            demoClientId: null,
            guide: { dismissed: false, hidden: false },
        })
        expect(v.canReseedDemo).toBe(false)
        expect(v.personaHasNoDemo).toBe(false)
    })

    it('la guía descartada u oculta ofrece volver a mostrarla', async () => {
        const { resolveMiPanelVisibility } = await loadModule()
        const base = { persona: 'strength' as const, demoClientId: null }
        expect(
            resolveMiPanelVisibility({ ...base, guide: { dismissed: true, hidden: false } }).canRestoreGuide,
        ).toBe(true)
        expect(
            resolveMiPanelVisibility({ ...base, guide: { dismissed: false, hidden: true } }).canRestoreGuide,
        ).toBe(true)
        expect(
            resolveMiPanelVisibility({ ...base, guide: { dismissed: false, hidden: false } }).canRestoreGuide,
        ).toBe(false)
    })
})

describe('buildPersonaPayload', () => {
    it('conserva la segunda pregunta cuando la persona la tiene', async () => {
        const { buildPersonaPayload } = await loadModule()
        expect(buildPersonaPayload({ persona: 'strength', alsoOther: true })).toEqual({
            persona: 'strength',
            alsoOther: true,
            reorderPanel: false,
        })
    })

    it('`other` no tiene segunda pregunta: alsoOther se normaliza a false', async () => {
        const { buildPersonaPayload } = await loadModule()
        expect(buildPersonaPayload({ persona: 'other', alsoOther: true }).alsoOther).toBe(false)
    })

    it('reorderPanel viaja SIEMPRE (es lo que marca el camino «Mi panel»)', async () => {
        const { buildPersonaPayload } = await loadModule()
        expect(buildPersonaPayload({ persona: 'rehab' })).toHaveProperty('reorderPanel', false)
        expect(buildPersonaPayload({ persona: 'rehab', reorderPanel: true }).reorderPanel).toBe(true)
    })
})

describe('isPersonaDirty', () => {
    it('sin cambios no hay nada que guardar', async () => {
        const { isPersonaDirty } = await loadModule()
        expect(
            isPersonaDirty({ persona: 'strength', alsoOther: true }, { persona: 'strength', alsoOther: true }),
        ).toBe(false)
    })

    it('cambiar la persona o la segunda pregunta ensucia el borrador', async () => {
        const { isPersonaDirty } = await loadModule()
        expect(
            isPersonaDirty({ persona: 'nutrition', alsoOther: false }, { persona: 'strength', alsoOther: false }),
        ).toBe(true)
        expect(
            isPersonaDirty({ persona: 'strength', alsoOther: false }, { persona: 'strength', alsoOther: true }),
        ).toBe(true)
    })

    it('pedir el reorden ensucia el borrador aunque la persona no cambie', async () => {
        const { isPersonaDirty } = await loadModule()
        expect(
            isPersonaDirty(
                { persona: 'strength', alsoOther: false, reorderPanel: true },
                { persona: 'strength', alsoOther: false },
            ),
        ).toBe(true)
    })

    it('`other` con alsoOther fantasma NO cuenta como cambio', async () => {
        const { isPersonaDirty } = await loadModule()
        expect(isPersonaDirty({ persona: 'other', alsoOther: true }, { persona: 'other', alsoOther: false })).toBe(
            false,
        )
    })
})

describe('buildDomainRows', () => {
    it('un dominio sin fila arranca PRENDIDO (fail-open)', async () => {
        const { buildDomainRows, MI_PANEL_DOMAINS } = await loadModule()
        const rows = buildDomainRows([])
        expect(rows).toHaveLength(MI_PANEL_DOMAINS.length)
        expect(rows.every((row: { enabled: boolean }) => row.enabled)).toBe(true)
        expect(rows.map((row: { domain: string }) => row.domain)).toEqual([
            'nutrition',
            'training',
            'cardio',
            'movement',
            'bodycomp',
        ])
    })

    it('`_enabled: false` apaga el dominio y conserva preset y secciones', async () => {
        const { buildDomainRows } = await loadModule()
        const rows = buildDomainRows([
            { domain: 'cardio', preset: 'profesional', sections: { _enabled: false, zonas: true } },
        ])
        const cardio = rows.find((row: { domain: string }) => row.domain === 'cardio')
        expect(cardio.enabled).toBe(false)
        expect(cardio.preset).toBe('profesional')
        expect(cardio.sections).toEqual({ _enabled: false, zonas: true })
    })

    it('un preset basura degrada al default seguro', async () => {
        const { buildDomainRows } = await loadModule()
        const rows = buildDomainRows([{ domain: 'nutrition', preset: 'ultra', sections: null }])
        const nutrition = rows.find((row: { domain: string }) => row.domain === 'nutrition')
        expect(nutrition.preset).toBe('basico')
        expect(nutrition.enabled).toBe(true)
    })
})

describe('buildDomainSwitchPayload', () => {
    it('solo pisa `_enabled`: preset y toggles finos sobreviven', async () => {
        const { buildDomainRows, buildDomainSwitchPayload } = await loadModule()
        const rows = buildDomainRows([
            { domain: 'nutrition', preset: 'intermedio', sections: { _enabled: true, micros: true, recetas: false } },
        ])
        const nutrition = rows.find((row: { domain: string }) => row.domain === 'nutrition')
        expect(buildDomainSwitchPayload(nutrition, false)).toEqual({
            domain: 'nutrition',
            preset: 'intermedio',
            sections: { _enabled: false, micros: true, recetas: false },
        })
    })
})

describe('loadMiPanelDomains', () => {
    it('sin coachId no consulta y devuelve todo prendido', async () => {
        const { loadMiPanelDomains } = await loadModule()
        const rows = await loadMiPanelDomains(null)
        expect(lastSelect.coachId).toBeNull()
        expect(rows.every((row: { enabled: boolean }) => row.enabled)).toBe(true)
    })

    it('consulta los 5 dominios del coach y cruza lo guardado', async () => {
        const { loadMiPanelDomains } = await loadModule()
        selectRows = [{ domain: 'movement', preset: 'basico', sections: { _enabled: false } }]
        const rows = await loadMiPanelDomains('coach-1')
        expect(lastSelect.coachId).toBe('coach-1')
        expect(lastSelect.domains).toEqual(['nutrition', 'training', 'cardio', 'movement', 'bodycomp'])
        expect(rows.find((row: { domain: string }) => row.domain === 'movement').enabled).toBe(false)
        expect(rows.find((row: { domain: string }) => row.domain === 'training').enabled).toBe(true)
    })

    it('un fallo de RLS/red degrada a panel completo, no a pantalla rota', async () => {
        const { loadMiPanelDomains } = await loadModule()
        selectThrows = true
        const rows = await loadMiPanelDomains('coach-1')
        expect(rows.every((row: { enabled: boolean }) => row.enabled)).toBe(true)
    })
})

describe('saveMiPanelPersona', () => {
    it('postea al endpoint de persona con reorderPanel explícito', async () => {
        const { saveMiPanelPersona } = await loadModule()
        const result = await saveMiPanelPersona({ persona: 'endurance', alsoOther: true, reorderPanel: true })
        expect(result).toEqual({ ok: true, message: 'Especialidad guardada y panel reordenado.' })
        expect(calls).toHaveLength(1)
        expect(calls[0].path).toBe('/api/mobile/coach/persona')
        expect(calls[0].options.method).toBe('POST')
        expect(calls[0].options.authenticated).toBe(true)
        expect(calls[0].options.body).toEqual({
            persona: 'endurance',
            alsoOther: true,
            reorderPanel: true,
        })
    })

    it('sin reorden el mensaje no promete un reordenamiento que no pasó', async () => {
        const { saveMiPanelPersona } = await loadModule()
        const result = await saveMiPanelPersona({ persona: 'strength' })
        expect(result).toEqual({ ok: true, message: 'Especialidad guardada.' })
        expect(calls[0].options.body).toEqual({ persona: 'strength', alsoOther: false, reorderPanel: false })
    })

    it('el mensaje accionable del servidor (4xx) se muestra tal cual', async () => {
        const { saveMiPanelPersona } = await loadModule()
        apiFetchImpl = async () => {
            throw Object.assign(new Error('Tu panel lo administra tu organización o tu equipo.'), { status: 403 })
        }
        const result = await saveMiPanelPersona({ persona: 'strength' })
        expect(result).toEqual({ ok: false, error: 'Tu panel lo administra tu organización o tu equipo.' })
    })

    it('un fallo de red NO le pone «Network request failed» delante a nadie', async () => {
        const { saveMiPanelPersona } = await loadModule()
        apiFetchImpl = async () => {
            throw new TypeError('Network request failed')
        }
        const result = await saveMiPanelPersona({ persona: 'strength' })
        expect(result.ok).toBe(false)
        expect(result.error).toBe('No pudimos guardar tu elección. Revisa tu conexión e inténtalo de nuevo.')
    })

    it('un 5xx tampoco filtra el mensaje interno', async () => {
        const { saveMiPanelPersona } = await loadModule()
        apiFetchImpl = async () => {
            throw Object.assign(new Error('column persona does not exist'), { status: 500 })
        }
        const result = await saveMiPanelPersona({ persona: 'strength' })
        expect(result.error).toBe('No pudimos guardar tu elección. Revisa tu conexión e inténtalo de nuevo.')
    })

    it('una respuesta sin `ok` no se celebra', async () => {
        const { saveMiPanelPersona } = await loadModule()
        apiFetchImpl = async () => ({})
        const result = await saveMiPanelPersona({ persona: 'strength' })
        expect(result.ok).toBe(false)
    })
})

describe('reseedDemoStudent', () => {
    it('POST al endpoint del alumno de ejemplo y refleja el nombre', async () => {
        const { reseedDemoStudent } = await loadModule()
        apiFetchImpl = async () => ({ ok: true, demoClientId: 'demo-9', demoName: 'Matías', alreadyExisted: false })
        const result = await reseedDemoStudent()
        expect(calls[0]).toMatchObject({
            path: '/api/mobile/coach/demo-student',
            options: { method: 'POST', authenticated: true },
        })
        expect(result).toEqual({ ok: true, demoClientId: 'demo-9', demoName: 'Matías', alreadyExisted: false })
    })

    it('idempotente: `alreadyExisted` llega a la UI para no mentir en el toast', async () => {
        const { reseedDemoStudent } = await loadModule()
        apiFetchImpl = async () => ({ ok: true, demoClientId: 'demo-9', demoName: 'Ana', alreadyExisted: true })
        const result = await reseedDemoStudent()
        expect(result).toMatchObject({ ok: true, alreadyExisted: true })
    })

    it('el motivo humano del servidor (409) se muestra tal cual', async () => {
        const { reseedDemoStudent } = await loadModule()
        apiFetchImpl = async () => {
            throw Object.assign(new Error('Tu especialidad no trae alumno de ejemplo.'), { status: 409 })
        }
        expect(await reseedDemoStudent()).toEqual({
            ok: false,
            error: 'Tu especialidad no trae alumno de ejemplo.',
        })
    })
})

describe('claves y rutas', () => {
    it('la clave de la píldora es la MISMA que usa GuidePill', async () => {
        const { guidePillStorageKey, GUIDE_PILL_EXPANDED } = await loadModule()
        expect(guidePillStorageKey('coach-1')).toBe('eva.guide-pill.v1:coach-1')
        expect(GUIDE_PILL_EXPANDED).toBe('expanded')
    })

    it('las rutas apuntan a las pantallas reales del árbol', async () => {
        const { MI_PANEL_ROUTE, MI_PANEL_GUIA_ROUTE } = await loadModule()
        expect(MI_PANEL_ROUTE).toBe('/coach/settings/mi-panel')
        expect(MI_PANEL_GUIA_ROUTE).toBe('/coach/guia')
    })
})

/**
 * Paso 3 template-first en la app (`apps/mobile/lib/templates.ts`, W8).
 *
 * Lo que se pinnea:
 *  - el parser de la lista es TOTAL: un deploy viejo o una fila rota no puede dejar la sheet con
 *    una plantilla sin id que después muere en el POST;
 *  - la marca de entrada guiada (`?primera=1`) se lee igual venga como string o como arreglo
 *    (Expo Router entrega las dos formas) y NO se activa con cualquier valor;
 *  - los parámetros con los que se abre el lienzo espejan el destino de la web: alumno + programa
 *    sembrado + marca guiada, y sin `programId` el parámetro simplemente no viaja;
 *  - un error del servidor accionable llega tal cual al coach; uno de red o 5xx, nunca.
 *
 * GOTCHA de resolución (mismo patrón que `coach-persona.test.ts`): los ids bare resuelven distinto
 * desde `tests/` que desde `apps/mobile/`, así que los módulos del app se mockean por PATH
 * ABSOLUTO con `vi.doMock` + `import()` dinámico.
 */
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RN_FIRST_STEP_PARAM } from '@eva/onboarding'

const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)

type ApiCall = { path: string; options: Record<string, unknown> }

/** Copia mínima de `ApiError` de `lib/api`: lo único que importa acá es `status` + `message`. */
class FakeApiError extends Error {
    status: number
    constructor(message: string, status: number) {
        super(message)
        this.status = status
    }
}

let apiFetchImpl: (p: string, options: Record<string, unknown>) => Promise<unknown>
let calls: ApiCall[] = []

async function loadModule() {
    vi.resetModules()
    vi.doMock(mobileLib('api'), () => ({
        ApiError: FakeApiError,
        apiFetch: (p: string, options: Record<string, unknown>) => {
            calls.push({ path: p, options })
            return apiFetchImpl(p, options)
        },
    }))
    return import(mobileLib('templates'))
}

beforeEach(() => {
    calls = []
    apiFetchImpl = async () => ({ persona: 'strength', templates: [] })
})

describe('parseTemplateList', () => {
    it('normaliza la respuesta del endpoint', async () => {
        const { parseTemplateList } = await loadModule()
        expect(
            parseTemplateList({
                persona: 'strength',
                templates: [{ id: ' full-body-3 ', label: ' Full body 3 días ', blurb: 'x', kind: 'program', days: 3 }],
            }),
        ).toEqual({
            persona: 'strength',
            templates: [{ id: 'full-body-3', label: 'Full body 3 días', blurb: 'x', kind: 'program', days: 3 }],
        })
    })

    it('descarta lo que no se puede pintar ni aplicar (sin id o sin label)', async () => {
        const { parseTemplateList } = await loadModule()
        const parsed = parseTemplateList({
            templates: [
                { label: 'Sin id' },
                { id: 'sin-label' },
                null,
                'basura',
                { id: 'ok', label: 'Ok' },
            ],
        })
        expect(parsed.templates.map((t: { id: string }) => t.id)).toEqual(['ok'])
    })

    it('degrada campo por campo en vez de caerse entero', async () => {
        const { parseTemplateList } = await loadModule()
        const parsed = parseTemplateList({ templates: [{ id: 'a', label: 'A', kind: 'marte', days: -3 }] })
        expect(parsed).toEqual({ persona: null, templates: [{ id: 'a', label: 'A', blurb: '', kind: null, days: null }] })
    })

    it('un payload que no es objeto no revienta', async () => {
        const { parseTemplateList } = await loadModule()
        expect(parseTemplateList(null)).toEqual({ persona: null, templates: [] })
        expect(parseTemplateList('nope')).toEqual({ persona: null, templates: [] })
    })
})

describe('templateMetaLine', () => {
    it('distingue rutina de menú y singulariza', async () => {
        const { templateMetaLine } = await loadModule()
        expect(templateMetaLine({ id: 'a', label: 'A', blurb: '', kind: 'program', days: 3 })).toBe('3 días')
        expect(templateMetaLine({ id: 'a', label: 'A', blurb: '', kind: 'nutrition', days: 2 })).toBe('2 días de menú')
        expect(templateMetaLine({ id: 'a', label: 'A', blurb: '', kind: 'program', days: 1 })).toBe('1 día')
    })

    it('sin dato del servidor no inventa la línea', async () => {
        const { templateMetaLine } = await loadModule()
        expect(templateMetaLine({ id: 'a', label: 'A', blurb: '', kind: null, days: null })).toBe('')
    })
})

describe('isGuidedEntry', () => {
    it('acepta las dos formas que entrega Expo Router', async () => {
        const { isGuidedEntry } = await loadModule()
        expect(isGuidedEntry('1')).toBe(true)
        expect(isGuidedEntry(['1'])).toBe(true)
        expect(isGuidedEntry('true')).toBe(true)
    })

    it('no se activa con cualquier cosa (ni con el parámetro ya consumido)', async () => {
        const { isGuidedEntry } = await loadModule()
        expect(isGuidedEntry(undefined)).toBe(false)
        expect(isGuidedEntry('')).toBe(false)
        expect(isGuidedEntry('0')).toBe(false)
        expect(isGuidedEntry([])).toBe(false)
    })

    it('el nombre del parámetro sale del paquete compartido', async () => {
        const { FIRST_STEP_PARAM } = await loadModule()
        expect(FIRST_STEP_PARAM).toBe(RN_FIRST_STEP_PARAM)
    })
})

describe('resolveGuidedEntry', () => {
    it('con la foto del panel publicada y demo sembrado: consume y abre la sheet', async () => {
        const { resolveGuidedEntry } = await loadModule()
        expect(resolveGuidedEntry({ raw: '1', snapshotReady: true, hasDemo: true })).toEqual({
            consume: true,
            openSheet: true,
        })
    })

    it('con foto y SIN demo consume igual, pero no abre nada (el tab se comporta como siempre)', async () => {
        const { resolveGuidedEntry } = await loadModule()
        expect(resolveGuidedEntry({ raw: '1', snapshotReady: true, hasDemo: false })).toEqual({
            consume: true,
            openSheet: false,
        })
    })

    it('sin snapshot NO se quema el paso: espera al render siguiente', async () => {
        const { resolveGuidedEntry } = await loadModule()
        // Arranque en frío / deep link: el store de presentación todavía no publicó nada.
        expect(resolveGuidedEntry({ raw: '1', snapshotReady: false, hasDemo: false })).toEqual({
            consume: false,
            openSheet: false,
        })
        // ...y cuando llega, con el demo adentro, recién ahí se consume y abre.
        expect(resolveGuidedEntry({ raw: '1', snapshotReady: true, hasDemo: true })).toEqual({
            consume: true,
            openSheet: true,
        })
    })

    it('una vez consumida no vuelve a consumirse (volver del lienzo no reabre la sheet)', async () => {
        const { resolveGuidedEntry } = await loadModule()
        expect(
            resolveGuidedEntry({ raw: '1', snapshotReady: true, hasDemo: true, alreadyConsumed: true }),
        ).toEqual({ consume: false, openSheet: false })
    })

    it('sin marca guiada no hace nada, esté como esté el snapshot', async () => {
        const { resolveGuidedEntry } = await loadModule()
        for (const raw of [undefined, '', '0', [] as string[]]) {
            expect(resolveGuidedEntry({ raw, snapshotReady: true, hasDemo: true })).toEqual({
                consume: false,
                openSheet: false,
            })
        }
    })

    it('acepta la marca como arreglo (Expo Router repite el parámetro)', async () => {
        const { resolveGuidedEntry } = await loadModule()
        expect(resolveGuidedEntry({ raw: ['1'], snapshotReady: true, hasDemo: true })).toEqual({
            consume: true,
            openSheet: true,
        })
    })
})

describe('builderParamsAfterTemplate', () => {
    it('espeja el destino de la web: alumno + programa sembrado + marca guiada', async () => {
        const { builderParamsAfterTemplate } = await loadModule()
        expect(builderParamsAfterTemplate({ clientId: 'c1', clientName: 'Matías', programId: 'p1' })).toEqual({
            clientId: 'c1',
            clientName: 'Matías',
            programId: 'p1',
            [RN_FIRST_STEP_PARAM]: '1',
        })
    })

    it('sin programa (el sembrado falló) el lienzo se abre igual, sin programId', async () => {
        const { builderParamsAfterTemplate } = await loadModule()
        expect(builderParamsAfterTemplate({ clientId: 'c1', programId: null })).toEqual({
            clientId: 'c1',
            [RN_FIRST_STEP_PARAM]: '1',
        })
    })

    it('un nombre en blanco no viaja como parámetro vacío', async () => {
        const { builderParamsAfterTemplate } = await loadModule()
        expect(builderParamsAfterTemplate({ clientId: 'c1', clientName: '   ' })).toEqual({
            clientId: 'c1',
            [RN_FIRST_STEP_PARAM]: '1',
        })
    })
})

describe('firstTemplateSheetTitle', () => {
    it('sin nombre del demo no escribe «para null»', async () => {
        const { firstTemplateSheetTitle } = await loadModule()
        expect(firstTemplateSheetTitle('Matías')).toBe('Tu primera rutina para Matías')
        expect(firstTemplateSheetTitle(null)).toBe('Tu primera rutina')
        expect(firstTemplateSheetTitle('  ')).toBe('Tu primera rutina')
    })
})

describe('listOnboardingTemplates', () => {
    it('pide la superficie que le toca a la pantalla', async () => {
        const { listOnboardingTemplates } = await loadModule()
        await listOnboardingTemplates('cardio')
        expect(calls[0].path).toBe('/api/mobile/coach/templates?surface=cardio')
        expect(calls[0].options).toMatchObject({ method: 'GET', authenticated: true })
    })

    it('sin red devuelve null (la sheet lo muestra, no revienta)', async () => {
        const { listOnboardingTemplates } = await loadModule()
        apiFetchImpl = async () => {
            throw new TypeError('Network request failed')
        }
        expect(await listOnboardingTemplates('training')).toBeNull()
    })
})

describe('applyOnboardingTemplate', () => {
    it('manda solo plantilla y alumno: el coach lo resuelve el servidor desde el token', async () => {
        const { applyOnboardingTemplate } = await loadModule()
        apiFetchImpl = async () => ({ ok: true, programId: 'p1', planId: null })
        const result = await applyOnboardingTemplate({ templateId: 'full-body-3', clientId: 'c1' })
        expect(result).toEqual({ ok: true, programId: 'p1', planId: null })
        expect(calls[0].path).toBe('/api/mobile/coach/templates')
        expect(calls[0].options).toMatchObject({
            method: 'POST',
            authenticated: true,
            body: { templateId: 'full-body-3', clientId: 'c1' },
        })
    })

    it('una respuesta sin ok se trata como fallo', async () => {
        const { applyOnboardingTemplate } = await loadModule()
        apiFetchImpl = async () => ({ programId: 'p1' })
        const result = await applyOnboardingTemplate({ templateId: 'full-body-3', clientId: 'c1' })
        expect(result.ok).toBe(false)
    })

    it('el mensaje accionable del servidor llega tal cual', async () => {
        const { applyOnboardingTemplate } = await loadModule()
        apiFetchImpl = async () => {
            throw new FakeApiError('Ese alumno no es tuyo.', 403)
        }
        expect(await applyOnboardingTemplate({ templateId: 'x', clientId: 'c1' })).toEqual({
            ok: false,
            error: 'Ese alumno no es tuyo.',
        })
    })

    it('un 5xx o un fallo de red NUNCA se le pone delante al coach', async () => {
        const { applyOnboardingTemplate, humanizeApplyError } = await loadModule()
        apiFetchImpl = async () => {
            throw new FakeApiError('workout_programs: duplicate key value…', 500)
        }
        const server = await applyOnboardingTemplate({ templateId: 'x', clientId: 'c1' })
        expect(server.ok).toBe(false)
        expect((server as { error: string }).error).not.toContain('duplicate key')
        expect(humanizeApplyError(new TypeError('Network request failed'))).toBe(
            (server as { error: string }).error,
        )
    })
})

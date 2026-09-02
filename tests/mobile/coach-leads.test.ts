/**
 * `apps/mobile/lib/leads.ts` — bandeja «Solicitudes» del coach en RN (coach-leads W3.2).
 *
 * Cubre las dos mitades del módulo:
 *  - la RED (qué path y qué body se le pide al bridge móvil), porque un typo en la URL solo se
 *    ve en un device con sesión real;
 *  - lo PURO (fecha con tabla fija, badge, WhatsApp), que es donde vive el riesgo de drift con
 *    la web y donde `toLocaleDateString` está prohibido.
 *
 * GOTCHA de resolución (mismo patrón que `coach-branding-rpc.test.ts`): los ids relativos
 * resuelven distinto desde `tests/` que desde `apps/mobile/`, así que `./api` se mockea por PATH
 * ABSOLUTO con `vi.doMock` + import() dinámico.
 */
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)

const LEAD = {
    id: 'lead-1',
    fullName: 'Ana Pérez',
    phone: '+56 9 1234 5678',
    email: 'ana@example.com',
    message: 'Quiero entrenar contigo',
    status: 'new' as const,
    createdAt: '2026-08-21T14:00:00.000Z',
    referrerName: 'Dani Referente',
    referralCardKind: 'placa',
    referralSource: 'share_card',
}

async function setup(response: unknown = { leads: [LEAD] }) {
    const apiFetch = vi.fn(async () => response)
    vi.resetModules()
    vi.doMock(mobileLib('api.ts'), () => ({ apiFetch }))
    const mod = (await import(mobileLib('leads.ts'))) as typeof import('../../apps/mobile/lib/leads')
    return { ...mod, apiFetch }
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('red', () => {
    it('la lista pide el endpoint del coach autenticado, sin filtro por defecto', async () => {
        const { getCoachLeads, apiFetch } = await setup()

        await expect(getCoachLeads()).resolves.toEqual([LEAD])
        expect(apiFetch).toHaveBeenCalledWith('/api/mobile/coach/leads', { authenticated: true })
    })

    it('con estado explícito viaja como query, escapado', async () => {
        const { getCoachLeads, apiFetch } = await setup({ leads: [] })

        await getCoachLeads('dismissed')

        expect(apiFetch).toHaveBeenCalledWith('/api/mobile/coach/leads?status=dismissed', {
            authenticated: true,
        })
    })

    it('una respuesta sin `leads` no rompe la pantalla', async () => {
        const { getCoachLeads } = await setup({} as never)

        await expect(getCoachLeads()).resolves.toEqual([])
    })

    it('mover una solicitud es un PATCH con el id escapado y devuelve el item releído', async () => {
        const updated = { ...LEAD, status: 'contacted' as const }
        const { setCoachLeadStatus, apiFetch } = await setup({ ok: true, lead: updated })

        await expect(setCoachLeadStatus('lead 1/x', 'contacted')).resolves.toEqual(updated)
        expect(apiFetch).toHaveBeenCalledWith('/api/mobile/coach/leads/lead%201%2Fx', {
            method: 'PATCH',
            authenticated: true,
            body: { status: 'contacted' },
        })
    })

    it('convertir con el alumno recién creado manda `clientId` (cierre de la atribución)', async () => {
        const updated = { ...LEAD, status: 'converted' as const }
        const { setCoachLeadStatus, apiFetch } = await setup({ ok: true, lead: updated })

        await setCoachLeadStatus('lead-1', 'converted', 'client-nuevo')

        expect(apiFetch).toHaveBeenCalledWith('/api/mobile/coach/leads/lead-1', {
            method: 'PATCH',
            authenticated: true,
            body: { status: 'converted', clientId: 'client-nuevo' },
        })
    })

    it('sin alumno la clave NO viaja: el server la valida `strict` y un null rebotaría el PATCH', async () => {
        const updated = { ...LEAD, status: 'converted' as const }
        const { setCoachLeadStatus, apiFetch } = await setup({ ok: true, lead: updated })

        await setCoachLeadStatus('lead-1', 'converted')
        await setCoachLeadStatus('lead-1', 'converted', null)

        for (const call of apiFetch.mock.calls) {
            expect((call as unknown as [string, { body: unknown }])[1].body).toEqual({ status: 'converted' })
        }
    })
})

describe('formatLeadDate (tabla fija, sin locale)', () => {
    // Mediodía local: la comparación es por día de calendario, así que la hora no debe influir.
    const now = new Date(2026, 7, 21, 12, 0, 0)

    it('hoy y ayer se nombran, no se fechan', async () => {
        const { formatLeadDate } = await setup()
        expect(formatLeadDate(new Date(2026, 7, 21, 8, 30).toISOString(), now)).toBe('Hoy')
        expect(formatLeadDate(new Date(2026, 7, 21, 23, 59).toISOString(), now)).toBe('Hoy')
        expect(formatLeadDate(new Date(2026, 7, 20, 23, 59).toISOString(), now)).toBe('Ayer')
    })

    it('la semana en curso cuenta días', async () => {
        const { formatLeadDate } = await setup()
        expect(formatLeadDate(new Date(2026, 7, 19).toISOString(), now)).toBe('Hace 2 días')
        expect(formatLeadDate(new Date(2026, 7, 15).toISOString(), now)).toBe('Hace 6 días')
    })

    it('más viejo usa la tabla de meses en español, y el año solo si no es el corriente', async () => {
        const { formatLeadDate } = await setup()
        expect(formatLeadDate(new Date(2026, 7, 14).toISOString(), now)).toBe('14 ago')
        expect(formatLeadDate(new Date(2026, 0, 3).toISOString(), now)).toBe('3 ene')
        expect(formatLeadDate(new Date(2025, 11, 31).toISOString(), now)).toBe('31 dic 2025')
    })

    it('una fecha ilegible no pinta «Invalid Date»', async () => {
        const { formatLeadDate } = await setup()
        expect(formatLeadDate('no-es-fecha', now)).toBe('')
    })
})

describe('helpers puros', () => {
    it('el badge cuenta SOLO las que el coach no tocó', async () => {
        const { countNewLeads } = await setup()
        expect(
            countNewLeads([
                LEAD,
                { ...LEAD, id: '2', status: 'contacted' },
                { ...LEAD, id: '3', status: 'new' },
            ]),
        ).toBe(2)
    })

    it('el origen prioriza el nombre del referente y calla si no hay atribución', async () => {
        const { leadSourceLabel } = await setup()
        expect(leadSourceLabel({ referrerName: 'Dani', referralSource: 'share_card' })).toBe(
            'Por la tarjeta de Dani',
        )
        // El embed del referente pasa por la RLS de `clients`: sin nombre, el origen sigue siendo real.
        expect(leadSourceLabel({ referrerName: null, referralSource: 'share_card' })).toBe(
            'Por una tarjeta compartida',
        )
        expect(leadSourceLabel({ referrerName: null, referralSource: null })).toBeNull()
    })

    // Espejo EXACTO de `toWhatsAppDigits` (apps/web/src/lib/contact/whatsapp.ts): si los dos lados
    // normalizaran distinto, el mismo lead abriría dos chats distintos desde la web y desde la app.
    it('el WhatsApp normaliza el móvil chileno igual que la web', async () => {
        const { leadWhatsAppUrl } = await setup()
        expect(leadWhatsAppUrl('+56 9 1234 5678')).toBe('https://wa.me/56912345678')
        expect(leadWhatsAppUrl('912345678')).toBe('https://wa.me/56912345678')
        expect(leadWhatsAppUrl('09 1234 5678')).toBe('https://wa.me/56912345678')
        // Extranjero: ya trae su país, no se toca.
        expect(leadWhatsAppUrl('+54 9 11 1234 5678')).toBe('https://wa.me/5491112345678')
        expect(leadWhatsAppUrl(null)).toBeNull()
        expect(leadWhatsAppUrl('sin numeros')).toBeNull()
    })

    it('el primer nombre sobrevive a espacios de más', async () => {
        const { leadFirstName } = await setup()
        expect(leadFirstName('  Ana   Pérez ')).toBe('Ana')
        expect(leadFirstName('Ana')).toBe('Ana')
    })
})

describe('handoff «convertir» → alta de alumno', () => {
    it('se consume UNA vez: volver al tab no puede reabrir el alta sola', async () => {
        const { setPendingLeadConversion, consumePendingLeadConversion, peekPendingLeadConversion } =
            await setup()

        expect(consumePendingLeadConversion()).toBeNull()

        setPendingLeadConversion({
            leadId: 'lead-1',
            fullName: 'Ana Pérez',
            email: 'ana@example.com',
            phone: '912345678',
        })
        expect(peekPendingLeadConversion()).toMatchObject({ leadId: 'lead-1' })
        expect(consumePendingLeadConversion()).toMatchObject({ leadId: 'lead-1' })
        expect(consumePendingLeadConversion()).toBeNull()
    })
})

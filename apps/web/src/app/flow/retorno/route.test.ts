import { describe, expect, it } from 'vitest'
import { GET, POST } from './route'

// Puente publico de retorno de Flow (fix incidente go-live 2026-07-09): Flow devuelve por POST
// cross-site (cookies Lax no viajan) → esta ruta responde 303 para que el browser re-navegue con
// GET (cookies SI viajan) al destino real. Anti open-redirect: destino SIEMPRE construido aca.
const BASE = 'https://www.eva-app.cl'

describe('POST /flow/retorno — puente 303', () => {
    it('alta: 303 a flow-processing con tier/cycle/addons saneados', async () => {
        const res = await POST(new Request(`${BASE}/flow/retorno?tier=starter&cycle=monthly&addons=cardio,body_composition`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: 'token=FLOWTOKEN',
        }))
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe(
            `${BASE}/coach/subscription/flow-processing?tier=starter&cycle=monthly&addons=cardio%2Cbody_composition`
        )
    })

    it('dest=card: 303 al banner de tarjeta actualizada', async () => {
        const res = await POST(new Request(`${BASE}/flow/retorno?dest=card`, { method: 'POST', body: '' }))
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe(`${BASE}/coach/subscription?card=updated`)
    })

    it('params con charset raro se DESCARTAN (anti inyeccion/open-redirect)', async () => {
        const res = await POST(new Request(`${BASE}/flow/retorno?tier=${encodeURIComponent('https://evil.com')}&cycle=monthly`, { method: 'POST', body: '' }))
        expect(res.status).toBe(303)
        // tier malicioso descartado; cycle valido pasa.
        expect(res.headers.get('location')).toBe(`${BASE}/coach/subscription/flow-processing?cycle=monthly`)
    })

    it('sin params: 303 a flow-processing pelado', async () => {
        const res = await POST(new Request(`${BASE}/flow/retorno`, { method: 'POST', body: '' }))
        expect(res.headers.get('location')).toBe(`${BASE}/coach/subscription/flow-processing`)
    })

    it('GET defensivo se comporta igual', async () => {
        const res = await GET(new Request(`${BASE}/flow/retorno?tier=pro&cycle=annual`))
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe(`${BASE}/coach/subscription/flow-processing?tier=pro&cycle=annual`)
    })
})

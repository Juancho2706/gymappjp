import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { getTierMaxClients, studentCountLabel } from '@/lib/constants'
import { PlanStep } from './PlanStep'
import { SummaryStep } from './SummaryStep'

/**
 * `/register?tier=free` es el aterrizaje del sello «Hecho con EVA» de la app del alumno
 * (`/hecho-con-eva` → único CTA). Con la grilla de planes del paso 2 en pantalla, el sello quedaba
 * a DOS toques de una vitrina con `$29.990 CLP / mensual`: eso es venta fuera de la tienda y App
 * Review lo cobra (guideline 3.1.1), no es un detalle de copy.
 *
 * El test renderiza los pasos REALES (plan + resumen) en los dos modos y busca plata en el HTML,
 * en vez de leer el fuente: un precio que entre por un helper importado no se ve en este archivo
 * pero sí en lo que el navegador pinta.
 */

/** Los pasos 2 y 3 juntos: es lo que ve quien recorre el alta entera con ese link. */
function renderSteps(freeOnly: boolean): string {
    return renderToStaticMarkup(
        <>
            <PlanStep
                tier="free"
                setTier={() => {}}
                billingCycle="monthly"
                setBillingCycle={() => {}}
                couponCode=""
                setCouponCode={() => {}}
                couponFieldOpen={false}
                setCouponFieldOpen={() => {}}
                couponAutoApplied={false}
                freeOnly={freeOnly}
            />
            <SummaryStep tier="free" billingCycle="monthly" totalClp={0} freeOnly={freeOnly} />
        </>
    )
}

/** HTML sin tags: solo lo que el usuario LEE. */
function visibleText(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/\s+/g, ' ')
}

describe('/register?tier=free — el alta que abre el sello no muestra precios', () => {
    const html = renderSteps(true)
    const text = visibleText(html)

    it('no imprime ni un peso, ni una moneda, ni una periodicidad de cobro', () => {
        expect(html).not.toContain('$')
        expect(text).not.toMatch(/CLP/)
        expect(text).not.toMatch(/\/mes\b/)
        expect(text).not.toMatch(/\/año\b/)
        expect(text).not.toMatch(/Total a pagar/)
    })

    it('no monta la grilla de planes ni nombra los pagos', () => {
        expect(html).not.toContain('role="radiogroup"')
        expect(text).not.toMatch(/Elige tu plan/)
        expect(text).not.toMatch(/\bPro\b/)
        expect(text).not.toMatch(/\bElite\b/)
        expect(text).not.toMatch(/Frecuencia de pago/)
        expect(text).not.toMatch(/código de descuento/i)
    })

    it('muestra la tarjeta compacta del plan gratuito con el cupo que dicta @eva/tiers', () => {
        expect(text).toContain('Plan gratuito')
        expect(text).toContain(studentCountLabel(getTierMaxClients('free')))
        expect(text).toContain('con tu marca')
        expect(text).toContain('sin tarjeta')
    })

    it('deja la puerta abierta al cambio de plan sin mandar a una vitrina', () => {
        expect(text).toContain('Puedes cambiar de plan cuando quieras desde tu cuenta')
        const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
        expect(hrefs).toEqual([])
    })

    it('el resumen cierra en «Gratis», sin cifra', () => {
        expect(text).toContain('Costo')
        expect(text).toContain('Gratis')
    })
})

describe('el alta normal (sin ?tier=free) no cambia', () => {
    const html = renderSteps(false)
    const text = visibleText(html)

    it('sigue mostrando la grilla de planes con sus precios', () => {
        expect(html).toContain('role="radiogroup"')
        expect(text).toContain('Elige tu plan')
        expect(html).toContain('$')
        expect(text).toMatch(/CLP/)
        expect(text).toMatch(/\bPro\b/)
        expect(text).toMatch(/\bElite\b/)
    })

    it('el resumen del free sigue diciendo «$0 — Gratis»', () => {
        expect(text).toContain('$0 — Gratis')
    })
})

// El contrato del SUBMIT (los `<input type="hidden">` del tier/ciclo y el
// `setFreeOnly(rawTier === 'free')` de `page.tsx`) ya no se afirma leyendo el
// fuente como texto: vive en la regla eslint `local/register-free-tier-contract`
// (tools/eslint-rules/), que corre en `pnpm lint` sobre ese archivo.

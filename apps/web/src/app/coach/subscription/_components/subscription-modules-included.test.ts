import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * QA del owner 02-09 (OB2). El bloque «Módulos incluidos» de la pantalla de suscripción pintaba
 * candado gris y «Estos módulos vienen incluidos en cualquier plan pago» cuando
 * `hasActivePaidPlan` era falso — es decir, a TODO coach free. Contradice la regla vigente (D1):
 * todo está incluido en todos los planes y lo único que cambia entre ellos es el CUPO de alumnos.
 *
 * Mismo enfoque que `subscription-price-suffix.test.ts`: renderizar `SubscriptionContent` entero
 * exigiría montar coach + suscripción + add-ons + MercadoPago. El guard de archivo ata la
 * regresión exacta a costo cero.
 */
const SUBSCRIPTION_CONTENT = readFileSync(join(__dirname, 'SubscriptionContent.tsx'), 'utf-8')

describe('«Módulos incluidos» — incluidos en TODOS los planes', () => {
    it('no queda copy que los ate a un plan pago', () => {
        expect(SUBSCRIPTION_CONTENT).not.toContain('incluidos en cualquier plan pago')
        expect(SUBSCRIPTION_CONTENT).not.toContain('Elige un plan abajo para activarlos')
    })

    it('el bloque ya no se gatea con `hasActivePaidPlan`', () => {
        // `hasActivePaidPlan` sigue vivo para el cambio de plan (prorrateo, gate de Flow): lo que
        // no puede volver es un `included` derivado de él.
        expect(SUBSCRIPTION_CONTENT).not.toContain('const included = hasActivePaidPlan')
    })

    it('dice que vienen incluidos en todos los planes', () => {
        expect(SUBSCRIPTION_CONTENT).toContain('Vienen incluidos en todos los planes')
    })
})

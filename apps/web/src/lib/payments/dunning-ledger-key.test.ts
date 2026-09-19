import { describe, expect, it } from 'vitest'
import { buildDunningTemplateKey } from '@/lib/payments/webhook-pipeline'

/**
 * La clave de dedupe del aviso de dunning (`coach_email_ledger_dedupe_uidx`, sobre
 * `(coach_id, template_key)` donde `status <> 'failed'`).
 *
 * POR QUE ESTE TEST EXISTE (incidente 2026-09-18): el aviso de cobro rechazado salia por
 * `sendTransactionalEmail` pelado, sin fila en el ledger. Cuando el coach reclamo que no sabia nada
 * del rechazo, no hubo forma de saber si se le habia avisado. Al meterlo al ledger aparece una
 * trampa nueva y peor: con una key ESTATICA el indice unico lo dejaria sin aviso del SEGUNDO mes en
 * adelante — cambiariamos "sin rastro" por "sin correo", que es peor.
 *
 * Las dos propiedades que fijan estos casos:
 *  · mismo cobro  => misma key  (reintento de webhook no reescribe al coach)
 *  · otro cobro   => otra key   (el dunning del mes que viene SI sale)
 */
describe('buildDunningTemplateKey — dedupe del aviso de dunning', () => {
    it('mismo pago ⇒ misma key (un reintento del webhook no manda dos correos)', () => {
        expect(buildDunningTemplateKey('failed', '179754636004')).toBe(
            buildDunningTemplateKey('failed', '179754636004'),
        )
    })

    it('pagos distintos ⇒ keys distintas (el dunning del ciclo siguiente NO queda mudo)', () => {
        // El rechazo real de Joaquin (18-09) y un rechazo hipotetico del ciclo siguiente.
        const septiembre = buildDunningTemplateKey('failed', '179754636004')
        const octubre = buildDunningTemplateKey('failed', '181000000001')
        expect(septiembre).not.toBe(octubre)
    })

    it('`failed` y `recovered` del MISMO pago no se pisan entre si', () => {
        expect(buildDunningTemplateKey('failed', '179754636004')).not.toBe(
            buildDunningTemplateKey('recovered', '179754636004'),
        )
    })

    it('sin id de pago cae al corte del periodo: un aviso por ciclo, nunca cero', () => {
        const cicloA = buildDunningTemplateKey('failed', 'period:2026-09-26T15:14:13Z')
        const cicloB = buildDunningTemplateKey('failed', 'period:2026-10-26T15:14:13Z')
        expect(cicloA).not.toBe(cicloB)
        // Dentro del mismo ciclo, estable ⇒ dedupe efectivo.
        expect(cicloA).toBe(buildDunningTemplateKey('failed', 'period:2026-09-26T15:14:13Z'))
    })

    it('nunca produce una key estatica: el sufijo siempre viaja', () => {
        // La regresion que este test bloquea es exactamente «volver a `payment_failed` a secas».
        for (const key of ['179754636004', 'period:2026-09-26T15:14:13Z', 'unknown']) {
            expect(buildDunningTemplateKey('failed', key)).not.toBe('payment_failed')
            expect(buildDunningTemplateKey('failed', key).startsWith('payment_failed:')).toBe(true)
        }
    })

    it('null / undefined / vacio degradan a `unknown` en vez de romper la key', () => {
        for (const vacio of [null, undefined, '', '   ']) {
            expect(buildDunningTemplateKey('failed', vacio)).toBe('payment_failed:unknown')
        }
    })

    it('recorta el id (un espacio de mas no puede abrir una key nueva y duplicar el correo)', () => {
        expect(buildDunningTemplateKey('failed', ' 179754636004 ')).toBe(
            buildDunningTemplateKey('failed', '179754636004'),
        )
    })
})

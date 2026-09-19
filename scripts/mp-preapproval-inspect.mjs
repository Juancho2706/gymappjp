#!/usr/bin/env node
/**
 * mp-preapproval-inspect — lee un preapproval de Mercado Pago y muestra su CALENDARIO real.
 *
 * READ-ONLY: un solo GET a la API de MP. No escribe en MP ni en la base.
 *
 * POR QUE EXISTE (incidente 2026-09-18, coach JB fitness): MP intentó el cobro recurrente el 18-09
 * mientras `coaches.current_period_end` decía 26-09. Los webhooks guardan QUE cobró, no CUÁNDO
 * piensa cobrar de nuevo, así que desde la base no se puede saber si el desfase lo pone MP o
 * nosotros (`resolveCurrentPeriodEnd` fecha con `charged_at + 1 mes` cuando el gateway no da la
 * fecha). Esta lectura es la única fuente que lo dice.
 *
 * Uso:
 *   MERCADOPAGO_ACCESS_TOKEN=APP_USR-... node scripts/mp-preapproval-inspect.mjs <preapproval_id>
 *
 * El id vive en `coaches.subscription_mp_id`.
 */

const token = process.env.MERCADOPAGO_ACCESS_TOKEN
const preapprovalId = process.argv[2]

if (!token) {
    console.error('Falta MERCADOPAGO_ACCESS_TOKEN en el entorno.')
    process.exit(1)
}
if (!preapprovalId) {
    console.error('Uso: node scripts/mp-preapproval-inspect.mjs <preapproval_id>')
    process.exit(1)
}

const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${token}` },
})

if (!res.ok) {
    console.error(`MP respondió ${res.status}: ${await res.text()}`)
    process.exit(1)
}

const p = await res.json()
const auto = p.auto_recurring ?? {}

// `next_payment_date` es el dato que decide todo: si coincide con current_period_end no hay
// desfase; si no, el coach va a entrar en dunning antes de que se le acabe lo pagado.
const out = {
    id: p.id,
    status: p.status,
    reason: p.reason,
    external_reference: p.external_reference,
    payer_email: p.payer_email,
    date_created: p.date_created,
    last_modified: p.last_modified,
    next_payment_date: p.next_payment_date ?? null,
    auto_recurring: {
        frequency: auto.frequency,
        frequency_type: auto.frequency_type,
        transaction_amount: auto.transaction_amount,
        currency_id: auto.currency_id,
        start_date: auto.start_date ?? null,
        end_date: auto.end_date ?? null,
    },
}

console.log(JSON.stringify(out, null, 2))

if (out.next_payment_date) {
    const next = new Date(out.next_payment_date)
    const dias = Math.round((next.getTime() - Date.now()) / 86_400_000)
    console.log(`\n→ Próximo cobro según MP: ${next.toISOString()} (en ${dias} día(s), día ${next.getUTCDate()} del mes).`)
    console.log('  Compáralo con `coaches.current_period_end`: si no coinciden, ese es el desfase.')
} else {
    console.log('\n→ MP no devolvió next_payment_date (sub sin cobro programado: cancelada, pausada o aún pendiente).')
}

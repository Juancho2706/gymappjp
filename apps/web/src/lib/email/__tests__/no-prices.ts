import { expect } from 'vitest'

/**
 * Guardas de contenido compartidas por los tests de RENDER de los correos al COACH.
 *
 * Vivían inline en `sales-templates.test.ts`; el embudo Free→Pro (W2.3) las sube a un helper
 * porque el mismo contrato aplica al drip y a los transaccionales: los planes cambian y un correo
 * viejo con precios stale es peor que ninguno. La ÚNICA excepción declarada son los correos que
 * llevan el precio del CATÁLOGO (`TIER_CONFIG.pro.monthlyPriceClp`) — ésos se pinnean con
 * `assertOnlyCatalogPrice`, no con `assertNoPrices`.
 *
 * No es un archivo de test (no matchea `*.test.ts`): vitest no lo colecta, solo lo importa.
 */

/** Cuenta los `<a>` del HTML: el contrato es exactamente un link por correo. */
export function countLinks(html: string): number {
    return (html.match(/<a\s/g) ?? []).length
}

/** Ningún correo puede llevar precios embebidos (formato CLP $19.990 / 19990 / «/mes»). */
export function assertNoPrices(html: string) {
    expect(html).not.toMatch(/\$\s?\d/)
    expect(html).not.toMatch(/\b\d{2}\.\d{3}\b/)
    expect(html.toLowerCase()).not.toContain('/mes')
}

/**
 * Para los correos que SÍ llevan precio (D+2 y D+14 del drip): el único precio del HTML tiene que
 * ser el del catálogo vivo, formateado es-CL. Cualquier otro número con forma de precio (un
 * literal olvidado, un tier viejo) rompe el test.
 */
export function assertOnlyCatalogPrice(html: string, priceClp: number) {
    const expected = new Intl.NumberFormat('es-CL').format(priceClp)
    expect(html).toContain(`$${expected}`)
    expect(html.match(/\$\s?[\d.]+/g) ?? []).toEqual([`$${expected}`])
    expect(html.match(/\b\d{2}\.\d{3}\b/g) ?? []).toEqual([expected])
}

import { computeDiscountedClp, type DiscountSpec } from '@/lib/constants'

/**
 * Cupón vivo del coach, serializado del server (RSC) al cliente de Reactivar.
 *
 * Es la MISMA forma que el `DiscountSpec` de precio (type/value/target/remainingCycles) más el
 * código para el display. `moduleKeys` NO viaja a propósito: la pantalla precia el PLAN BASE (sin
 * add-ons), así que un cupón `target='module'` no tiene línea que descontar y el precio queda
 * intacto — exactamente lo que muestra hoy la página.
 */
export type ReactivateActiveDiscount = {
    code: string | null
    type: 'percent' | 'fixed_clp'
    value: number
    target: 'base' | 'module' | 'total'
    remainingCycles: number | null
}

/** Precio de lista + neto con el cupón vivo aplicado (y el descuento efectivo, ya clampeado). */
export type ReactivatePriceView = {
    listClp: number
    netClp: number
    discountClp: number
}

/**
 * PURA: precio a MOSTRAR en Reactivar con el cupón vivo aplicado.
 *
 * Usa `computeDiscountedClp` — el MISMO motor puro con el que `getCompositeAmountClp` hornea el
 * monto que cobra `create-preference` — sobre el precio de lista del tier/ciclo elegido y SIN
 * add-ons (la pantalla precia el plan base, igual que hoy). Así el precio mostrado == el cobrado
 * (SERNAC: disclosed == charged) para el caso real de la reactivación, donde el checkout no lleva
 * add-ons nuevos. `floorClp` NO se pasa (igual que create-preference) → mismo piso por defecto.
 *
 * Sin cupón (`null`) devuelve list == net y descuento 0: la UI queda idéntica a la de siempre.
 */
export function computeReactivatePrice(
    listClp: number,
    discount: ReactivateActiveDiscount | null
): ReactivatePriceView {
    if (!discount) return { listClp, netClp: listClp, discountClp: 0 }
    const spec: DiscountSpec = {
        type: discount.type,
        value: discount.value,
        target: discount.target,
        remainingCycles: discount.remainingCycles,
    }
    const r = computeDiscountedClp({ baseClp: listClp, addons: [], spec })
    return { listClp: r.baseBeforeDiscountClp, netClp: r.netClp, discountClp: r.discountClp }
}

/**
 * PURA: texto de la pill del cupón («−50% · tu cupón JHNG3C48AE · por 3 ciclos»). `fixed_clp`
 * muestra el descuento EFECTIVO (ya clampeado al monto), no el valor nominal del cupón.
 */
export function reactivateDiscountLabel(
    discount: ReactivateActiveDiscount,
    discountClp: number
): string {
    const off =
        discount.type === 'percent'
            ? `−${discount.value}%`
            : `−$${discountClp.toLocaleString('es-CL')}`
    const owner = discount.code ? `tu cupón ${discount.code}` : 'tu descuento'
    const cycles =
        discount.remainingCycles == null
            ? ''
            : ` · por ${discount.remainingCycles} ciclo${discount.remainingCycles !== 1 ? 's' : ''}`
    return `${off} · ${owner}${cycles}`
}

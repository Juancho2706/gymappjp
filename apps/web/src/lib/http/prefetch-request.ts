/**
 * ¿Es un PREFETCH de Next.js (RSC especulativo) y NO una navegación real?
 *
 * Señales (cualquiera basta):
 * - `next-router-prefetch: 1` — lo setea el router de Next en sus prefetch.
 * - `purpose: prefetch` — hint clásico de browsers.
 * - `Sec-Purpose: ...prefetch...` — hint moderno (Chrome manda `prefetch;prerender`).
 *
 * Es la capa secundaria al `missing` del matcher del proxy (en Next 16 estos headers
 * a veces faltan). Se usa para saltar SOLO efectos colaterales (la RPC
 * `touch_coach_activity` del proxy), NUNCA la lógica de auth/redirect.
 *
 * Función PURA (lee únicamente `Headers`) → se testea la matriz de headers sin
 * levantar el middleware. Extraída de `proxy.ts` en la Phase 5 del plan de
 * optimización de DB requests.
 */
export function isPrefetchRequest(headers: Headers): boolean {
    return (
        headers.get('next-router-prefetch') === '1' ||
        headers.get('purpose') === 'prefetch' ||
        (headers.get('sec-purpose')?.includes('prefetch') ?? false)
    )
}

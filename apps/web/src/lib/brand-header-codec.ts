/**
 * Los headers HTTP son ByteString (ISO-8859-1): un solo char fuera de U+00FF en un valor
 * user-editable (emoji en loader_text, simbolos en brand_name) hace throw en headers.set()
 * y tumba el middleware COMPLETO con 500 para ese coach — incidente 2026-08-05: /c/<slug>
 * de un coach estuvo roto desde el 24-jul porque su loader_text era "⚔️🐺🔱" (U+2694 > 255).
 *
 * Contrato: todo valor user-editable que viaja en headers x-coach-* se escribe con
 * encodeBrandHeaderValue (proxy) y se lee con decodeBrandHeaderValue (RSC via headers()).
 * Campos de formato fijo (hex de color pickers, enums, URLs de storage, uuids, slugs)
 * viajan crudos: agregarles el codec exigiria tocar cada lector sin ganancia real.
 */
export function encodeBrandHeaderValue(value: string): string {
    return encodeURIComponent(value)
}

/**
 * Tolerante a valores no encodeados (constantes tipo 'EVA' que el proxy setea crudas y
 * un '%' suelto que haria throw a decodeURIComponent): en ese caso devuelve el valor tal cual.
 */
export function decodeBrandHeaderValue(value: string | null): string | null {
    if (value === null) return null
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

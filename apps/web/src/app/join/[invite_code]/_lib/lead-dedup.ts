/**
 * Dedup de solicitudes (`coach_leads`): mismo coach + mismo teléfono o correo dentro de la ventana.
 *
 * Vive fuera del action porque un archivo `'use server'` solo puede exportar funciones async, y
 * esto es una función pura que además se testea sola.
 */

/** Dos envíos del mismo contacto dentro de esta ventana son la MISMA solicitud. */
export const LEAD_DEDUP_WINDOW_DAYS = 7

/** Instante desde el cual se busca un duplicado (ISO, para `.gte('created_at', …)`). */
export function leadDedupSince(now: Date = new Date()): string {
    return new Date(now.getTime() - LEAD_DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Filtro `or` de PostgREST: `phone.eq."…"` o `email.eq."…"`.
 *
 * Los valores van entre comillas dobles y escapados porque son ENTRADA DEL USUARIO: una coma o un
 * paréntesis sueltos parten el filtro en dos condiciones distintas, lo que en el mejor caso rompe
 * la consulta y en el peor la ensancha.
 */
export function buildLeadContactFilter(phone: string, email?: string | null): string {
    const parts = [`phone.eq.${quote(phone)}`]
    if (email) parts.push(`email.eq.${quote(email)}`)
    return parts.join(',')
}

function quote(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

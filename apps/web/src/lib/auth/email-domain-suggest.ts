/**
 * Guardia de typos de dominio de correo — archivo PROPIO y sin imports para que el componente
 * cliente del registro lo consuma sin arrastrar `platform-email.ts` al bundle del browser: esa
 * lista de dominios desechables es server-side (le diría a un abusador exactamente qué se rechaza)
 * y acá nada depende del tree-shaking. `platform-email.ts` la re-exporta para el server.
 */

/**
 * Dominios que concentran el grueso de las altas. NO son una lista blanca —cualquier otro dominio
 * pasa igual—: son el ancla para detectar un tipeo torcido y ofrecer la corrección.
 */
const COMMON_EMAIL_DOMAINS = [
    'gmail.com',
    'hotmail.com',
    'hotmail.cl',
    'outlook.com',
    'outlook.cl',
    'yahoo.com',
    'yahoo.es',
    'icloud.com',
    'live.cl',
    'live.com',
]

/**
 * Dominios REALES que caen a un solo error de un ancla y por eso jamás se marcan. Sin esta lista la
 * métrica «corregiría» `mail.com` → `gmail.com` (los dos existen y entregan) y el coach vería una
 * sugerencia falsa sobre un correo que funciona perfecto. `googlemail.com` va acá por lo mismo:
 * `normalizePlatformEmail` ya lo trata como Gmail, es la misma bandeja.
 */
const LEGIT_LOOKALIKE_DOMAINS = new Set(['mail.com', 'email.com', 'googlemail.com'])

/**
 * Typos que la métrica NO alcanza —dos errores o más— pero que en Chile son rutina: el `.cl` por
 * reflejo sobre un proveedor que no lo tiene, y el `.com.cl` pegado al final. La tabla es de
 * dominio COMPLETO y exacto: `miempresa.com.cl` (patrón corporativo legítimo) no entra.
 */
const EMAIL_DOMAIN_TYPOS: Record<string, string> = {
    'gmail.cl': 'gmail.com',
    'gmail.com.cl': 'gmail.com',
    'hotmail.com.cl': 'hotmail.com',
    'outlook.com.cl': 'outlook.com',
    'yahoo.cl': 'yahoo.com',
    'icloud.cl': 'icloud.com',
}

/**
 * Damerau-Levenshtein (incluye TRANSPOSICIÓN): sin ella `gmial.com` queda a distancia 2 de
 * `gmail.com` y el typo más común de todos pasaría de largo.
 */
function damerauLevenshtein(a: string, b: string): number {
    const rows = a.length + 1
    const cols = b.length + 1
    const d: number[][] = Array.from({ length: rows }, (_, i) => {
        const row = new Array<number>(cols).fill(0)
        row[0] = i
        return row
    })
    for (let j = 0; j < cols; j += 1) d[0][j] = j
    for (let i = 1; i < rows; i += 1) {
        for (let j = 1; j < cols; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
            }
        }
    }
    return d[rows - 1][cols - 1]
}

/**
 * «¿Quisiste decir …?» — devuelve el correo con el DOMINIO corregido, o null si no hay sospecha.
 *
 * Es una SUGERENCIA, nunca un bloqueo: el alta con un dominio raro pero válido tiene que salir
 * igual (un coach puede tener su propio dominio, y esta función no sabe nada del mundo). Existe por
 * el caso `esteban` del 22-08 (autopsia 25-08): escribió `…@gmail.con`, el formulario lo aceptó, el
 * correo de confirmación no pudo llegar nunca y la cuenta quedó muerta en `pending_email` — sin
 * forma de recuperarla, porque re-registrarse con el correo bueno es otra cuenta y el link de
 * reenvío va al dominio equivocado.
 *
 * Dos caminos, en este orden: la tabla explícita de typos y, si no hay match, un solo error de
 * edición (Damerau-Levenshtein === 1) contra un ancla de largo parecido. Distancia 2 queda fuera a
 * propósito: marcaría dominios reales como `hotmail.es` (España) contra `hotmail.cl`.
 *
 * A propósito NO se exige que el dominio traiga punto: `@gmailcom` está a un solo error de
 * `gmail.com` y muere exactamente igual que `@gmail.con`. Un dominio de una sola etiqueta que no se
 * parezca a nada (`@localhost`, una intranet) sigue sin marcarse porque ninguna ancla queda a 1.
 *
 * Sólo se toca el DOMINIO: el buzón se devuelve tal como se tipeó (la parte local del correo es
 * sensible a mayúsculas según RFC 5321).
 */
export function suggestEmailDomainFix(raw: string): string | null {
    const value = raw.trim()
    const at = value.lastIndexOf('@')
    if (at <= 0 || at === value.length - 1) return null

    const local = value.slice(0, at)
    const domain = value.slice(at + 1).toLowerCase()
    if (COMMON_EMAIL_DOMAINS.includes(domain) || LEGIT_LOOKALIKE_DOMAINS.has(domain)) return null

    const listed = EMAIL_DOMAIN_TYPOS[domain]
    if (listed) return `${local}@${listed}`

    const near = COMMON_EMAIL_DOMAINS.find(
        (candidate) =>
            Math.abs(candidate.length - domain.length) <= 1 &&
            damerauLevenshtein(domain, candidate) === 1
    )
    return near ? `${local}@${near}` : null
}

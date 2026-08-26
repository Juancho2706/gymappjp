// ===== Estado del alumno en el roster · fuente única (web) =====
// Antes vivía duplicado en `DirRowCard.tsx` y `DirTableMobile.tsx` (dos `statusMeta`
// que ya divergían en el tono del chip pendiente). Ahora es una función pura y
// compartida: W1.5 solo cambió su ENTRADA, no cada componente.
//
// El espejo RN de esta misma lógica vive en `apps/mobile/components/coach/directory/`.

/**
 * Claves internas del estado. Las tres viejas NO se renombran: el filtro `pending_sync` del
 * directorio (y `pendingSyncCount`) las espeja y sigue significando «no cambió su clave».
 * `entered` es la única clave nueva de W1.5 — el chip que la promesa «lo ves en tu panel» necesitaba.
 */
export type ClientStatusKey = 'archived' | 'paused' | 'entered' | 'pending_sync' | 'active'

/**
 * Instante desde el cual `first_login_at` es una señal CONFIABLE: solo las filas creadas después
 * del deploy web que empezó a escribir la columna pueden interpretarse como «Todavía no entró»
 * cuando llegan sin timestamp.
 *
 * **El jefe de la ola la fija al ISO del deploy web** (mismo patrón que `VIVE_TU_APP_ENTERED_CUTOVER`
 * en vive-tu-app-directo). Mientras apunte al futuro —el valor con el que nace— ninguna fila cae en
 * «Todavía no entró» y el roster degrada al fallback honesto de W0: **degradación honesta, no un bug**.
 *
 * Está DUPLICADA a propósito en RN (`apps/mobile/components/coach/directory/directory-shared.ts`):
 * un módulo compartido en `packages/*` viajaría en el bundle RN y crearía split por runtime — el
 * binario en la tienda no se redeploya junto con la web, así que cada plataforma fija su propio corte.
 */
export const FIRST_LOGIN_SIGNAL_CUTOVER = '2100-01-01T00:00:00Z'

export interface ClientStatusInput {
    /** `client.is_archived === true` */
    isArchived: boolean
    /** `client.is_active !== false` (el default de la fila es activo) */
    isActive: boolean
    /** Primer login real del alumno (columna `clients.first_login_at`). */
    firstLoginAt: string | null
    /** `client.created_at` — decide si el `null` de arriba es «no entró» o «fila vieja». */
    createdAt: string | null
    /** `client.force_password_change` */
    forcePasswordChange: boolean
}

export interface ClientStatusMeta {
    key: ClientStatusKey
    label: string
    /** Clases del chip (fondo + tinta), en tokens que flipean con el tema. */
    cls: string
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function parseIso(value: string | null): number | null {
    if (!value) return null
    const ms = new Date(value).getTime()
    return Number.isNaN(ms) ? null : ms
}

/** Medianoche local del instante dado — para «mismo día calendario», que NO es «hace menos de 24 h». */
function startOfLocalDay(ms: number): number {
    const d = new Date(ms)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
}

/** «Entró hace 3 min» / «Entró hoy» / «Entró hace 2 d», con el reloj inyectado. */
function enteredLabel(firstLoginMs: number, now: Date): string {
    const elapsed = Math.max(0, now.getTime() - firstLoginMs)
    if (elapsed < HOUR_MS) {
        // Mínimo 1: «Entró hace 0 min» se lee como un error de cálculo, no como recién.
        const minutes = Math.max(1, Math.floor(elapsed / 60000))
        return `Entró hace ${minutes} min`
    }
    const days = Math.round((startOfLocalDay(now.getTime()) - startOfLocalDay(firstLoginMs)) / DAY_MS)
    if (days <= 0) return 'Entró hoy'
    return `Entró hace ${days} d`
}

/**
 * Devuelve el chip de estado del alumno para el roster.
 *
 * Precedencia: archivado > pausado > `first_login_at` > fallback por `force_password_change`.
 *
 * REGLA DURA que sobrevive a W1.5: `force_password_change` se apaga cuando el alumno **completa**
 * el cambio de clave, no cuando entra. Una fila ANTERIOR al corte pudo entrar sin dejar timestamp,
 * así que jamás le decimos «Todavía no entró»: su fallback sigue diciendo lo que el dato dice
 * («Todavía no cambió su clave» / «Activo»). Solo las filas nacidas después de
 * `FIRST_LOGIN_SIGNAL_CUTOVER` pueden afirmar la ausencia de login.
 *
 * @param now reloj inyectable (tests deterministas).
 * @param cutoverIso costura de test: en producción SIEMPRE `FIRST_LOGIN_SIGNAL_CUTOVER`.
 */
export function getClientStatusMeta(
    { isArchived, isActive, firstLoginAt, createdAt, forcePasswordChange }: ClientStatusInput,
    now: Date = new Date(),
    cutoverIso: string = FIRST_LOGIN_SIGNAL_CUTOVER
): ClientStatusMeta {
    if (isArchived) {
        return { key: 'archived', label: 'Archivado', cls: 'bg-surface-sunken text-subtle' }
    }
    if (!isActive) {
        return {
            key: 'paused',
            label: 'Pausado',
            cls: 'bg-[var(--ink-100)] text-[var(--ink-600)]',
        }
    }

    const firstLoginMs = parseIso(firstLoginAt)
    if (firstLoginMs !== null) {
        return {
            key: 'entered',
            label: enteredLabel(firstLoginMs, now),
            cls: 'bg-[var(--success-100)] text-[var(--success-700)]',
        }
    }

    if (forcePasswordChange) {
        const createdMs = parseIso(createdAt)
        const cutoverMs = parseIso(cutoverIso)
        // Fila NACIDA después del corte y sin timestamp ⇒ la ausencia es información, no un hueco.
        const postCutover = createdMs !== null && cutoverMs !== null && createdMs >= cutoverMs
        return {
            key: 'pending_sync',
            label: postCutover ? 'Todavía no entró' : 'Todavía no cambió su clave',
            cls: 'bg-[var(--info-100)] text-[var(--info-700)]',
        }
    }

    return {
        key: 'active',
        label: 'Activo',
        cls: 'bg-[var(--success-100)] text-[var(--success-700)]',
    }
}

/** Adaptador desde la fila cruda del roster (`select('*')` ya trae las dos columnas nuevas). */
export function clientStatusInputFromRow(client: {
    is_archived?: boolean | null
    is_active?: boolean | null
    force_password_change?: boolean | null
    first_login_at?: string | null
    created_at?: string | null
}): ClientStatusInput {
    return {
        isArchived: client.is_archived === true,
        isActive: client.is_active !== false,
        firstLoginAt: client.first_login_at ?? null,
        createdAt: client.created_at ?? null,
        forcePasswordChange: !!client.force_password_change,
    }
}

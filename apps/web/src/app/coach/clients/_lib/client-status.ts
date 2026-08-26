// ===== Estado del alumno en el roster · fuente única (web) =====
// Antes vivía duplicado en `DirRowCard.tsx` y `DirTableMobile.tsx` (dos `statusMeta`
// que ya divergían en el tono del chip pendiente). Ahora es una función pura y
// compartida: W1 solo tiene que cambiar su ENTRADA, no cada componente.
//
// El espejo RN de esta misma lógica vive en `apps/mobile/components/coach/directory/`.

/** Claves internas del estado. No se renombran: el filtro `pending_sync` del directorio las espeja. */
export type ClientStatusKey = 'archived' | 'paused' | 'pending_sync' | 'active'

export interface ClientStatusInput {
    /** `client.is_archived === true` */
    isArchived: boolean
    /** `client.is_active !== false` (el default de la fila es activo) */
    isActive: boolean
    /**
     * Primer login real del alumno (columna `first_login_at`). Todavía NO existe:
     * los llamadores pasan `null` y la función la ignora.
     */
    firstLoginAt: string | null
    /** `client.force_password_change` */
    forcePasswordChange: boolean
}

export interface ClientStatusMeta {
    key: ClientStatusKey
    label: string
    /** Clases del chip (fondo + tinta), en tokens que flipean con el tema. */
    cls: string
}

/**
 * Devuelve el chip de estado del alumno para el roster.
 *
 * REGLA DURA (W0): mientras no exista la columna `first_login_at`, ningún label puede
 * decir «entró». `force_password_change` se apaga cuando el alumno COMPLETA el cambio de
 * clave, no cuando entra: el que entra y abandona esa pantalla quedaría «Todavía no entró»
 * para siempre. Por eso el fallback dice lo que el dato realmente dice —«Todavía no cambió
 * su clave»— y el copy «entró» recién entra en W1, cuando la columna exista.
 *
 * `firstLoginAt` ya está en la firma para que W1 sea un cambio de entrada, no de llamadores.
 */
export function getClientStatusMeta({
    isArchived,
    isActive,
    forcePasswordChange,
}: ClientStatusInput): ClientStatusMeta {
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
    if (forcePasswordChange) {
        return {
            key: 'pending_sync',
            label: 'Todavía no cambió su clave',
            cls: 'bg-[var(--info-100)] text-[var(--info-700)]',
        }
    }
    return {
        key: 'active',
        label: 'Activo',
        cls: 'bg-[var(--success-100)] text-[var(--success-700)]',
    }
}

/** Adaptador desde la fila cruda del roster (los selects todavía no traen `first_login_at`). */
export function clientStatusInputFromRow(client: {
    is_archived?: boolean | null
    is_active?: boolean | null
    force_password_change?: boolean | null
}): ClientStatusInput {
    return {
        isArchived: client.is_archived === true,
        isActive: client.is_active !== false,
        firstLoginAt: null,
        forcePasswordChange: !!client.force_password_change,
    }
}

/**
 * Catálogo único de acciones de `admin_audit_logs`.
 *
 * Fuente de verdad compartida entre la tabla de Auditoría (label + tone del badge) y el filtro
 * de acciones. Se alimenta de TODO lo que hoy escribe en la tabla: el panel CEO
 * (`logAdminAction` + inserts directos) y los procesos automáticos (crons, webhooks de pago y
 * self-service de coach/owner), que también aterrizan en la misma tabla y por lo tanto se ven
 * en la vista de Auditoría.
 *
 * Regla de oro: una acción que NO esté acá NUNCA rompe la UI — se muestra el string crudo con
 * tone `neutral` (ver `getAdminActionMeta`).
 */

export type AdminActionTone = 'success' | 'warning' | 'danger' | 'sport' | 'neutral'

export interface AdminActionMeta {
    label: string
    tone: AdminActionTone
}

export const ADMIN_ACTION_CATALOG: Record<string, AdminActionMeta> = {
    // ── Coaches — panel CEO (coach-actions.ts) ──────────────────────────────
    'coach.create': { label: 'Creó coach', tone: 'success' },
    'coach.update': { label: 'Editó coach', tone: 'neutral' },
    'coach.modules_grant': { label: 'Módulos del coach', tone: 'sport' },
    'coach.notes_update': { label: 'Editó notas', tone: 'neutral' },
    'coach.delete': { label: 'Eliminó coach', tone: 'danger' },
    'coach.suspend': { label: 'Suspendió coach', tone: 'warning' },
    'coach.reactivate': { label: 'Reactivó coach', tone: 'success' },
    'coach.force_expire': { label: 'Expiró trial', tone: 'warning' },
    'coach.period_extend': { label: 'Extendió período', tone: 'success' },
    'coach.period_end_update': { label: 'Cambió vencimiento', tone: 'neutral' },
    'coach.bulk_status': { label: 'Cambio masivo de estado', tone: 'warning' },
    'coach.bulk_tier': { label: 'Cambio masivo de plan', tone: 'warning' },
    'coach.announcement_email': { label: 'Anuncio masivo', tone: 'sport' },
    'coach.manual_email_sent': { label: 'Correo manual', tone: 'sport' },

    // ── Alumnos — panel CEO (client-actions.ts) ─────────────────────────────
    'client.create': { label: 'Creó alumno', tone: 'success' },
    'client.update': { label: 'Editó alumno', tone: 'neutral' },
    'client.delete': { label: 'Eliminó alumno', tone: 'danger' },

    // ── Cupones — panel CEO (codigos.actions.ts) ────────────────────────────
    'coupon.mint': { label: 'Creó cupón', tone: 'success' },
    'coupon.deactivate': { label: 'Desactivó cupón', tone: 'warning' },
    'coupon.revoke_redemption': { label: 'Revocó canje', tone: 'danger' },

    // ── Equipos — panel CEO (teams.actions.ts) ──────────────────────────────
    'team.create': { label: 'Creó equipo', tone: 'success' },
    'team.update': { label: 'Editó equipo', tone: 'neutral' },
    'team.suspend': { label: 'Suspendió equipo', tone: 'warning' },
    'team.unsuspend': { label: 'Reactivó equipo', tone: 'success' },

    // ── Organizaciones — panel CEO (orgs.actions.ts) ────────────────────────
    'org.resend_owner_invite': { label: 'Reenvió invitación', tone: 'sport' },
    'org.status_manual_active': { label: 'Activó organización', tone: 'success' },
    'org.status_manual_suspended': { label: 'Suspendió organización', tone: 'warning' },

    // ── Novedades — panel CEO (novedades-actions.ts) ────────────────────────
    create_news_item: { label: 'Creó novedad', tone: 'success' },
    update_news_item: { label: 'Editó novedad', tone: 'neutral' },
    publish_news_item: { label: 'Publicó novedad', tone: 'sport' },
    archive_news_item: { label: 'Archivó novedad', tone: 'warning' },
    delete_news_item: { label: 'Eliminó novedad', tone: 'danger' },
    toggle_pin_news_item: { label: 'Fijó / desfijó novedad', tone: 'neutral' },

    // ── Automáticas: conciliación de pagos (crons + webhook pipeline) ───────
    'coach.flow_status_divergence': { label: 'Flow: estado divergente', tone: 'warning' },
    'coach.flow_period_not_advanced': { label: 'Flow: período sin avanzar', tone: 'warning' },
    'coach.flow_composite_synced': { label: 'Flow: monto sincronizado', tone: 'neutral' },
    'coach.flow_composite_lowered': { label: 'Flow: monto rebajado', tone: 'neutral' },
    'coach.flow_amount_drift': { label: 'Flow: monto desalineado', tone: 'warning' },
    'coach.flow_sub_cancelled_on_gateway_switch': { label: 'Flow: baja por cambio de pasarela', tone: 'warning' },
    'coach.mp_status_divergence': { label: 'MP: estado divergente', tone: 'warning' },
    'coach.addon_amount_drift': { label: 'Add-on: monto desalineado', tone: 'warning' },
    'coach.addon_killswitch_billed': { label: 'Add-on cobrado con killswitch', tone: 'danger' },
    'coach.addon_expired': { label: 'Add-on expirado', tone: 'neutral' },
    'coach.preapproval_paused_with_addons': { label: 'Preaprobación pausada con add-ons', tone: 'warning' },
    'coach.payment_refunded_or_chargeback': { label: 'Reembolso / contracargo', tone: 'danger' },
    'coach.coupon_redeemed': { label: 'Canjeó cupón', tone: 'success' },
    'coach.coupon_pre_increase_notice': { label: 'Aviso de alza por cupón', tone: 'neutral' },
    'coach.coupon_signup_abandoned': { label: 'Registro con cupón abandonado', tone: 'neutral' },

    // ── Automáticas: ciclo de vida del plan del coach ───────────────────────
    'coach.activate_free': { label: 'Activó plan Free', tone: 'success' },
    'coach.trial_expired_auto': { label: 'Trial expirado (auto)', tone: 'warning' },
    'coach.beta_trial_downgraded_to_free': { label: 'Beta: trial bajado a Free', tone: 'neutral' },
    'coach.paid_expired_auto': { label: 'Plan pagado expirado (auto)', tone: 'warning' },
    'coach.paid_expiry_alert': { label: 'Alerta de vencimiento', tone: 'warning' },
    'coach.sales_email_client_limit_reached': { label: 'Venta: tope de alumnos', tone: 'sport' },
    'coach.sales_email_plan_expiring_soon': { label: 'Venta: plan por vencer', tone: 'sport' },
    'coach.sales_email_plan_expired': { label: 'Venta: plan vencido', tone: 'sport' },

    // ── Automáticas: organizaciones enterprise ──────────────────────────────
    'org.trial_expired_auto_suspended': { label: 'Org suspendida por trial', tone: 'warning' },
    'org.trial_expiry_alert': { label: 'Alerta de trial de org', tone: 'warning' },
    'org.invoice_overdue_verified': { label: 'Factura vencida verificada', tone: 'warning' },
    'org.payment_reminder_sent': { label: 'Recordatorio de pago', tone: 'sport' },
    'org_owner.setup_account': { label: 'Owner configuró cuenta', tone: 'success' },

    // ── Otros procesos ──────────────────────────────────────────────────────
    'exercise.media.uploaded': { label: 'Subió media de ejercicio', tone: 'neutral' },
    'cron.trial_expiry_ran': { label: 'Cron: vencimiento de trials', tone: 'neutral' },
    'cron.paid_expiry_ran': { label: 'Cron: vencimiento de pagos', tone: 'neutral' },
    'cron.purge_data_ran': { label: 'Cron: purga de datos', tone: 'neutral' },
}

const UNKNOWN_TONE: AdminActionTone = 'neutral'

/**
 * Meta de una acción. Acción desconocida → string crudo + tone neutral (nunca rompe la UI).
 */
export function getAdminActionMeta(action: string): AdminActionMeta {
    return ADMIN_ACTION_CATALOG[action] ?? { label: action, tone: UNKNOWN_TONE }
}

// ── Agrupación para el <select> del filtro ──────────────────────────────────

const GROUP_ORDER = ['coach', 'client', 'coupon', 'team', 'org', 'news', 'exercise', 'cron', 'otras'] as const
type GroupKey = (typeof GROUP_ORDER)[number]

const GROUP_LABELS: Record<GroupKey, string> = {
    coach: 'Coaches',
    client: 'Alumnos',
    coupon: 'Cupones',
    team: 'Equipos',
    org: 'Organizaciones',
    news: 'Novedades',
    exercise: 'Ejercicios',
    cron: 'Procesos automáticos',
    otras: 'Otras',
}

function groupKeyFor(action: string): GroupKey {
    if (action.endsWith('_news_item')) return 'news'
    const prefix = action.split('.')[0] ?? ''
    if (prefix === 'org_owner') return 'org'
    return (GROUP_ORDER as readonly string[]).includes(prefix) ? (prefix as GroupKey) : 'otras'
}

export interface AdminActionGroup {
    key: GroupKey
    label: string
    options: { value: string; label: string }[]
}

/** Opciones agrupadas del filtro de acciones, derivadas del catálogo (sin duplicar keys). */
export const ADMIN_ACTION_GROUPS: AdminActionGroup[] = GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key],
    options: Object.entries(ADMIN_ACTION_CATALOG)
        .filter(([action]) => groupKeyFor(action) === key)
        .map(([value, meta]) => ({ value, label: meta.label })),
})).filter((group) => group.options.length > 0)

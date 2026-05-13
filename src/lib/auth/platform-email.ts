import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])
const PLUS_ALIAS_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com'])

export function normalizePlatformEmail(email: string): string {
    const trimmed = email.trim().toLowerCase()
    const atIdx = trimmed.lastIndexOf('@')
    if (atIdx === -1) return trimmed

    const local = trimmed.slice(0, atIdx)
    const domain = trimmed.slice(atIdx + 1)

    // Strip +alias from supported providers
    const withoutAlias = PLUS_ALIAS_DOMAINS.has(domain) ? (local.split('+')[0] ?? local) : local

    // Gmail ignores dots in local part; googlemail.com and gmail.com are the same inbox
    if (GMAIL_DOMAINS.has(domain)) {
        return `${withoutAlias.replace(/\./g, '')}@gmail.com`
    }

    return `${withoutAlias}@${domain}`
}

type AvailabilityPayload = {
    exists_in_auth?: boolean
    is_coach?: boolean
    is_client?: boolean
    orphan_client_email?: boolean
}

function parseAvailabilityPayload(data: Json): AvailabilityPayload | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const o = data as Record<string, unknown>
    return {
        exists_in_auth: Boolean(o.exists_in_auth),
        is_coach: Boolean(o.is_coach),
        is_client: Boolean(o.is_client),
        orphan_client_email: Boolean(o.orphan_client_email),
    }
}

function rowUnavailable(row: AvailabilityPayload): boolean {
    return Boolean(row.exists_in_auth || row.orphan_client_email)
}

/** User-facing message when email is already used anywhere on the platform. */
export const PLATFORM_EMAIL_TAKEN_ES =
    'Este correo ya está registrado en la plataforma. Usa otro correo o inicia sesión si ya tienes cuenta.'

const BLOCKED_EMAIL_DOMAINS = ['eva-app.cl']

// Top disposable/temporary email domains. Full list: github.com/disposable-email-domains/disposable-email-domains
const DISPOSABLE_EMAIL_DOMAINS = new Set([
    '0815.ru','10minutemail.com','10minutemail.net','10minutemail.org','10minutemail.de',
    '10minutemail.co.uk','10minutemail.eu','10minutemail.info','10minutemail.ru','10minutemail.us',
    '10minutemail.be','10minutemail.cf','10minutemail.ga','10minutemail.gq','10minutemail.ml',
    '20minutemail.com','20minutemail.it',
    'binkmail.com','bob.email','cfl.cool',
    'damnthespam.com','discard.email','discardmail.com','dispostable.com',
    'fakeinbox.com','filzmail.com',
    'getonemail.com','grr.la',
    'guerrillamail.biz','guerrillamail.com','guerrillamail.de','guerrillamail.info',
    'guerrillamail.net','guerrillamail.org','guerrillamailblock.com',
    'humaility.com',
    'incognitomail.com',
    'junk.to',
    'mailbait.info','mailbucket.org','maildrop.cc','mailexpire.com','mailfreeonline.com',
    'mailinator.com','mailme.lv','mailnesia.com','mailnull.com','malinator.com',
    'mt2015.com','mytrashmail.com','mzico.com',
    'odnorazovoe.ru','one-time.email',
    'randommail.me',
    'sharklasers.com','spam.la','spam4.me','spambog.com','spambox.us',
    'spamboy.com','spamgourmet.com','spamgourmet.net','spamgourmet.org',
    'spamhereplease.com','spamscrap.com','spamspot.com',
    'tempail.com','temp-mail.org','tempinbox.com','tempmail.com','tempmail.net',
    'throwam.com','trashcanmail.com','trash-mail.at','trashmail.at','trashmail.com',
    'trashmail.io','trashmail.me','trashmail.net','trashmail.org','trashmailer.com',
    'trbvm.com','yepmail.net','yopmail.com','yopmail.fr',
])

export function isDisposableEmail(email: string): boolean {
    const domain = email.trim().toLowerCase().split('@')[1] ?? ''
    return DISPOSABLE_EMAIL_DOMAINS.has(domain)
}

/**
 * Server-only: requires service_role (or a role granted EXECUTE on the RPC).
 */
export async function assertPlatformEmailAvailable(
    admin: SupabaseClient<Database>,
    email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    const normalized = normalizePlatformEmail(email)
    if (!normalized) {
        return { ok: false, error: 'El correo es obligatorio.' }
    }

    const domain = normalized.split('@')[1] ?? ''
    if (BLOCKED_EMAIL_DOMAINS.includes(domain)) {
        return { ok: false, error: 'Este dominio de correo no está permitido para registro.' }
    }
    if (isDisposableEmail(normalized)) {
        return { ok: false, error: 'Los correos temporales o desechables no están permitidos. Usa tu correo personal o profesional.' }
    }

    const { data, error } = await admin.rpc('check_platform_email_availability', {
        p_email: email,
    })

    if (error) {
        console.error('check_platform_email_availability RPC error:', error)
        return {
            ok: false,
            error: 'No pudimos verificar el correo. Si el problema continúa, contacta soporte.',
        }
    }

    const row = parseAvailabilityPayload(data as Json)
    if (!row) {
        return {
            ok: false,
            error: 'No pudimos verificar el correo. Si el problema continúa, contacta soporte.',
        }
    }

    if (rowUnavailable(row)) {
        return { ok: false, error: PLATFORM_EMAIL_TAKEN_ES }
    }

    return { ok: true }
}

export function isAuthDuplicateEmailMessage(message: string): boolean {
    const m = message.toLowerCase()
    return (
        m.includes('already been registered') ||
        m.includes('already registered') ||
        m.includes('user already registered') ||
        m.includes('duplicate') ||
        (m.includes('email address') && m.includes('already')) ||
        (m.includes('unique') && m.includes('email'))
    )
}

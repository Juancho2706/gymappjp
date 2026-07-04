'use client'

/**
 * Google Identity Services (GIS) client helpers.
 *
 * Runs 100% in the browser from eva-app.cl so Google shows our own domain/brand
 * on the account-picker (instead of "<ref>.supabase.co"). Pairs with
 * supabase.auth.signInWithIdToken.
 *
 * Nonce pattern (official Supabase guidance): the SHA-256 HASH of the nonce goes
 * to google.accounts.id.initialize({ nonce }); the RAW nonce goes to
 * signInWithIdToken({ nonce }).
 */

export interface GoogleCredentialResponse {
    credential: string
}

export interface GsiButtonConfiguration {
    type?: 'standard' | 'icon'
    theme?: 'outline' | 'filled_blue' | 'filled_black'
    size?: 'large' | 'medium' | 'small'
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
    shape?: 'rectangular' | 'pill' | 'circle' | 'square'
    width?: number
    locale?: string
    logo_alignment?: 'left' | 'center'
}

interface GsiIdConfiguration {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
    nonce?: string
    use_fedcm_for_prompt?: boolean
    itp_support?: boolean
}

interface GoogleAccountsId {
    initialize: (config: GsiIdConfiguration) => void
    renderButton: (parent: HTMLElement, options: GsiButtonConfiguration) => void
    prompt: () => void
}

declare global {
    interface Window {
        google?: {
            accounts?: {
                id?: GoogleAccountsId
            }
        }
    }
}

function toBase64Url(bytes: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function toHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let hex = ''
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0')
    }
    return hex
}

/**
 * Generates a random nonce and its SHA-256 hash.
 * - `nonce` (raw, base64url) → signInWithIdToken.
 * - `hashedNonce` (hex) → google.accounts.id.initialize.
 */
export async function generateGoogleNonce(): Promise<{ nonce: string; hashedNonce: string }> {
    const random = new Uint8Array(32)
    crypto.getRandomValues(random)
    const nonce = toBase64Url(random)

    const encoded = new TextEncoder().encode(nonce)
    const digest = await crypto.subtle.digest('SHA-256', encoded)
    const hashedNonce = toHex(digest)

    return { nonce, hashedNonce }
}

let gisScriptPromise: Promise<void> | null = null

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

/**
 * Injects the GIS client script exactly once. Resolves immediately if GIS is
 * already available; rejects if the script fails to load.
 */
export function loadGisScript(): Promise<void> {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('loadGisScript called outside the browser'))
    }

    if (window.google?.accounts?.id) {
        return Promise.resolve()
    }

    if (gisScriptPromise) {
        return gisScriptPromise
    }

    gisScriptPromise = new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`)

        const onLoaded = () => {
            if (window.google?.accounts?.id) {
                resolve()
            } else {
                reject(new Error('GIS script loaded but window.google.accounts.id is unavailable'))
            }
        }

        if (existing) {
            existing.addEventListener('load', onLoaded, { once: true })
            existing.addEventListener('error', () => reject(new Error('GIS script failed to load')), { once: true })
            return
        }

        const script = document.createElement('script')
        script.src = GIS_SCRIPT_SRC
        script.async = true
        script.defer = true
        script.addEventListener('load', onLoaded, { once: true })
        script.addEventListener('error', () => {
            gisScriptPromise = null
            reject(new Error('GIS script failed to load'))
        }, { once: true })
        document.head.appendChild(script)
    })

    return gisScriptPromise
}

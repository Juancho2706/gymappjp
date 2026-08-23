'use client'

import * as React from 'react'
import { TurnstileWidget, type CaptchaState } from './TurnstileWidget'

interface CaptchaSlotProps {
    siteKey: string | null | undefined
    theme?: 'light' | 'dark'
    /** Name of the hidden input carrying the token (default: "cf-turnstile-response") */
    inputName?: string
    /** Notifica el estado del challenge por si el formulario quiere reaccionar. Opcional. */
    onStateChange?: (state: CaptchaState) => void
}

/**
 * Renders Cloudflare Turnstile widget when `siteKey` is provided.
 * Widget is invisible until the captcha challenge must be shown — caller controls render by
 * conditionally passing `siteKey` (or null/undefined to skip entirely).
 *
 * El montaje real (render explícito, `error-callback` que no lanza, retry y refresh automáticos)
 * vive en `TurnstileWidget`, compartido con `/register`. Acá sólo queda el contrato de props que ya
 * usaban `/login`, `/org/login` y compañía.
 */
export function CaptchaSlot({
    siteKey,
    theme = 'light',
    inputName = 'cf-turnstile-response',
    onStateChange,
}: CaptchaSlotProps) {
    if (!siteKey) return null

    return (
        <TurnstileWidget
            siteKey={siteKey}
            theme={theme}
            size="flexible"
            responseFieldName={inputName}
            onStateChange={onStateChange}
        />
    )
}

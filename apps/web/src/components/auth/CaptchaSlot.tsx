'use client'

import * as React from 'react'
import Script from 'next/script'

interface CaptchaSlotProps {
    siteKey: string | null | undefined
    theme?: 'light' | 'dark'
    /** Name of the hidden input carrying the token (default: "cf-turnstile-response") */
    inputName?: string
}

/**
 * Renders Cloudflare Turnstile widget when `siteKey` is provided.
 * Widget is invisible until the captcha challenge must be shown — caller controls render by
 * conditionally passing `siteKey` (or null/undefined to skip entirely).
 */
export function CaptchaSlot({
    siteKey,
    theme = 'light',
    inputName = 'cf-turnstile-response',
}: CaptchaSlotProps) {
    if (!siteKey) return null

    return (
        <>
            <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                strategy="lazyOnload"
            />
            <div
                className="cf-turnstile"
                data-sitekey={siteKey}
                data-theme={theme}
                data-response-field-name={inputName}
                data-size="flexible"
            />
        </>
    )
}

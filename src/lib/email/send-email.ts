type SendEmailInput = {
    to: string
    subject: string
    html: string
}

type SendEmailResult =
    | { ok: true; providerMessageId: string | null }
    | { ok: false; error: string }

export async function sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.EMAIL_FROM
    if (!apiKey || !from) {
        return { ok: false, error: 'Missing RESEND_API_KEY or EMAIL_FROM' }
    }

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from,
            to: [input.to],
            subject: input.subject,
            html: input.html,
        }),
    })

    if (!res.ok) {
        const text = await res.text()
        return { ok: false, error: `Resend ${res.status}: ${text}` }
    }

    const payload = (await res.json()) as { id?: string }
    return { ok: true, providerMessageId: payload.id ?? null }
}

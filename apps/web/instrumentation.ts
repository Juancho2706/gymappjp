export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('./sentry.server.config')
    }
    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('./sentry.edge.config')
    }
}

// DIAGNÓSTICO temporal: capturar TODO error de server render/action a admin_audit_logs
// (con mensaje + stack + digest reales, que prod oculta en el cliente). Para cazar el "Oops"
// al crear ejercicio. TODO: quitar una vez resuelto.
export async function onRequestError(
    error: unknown,
    request: { path?: string; method?: string },
    context: { routePath?: string; routerKind?: string; routeType?: string },
) {
    try {
        const { createClient } = await import('@supabase/supabase-js')
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!url || !key) return
        const admin = createClient(url, key, { auth: { persistSession: false } })
        const e = error as { message?: string; stack?: string; digest?: string }
        await admin.from('admin_audit_logs').insert({
            admin_email: 'DIAG-onRequestError',
            action: 'server.error',
            target_table: 'exercises',
            target_id: null,
            payload: {
                message: String(e?.message ?? error).slice(0, 1200),
                digest: e?.digest ?? null,
                stack: (e?.stack ?? '').slice(0, 4000),
                path: request?.path ?? null,
                method: request?.method ?? null,
                routePath: context?.routePath ?? null,
                routeType: context?.routeType ?? null,
            },
        })
    } catch {
        /* noop */
    }
}

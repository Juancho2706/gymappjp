'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { getImportContext, type ImportContext } from '../_actions/import.actions'
import { ImportWizard } from './ImportWizard'
import { UpsellGate } from '@/components/upgrade/UpsellGate'

/**
 * Contenido reutilizable del importador de alumnos (patrón `SubscriptionContent`): carga data +
 * gating vía server action (`getImportContext`) y renderiza el wizard / el upsell. Se consume:
 *  · Como ruta directa `/coach/clients/import` (embedded=false) — redirige igual que la RSC
 *    original (org-coach → /coach/clients, sin sesión → /login).
 *  · Como pane "Importar alumnos" embebido en Opciones (embedded=true, vía `ImportPane`) — NO
 *    redirige (sacaría al coach de la SettingsShell); el caso org-coach simplemente no muestra
 *    nada (inalcanzable en la práctica: esos coaches no llegan al SettingsShell standalone).
 * El gating por tier/capacidad es idéntico en ambos modos (vive en `getImportContext`).
 */
export function ImportContent({ embedded = false }: { embedded?: boolean }) {
    const router = useRouter()
    const [ctx, setCtx] = useState<ImportContext | null>(null)

    useEffect(() => {
        let mounted = true
        void (async () => {
            const result = await getImportContext()
            if (!mounted) return
            setCtx(result)
            // Redirecciones SOLO en la ruta directa — espejo de los `redirect()` de la page RSC.
            if (!embedded && !result.allowed) {
                if (result.reason === 'org_coach') router.replace('/coach/clients')
                else if (result.reason === 'unauth') router.replace('/login')
            }
        })()
        return () => {
            mounted = false
        }
    }, [embedded, router])

    if (!ctx) {
        return (
            <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Cargando…</span>
            </div>
        )
    }

    if (ctx.allowed) {
        return (
            <ImportWizard
                coachId={ctx.coachId}
                orgId={ctx.orgId}
                maxClients={ctx.maxClients}
                activeCount={ctx.activeCount}
                embedded={embedded}
            />
        )
    }

    // No permitido: Free / sin capacidad → upsell (idéntico a la ruta). org-coach / sin sesión
    // embebido → nada (la ruta directa ya redirigió por su cuenta).
    if (ctx.reason === 'upsell') {
        return <UpsellGate variant="client_import" currentTier={ctx.tier} />
    }
    return null
}

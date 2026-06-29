import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { getClientBasePath } from '@/lib/client/base-path'
import { getClientProfile } from '../../_data/dashboard.queries'

/**
 * Coach presence (Ola 4 del diseño): avatar del coach + nombre + badge "Tu coach" + nota +
 * botón de mensaje. Linkea al check-in (canal de contacto del alumno, igual que `onCoach` del jsx).
 *
 * Mapeo de data real: nombre/marca del coach desde `coaches` anidado en `clients` (o `brandName`
 * del header de team). El diseño usa una `dashCoachNote` (último mensaje del coach) que no existe en
 * la data real del dashboard → degradamos a una nota de bienvenida del coach (`welcome_message`) o,
 * si no hay, a una línea de soporte fija. La estructura (avatar+nombre+nota+icono) se mantiene 1:1.
 */
export async function CoachPresenceCard({
    userId,
    coachSlug,
    brandName,
    note,
}: {
    userId: string
    coachSlug: string
    brandName?: string | null
    note?: string | null
}) {
    const base = await getClientBasePath(coachSlug)
    const { client } = await getClientProfile(userId)
    const coachRow = client?.coaches
    const coachBrand = Array.isArray(coachRow) ? coachRow[0] : coachRow
    const displayName = brandName || coachBrand?.brand_name || 'Tu coach'
    const noteText = note || coachBrand?.welcome_message || 'Escríbeme cuando quieras, estoy para ayudarte con tu progreso.'

    return (
        <Link href={`${base}/check-in`} className="block">
            <Card padding="md" interactive className="flex-row items-center gap-3">
                <Avatar name={displayName} size="md" ring="ember" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate text-[13.5px] font-extrabold text-strong">{displayName}</span>
                        <span className="shrink-0 whitespace-nowrap rounded-pill bg-ember-100 px-1.5 py-px text-[10px] font-bold text-ember-700">
                            Tu coach
                        </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">{noteText}</p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ember-100 text-ember-700">
                    <MessageCircle className="h-[17px] w-[17px]" />
                </span>
            </Card>
        </Link>
    )
}

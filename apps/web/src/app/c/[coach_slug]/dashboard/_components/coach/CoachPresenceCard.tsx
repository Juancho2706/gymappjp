import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { getClientProfile } from '../../_data/dashboard.queries'

/**
 * Coach presence (Ola 4 del diseño): avatar del coach + nombre + badge "Tu coach" + nota del coach.
 *
 * Es una tarjeta INFORMATIVA (no navega): antes linkeaba al check-in con un ícono de mensaje, lo que
 * hacía creer que abría un chat (afordancia engañosa) — el alumno terminaba en un formulario. Sin un
 * canal de contacto real del coach (no hay teléfono/WhatsApp en `coaches`), se degrada a mostrar la
 * nota del coach sin prometer mensajería.
 *
 * Mapeo de data real: nombre/marca del coach desde `coaches` anidado en `clients` (o `brandName`
 * del header de team). La nota usa el `welcome_message` del coach o, si no hay, una línea de
 * acompañamiento fija (sin invitar a "escribir", que no es posible en la app).
 */
export async function CoachPresenceCard({
    userId,
    brandName,
    note,
}: {
    userId: string
    brandName?: string | null
    note?: string | null
}) {
    const { client } = await getClientProfile(userId)
    const coachRow = client?.coaches
    const coachBrand = Array.isArray(coachRow) ? coachRow[0] : coachRow
    const displayName = brandName || coachBrand?.brand_name || 'Tu coach'
    const noteText = note || coachBrand?.welcome_message || 'Estoy atento a tu progreso. ¡Seguimos!'

    return (
        <Card padding="md" className="flex-row items-center gap-3">
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
        </Card>
    )
}

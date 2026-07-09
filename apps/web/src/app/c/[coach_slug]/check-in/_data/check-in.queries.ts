import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// Violeta de marca por defecto: alumnos SIN coach directo (coach_id NULL — team/pool/enterprise
// o huérfanos) o coach sin color de marca. Mismo valor que el fallback de CheckInForm.
const FALLBACK_PRIMARY_COLOR = '#8B5CF6'

export const getCheckInPageData = cache(async () => {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return { user: null, isClient: false, coachPrimaryColor: FALLBACK_PRIMARY_COLOR, lastCheckIn: null }

    // Resolver al alumno SOLO por id (LEFT join a coaches, sin `!inner` ni filtro por slug). El
    // criterio viejo (`coaches!inner (...)` + `.eq('coaches.slug', coachSlug)`) devolvía null para
    // los alumnos con coach_id NULL (team/pool/enterprise/huérfanos: clients.coach_id es NULLABLE) o
    // cuando el slug de la URL no matcheaba su coach directo → el gate del page los rebotaba al
    // dashboard. El resto del árbol /c (p. ej. findDashboardClientById) resuelve por id con LEFT
    // join, así que el banner "check-in pendiente" SÍ los invitaba: esa divergencia ERA el bug P0
    // (jul-2026: "me dice que no he hecho check-in pero no me deja ingresar al hacerle click").
    const { data: client } = await supabase
        .from('clients')
        .select('id, coaches ( primary_color )')
        .eq('id', user.id)
        .maybeSingle()

    // Sin fila de clients para este uid → el usuario no es alumno: mantener el redirect al dashboard.
    if (!client) return { user, isClient: false, coachPrimaryColor: FALLBACK_PRIMARY_COLOR, lastCheckIn: null }

    const typedClient = client as unknown as {
        coaches: { primary_color: string | null } | { primary_color: string | null }[] | null
    }
    const coachInfo = Array.isArray(typedClient.coaches) ? typedClient.coaches[0] : typedClient.coaches

    const { data: lastCheckIn } = await supabase
        .from('check_ins')
        .select('weight, energy_level, created_at')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    return {
        user,
        isClient: true,
        // coach_id NULL o coach sin color → violeta de marca. NUNCA null: el color dejó de ser el
        // proxy del gate (ahora el gate del page usa `isClient`).
        coachPrimaryColor: coachInfo?.primary_color ?? FALLBACK_PRIMARY_COLOR,
        lastCheckIn,
    }
})

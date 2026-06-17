import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getClientNutritionUser = cache(async () => {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return { user: null, hasClientRow: false }

    const { data: clientRow } = await supabase
        .from('clients')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

    return { user, hasClientRow: Boolean(clientRow) }
})

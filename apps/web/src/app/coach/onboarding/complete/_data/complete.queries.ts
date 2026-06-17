import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getCompleteOnboardingUser = cache(async () => {
    const supabase = await createClient()
    // OAuth onboarding (corre 1 vez al signup): necesita el perfil completo (email + user_metadata
    // del provider), no solo el id -> se queda en getUser. Baja frecuencia, no vale getClaims acá.
    const { data: { user } } = await supabase.auth.getUser()
    return user
})

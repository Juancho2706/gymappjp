import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getAdminLayoutAuth = cache(async () => {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    return { user, error }
})

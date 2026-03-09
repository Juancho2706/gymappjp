import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const adminDb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

async function resetAllPasswords() {
    console.log('Resetting all test user passwords...')
    const { data: { users }, error } = await adminDb.auth.admin.listUsers()

    if (error) {
        console.error('Error fetching users:', error)
        return
    }

    for (const u of users) {
        await adminDb.auth.admin.updateUserById(u.id, { password: 'Password123!' })
        console.log(`Reset password for ${u.email} to Password123!`)
    }
    console.log('Done.')
}

resetAllPasswords().catch(console.error)

/**
 * OmniCoach OS — Account Cleanup Script
 * Deletes ALL coaches, clients, and related data.
 * Run: $env:SUPABASE_SERVICE_ROLE_KEY="key"; node scripts/cleanup-accounts.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jikjeokundmaafuytdcx.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ Set SUPABASE_SERVICE_ROLE_KEY env variable.')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
})

async function main() {
    console.log('🧹 OmniCoach OS — Account Cleanup')
    console.log('===================================\n')

    // 1. Get all clients
    const { data: clients } = await supabase.from('clients').select('id, full_name, email')
    console.log(`📋 Found ${clients?.length || 0} clients`)

    // 2. Get all coaches
    const { data: coaches } = await supabase.from('coaches').select('id, full_name, brand_name')
    console.log(`📋 Found ${coaches?.length || 0} coaches\n`)

    // 3. Delete workout_sets → workout_blocks → workout_plans (order matters for FKs)
    console.log('🗑️  Deleting workout sets...')
    await supabase.from('workout_sets').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    
    console.log('🗑️  Deleting workout blocks...')
    await supabase.from('workout_blocks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    
    console.log('🗑️  Deleting workout plans...')
    await supabase.from('workout_plans').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    // 4. Delete check-ins
    console.log('🗑️  Deleting check-ins...')
    await supabase.from('check_ins').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    // 5. Delete custom exercises (coach_id IS NOT NULL)
    console.log('🗑️  Deleting custom exercises...')
    await supabase.from('exercises').delete().not('coach_id', 'is', null)

    // 6. Delete clients from DB
    console.log('🗑️  Deleting clients from database...')
    if (clients && clients.length > 0) {
        for (const client of clients) {
            await supabase.from('clients').delete().eq('id', client.id)
            console.log(`   ✅ Deleted client: ${client.full_name} (${client.email})`)
        }
    }

    // 7. Delete coaches from DB
    console.log('🗑️  Deleting coaches from database...')
    if (coaches && coaches.length > 0) {
        for (const coach of coaches) {
            await supabase.from('coaches').delete().eq('id', coach.id)
            console.log(`   ✅ Deleted coach: ${coach.full_name} (${coach.brand_name})`)
        }
    }

    // 8. Delete auth users (clients first, then coaches)
    console.log('\n🔑 Deleting auth users...')
    const allUserIds = [
        ...(clients || []).map(c => c.id),
        ...(coaches || []).map(c => c.id),
    ]
    
    for (const userId of allUserIds) {
        const { error } = await supabase.auth.admin.deleteUser(userId)
        if (error) {
            console.log(`   ⚠️  Could not delete auth user ${userId}: ${error.message}`)
        } else {
            console.log(`   ✅ Deleted auth user: ${userId}`)
        }
    }

    console.log('\n🎉 Cleanup complete! All accounts deleted.')
    
    // 9. Quick exercise duplicate check
    console.log('\n📊 Checking exercise muscle groups...')
    const { data: exercises } = await supabase
        .from('exercises')
        .select('muscle_group')
        .is('coach_id', null)
    
    const muscleCount = {}
    for (const ex of (exercises || [])) {
        muscleCount[ex.muscle_group] = (muscleCount[ex.muscle_group] || 0) + 1
    }
    
    console.log('\nMuscle groups in catalog:')
    for (const [group, count] of Object.entries(muscleCount).sort((a, b) => b[1] - a[1])) {
        console.log(`   ${group}: ${count} exercises`)
    }
}

main().catch(err => {
    console.error('💥 Error:', err)
    process.exit(1)
})
